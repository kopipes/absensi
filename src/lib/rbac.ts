import { Prisma } from '@prisma/client';

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
