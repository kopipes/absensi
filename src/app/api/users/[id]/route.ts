import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, ok, unauthorized, forbidden, badRequest, serverError } from '@/lib/api';
import { canViewUser } from '@/lib/rbac';

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();
  if (authUser.role !== 'ADMIN') return forbidden();
  if (authUser.userId === params.id) {
    return badRequest('Tidak dapat menghapus akun Anda sendiri.');
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: params.id } });
    if (!user) return badRequest('User tidak ditemukan.');

    // Cascade delete in a transaction
    await prisma.$transaction([
      prisma.notification.deleteMany({
        where: { OR: [{ recipientId: params.id }, { senderId: params.id }] },
      }),
      prisma.attendanceCorrection.deleteMany({
        where: { OR: [{ requestedById: params.id }, { approvedById: params.id }] },
      }),
      prisma.attendance.deleteMany({ where: { userId: params.id } }),
      prisma.user.updateMany({
        where: { managerId: params.id },
        data: { managerId: null },
      }),
      prisma.user.delete({ where: { id: params.id } }),
    ]);

    return ok(null, 'Karyawan berhasil dihapus.');
  } catch (error) {
    console.error('[DELETE USER]', error);
    return serverError();
  }
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();

  try {
    const user = await prisma.user.findUnique({
      where: { id: params.id },
      include: {
        manager: { select: { id: true, name: true, role: true } },
        office: true,
        workSchedule: true,
      },
    });
    if (!user) return badRequest('User tidak ditemukan.');

    // ADMIN sees everyone, MANAGER everyone, SPV self + direct reports, USER self
    if (!canViewUser(authUser.role, authUser.userId, { id: user.id, managerId: user.managerId })) {
      return forbidden();
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _pw, ...safe } = user;
    return ok(safe);
  } catch (error) {
    console.error('[GET USER]', error);
    return serverError();
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();

  const isSelf = authUser.userId === params.id;
  if (!isSelf && authUser.role !== 'ADMIN') return forbidden();

  try {
    const body = await req.json();
    const { name, email, phone, address, position, department, role, password, managerId, officeId, workScheduleId, isActive } = body;

    const updateData: Record<string, unknown> = {};

    if (name?.trim()) updateData.name = name.trim();
    if (email !== undefined) updateData.email = email?.trim() || null;
    if (phone !== undefined) updateData.phone = phone?.trim() || null;
    if (address !== undefined) updateData.address = address?.trim() || null;
    if (password?.trim()) {
      const bcrypt = await import('bcryptjs');
      updateData.password = await bcrypt.hash(password, 12);
    }

    if (authUser.role === 'ADMIN') {
      if (position !== undefined) updateData.position = position?.trim() || null;
      if (department !== undefined) updateData.department = department?.trim() || null;
      if (role && ['ADMIN', 'MANAGER', 'SPV', 'USER'].includes(role)) updateData.role = role;
      if (managerId !== undefined) updateData.managerId = managerId || null;
      if (officeId !== undefined) updateData.officeId = officeId || null;
      if (workScheduleId !== undefined) updateData.workScheduleId = workScheduleId || null;
      if (isActive !== undefined) updateData.isActive = Boolean(isActive);
    }

    if (Object.keys(updateData).length === 0) {
      return badRequest('Tidak ada data yang diperbarui.');
    }

    const updated = await prisma.user.update({ where: { id: params.id }, data: updateData });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _pw, ...safe } = updated;
    return ok(safe, 'Data berhasil diperbarui.');
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'P2002') {
      return badRequest('Email sudah digunakan oleh karyawan lain.');
    }
    console.error('[UPDATE USER]', error);
    return serverError();
  }
}
