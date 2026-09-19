import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { signToken } from '@/lib/auth';
import bcrypt from 'bcryptjs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { login, password } = body;

    if (!login || !password) {
      return NextResponse.json(
        { success: false, error: 'Login dan password wajib diisi.' },
        { status: 400 }
      );
    }

    const identifier = String(login).trim();

    // Find by NIK, email, or phone (exact match first — uses the NIK index)
    let user = await prisma.user.findFirst({
      where: {
        isActive: true,
        OR: [
          { nik: identifier },
          { email: identifier },
          { phone: identifier },
        ],
      },
    });

    // Fallback: case-insensitive match (SQLite is case-sensitive by default)
    if (!user) {
      const matches = await prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM User
        WHERE isActive = 1
          AND (
            nik = ${identifier} COLLATE NOCASE
            OR email = ${identifier} COLLATE NOCASE
            OR phone = ${identifier}
          )
        LIMIT 1
      `;
      if (matches.length > 0) {
        user = await prisma.user.findUnique({ where: { id: matches[0].id } });
      }
    }

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'NIK/email/no. HP atau password salah.' },
        { status: 401 }
      );
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return NextResponse.json(
        { success: false, error: 'NIK/email/no. HP atau password salah.' },
        { status: 401 }
      );
    }

    const token = await signToken({
      userId: user.id,
      nik: user.nik,
      role: user.role,
      name: user.name,
    });

    const response = NextResponse.json({
      success: true,
      data: {
        id: user.id,
        nik: user.nik,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        position: user.position,
        avatar: user.avatar,
      },
    });

    response.cookies.set('absensi_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('[LOGIN]', error);
    return NextResponse.json(
      { success: false, error: 'Terjadi kesalahan pada server.' },
      { status: 500 }
    );
  }
}
