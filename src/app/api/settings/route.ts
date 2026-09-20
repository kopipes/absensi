import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, ok, unauthorized, forbidden, badRequest, serverError } from '@/lib/api';
import { recordAudit, getClientIp } from '@/lib/audit';
import { AUTO_CHECKOUT_CUTOFF_TIME } from '@/lib/utils';

const AUTO_CUTOFF_ENABLED_KEY = 'auto_cutoff_enabled';
const AUTO_CUTOFF_TIME_KEY = 'auto_cutoff_time';
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

async function readSettings() {
  const settings = await prisma.setting.findMany({
    where: { key: { in: [AUTO_CUTOFF_ENABLED_KEY, AUTO_CUTOFF_TIME_KEY] } },
  });
  const map = new Map(settings.map((s) => [s.key, s.value]));
  const enabledValue = map.get(AUTO_CUTOFF_ENABLED_KEY);
  const timeValue = map.get(AUTO_CUTOFF_TIME_KEY);
  return {
    autoCutoffEnabled: enabledValue ? enabledValue === 'true' : true,
    autoCutoffTime: timeValue && TIME_PATTERN.test(timeValue) ? timeValue : AUTO_CHECKOUT_CUTOFF_TIME,
  };
}

// Any authenticated user can read app config (used by the attendance page)
export async function GET(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();

  try {
    return ok(await readSettings());
  } catch (error) {
    console.error('[GET SETTINGS]', error);
    return serverError();
  }
}

export async function PUT(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();
  if (authUser.role !== 'ADMIN') return forbidden();

  try {
    const body = await req.json();
    const { autoCutoffEnabled, autoCutoffTime } = body;

    if (autoCutoffEnabled === undefined && autoCutoffTime === undefined) {
      return badRequest('Tidak ada pengaturan yang dikirim.');
    }
    if (autoCutoffEnabled !== undefined && typeof autoCutoffEnabled !== 'boolean') {
      return badRequest('Nilai cutoff aktif tidak valid.');
    }
    if (autoCutoffTime !== undefined && (typeof autoCutoffTime !== 'string' || !TIME_PATTERN.test(autoCutoffTime))) {
      return badRequest('Jam cutoff tidak valid. Gunakan format HH:mm.');
    }

    const operations = [];
    if (autoCutoffEnabled !== undefined) {
      operations.push(
        prisma.setting.upsert({
          where: { key: AUTO_CUTOFF_ENABLED_KEY },
          update: { value: autoCutoffEnabled ? 'true' : 'false' },
          create: { key: AUTO_CUTOFF_ENABLED_KEY, value: autoCutoffEnabled ? 'true' : 'false' },
        })
      );
    }
    if (autoCutoffTime !== undefined) {
      operations.push(
        prisma.setting.upsert({
          where: { key: AUTO_CUTOFF_TIME_KEY },
          update: { value: autoCutoffTime },
          create: { key: AUTO_CUTOFF_TIME_KEY, value: autoCutoffTime },
        })
      );
    }
    await prisma.$transaction(operations);

    await recordAudit({
      actor: authUser, action: 'SETTINGS_UPDATE', targetType: 'Setting',
      details: { autoCutoffEnabled, autoCutoffTime }, ip: getClientIp(req),
    });

    return ok(await readSettings(), 'Pengaturan disimpan.');
  } catch (error) {
    console.error('[UPDATE SETTINGS]', error);
    return serverError();
  }
}
