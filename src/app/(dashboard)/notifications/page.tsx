'use client';

import { useEffect, useState } from 'react';
import { Bell, Check, CheckCheck, MapPin, AlertCircle, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn, formatDateTime } from '@/lib/utils';
import type { Notification } from '@/types';

const typeConfig: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  OUT_OF_RADIUS:       { icon: MapPin,     color: 'text-orange-600', bg: 'bg-orange-50' },
  MISSING_CHECKOUT:    { icon: AlertCircle,color: 'text-red-600',    bg: 'bg-red-50' },
  CORRECTION_REQUEST:  { icon: Bell,       color: 'text-blue-600',   bg: 'bg-blue-50' },
  CORRECTION_APPROVED: { icon: Check,      color: 'text-green-600',  bg: 'bg-green-50' },
  CORRECTION_REJECTED: { icon: AlertCircle,color: 'text-red-600',    bg: 'bg-red-50' },
  SYSTEM:              { icon: Info,       color: 'text-slate-600',  bg: 'bg-slate-50' },
};

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const res = await fetch('/api/notifications');
    const data = await res.json();
    if (data.success) setNotifications(data.data);
    setLoading(false);
  }

  async function markAllRead() {
    await fetch('/api/notifications', { method: 'PATCH' });
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    toast.success('Semua notifikasi ditandai sudah dibaca.');
  }

  useEffect(() => { load(); }, []);

  const unread = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Notifikasi</h1>
          {unread > 0 && (
            <p className="text-sm text-slate-500 mt-0.5">{unread} belum dibaca</p>
          )}
        </div>
        {unread > 0 && (
          <button onClick={markAllRead} className="btn-secondary btn-sm">
            <CheckCheck size={14} /> Tandai Semua Dibaca
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <div className="card text-center py-16">
          <Bell size={40} className="mx-auto mb-3 text-slate-300" />
          <p className="text-slate-500 font-medium">Tidak ada notifikasi</p>
          <p className="text-slate-400 text-sm mt-1">Notifikasi akan muncul di sini</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => {
            const cfg = typeConfig[n.type] || typeConfig.SYSTEM;
            return (
              <div
                key={n.id}
                className={cn(
                  'card transition-all',
                  !n.isRead && 'border-brand-200 bg-brand-50/30'
                )}
              >
                <div className="flex gap-3">
                  <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0', cfg.bg)}>
                    <cfg.icon size={18} className={cfg.color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={cn('text-sm font-semibold', !n.isRead ? 'text-slate-900' : 'text-slate-700')}>
                        {n.title}
                      </p>
                      {!n.isRead && (
                        <span className="w-2 h-2 rounded-full bg-brand-500 flex-shrink-0 mt-1.5" />
                      )}
                    </div>
                    <p className="text-sm text-slate-600 mt-0.5">{n.message}</p>
                    <p className="text-xs text-slate-400 mt-1.5">{formatDateTime(n.createdAt)}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
