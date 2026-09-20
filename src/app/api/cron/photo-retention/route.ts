import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import { prisma } from '@/lib/prisma';
import { getUploadRoot, isValidPhotoKey, resolvePhotoPath } from '@/lib/photos';
import { recordAudit } from '@/lib/audit';

const CRON_SECRET = process.env.CRON_SECRET;
const DEFAULT_RETENTION_DAYS = 180;

function wibYearMonth(daysAgo: number): { year: string; month: string } {
  const d = new Date(Date.now() - daysAgo * 86_400_000);
  const iso = new Date(d.getTime() + 7 * 60 * 60 * 1000).toISOString();
  return { year: iso.slice(0, 4), month: iso.slice(5, 7) };
}

/**
 * Purge attendance photos older than the retention window (default 180 days).
 * Deletes the DB reference and the file. Protected by the cron secret.
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get('x-cron-secret');
  if (!CRON_SECRET || auth !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const daysParam = parseInt(url.searchParams.get('days') || '', 10);
    const retentionDays = Number.isFinite(daysParam) && daysParam > 30 ? daysParam : DEFAULT_RETENTION_DAYS;

    const cutoff = new Date(Date.now() - retentionDays * 86_400_000);
    const cutoffDate = new Date(cutoff.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const stale = await prisma.attendance.findMany({
      where: {
        date: { lt: cutoffDate },
        OR: [{ checkInPhoto: { not: null } }, { checkOutPhoto: { not: null } }],
      },
      select: { id: true, checkInPhoto: true, checkOutPhoto: true },
    });

    let filesDeleted = 0;
    for (const row of stale) {
      for (const key of [row.checkInPhoto, row.checkOutPhoto]) {
        if (!key || !isValidPhotoKey(key)) continue;
        const filePath = resolvePhotoPath(key);
        if (filePath) {
          try {
            await fs.unlink(filePath);
            filesDeleted++;
          } catch {
            /* already gone */
          }
        }
      }
      await prisma.attendance.update({
        where: { id: row.id },
        data: { checkInPhoto: null, checkOutPhoto: null },
      });
    }

    // Remove directory scaffolding for months entirely older than the window
    const { year, month } = wibYearMonth(retentionDays + 62);
    try {
      await fs.rm(`${getUploadRoot()}/${year}/${month}`, { recursive: true, force: true });
    } catch {
      /* best effort */
    }

    if (filesDeleted > 0) {
      await recordAudit({
        action: 'PHOTO_RETENTION_PURGE',
        details: { retentionDays, cutoffDate, attendanceRows: stale.length, filesDeleted },
      });
    }

    return NextResponse.json({
      success: true,
      retentionDays,
      cutoffDate,
      rowsProcessed: stale.length,
      filesDeleted,
      time: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[CRON PHOTO RETENTION]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}