import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, ok, unauthorized, forbidden, badRequest, serverError } from '@/lib/api';
import { canViewUser } from '@/lib/rbac';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();

  try {
    const correction = await prisma.attendanceCorrection.findUnique({
      where: { id: params.id },
      include: {
        attendance: { include: { user: { select: { id: true, managerId: true } } } },
        requestedBy: {
          select: { id: true, name: true, nik: true, role: true, department: true, position: true },
        },
      },
    });
    if (!correction) return badRequest('Data koreksi tidak ditemukan.');

    const owner = correction.attendance?.user;
    const allowed =
      (!!owner && canViewUser(authUser.role, authUser.userId, owner)) ||
      correction.requestedById === authUser.userId;
    if (!allowed) return forbidden();

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
      include: { attendance: { include: { user: { select: { id: true, managerId: true } } } } },
    });
    if (!correction) return badRequest('Data koreksi tidak ditemukan.');
    if (!canViewUser(authUser.role, authUser.userId, correction.attendance.user)) return forbidden();
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
      await prisma.$transaction([
        updateCorrection,
        createNotification,
        prisma.attendance.update({
          where: { id: correction.attendanceId },
          data: {
            ...(correction.newCheckIn ? { checkIn: correction.newCheckIn } : {}),
            ...(correction.newCheckOut ? { checkOut: correction.newCheckOut, isAutoCheckout: false } : {}),
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
