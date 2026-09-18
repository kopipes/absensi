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

    // Find by NIK, email, or phone
    const user = await prisma.user.findFirst({
      where: {
        isActive: true,
        OR: [
          { nik: login },
          { email: login },
          { phone: login },
        ],
      },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'NIK/email atau password salah.' },
        { status: 401 }
      );
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return NextResponse.json(
        { success: false, error: 'NIK/email atau password salah.' },
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
