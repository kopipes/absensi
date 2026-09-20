import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getAuthUser, ok, unauthorized, forbidden, serverError } from '@/lib/api';

// GET: paginated audit trail (admin only)
export async function GET(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();
  if (authUser.role !== 'ADMIN') return forbidden();

  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '25', 10) || 25));
    const action = (searchParams.get('action') || '').trim().slice(0, 60);
    const actorId = (searchParams.get('actorId') || '').trim();
    const startDate = (searchParams.get('startDate') || '').trim();
    const endDate = (searchParams.get('endDate') || '').trim();

    const where: Prisma.AuditLogWhereInput = {};
    if (action) where.action = action;
    if (actorId) where.actorId = actorId;
    if (/^\d{4}-\d{2}-\d{2}$/.test(startDate) || /^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      where.createdAt = {
        ...(startDate ? { gte: new Date(`${startDate}T00:00:00+07:00`) } : {}),
        ...(endDate ? { lte: new Date(`${endDate}T23:59:59.999+07:00`) } : {}),
      };
    }

    const [logs, total, actions] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({ distinct: ['action'], select: { action: true }, orderBy: { action: 'asc' } }),
    ]);

    return ok({
      logs,
      actions: actions.map((a) => a.action),
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    });
  } catch (error) {
    console.error('[GET AUDIT LOGS]', error);
    return serverError();
  }
}