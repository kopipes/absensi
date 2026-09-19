'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Clock, Users, BarChart3, Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { JWTPayload } from '@/lib/auth';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/attendance', label: 'Absen', icon: Clock },
  { href: '/team', label: 'Tim', icon: Users, roles: ['ADMIN', 'MANAGER', 'SPV'] },
  { href: '/reports', label: 'Laporan', icon: BarChart3, roles: ['ADMIN', 'MANAGER', 'SPV'] },
  { href: '/notifications', label: 'Notifikasi', icon: Bell },
];

export default function MobileNav({ user }: { user: JWTPayload }) {
  const pathname = usePathname();

  const filtered = navItems.filter(
    (item) => !item.roles || item.roles.includes(user.role)
  );

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-100 z-50 safe-area-bottom" aria-label="Navigasi utama">
      <div className="flex items-center justify-around px-2 py-2">
        {filtered.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-all',
                isActive ? 'text-sky-500' : 'text-slate-400'
              )}
            >
              <item.icon size={22} aria-hidden="true" />
              <span className="text-xs font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
