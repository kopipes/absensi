'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Clock, Users, BarChart3, Settings,
  Fingerprint, CalendarDays, MapPin, Bell, LogOut, ChevronRight,
  Building2, Edit2, ShieldCheck, ChevronDown, Camera, ScrollText
} from 'lucide-react';
import { cn, getRoleLabel, getRoleBadgeColor } from '@/lib/utils';
import type { JWTPayload } from '@/lib/auth';

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
}

interface NavGroup {
  label: string;
  roles?: string[];
  collapsible?: boolean;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: 'Menu Utama',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/attendance', label: 'Absensi', icon: Clock },
    ],
  },
  {
    label: 'Manajemen Tim',
    roles: ['ADMIN', 'MANAGER', 'SPV'],
    items: [
      { href: '/team', label: 'Tim Saya', icon: Users },
      { href: '/corrections', label: 'Koreksi Absen', icon: Edit2 },
      { href: '/reports', label: 'Laporan', icon: BarChart3 },
    ],
  },
  {
    label: 'Administrasi',
    roles: ['ADMIN'],
    collapsible: true,
    items: [
      { href: '/admin/users', label: 'Kelola Karyawan', icon: Users },
      { href: '/admin/departments', label: 'Departemen', icon: Building2 },
      { href: '/admin/offices', label: 'Lokasi Kantor', icon: MapPin },
      { href: '/admin/holidays', label: 'Hari Libur', icon: CalendarDays },
      { href: '/admin/work-hours', label: 'Jadwal Kerja', icon: Settings },
      { href: '/admin/photos', label: 'Foto Absensi', icon: Camera },
      { href: '/admin/audit', label: 'Audit Log', icon: ScrollText },
    ],
  },
];

export default function Sidebar({ user }: { user: JWTPayload }) {
  const pathname = usePathname();

  // Auto-expand Administrasi if current path is under /admin
  const [adminOpen, setAdminOpen] = useState(pathname.startsWith('/admin'));

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  const visibleGroups = navGroups.filter(
    (group) => !group.roles || group.roles.includes(user.role)
  );

  return (
    <aside className="hidden md:flex flex-col w-64 bg-white border-r border-gray-100 h-screen sticky top-0">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-100">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center shadow-sm">
          <Fingerprint className="w-5 h-5 text-white" />
        </div>
        <span className="text-lg font-bold text-slate-900">Absen<span className="text-brand-500">si</span></span>
      </div>

      {/* User info */}
      <div className="px-4 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3 p-2 rounded-xl bg-slate-50">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800 truncate">{user.name}</p>
            <span className={cn('badge text-xs', getRoleBadgeColor(user.role))}>
              {getRoleLabel(user.role)}
            </span>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-4">
        {visibleGroups.map((group) => {
          const isCollapsible = group.collapsible;
          const isOpen = isCollapsible ? adminOpen : true;
          const hasActiveItem = group.items.some(
            (item) => pathname === item.href || pathname.startsWith(item.href + '/')
          );

          return (
            <div key={group.label}>
              {/* Group header */}
              {isCollapsible ? (
                <button
                  onClick={() => setAdminOpen((o) => !o)}
                  className={cn(
                    'w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all mb-1',
                    hasActiveItem
                      ? 'text-brand-600 bg-brand-50'
                      : 'text-slate-400 hover:text-slate-600 hover:bg-gray-50'
                  )}
                >
                  <ShieldCheck size={13} className="flex-shrink-0" />
                  <span className="flex-1 text-left">{group.label}</span>
                  <ChevronDown
                    size={13}
                    className={cn('transition-transform duration-200', isOpen && 'rotate-180')}
                  />
                </button>
              ) : (
                <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  {group.label}
                </p>
              )}

              {/* Group items */}
              {isOpen && (
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group',
                          isActive
                            ? 'bg-brand-50 text-brand-600'
                            : 'text-slate-600 hover:bg-gray-50 hover:text-slate-900'
                        )}
                      >
                        <item.icon
                          size={18}
                          className={cn(
                            'flex-shrink-0',
                            isActive ? 'text-brand-500' : 'text-slate-400 group-hover:text-slate-600'
                          )}
                        />
                        <span className="flex-1">{item.label}</span>
                        {isActive && <ChevronRight size={14} className="text-brand-400" />}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Notifications & logout */}
      <div className="px-3 py-4 border-t border-gray-100 space-y-0.5">
        <Link
          href="/notifications"
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
            pathname === '/notifications'
              ? 'bg-brand-50 text-brand-600'
              : 'text-slate-600 hover:bg-gray-50 hover:text-slate-900'
          )}
        >
          <Bell size={18} className={pathname === '/notifications' ? 'text-brand-500' : 'text-slate-400'} />
          Notifikasi
        </Link>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 transition-all"
        >
          <LogOut size={18} />
          Keluar
        </button>
      </div>
    </aside>
  );
}
