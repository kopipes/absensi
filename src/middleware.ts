import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';

const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/cron/auto-checkout', '/api/cron/checkout-reminder', '/api/cron/photo-retention'];
const ADMIN_ONLY_PATHS = ['/admin'];
const MANAGER_PATHS = ['/team', '/reports'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Absolute redirects must use the public URL when running behind a reverse
  // proxy (and when the server binds to a loopback host via `next start -H`).
  const baseUrl = process.env.APP_URL || req.url;
  const redirectTo = (path: string) => NextResponse.redirect(new URL(path, baseUrl));

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

  // Allow the publishable user guide (served as a static file from /public)
  if (pathname === '/guide' || pathname.startsWith('/guide/')) {
    return NextResponse.next();
  }

  // Require auth token
  const token = req.cookies.get('absensi_token')?.value;
  if (!token) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { success: false, error: 'Tidak memiliki akses.' },
        { status: 401 }
      );
    }
    return redirectTo('/login');
  }

  const user = await verifyToken(token);
  if (!user) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { success: false, error: 'Token tidak valid atau sudah kadaluarsa.' },
        { status: 401 }
      );
    }
    const res = redirectTo('/login');
    res.cookies.delete('absensi_token');
    return res;
  }

  // Admin-only UI paths — redirect non-admins
  const isAdminUiPath = ADMIN_ONLY_PATHS.some((p) => pathname.startsWith(p));
  if (isAdminUiPath && user.role !== 'ADMIN') {
    return redirectTo('/dashboard');
  }

  // Admin-only API paths — return 403 for non-admins.
  // `/api/departments` is intentionally excluded: GET serves the report
  // filter for managers, while POST/PUT/DELETE enforce ADMIN in the route.
  // `/api/users/<id>` is left to the route so users can read/update their own
  // profile; the collection and the Excel import stay admin-only.
  const isAdminApiPath =
    pathname.startsWith('/api/offices') ||
    pathname.startsWith('/api/work-schedules') ||
    pathname.startsWith('/api/holidays') ||
    pathname.startsWith('/api/admin') ||
    pathname === '/api/users' ||
    pathname === '/api/users/' ||
    pathname.startsWith('/api/users/import');
  if (isAdminApiPath && user.role !== 'ADMIN') {
    return NextResponse.json(
      { success: false, error: 'Tidak memiliki akses.' },
      { status: 403 }
    );
  }

  // Redirect root to dashboard
  if (pathname === '/') {
    return redirectTo('/dashboard');
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
