import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { formatInTimeZone } from 'date-fns-tz';
import { AUTO_CHECKOUT_CUTOFF_TIME } from '@/lib/utils';
import { audienceUserIds } from '@/lib/rbac';

const TZ = 'Asia/Jakarta';
const CRON_SECRET = process.env.CRON_SECRET;

// Jam cutoff default (WIB); nilai aktual dibaca dari Setting admin.
const CUTOFF_TIME = AUTO_CHECKOUT_CUTOFF_TIME;
const CUTOFF_TIME_KEY = 'auto_cutoff_time';
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
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
  nowUTC: Date,
  cutoffTime: string
): Promise<number> {
  const dateStr = attendance.date;

  // Same-day cutoff only applies once the cutoff instant has passed
  if (dateStr === todayStr) {
    const cutoffInstant = new Date(`${todayStr}T${cutoffTime}:00+07:00`);
    if (nowUTC < cutoffInstant) return 0;
  }

  const user = attendance.user;

  // Auto checkout time = configured cutoff (WIB) on the attendance date
  const autoCheckoutTime = new Date(`${dateStr}T${cutoffTime}:00+07:00`);

  const operations = [
    prisma.attendance.update({
      where: { id: attendance.id },
      data: {
        checkOut: autoCheckoutTime,
        isAutoCheckout: true,
        notes: attendance.notes
          ? `${attendance.notes} | Auto cutoff ${cutoffTime} WIB - harap koreksi jika salah`
          : `Auto cutoff ${cutoffTime} WIB - harap koreksi jika salah`,
      },
    }),
    prisma.notification.create({
      data: {
        type: 'MISSING_CHECKOUT',
        title: 'Absen Pulang Otomatis (Cutoff)',
        message: `Anda tidak absen pulang pada ${dateStr}. Sistem otomatis mencatat jam pulang pukul ${cutoffTime} WIB. Ajukan koreksi jika tidak sesuai.`,
        recipientId: user.id,
      },
    }),
  ];

  if (user.managerId) {
    const recipients = await audienceUserIds(user.id);
    for (const recipientId of recipients) {
      operations.push(
        prisma.notification.create({
          data: {
            type: 'MISSING_CHECKOUT',
            title: 'Auto Cutoff Karyawan',
            message: `${user.name} tidak absen pulang pada ${dateStr}. Sistem otomatis mencatat jam pulang pukul ${cutoffTime} WIB. Silakan review jika diperlukan.`,
            recipientId,
            senderId: user.id,
          },
        })
      );
    }
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
    // Respect the admin on/off + time settings; leave data untouched when disabled
    const [enabledSetting, timeSetting] = await Promise.all([
      prisma.setting.findUnique({ where: { key: 'auto_cutoff_enabled' } }),
      prisma.setting.findUnique({ where: { key: CUTOFF_TIME_KEY } }),
    ]);
    const cutoffEnabled = enabledSetting ? enabledSetting.value === 'true' : true;
    if (!cutoffEnabled) {
      return NextResponse.json({
        success: true,
        enabled: false,
        autoCheckedOut: 0,
        message: 'Auto cutoff nonaktif — data absen dibiarkan kosong.',
      });
    }

    const cutoffTime = timeSetting && TIME_PATTERN.test(timeSetting.value)
      ? timeSetting.value
      : CUTOFF_TIME;

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
        chunk.map((attendance) => processAttendance(attendance, todayStr, nowUTC, cutoffTime))
      );
      autoCheckedOut += results.reduce((sum, value) => sum + value, 0);
    }

    return NextResponse.json({
      success: true,
      autoCheckedOut,
      cutoffTime,
      time: nowUTC.toISOString(),
    });
  } catch (error) {
    console.error('[CRON AUTO CHECKOUT]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
