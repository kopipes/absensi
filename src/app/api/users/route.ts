import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, ok, unauthorized, forbidden, badRequest, serverError } from '@/lib/api';
import { recordAudit, getClientIp } from '@/lib/audit';
import bcrypt from 'bcryptjs';

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!['ADMIN', 'MANAGER', 'SPV'].includes(user.role)) return forbidden();

  const { searchParams } = new URL(req.url);
  const department = searchParams.get('department');
  const role = searchParams.get('role');
  const search = searchParams.get('search');
  const isActive = searchParams.get('isActive');

  const users = await prisma.user.findMany({
    where: {
      ...(department ? { department } : {}),
      ...(role ? { role } : {}),
      ...(isActive !== null ? { isActive: isActive === 'true' } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search } },
              { nik: { contains: search } },
              { email: { contains: search } },
              { department: { contains: search } },
            ],
          }
        : {}),
      // Non-admins only see their subordinates
      ...(user.role !== 'ADMIN'
        ? { managerId: user.userId }
        : {}),
    },
    select: {
      id: true,
      nik: true,
      name: true,
      email: true,
      phone: true,
      position: true,
      department: true,
      role: true,
      avatar: true,
      isActive: true,
      createdAt: true,
      managerId: true,
      officeId: true,
      workScheduleId: true,
      manager: { select: { id: true, name: true, role: true } },
      office: { select: { id: true, name: true } },
      workSchedule: { select: { id: true, name: true, checkInTime: true, checkOutTime: true } },
    },
    orderBy: { name: 'asc' },
  });

  return ok(users);
}

export async function POST(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();
  if (authUser.role !== 'ADMIN') return forbidden();

  try {
    const body = await req.json();
    const { nik, name, email, phone, address, position, department, role, password, managerId, officeId, workScheduleId } = body;

    if (!nik || !name || !password) {
      return badRequest('NIK, nama, dan password wajib diisi.');
    }

    const existing = await prisma.user.findFirst({
      where: { OR: [{ nik }, ...(email ? [{ email }] : [])] },
    });
    if (existing) {
      return badRequest('NIK atau email sudah terdaftar.');
    }

    const hashed = await bcrypt.hash(password, 12);
    const newUser = await prisma.user.create({
      data: {
        nik, name, email, phone, address, position, department,
        role: role || 'USER',
        password: hashed,
        managerId: managerId || null,
        officeId: officeId || null,
        workScheduleId: workScheduleId || null,
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _pw, ...safe } = newUser;
    await recordAudit({
      actor: authUser,
      action: 'USER_CREATE',
      targetType: 'User',
      targetId: newUser.id,
      details: { nik, role: newUser.role, department },
      ip: getClientIp(req),
    });
    return ok(safe, 'Karyawan berhasil ditambahkan.');
  } catch (error) {
    console.error('[CREATE USER]', error);
    return serverError();
  }
}
