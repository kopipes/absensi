import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, ok, unauthorized, serverError } from '@/lib/api';
import { getTodayString } from '@/lib/utils';

export async function GET(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();

  try {
    const today = getTodayString();
    const isManager = ['ADMIN', 'MANAGER', 'SPV'].includes(authUser.role);

    if (!isManager) {
      // For regular users just return their own today attendance
      const attendance = await prisma.attendance.findUnique({
        where: { userId_date: { userId: authUser.userId, date: today } },
      });
      return ok({ todayAttendance: attendance });
    }

    const whereTeam = authUser.role !== 'ADMIN'
      ? { managerId: authUser.userId }
      : {};

    const [totalEmployees, todayAttendances, pendingCorrections] =
      await Promise.all([
        prisma.user.count({ where: { isActive: true, role: 'USER', ...whereTeam } }),
        prisma.attendance.findMany({
          where: {
            date: today,
            ...(authUser.role !== 'ADMIN' ? { user: { managerId: authUser.userId } } : {}),
          },
          include: {
            user: {
              select: {
                id: true, name: true, nik: true,
                department: true, avatar: true, position: true,
              },
            },
          },
          orderBy: { checkIn: 'asc' },
        }),
        prisma.attendanceCorrection.count({
          where: {
            status: 'PENDING',
            ...(authUser.role !== 'ADMIN'
              ? { attendance: { user: { managerId: authUser.userId } } }
              : {}),
          },
        }),
      ]);

    return ok({
      totalEmployees,
      presentToday: todayAttendances.filter((a) => a.status === 'PRESENT').length,
      lateToday: todayAttendances.filter((a) => a.isLate).length,
      absentToday: todayAttendances.filter((a) => a.status === 'ABSENT').length,
      outOfRadiusToday: todayAttendances.filter((a) => a.isOutOfRadius).length,
      autoCutoffToday: todayAttendances.filter((a) => a.isAutoCheckout).length,
      pendingCorrections,
      todayAttendances,
    });
  } catch (error) {
    console.error('[DASHBOARD STATS]', error);
    return serverError();
  }
}
