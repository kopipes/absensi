import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';

export async function getAuthUser(req: NextRequest) {
  const token =
    req.cookies.get('absensi_token')?.value ||
    req.headers.get('authorization')?.replace('Bearer ', '');

  if (!token) return null;
  return await verifyToken(token);
}

export function unauthorized() {
  return NextResponse.json(
    { success: false, error: 'Tidak memiliki akses. Silakan login ulang.' },
    { status: 401 }
  );
}

export function forbidden() {
  return NextResponse.json(
    { success: false, error: 'Anda tidak memiliki izin untuk aksi ini.' },
    { status: 403 }
  );
}

export function badRequest(message: string) {
  return NextResponse.json({ success: false, error: message }, { status: 400 });
}

export function serverError(message = 'Terjadi kesalahan pada server.') {
  return NextResponse.json({ success: false, error: message }, { status: 500 });
}

export function ok<T>(data: T, message?: string) {
  return NextResponse.json({ success: true, data, message });
}
