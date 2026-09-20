import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, ok, unauthorized, forbidden, badRequest, serverError } from '@/lib/api';
import { recordAudit, getClientIp } from '@/lib/audit';

export async function GET(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();

  const { searchParams } = new URL(req.url);
  const activeOnly = searchParams.get('activeOnly') !== 'false';

  const departments = await prisma.department.findMany({
    where: activeOnly ? { isActive: true } : {},
    orderBy: { name: 'asc' },
  });
  return ok(departments);
}

export async function POST(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();
  if (authUser.role !== 'ADMIN') return forbidden();

  try {
    const body = await req.json();
    const { name, description } = body;

    if (!name) return badRequest('Nama departemen wajib diisi.');

    const existing = await prisma.department.findUnique({ where: { name } });
    if (existing) return badRequest('Nama departemen sudah digunakan.');

    const dept = await prisma.department.create({
      data: { name, description: description || null },
    });
    await recordAudit({
      actor: authUser, action: 'DEPARTMENT_CREATE', targetType: 'Department', targetId: dept.id,
      details: { name: dept.name }, ip: getClientIp(req),
    });
    return ok(dept, 'Departemen berhasil ditambahkan.');
  } catch (error) {
    console.error('[CREATE DEPARTMENT]', error);
    return serverError();
  }
}
