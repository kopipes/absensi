import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/api';
import { canViewUser } from '@/lib/rbac';
import { isValidPhotoKey, resolvePhotoPath } from '@/lib/photos';

export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
  const authUser = await getAuthUser(req);
  if (!authUser) {
    return NextResponse.json({ error: 'Tidak memiliki akses.' }, { status: 401 });
  }

  const key = (params.path || []).join('/');
  if (!isValidPhotoKey(key)) {
    return NextResponse.json({ error: 'Foto tidak ditemukan.' }, { status: 404 });
  }

  const attendance = await prisma.attendance.findFirst({
    where: { OR: [{ checkInPhoto: key }, { checkOutPhoto: key }] },
    select: { userId: true, user: { select: { managerId: true } } },
  });
  if (!attendance) {
    return NextResponse.json({ error: 'Foto tidak ditemukan.' }, { status: 404 });
  }

  const allowed = canViewUser(authUser.role, authUser.userId, {
    id: attendance.userId,
    managerId: attendance.user.managerId,
  });
  if (!allowed) {
    return NextResponse.json({ error: 'Tidak memiliki akses.' }, { status: 403 });
  }

  const filePath = resolvePhotoPath(key);
  if (!filePath) {
    return NextResponse.json({ error: 'Foto tidak ditemukan.' }, { status: 404 });
  }

  try {
    const file = await fs.readFile(filePath);
    return new NextResponse(new Uint8Array(file), {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Foto tidak ditemukan.' }, { status: 404 });
  }
}
