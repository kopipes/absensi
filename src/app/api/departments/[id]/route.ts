import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, ok, unauthorized, forbidden, badRequest, serverError } from '@/lib/api';
import { recordAudit, getClientIp } from '@/lib/audit';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();
  if (authUser.role !== 'ADMIN') return forbidden();

  const dept = await prisma.department.findUnique({ where: { id: params.id } });
  if (!dept) return badRequest('Departemen tidak ditemukan.');
  return ok(dept);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();
  if (authUser.role !== 'ADMIN') return forbidden();

  try {
    const body = await req.json();
    const { name, description, isActive } = body;

    if (!name) return badRequest('Nama departemen wajib diisi.');

    // Check duplicate name (excluding self)
    const existing = await prisma.department.findFirst({
      where: { name, NOT: { id: params.id } },
    });
    if (existing) return badRequest('Nama departemen sudah digunakan.');

    const dept = await prisma.department.update({
      where: { id: params.id },
      data: { name, description, isActive },
    });
    await recordAudit({
      actor: authUser, action: 'DEPARTMENT_UPDATE', targetType: 'Department', targetId: dept.id,
      details: { name: dept.name, isActive: dept.isActive }, ip: getClientIp(req),
    });
    return ok(dept, 'Departemen berhasil diperbarui.');
  } catch (error) {
    console.error('[UPDATE DEPARTMENT]', error);
    return serverError();
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();
  if (authUser.role !== 'ADMIN') return forbidden();

  try {
    // Check if any users are in this department
    const dept = await prisma.department.findUnique({ where: { id: params.id } });
    if (!dept) return badRequest('Departemen tidak ditemukan.');

    const userCount = await prisma.user.count({ where: { department: dept.name } });
    if (userCount > 0) {
      return badRequest(`Tidak dapat menghapus departemen yang masih memiliki ${userCount} karyawan.`);
    }

    await prisma.department.delete({ where: { id: params.id } });
    await recordAudit({
      actor: authUser, action: 'DEPARTMENT_DELETE', targetType: 'Department', targetId: params.id,
      details: { name: dept.name }, ip: getClientIp(req),
    });
    return ok(null, 'Departemen berhasil dihapus.');
  } catch (error) {
    console.error('[DELETE DEPARTMENT]', error);
    return serverError();
  }
}
