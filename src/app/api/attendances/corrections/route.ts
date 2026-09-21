import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, ok, unauthorized, forbidden, badRequest, serverError } from '@/lib/api';
import { userScopeFilter, audienceUserIds, canViewUser } from '@/lib/rbac';

export async function GET(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();
  if (!['ADMIN', 'MANAGER', 'SPV'].includes(authUser.role)) return forbidden();

  const scope = userScopeFilter(authUser.role, authUser.userId);

  // Optional status filter: the UI tabs ("Menunggu" / "Disetujui" / "Ditolak")
  // must narrow the list, otherwise every tab shows the same rows.
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') || '';
  const VALID_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'];
  if (status && !VALID_STATUSES.includes(status)) {
    return badRequest('Status tidak valid.');
  }

  const corrections = await prisma.attendanceCorrection.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(scope ? { attendance: { user: scope } } : {}),
    },
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

    const attendance = await prisma.attendance.findUnique({
      where: { id: attendanceId },
      include: { user: { select: { managerId: true } } },
    });
    if (!attendance) return badRequest('Data absen tidak ditemukan.');

    // Only the attendance owner, their SPV/manager chain, or ADMIN may request
    if (!canViewUser(authUser.role, authUser.userId, {
      id: attendance.userId,
      managerId: attendance.user.managerId,
    })) {
      return forbidden();
    }

    // Avoid piling up duplicate pending requests for the same attendance
    const pending = await prisma.attendanceCorrection.findFirst({
      where: { attendanceId, status: 'PENDING' },
    });
    if (pending) {
      return badRequest('Sudah ada permintaan koreksi yang menunggu persetujuan untuk absen ini.');
    }

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

    // Notify the whole manager chain (e.g. USER's SPV and MANAGER)
    const user = await prisma.user.findUnique({ where: { id: authUser.userId } });
    const recipients = await audienceUserIds(authUser.userId);
    if (user && recipients.length > 0) {
      await prisma.notification.createMany({
        data: recipients.map((recipientId) => ({
          type: 'CORRECTION_REQUEST',
          title: 'Permintaan Koreksi Absen',
          message: `${user.name} meminta koreksi absen untuk tanggal ${attendance.date}.`,
          recipientId,
          senderId: authUser.userId,
        })),
      });
    }

    return ok(correction, 'Permintaan koreksi berhasil dikirim.');
  } catch (error) {
    console.error('[CREATE CORRECTION]', error);
    return serverError();
  }
}
