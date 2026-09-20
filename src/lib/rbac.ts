import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export type DataScope = 'all' | 'team' | 'self';

/**
 * Data visibility scope for a role:
 * - ADMIN, MANAGER: every employee
 * - SPV: themselves and their direct subordinates
 * - USER (and anything else): themselves only
 */
export function getDataScope(role: string): DataScope {
  if (role === 'ADMIN' || role === 'MANAGER') return 'all';
  if (role === 'SPV') return 'team';
  return 'self';
}

/**
 * Prisma `User` where fragment restricting rows to the viewer's scope,
 * or null when the scope is unrestricted (ADMIN/MANAGER).
 */
export function userScopeFilter(role: string, userId: string): Prisma.UserWhereInput | null {
  switch (getDataScope(role)) {
    case 'all':
      return null;
    case 'team':
      return { OR: [{ id: userId }, { managerId: userId }] };
    default:
      return { id: userId };
  }
}

/** Whether a viewer may access data belonging to the given user. */
export function canViewUser(
  role: string,
  viewerId: string,
  target: { id: string; managerId: string | null }
): boolean {
  if (getDataScope(role) === 'all') return true;
  if (target.id === viewerId) return true;
  return target.managerId === viewerId;
}

const MAX_MANAGER_CHAIN = 10;

/**
 * Branch managers above `userId`, nearest first, following the `managerId`
 * chain (USER → SPV → MANAGER). Cycles and gaps are handled safely.
 */
export async function getManagerChain(userId: string): Promise<string[]> {
  const chain: string[] = [];
  const seen = new Set<string>([userId]);
  let current: string | null = null;

  const start = await prisma.user.findUnique({
    where: { id: userId },
    select: { managerId: true },
  });
  current = start?.managerId ?? null;

  while (current && !seen.has(current) && chain.length < MAX_MANAGER_CHAIN) {
    chain.push(current);
    seen.add(current);
    const next: { managerId: string | null } | null = await prisma.user.findUnique({
      where: { id: current },
      select: { managerId: true },
    });
    current = next?.managerId ?? null;
  }

  return chain;
}

/**
 * Users who should be notified about an action by `actorId`: every manager up
 * the chain, so a check-out by a USER reaches both the SPV and the MANAGER.
 */
export async function audienceUserIds(actorId: string): Promise<string[]> {
  return getManagerChain(actorId);
}
