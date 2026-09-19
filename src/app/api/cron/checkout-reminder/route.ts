import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { formatInTimeZone, toZonedTime } from 'date-fns-tz';

const TZ = 'Asia/Jakarta';
const CRON_SECRET = process.env.CRON_SECRET;

export async function POST(req: NextRequest) {
  // Validate cron secret — fail closed when the secret is not configured
  const auth = req.headers.get('x-cron-secret');
  if (!CRON_SECRET || auth !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const nowUTC = new Date();
    const todayWIB = formatInTimeZone(nowUTC, TZ, 'yyyy-MM-dd');

    // Get all active users with a work schedule
    const users = await prisma.user.findMany({
      where: { isActive: true, role: 'USER', workScheduleId: { not: null } },
      include: { workSchedule: true },
    });

    let notified = 0;

    for (const user of users) {
      if (!user.workSchedule) continue;

      // Check if today is a work day
      const workDays = user.workSchedule.workDays.split(',');
      const nowWIB = toZonedTime(nowUTC, TZ);
      const dayOfWeek = nowWIB.getDay(); // 0=Sun, 1=Mon...
      const dayMap: Record<number, string> = { 1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 0: '7' };
      if (!workDays.includes(dayMap[dayOfWeek])) continue;

      // Check if user has checked in but not out today
      const attendance = await prisma.attendance.findUnique({
        where: { userId_date: { userId: user.id, date: todayWIB } },
      });
      if (!attendance || !attendance.checkIn || attendance.checkOut) continue;

      // Calculate when reminder should fire: checkout time + 30 minutes
      const [h, m] = user.workSchedule.checkOutTime.split(':').map(Number);
      const checkoutWIB = toZonedTime(nowUTC, TZ);
      checkoutWIB.setHours(h, m + 30, 0, 0);

      // Only send if we're past the reminder time
      if (nowWIB < checkoutWIB) continue;

      // Check if we already sent a reminder today (avoid duplicate)
      const alreadyNotified = await prisma.notification.findFirst({
        where: {
          recipientId: user.id,
          type: 'MISSING_CHECKOUT',
          createdAt: { gte: new Date(todayWIB + 'T00:00:00+07:00') },
        },
      });
      if (alreadyNotified) continue;

      // Send reminder to employee
      await prisma.notification.create({
        data: {
          type: 'MISSING_CHECKOUT',
          title: 'Jangan Lupa Absen Pulang',
          message: `Anda belum melakukan absen pulang hari ini. Jika masih bekerja, abaikan notifikasi ini. Jika sudah pulang, segera lakukan absen pulang.`,
          recipientId: user.id,
        },
      });

      // Notify manager too
      if (user.managerId) {
        await prisma.notification.create({
          data: {
            type: 'MISSING_CHECKOUT',
            title: 'Karyawan Belum Absen Pulang',
            message: `${user.name} belum melakukan absen pulang hingga 30 menit setelah jam kerja (${user.workSchedule.checkOutTime}).`,
            recipientId: user.managerId,
            senderId: user.id,
          },
        });
      }

      notified++;
    }

    return NextResponse.json({ success: true, notified, time: nowUTC.toISOString() });
  } catch (error) {
    console.error('[CRON CHECKOUT REMINDER]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
