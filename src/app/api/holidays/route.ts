import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, ok, unauthorized, forbidden, badRequest, serverError } from '@/lib/api';
import { recordAudit, getClientIp } from '@/lib/audit';

export async function GET(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();

  try {
    const { searchParams } = new URL(req.url);
    const yearParam = searchParams.get('year');
    const year = yearParam && /^\d{4}$/.test(yearParam)
      ? yearParam
      : new Date().getFullYear().toString();

    const holidays = await prisma.holiday.findMany({
      where: { date: { startsWith: year } },
      orderBy: { date: 'asc' },
    });
    return ok(holidays);
  } catch (error) {
    console.error('[GET HOLIDAYS]', error);
    return serverError();
  }
}

export async function POST(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();
  if (authUser.role !== 'ADMIN') return forbidden();

  try {
    const body = await req.json();
    const { name, date, isNational } = body;
    if (!name?.trim() || !date) return badRequest('Nama dan tanggal wajib diisi.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return badRequest('Format tanggal tidak valid. Gunakan YYYY-MM-DD.');
    }

    const holiday = await prisma.holiday.create({
      data: { name: name.trim(), date, isNational: isNational !== false },
    });
    await recordAudit({
      actor: authUser, action: 'HOLIDAY_CREATE', targetType: 'Holiday', targetId: holiday.id,
      details: { name: holiday.name, date, isNational }, ip: getClientIp(req),
    });
    return ok(holiday, 'Hari libur berhasil ditambahkan.');
  } catch (error) {
    console.error('[CREATE HOLIDAY]', error);
    return serverError();
  }
}
