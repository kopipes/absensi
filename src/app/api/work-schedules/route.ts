import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, ok, unauthorized, forbidden, badRequest, serverError } from '@/lib/api';

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
    const { name, checkInTime, checkOutTime, gracePeriod, workDays, officeId } = body;
    if (!name || !checkInTime || !checkOutTime) {
      return badRequest('Nama, jam masuk, dan jam pulang wajib diisi.');
    }
    const schedule = await prisma.workSchedule.create({
      data: {
        name,
        checkInTime,
        checkOutTime,
        gracePeriod: gracePeriod ?? 15,
        workDays: workDays || '1,2,3,4,5',
        officeId: officeId || null,
      },
    });
    return ok(schedule, 'Jadwal kerja berhasil ditambahkan.');
  } catch (error) {
    console.error('[CREATE SCHEDULE]', error);
    return serverError();
  }
}
