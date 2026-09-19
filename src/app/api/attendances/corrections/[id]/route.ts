import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, ok, unauthorized, forbidden, badRequest, serverError } from '@/lib/api';
import { calculateLateMinutes } from '@/lib/utils';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();

  try {
    const correction = await prisma.attendanceCorrection.findUnique({
      where: { id: params.id },
      include: { attendance: true, requestedBy: true },
    });
    if (!correction) return badRequest('Data koreksi tidak ditemukan.');
    return ok(correction);
  } catch (error) {
    console.error('[GET CORRECTION]', error);
    return serverError();
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();
  if (!['ADMIN', 'MANAGER', 'SPV'].includes(authUser.role)) return forbidden();

  try {
    const body = await req.json();
    const { status } = body;

    if (!['APPROVED', 'REJECTED'].includes(status)) {
      return badRequest('Status tidak valid.');
    }

    const correction = await prisma.attendanceCorrection.findUnique({
      where: { id: params.id },
      include: { attendance: true, requestedBy: true },
    });
    if (!correction) return badRequest('Data koreksi tidak ditemukan.');
    if (correction.status !== 'PENDING') {
      return badRequest('Koreksi ini sudah diproses sebelumnya.');
    }

    // Wrap all mutations in a transaction
    const updateCorrection = prisma.attendanceCorrection.update({
      where: { id: params.id },
      data: { status, approvedById: authUser.userId },
    });

    const createNotification = prisma.notification.create({
      data: {
        type: status === 'APPROVED' ? 'CORRECTION_APPROVED' : 'CORRECTION_REJECTED',
        title: status === 'APPROVED' ? 'Koreksi Absen Disetujui' : 'Koreksi Absen Ditolak',
        message: status === 'APPROVED'
          ? `Permintaan koreksi absen Anda untuk tanggal ${correction.attendance.date} telah disetujui.`
          : `Permintaan koreksi absen Anda untuk tanggal ${correction.attendance.date} ditolak.`,
        recipientId: correction.requestedById,
        senderId: authUser.userId,
      },
    });

    if (status === 'APPROVED') {
      // Determine final checkIn after correction
      const newCheckIn = correction.newCheckIn ?? correction.attendance.checkIn;

      // Recalculate late minutes if user has a work schedule
      const user = await prisma.user.findUnique({
        where: { id: correction.requestedById },
        include: { workSchedule: true },
      });

      let lateData = {};
      if (user?.workSchedule && newCheckIn) {
        const ws = user.workSchedule;
        const checkInDate = new Date(Number(newCheckIn));
        const lateMinutes = calculateLateMinutes(checkInDate, ws.checkInTime, ws.gracePeriod);
        lateData = { isLate: lateMinutes > 0, lateMinutes };
      }

      await prisma.$transaction([
        updateCorrection,
        createNotification,
        prisma.attendance.update({
          where: { id: correction.attendanceId },
          data: {
            ...(correction.newCheckIn ? { checkIn: correction.newCheckIn } : {}),
            ...(correction.newCheckOut ? { checkOut: correction.newCheckOut, isAutoCheckout: false } : {}),
            ...lateData,
          },
        }),
      ]);
    } else {
      await prisma.$transaction([updateCorrection, createNotification]);
    }

    return ok(null, status === 'APPROVED' ? 'Koreksi disetujui.' : 'Koreksi ditolak.');
  } catch (error) {
    console.error('[PATCH CORRECTION]', error);
    return serverError();
  }
}
