import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, ok, unauthorized, forbidden, badRequest, serverError } from '@/lib/api';
import { recordAudit, getClientIp } from '@/lib/audit';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const WORKDAYS_PATTERN = /^([1-7])(,[1-7])*$/;

function validateScheduleFields(checkInTime: unknown, checkOutTime: unknown, workDays: unknown): string | null {
  if (checkInTime != null && (typeof checkInTime !== 'string' || !TIME_PATTERN.test(checkInTime))) {
    return 'Format jam masuk tidak valid (HH:mm).';
  }
  if (checkOutTime != null && (typeof checkOutTime !== 'string' || !TIME_PATTERN.test(checkOutTime))) {
    return 'Format jam pulang tidak valid (HH:mm).';
  }
  if (workDays != null && workDays !== '' && (typeof workDays !== 'string' || !WORKDAYS_PATTERN.test(workDays))) {
    return 'Hari kerja tidak valid (contoh: 1,2,3,4,5).';
  }
  return null;
}

export async function GET(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();
  if (!['ADMIN', 'MANAGER', 'SPV'].includes(authUser.role)) return forbidden();

  const schedules = await prisma.workSchedule.findMany({
    orderBy: { name: 'asc' },
    include: { office: { select: { id: true, name: true } } },
  });
  return ok(schedules);
}

export async function POST(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();
  if (authUser.role !== 'ADMIN') return forbidden();

  try {
    const body = await req.json();
    const { name, checkInTime, checkOutTime, workDays, officeId } = body;
    if (!name?.trim()) {
      return badRequest('Nama jadwal wajib diisi.');
    }
    const invalid = validateScheduleFields(checkInTime, checkOutTime, workDays);
    if (invalid) return badRequest(invalid);
    const schedule = await prisma.workSchedule.create({
      data: {
        name: name.trim(),
        checkInTime: checkInTime || null,
        checkOutTime: checkOutTime || null,
        workDays: workDays || '1,2,3,4,5',
        officeId: officeId || null,
      },
    });
    await recordAudit({
      actor: authUser, action: 'SCHEDULE_CREATE', targetType: 'WorkSchedule', targetId: schedule.id,
      details: { name: schedule.name, checkInTime, checkOutTime, workDays }, ip: getClientIp(req),
    });
    return ok(schedule, 'Jadwal kerja berhasil ditambahkan.');
  } catch (error) {
    console.error('[CREATE SCHEDULE]', error);
    return serverError();
  }
}
