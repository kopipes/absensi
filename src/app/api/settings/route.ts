import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, ok, unauthorized, forbidden, badRequest, serverError } from '@/lib/api';

const AUTO_CUTOFF_KEY = 'auto_cutoff_enabled';

async function readAutoCutoff(): Promise<boolean> {
  const setting = await prisma.setting.findUnique({ where: { key: AUTO_CUTOFF_KEY } });
  // Default to enabled when the setting has never been written
  return setting ? setting.value === 'true' : true;
}

export async function GET(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();
  if (authUser.role !== 'ADMIN') return forbidden();

  try {
    const autoCutoffEnabled = await readAutoCutoff();
    return ok({ autoCutoffEnabled });
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
    const { autoCutoffEnabled } = body;

    if (typeof autoCutoffEnabled !== 'boolean') {
      return badRequest('Nilai pengaturan tidak valid.');
    }

    await prisma.setting.upsert({
      where: { key: AUTO_CUTOFF_KEY },
      update: { value: autoCutoffEnabled ? 'true' : 'false' },
      create: { key: AUTO_CUTOFF_KEY, value: autoCutoffEnabled ? 'true' : 'false' },
    });

    return ok({ autoCutoffEnabled }, 'Pengaturan disimpan.');
  } catch (error) {
    console.error('[UPDATE SETTINGS]', error);
    return serverError();
  }
}
