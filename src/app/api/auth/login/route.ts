import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { signToken } from '@/lib/auth';
import bcrypt from 'bcryptjs';
import { recordAudit, getClientIp } from '@/lib/audit';
import { rateLimit } from '@/lib/rate-limit';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const LOCK_MS = LOCK_MINUTES * 60 * 1000;

function invalidCredentials() {
  return NextResponse.json(
    { success: false, error: 'NIK/email/no. HP atau password salah.' },
    { status: 401 }
  );
}

export async function POST(req: NextRequest) {
  try {
    // Per-IP rate limit (password-spraying guard) in addition to per-account lockout
    const ip = getClientIp(req) || 'unknown';
    const rl = rateLimit(`login:${ip}`, 20, 5 * 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: `Terlalu banyak percobaan dari jaringan ini. Coba lagi dalam ${rl.retryAfterSeconds} detik.` },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
    }

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
      return invalidCredentials();
    }

    // Account lockout after repeated failures
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await recordAudit({
        actor: { userId: user.id, name: user.name, role: user.role },
        action: 'LOGIN_BLOCKED',
        targetType: 'User',
        targetId: user.id,
        ip: getClientIp(req),
      });
      return NextResponse.json(
        {
          success: false,
          error: `Akun terkunci sementara karena percobaan login gagal berulang. Coba lagi setelah ${LOCK_MINUTES} menit.`,
        },
        { status: 423 }
      );
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      const attempts = user.failedLoginAttempts + 1;
      const shouldLock = attempts >= MAX_FAILED_ATTEMPTS;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: shouldLock ? 0 : attempts,
          lockedUntil: shouldLock ? new Date(Date.now() + LOCK_MS) : null,
        },
      });
      await recordAudit({
        actor: { userId: user.id, name: user.name, role: user.role },
        action: shouldLock ? 'ACCOUNT_LOCKED' : 'LOGIN_FAILED',
        targetType: 'User',
        targetId: user.id,
        details: { attempts },
        ip: getClientIp(req),
      });
      if (shouldLock) {
        return NextResponse.json(
          {
            success: false,
            error: `Terlalu banyak percobaan gagal. Akun terkunci ${LOCK_MINUTES} menit.`,
          },
          { status: 423 }
        );
      }
      return invalidCredentials();
    }

    // Success — clear any failure counters
    if (user.failedLoginAttempts !== 0 || user.lockedUntil) {
      await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
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

    await recordAudit({
      actor: { userId: user.id, name: user.name, role: user.role },
      action: 'LOGIN_SUCCESS',
      targetType: 'User',
      targetId: user.id,
      ip: getClientIp(req),
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
