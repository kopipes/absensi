import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, ok, unauthorized, forbidden, badRequest, serverError } from '@/lib/api';
import { recordAudit, getClientIp } from '@/lib/audit';

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();
  if (authUser.role !== 'ADMIN') return forbidden();

  try {
    await prisma.holiday.delete({ where: { id: params.id } });
    await recordAudit({
      actor: authUser, action: 'HOLIDAY_DELETE', targetType: 'Holiday', targetId: params.id,
      ip: getClientIp(req),
    });
    return ok(null, 'Hari libur berhasil dihapus.');
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'P2025') {
      return badRequest('Hari libur tidak ditemukan.');
    }
    console.error('[DELETE HOLIDAY]', error);
    return serverError();
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();
  if (authUser.role !== 'ADMIN') return forbidden();

  try {
    const body = await req.json();
    const { name, date, isNational } = body;
    if (!name?.trim() || !date) return badRequest('Nama dan tanggal wajib diisi.');

    // Validate date format YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return badRequest('Format tanggal tidak valid. Gunakan YYYY-MM-DD.');
    }

    const holiday = await prisma.holiday.update({
      where: { id: params.id },
      data: { name: name.trim(), date, isNational: Boolean(isNational) },
    });
    await recordAudit({
      actor: authUser, action: 'HOLIDAY_UPDATE', targetType: 'Holiday', targetId: holiday.id,
      details: { name: holiday.name, date, isNational }, ip: getClientIp(req),
    });
    return ok(holiday, 'Hari libur berhasil diperbarui.');
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'P2025') {
      return badRequest('Hari libur tidak ditemukan.');
    }
    console.error('[UPDATE HOLIDAY]', error);
    return serverError();
  }
}
