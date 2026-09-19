import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, ok, unauthorized, forbidden, badRequest, serverError } from '@/lib/api';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();
  if (authUser.role !== 'ADMIN') return forbidden();

  try {
    const body = await req.json();
    const { name, checkInTime, checkOutTime, gracePeriod, workDays, officeId, isActive } = body;

    if (!name || !checkInTime || !checkOutTime) {
      return badRequest('Nama, jam masuk, dan jam pulang wajib diisi.');
    }

    const schedule = await prisma.workSchedule.update({
      where: { id: params.id },
      data: {
        name,
        checkInTime,
        checkOutTime,
        gracePeriod: gracePeriod ?? 15,
        workDays: workDays || '1,2,3,4,5',
        officeId: officeId || null,
        ...(isActive !== undefined ? { isActive } : {}),
      },
    });
    return ok(schedule, 'Jadwal kerja berhasil diperbarui.');
  } catch (error) {
    console.error('[UPDATE SCHEDULE]', error);
    return serverError();
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();
  if (authUser.role !== 'ADMIN') return forbidden();

  try {
    // Check if any users are using this schedule
    const userCount = await prisma.user.count({ where: { workScheduleId: params.id } });
    if (userCount > 0) {
      return badRequest(`Tidak dapat menghapus jadwal yang masih digunakan oleh ${userCount} karyawan.`);
    }
    await prisma.workSchedule.delete({ where: { id: params.id } });
    return ok(null, 'Jadwal kerja berhasil dihapus.');
  } catch (error) {
    console.error('[DELETE SCHEDULE]', error);
    return serverError();
  }
}
