import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.json({ success: true, message: 'Berhasil logout.' });
  response.cookies.delete('absensi_token');
  return response;
}
