import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, ok, unauthorized, forbidden, badRequest, serverError } from '@/lib/api';
import { recordAudit, getClientIp } from '@/lib/audit';

export async function GET(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();
  if (!['ADMIN', 'MANAGER', 'SPV'].includes(authUser.role)) return forbidden();

  const offices = await prisma.office.findMany({
    orderBy: { name: 'asc' },
  });
  return ok(offices);
}

export async function POST(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();
  if (authUser.role !== 'ADMIN') return forbidden();

  try {
    const body = await req.json();
    const { name, address, latitude, longitude, radius } = body;
    if (!name || latitude === undefined || longitude === undefined) {
      return badRequest('Nama, latitude, dan longitude wajib diisi.');
    }
    if (typeof latitude !== 'number' || !isFinite(latitude) || latitude < -90 || latitude > 90 ||
        typeof longitude !== 'number' || !isFinite(longitude) || longitude < -180 || longitude > 180) {
      return badRequest('Koordinat tidak valid.');
    }
    const parsedRadius = Number(radius);
    if (radius !== undefined && (!Number.isFinite(parsedRadius) || parsedRadius < 1 || parsedRadius > 100000)) {
      return badRequest('Radius harus antara 1 dan 100000 meter.');
    }
    const office = await prisma.office.create({
      data: { name: String(name).trim(), address: address?.trim() || null, latitude, longitude, radius: parsedRadius || 100 },
    });
    await recordAudit({
      actor: authUser, action: 'OFFICE_CREATE', targetType: 'Office', targetId: office.id,
      details: { name, latitude, longitude, radius: office.radius }, ip: getClientIp(req),
    });
    return ok(office, 'Lokasi kantor berhasil ditambahkan.');
  } catch (error) {
    console.error('[CREATE OFFICE]', error);
    return serverError();
  }
}
