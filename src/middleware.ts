import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';

const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/cron/auto-checkout', '/api/cron/checkout-reminder'];
const ADMIN_ONLY_PATHS = ['/admin'];
const MANAGER_PATHS = ['/team', '/reports'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow static files and Next.js internals
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/icons') ||
    pathname.startsWith('/manifest') ||
    pathname === '/.well-known/appspecific/com.chrome.devtools.json'
  ) {
    return NextResponse.next();
  }

  // Allow public paths — exact match or exact prefix with /
  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  );
  if (isPublic) return NextResponse.next();

  // Require auth token
  const token = req.cookies.get('absensi_token')?.value;
  if (!token) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { success: false, error: 'Tidak memiliki akses.' },
        { status: 401 }
      );
    }
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const user = await verifyToken(token);
  if (!user) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { success: false, error: 'Token tidak valid atau sudah kadaluarsa.' },
        { status: 401 }
      );
    }
    const res = NextResponse.redirect(new URL('/login', req.url));
    res.cookies.delete('absensi_token');
    return res;
  }

  // Admin-only UI paths — redirect non-admins
  const isAdminUiPath = ADMIN_ONLY_PATHS.some((p) => pathname.startsWith(p));
  if (isAdminUiPath && user.role !== 'ADMIN') {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  // Admin-only API paths — return 403 for non-admins
  const isAdminApiPath =
    pathname.startsWith('/api/departments') ||
    pathname.startsWith('/api/offices') ||
    pathname.startsWith('/api/work-schedules') ||
    pathname.startsWith('/api/holidays') ||
    pathname.startsWith('/api/users');
  if (isAdminApiPath && user.role !== 'ADMIN') {
    return NextResponse.json(
      { success: false, error: 'Tidak memiliki akses.' },
      { status: 403 }
    );
  }

  // Redirect root to dashboard
  if (pathname === '/') {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  // Add user info to request headers for server components (optional, safe)
  const res = NextResponse.next();
  res.headers.set('x-user-id', user.userId);
  res.headers.set('x-user-role', user.role);
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
