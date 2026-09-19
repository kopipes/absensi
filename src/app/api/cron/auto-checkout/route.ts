import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { formatInTimeZone } from 'date-fns-tz';
import { AUTO_CHECKOUT_CUTOFF_TIME } from '@/lib/utils';

const TZ = 'Asia/Jakarta';
const CRON_SECRET = process.env.CRON_SECRET;

// Batas jam pulang otomatis (WIB) bila karyawan lupa absen pulang.
const CUTOFF_TIME = AUTO_CHECKOUT_CUTOFF_TIME;
// Batas riwayat yang diproses ulang per run (hari) agar tidak memindai seluruh data.
const LOOKBACK_DAYS = 7;
const CHUNK_SIZE = 25;

interface MissedAttendance {
  id: string;
  date: string;
  notes: string | null;
  user: { id: string; name: string; managerId: string | null };
}

async function processAttendance(
  attendance: MissedAttendance,
  todayStr: string,
  nowUTC: Date
): Promise<number> {
  const dateStr = attendance.date;

  // Same-day cutoff only applies once the cutoff instant has passed
  if (dateStr === todayStr) {
    const cutoffInstant = new Date(`${todayStr}T${CUTOFF_TIME}:00+07:00`);
    if (nowUTC < cutoffInstant) return 0;
  }

  const user = attendance.user;

  // Auto checkout time = cutoff (19:00 WIB) on the attendance date
  const autoCheckoutTime = new Date(`${dateStr}T${CUTOFF_TIME}:00+07:00`);

  const operations = [
    prisma.attendance.update({
      where: { id: attendance.id },
      data: {
        checkOut: autoCheckoutTime,
        isAutoCheckout: true,
        notes: attendance.notes
          ? `${attendance.notes} | Auto cutoff ${CUTOFF_TIME} WIB - harap koreksi jika salah`
          : `Auto cutoff ${CUTOFF_TIME} WIB - harap koreksi jika salah`,
      },
    }),
    prisma.notification.create({
      data: {
        type: 'MISSING_CHECKOUT',
        title: 'Absen Pulang Otomatis (Cutoff)',
        message: `Anda tidak absen pulang pada ${dateStr}. Sistem otomatis mencatat jam pulang pukul ${CUTOFF_TIME} WIB. Ajukan koreksi jika tidak sesuai.`,
        recipientId: user.id,
      },
    }),
  ];

  if (user.managerId) {
    operations.push(
      prisma.notification.create({
        data: {
          type: 'MISSING_CHECKOUT',
          title: 'Auto Cutoff Karyawan',
          message: `${user.name} tidak absen pulang pada ${dateStr}. Sistem otomatis mencatat jam pulang pukul ${CUTOFF_TIME} WIB. Silakan review jika diperlukan.`,
          recipientId: user.managerId,
          senderId: user.id,
        },
      })
    );
  }

  await prisma.$transaction(operations);
  return 1;
}

export async function POST(req: NextRequest) {
  // Validate cron secret — fail closed when the secret is not configured
  const auth = req.headers.get('x-cron-secret');
  if (!CRON_SECRET || auth !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const nowUTC = new Date();
    const todayStr = formatInTimeZone(nowUTC, TZ, 'yyyy-MM-dd');

    // Bounded window so a single run never re-processes the whole history
    const startDate = new Date(`${todayStr}T00:00:00+07:00`);
    startDate.setDate(startDate.getDate() - LOOKBACK_DAYS);
    const startStr = formatInTimeZone(startDate, TZ, 'yyyy-MM-dd');

    const missed = await prisma.attendance.findMany({
      where: {
        date: { gte: startStr, lte: todayStr },
        checkIn: { not: null },
        checkOut: null,
      },
      select: {
        id: true,
        date: true,
        notes: true,
        user: { select: { id: true, name: true, managerId: true } },
      },
    });

    let autoCheckedOut = 0;

    // Process in bounded-concurrency chunks instead of strictly sequential writes
    for (let i = 0; i < missed.length; i += CHUNK_SIZE) {
      const chunk = missed.slice(i, i + CHUNK_SIZE);
      const results = await Promise.all(
        chunk.map((attendance) => processAttendance(attendance, todayStr, nowUTC))
      );
      autoCheckedOut += results.reduce((sum, value) => sum + value, 0);
    }

    return NextResponse.json({
      success: true,
      autoCheckedOut,
      cutoffTime: CUTOFF_TIME,
      time: nowUTC.toISOString(),
    });
  } catch (error) {
    console.error('[CRON AUTO CHECKOUT]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
