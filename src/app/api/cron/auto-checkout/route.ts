import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { formatInTimeZone, toZonedTime } from 'date-fns-tz';

const TZ = 'Asia/Jakarta';
const CRON_SECRET = process.env.CRON_SECRET;

// Batas jam pulang otomatis (WIB) bila karyawan lupa absen pulang.
const CUTOFF_TIME = '19:00';

export async function POST(req: NextRequest) {
  // Validate cron secret
  const auth = req.headers.get('x-cron-secret');
  if (CRON_SECRET && auth !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const nowUTC = new Date();
    const nowWIB = toZonedTime(nowUTC, TZ);
    const todayStr = formatInTimeZone(nowUTC, TZ, 'yyyy-MM-dd');

    // Find all attendances with check-in but no check-out up to today
    const missed = await prisma.attendance.findMany({
      where: {
        date: { lte: todayStr },
        checkIn: { not: null },
        checkOut: null,
      },
      include: {
        user: { select: { id: true, name: true, managerId: true } },
      },
    });

    let autoCheckedOut = 0;

    for (const attendance of missed) {
      const dateStr = attendance.date;

      // Same-day cutoff only applies once 19:00 WIB has passed
      if (dateStr === todayStr) {
        const [cutH, cutM] = CUTOFF_TIME.split(':').map(Number);
        const cutoffToday = new Date(nowWIB);
        cutoffToday.setHours(cutH, cutM, 0, 0);
        if (nowWIB < cutoffToday) continue;
      }

      const user = attendance.user;

      // Auto checkout time = 19:00 WIB on the attendance date
      const autoCheckoutTime = new Date(`${dateStr}T${CUTOFF_TIME}:00+07:00`);

      await prisma.attendance.update({
        where: { id: attendance.id },
        data: {
          checkOut: autoCheckoutTime,
          isAutoCheckout: true,
          notes: attendance.notes
            ? `${attendance.notes} | Auto cutoff ${CUTOFF_TIME} WIB - harap koreksi jika salah`
            : `Auto cutoff ${CUTOFF_TIME} WIB - harap koreksi jika salah`,
        },
      });

      // Notify employee
      await prisma.notification.create({
        data: {
          type: 'MISSING_CHECKOUT',
          title: 'Absen Pulang Otomatis (Cutoff)',
          message: `Anda tidak absen pulang pada ${dateStr}. Sistem otomatis mencatat jam pulang pukul ${CUTOFF_TIME} WIB. Ajukan koreksi jika tidak sesuai.`,
          recipientId: user.id,
        },
      });

      // Notify manager
      if (user.managerId) {
        await prisma.notification.create({
          data: {
            type: 'MISSING_CHECKOUT',
            title: 'Auto Cutoff Karyawan',
            message: `${user.name} tidak absen pulang pada ${dateStr}. Sistem otomatis mencatat jam pulang pukul ${CUTOFF_TIME} WIB. Silakan review jika diperlukan.`,
            recipientId: user.managerId,
            senderId: user.id,
          },
        });
      }

      autoCheckedOut++;
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
