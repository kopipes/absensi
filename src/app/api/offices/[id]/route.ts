import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, ok, unauthorized, forbidden, badRequest, serverError } from '@/lib/api';
import { recordAudit, getClientIp } from '@/lib/audit';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();
  if (!['ADMIN', 'MANAGER', 'SPV'].includes(authUser.role)) return forbidden();

  try {
    const office = await prisma.office.findUnique({ where: { id: params.id } });
    if (!office) return badRequest('Lokasi tidak ditemukan.');
    return ok(office);
  } catch (error) {
    console.error('[GET OFFICE]', error);
    return serverError();
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();
  if (authUser.role !== 'ADMIN') return forbidden();

  try {
    const body = await req.json();
    const { name, address, latitude, longitude, radius, isActive } = body;

    if (!name?.trim()) return badRequest('Nama kantor wajib diisi.');
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return badRequest('Latitude dan longitude harus berupa angka.');
    }
    if (!isFinite(latitude) || latitude < -90 || latitude > 90 ||
        !isFinite(longitude) || longitude < -180 || longitude > 180) {
      return badRequest('Koordinat tidak valid.');
    }
    const parsedRadius = Number(radius);
    if (radius !== undefined && (!Number.isFinite(parsedRadius) || parsedRadius < 1 || parsedRadius > 100000)) {
      return badRequest('Radius harus antara 1 dan 100000 meter.');
    }

    const office = await prisma.office.update({
      where: { id: params.id },
      data: {
        name: name.trim(),
        address: address?.trim() || null,
        latitude,
        longitude,
        radius: Number.isFinite(parsedRadius) ? parsedRadius : 100,
        ...(isActive !== undefined ? { isActive: Boolean(isActive) } : {}),
      },
    });
    await recordAudit({
      actor: authUser, action: 'OFFICE_UPDATE', targetType: 'Office', targetId: office.id,
      details: { name: office.name, latitude, longitude, radius: office.radius, isActive: office.isActive },
      ip: getClientIp(req),
    });
    return ok(office, 'Lokasi berhasil diperbarui.');
  } catch (error) {
    console.error('[UPDATE OFFICE]', error);
    return serverError();
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();
  if (authUser.role !== 'ADMIN') return forbidden();

  try {
    // Soft delete — don't break existing user assignments
    await prisma.office.update({
      where: { id: params.id },
      data: { isActive: false },
    });
    await recordAudit({
      actor: authUser, action: 'OFFICE_DEACTIVATE', targetType: 'Office', targetId: params.id,
      ip: getClientIp(req),
    });
    return ok(null, 'Lokasi berhasil dinonaktifkan.');
  } catch (error) {
    console.error('[DELETE OFFICE]', error);
    return serverError();
  }
}
