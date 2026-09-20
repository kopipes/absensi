import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

/** Slim shape of the authenticated JWT payload needed for audit logging. */
export interface AuditActor {
  userId?: string;
  name?: string;
  role?: string;
}

export interface AuditInput {
  actor?: AuditActor | null;
  action: string;
  targetType?: string;
  targetId?: string;
  details?: Record<string, unknown> | string | null;
  ip?: string | null;
}

/**
 * Persist an audit log entry. Never throws: auditing must not break the
 * business action it records.
 */
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    const details =
      input.details === undefined || input.details === null
        ? null
        : typeof input.details === 'string'
          ? input.details
          : JSON.stringify(input.details).slice(0, 4000);

    await prisma.auditLog.create({
      data: {
        actorId: input.actor?.userId ?? null,
        actorName: input.actor?.name ?? null,
        action: input.action,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        details,
        ip: input.ip ?? null,
      },
    });
  } catch (error) {
    console.error('[AUDIT]', error);
  }
}

/** Best-effort client IP from proxy headers. */
export function getClientIp(req: Request): string | null {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers.get('x-real-ip');
}

export type AuditLogCreateInput = Prisma.AuditLogCreateInput;