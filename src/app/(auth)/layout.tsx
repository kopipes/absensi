import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const token = cookieStore.get('absensi_token')?.value;
  if (token) {
    const user = await verifyToken(token);
    if (user) redirect('/dashboard');
  }
  return <>{children}</>;
}
