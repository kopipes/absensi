'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Bell, Search } from 'lucide-react';
import { cn, formatDate } from '@/lib/utils';
import type { JWTPayload } from '@/lib/auth';

export default function TopBar({ user }: { user: JWTPayload }) {
  const [unread, setUnread] = useState(0);
  const today = formatDate(new Date(), 'EEEE, dd MMMM yyyy');

  useEffect(() => {
    fetch('/api/notifications')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setUnread(d.data.filter((n: { isRead: boolean }) => !n.isRead).length);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <header className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-gray-100 px-4 md:px-6 py-3">
      <div className="flex items-center justify-between gap-4">
        {/* Mobile logo */}
        <div className="md:hidden flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center">
            <span className="text-white text-xs font-bold">HB</span>
          </div>
          <span className="font-bold text-slate-900">Absensi</span>
        </div>

        {/* Date - desktop */}
        <div className="hidden md:block">
          <p className="text-sm text-slate-500 capitalize">{today}</p>
        </div>

        <div className="flex items-center gap-3 ml-auto">
          {/* Notification bell */}
          <Link
            href="/notifications"
            className="relative w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100 transition-colors"
          >
            <Bell size={18} className="text-slate-600" />
            {unread > 0 && (
              <span className={cn(
                'absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-xs font-bold flex items-center justify-center',
                'bg-red-500 text-white'
              )}>
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </Link>

          {/* Avatar */}
          <Link href="/profile" className="flex items-center gap-2 p-1 rounded-xl hover:bg-gray-100 transition-colors">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white font-bold text-sm">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <span className="hidden md:block text-sm font-semibold text-slate-700">{user.name.split(' ')[0]}</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
