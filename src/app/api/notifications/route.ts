import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, ok, unauthorized, serverError } from '@/lib/api';

export async function GET(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();

  try {
    const isAdmin = authUser.role === 'ADMIN';
    const notifications = await prisma.notification.findMany({
      where: isAdmin ? {} : { recipientId: authUser.userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        sender: { select: { id: true, name: true, avatar: true } },
        recipient: { select: { id: true, name: true, nik: true, role: true } },
      },
    });
    return ok(notifications);
  } catch (error) {
    console.error('[GET NOTIFICATIONS]', error);
    return serverError();
  }
}

export async function PATCH(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();

  try {
    await prisma.notification.updateMany({
      where: { recipientId: authUser.userId, isRead: false },
      data: { isRead: true },
    });
    return ok(null, 'Semua notifikasi ditandai sudah dibaca.');
  } catch (error) {
    console.error('[MARK NOTIFICATIONS READ]', error);
    return serverError();
  }
}
