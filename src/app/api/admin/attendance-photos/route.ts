import { NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import { prisma } from '@/lib/prisma';
import { getAuthUser, ok, unauthorized, forbidden, badRequest, serverError } from '@/lib/api';
import { isValidPhotoKey, resolvePhotoPath } from '@/lib/photos';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ROWS = 200;

// GET: attendance photo history for one day (admin only)
export async function GET(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();
  if (authUser.role !== 'ADMIN') return forbidden();

  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date') || '';
    if (!DATE_PATTERN.test(date)) return badRequest('Tanggal tidak valid. Gunakan format YYYY-MM-DD.');

    const attendances = await prisma.attendance.findMany({
      where: { date },
      select: {
        id: true,
        userId: true,
        checkIn: true,
        checkOut: true,
        checkInPhoto: true,
        checkOutPhoto: true,
        isOutOfRadius: true,
        checkOutOutOfRadius: true,
        user: { select: { id: true, nik: true, name: true, department: true } },
      },
      orderBy: { user: { name: 'asc' } },
      take: MAX_ROWS,
    });

    return ok(attendances);
  } catch (error) {
    console.error('[GET ATTENDANCE PHOTOS]', error);
    return serverError();
  }
}

// DELETE: remove a single stored photo and clear its DB reference (admin only)
export async function DELETE(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();
  if (authUser.role !== 'ADMIN') return forbidden();

  try {
    const { searchParams } = new URL(req.url);
    const key = searchParams.get('key') || '';
    if (!isValidPhotoKey(key)) return badRequest('Foto tidak valid.');

    const attendance = await prisma.attendance.findFirst({
      where: { OR: [{ checkInPhoto: key }, { checkOutPhoto: key }] },
      select: { id: true, checkInPhoto: true, checkOutPhoto: true },
    });
    if (!attendance) return badRequest('Data foto tidak ditemukan.');

    const filePath = resolvePhotoPath(key);
    if (filePath) await fs.unlink(filePath).catch(() => {});

    const isCheckIn = attendance.checkInPhoto === key;
    await prisma.attendance.update({
      where: { id: attendance.id },
      data: isCheckIn ? { checkInPhoto: null } : { checkOutPhoto: null },
    });

    return ok(null, 'Foto berhasil dihapus.');
  } catch (error) {
    console.error('[DELETE ATTENDANCE PHOTO]', error);
    return serverError();
  }
}