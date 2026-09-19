import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, ok, unauthorized, forbidden, badRequest, serverError } from '@/lib/api';
import { userScopeFilter } from '@/lib/rbac';

export async function GET(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();
  if (!['ADMIN', 'MANAGER', 'SPV'].includes(authUser.role)) return forbidden();

  const scope = userScopeFilter(authUser.role, authUser.userId);
  const corrections = await prisma.attendanceCorrection.findMany({
    where: scope ? { attendance: { user: scope } } : {},
    include: {
      requestedBy: { select: { id: true, name: true, nik: true, department: true } },
      approvedBy: { select: { id: true, name: true } },
      attendance: { select: { date: true, checkIn: true, checkOut: true, status: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return ok(corrections);
}

export async function POST(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();

  try {
    const body = await req.json();
    const { attendanceId, newCheckIn, newCheckOut, reason } = body;
    if (!attendanceId || !reason) return badRequest('ID absen dan alasan wajib diisi.');

    const attendance = await prisma.attendance.findUnique({ where: { id: attendanceId } });
    if (!attendance) return badRequest('Data absen tidak ditemukan.');

    // Users can only request correction for their own attendance
    if (authUser.role === 'USER' && attendance.userId !== authUser.userId) return forbidden();

    const correction = await prisma.attendanceCorrection.create({
      data: {
        attendanceId,
        requestedById: authUser.userId,
        oldCheckIn: attendance.checkIn,
        oldCheckOut: attendance.checkOut,
        newCheckIn: newCheckIn ? new Date(newCheckIn) : null,
        newCheckOut: newCheckOut ? new Date(newCheckOut) : null,
        reason,
        status: 'PENDING',
      },
    });

    // Notify manager
    const user = await prisma.user.findUnique({ where: { id: authUser.userId } });
    if (user?.managerId) {
      await prisma.notification.create({
        data: {
          type: 'CORRECTION_REQUEST',
          title: 'Permintaan Koreksi Absen',
          message: `${user.name} meminta koreksi absen untuk tanggal ${attendance.date}.`,
          recipientId: user.managerId,
          senderId: authUser.userId,
        },
      });
    }

    return ok(correction, 'Permintaan koreksi berhasil dikirim.');
  } catch (error) {
    console.error('[CREATE CORRECTION]', error);
    return serverError();
  }
}
