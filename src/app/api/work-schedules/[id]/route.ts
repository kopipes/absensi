import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, ok, unauthorized, forbidden, badRequest, serverError } from '@/lib/api';
import { recordAudit, getClientIp } from '@/lib/audit';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const WORKDAYS_PATTERN = /^([1-7])(,[1-7])*$/;

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();
  if (authUser.role !== 'ADMIN') return forbidden();

  try {
    const body = await req.json();
    const { name, checkInTime, checkOutTime, workDays, officeId, isActive } = body;

    if (!name?.trim()) {
      return badRequest('Nama jadwal wajib diisi.');
    }
    if (checkInTime != null && (typeof checkInTime !== 'string' || !TIME_PATTERN.test(checkInTime))) {
      return badRequest('Format jam masuk tidak valid (HH:mm).');
    }
    if (checkOutTime != null && (typeof checkOutTime !== 'string' || !TIME_PATTERN.test(checkOutTime))) {
      return badRequest('Format jam pulang tidak valid (HH:mm).');
    }
    if (workDays != null && workDays !== '' && (typeof workDays !== 'string' || !WORKDAYS_PATTERN.test(workDays))) {
      return badRequest('Hari kerja tidak valid (contoh: 1,2,3,4,5).');
    }

    const schedule = await prisma.workSchedule.update({
      where: { id: params.id },
      data: {
        name: name.trim(),
        checkInTime: checkInTime || null,
        checkOutTime: checkOutTime || null,
        workDays: workDays || '1,2,3,4,5',
        officeId: officeId || null,
        ...(isActive !== undefined ? { isActive } : {}),
      },
    });
    await recordAudit({
      actor: authUser, action: 'SCHEDULE_UPDATE', targetType: 'WorkSchedule', targetId: schedule.id,
      details: { name: schedule.name, checkInTime, checkOutTime, workDays, isActive }, ip: getClientIp(req),
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
    await recordAudit({
      actor: authUser, action: 'SCHEDULE_DELETE', targetType: 'WorkSchedule', targetId: params.id,
      ip: getClientIp(req),
    });
    return ok(null, 'Jadwal kerja berhasil dihapus.');
  } catch (error) {
    console.error('[DELETE SCHEDULE]', error);
    return serverError();
  }
}
