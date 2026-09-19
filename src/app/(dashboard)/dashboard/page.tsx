'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Users, Clock, AlertCircle, CheckCircle2,
  Calendar, ArrowRight, MapPin, Timer
} from 'lucide-react';
import { cn, formatDate, formatTime, getStatusBadgeColor, getStatusLabel } from '@/lib/utils';
import type { Attendance } from '@/types';

interface DashboardStats {
  totalEmployees: number;
  presentToday: number;
  absentToday: number;
  outOfRadiusToday: number;
  autoCutoffToday: number;
  pendingCorrections: number;
  todayAttendances: Attendance[];
}

interface UserProfile {
  id: string;
  role: string;
  name: string;
  workScheduleId?: string | null;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [myAttendance, setMyAttendance] = useState<Attendance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const today = new Date().toISOString().split('T')[0];
      const [meRes, attRes] = await Promise.all([
        fetch('/api/auth/me'),
        fetch(`/api/attendances?date=${today}`),
      ]);

      const [meData, attData] = await Promise.all([meRes.json(), attRes.json()]);

      if (!meData.success) { setError('Gagal memuat profil.'); return; }
      const me: UserProfile = meData.data;
      setProfile(me);

      // My own attendance
      if (attData.success) {
        const mine = attData.data.find((a: Attendance) => a.userId === me.id);
        if (mine) setMyAttendance(mine);
      }

      // Manager/Admin/SPV: load dashboard stats
      if (['ADMIN', 'MANAGER', 'SPV'].includes(me.role)) {
        const statsRes = await fetch('/api/dashboard');
        const statsData = await statsRes.json();
        if (statsData.success) setStats(statsData.data);
      }
    } catch {
      setError('Gagal memuat data. Periksa koneksi internet Anda.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const isManager = profile?.role === 'ADMIN' || profile?.role === 'MANAGER' || profile?.role === 'SPV';

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse max-w-6xl mx-auto">
        <div className="h-8 bg-gray-200 rounded-xl w-48" />
        <div className="h-28 bg-gray-200 rounded-2xl" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-gray-200 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="card bg-red-50 border-red-200 text-red-700 flex items-center gap-3">
          <AlertCircle size={18} />
          <div className="flex-1">{error}</div>
          <button onClick={load} className="btn-secondary btn-sm">Coba Lagi</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="text-slate-500 text-sm capitalize mt-0.5">
            {formatDate(new Date(), 'EEEE, dd MMMM yyyy')}
          </p>
        </div>
        <Link href="/attendance" className="btn-primary btn-sm hidden md:flex">
          <Clock size={14} />Absen Sekarang
        </Link>
      </div>

      {/* My attendance card */}
      {myAttendance ? (
        <div className="card bg-gradient-to-r from-sky-500 to-sky-600 text-white border-0">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sky-100 text-sm font-medium">Status Hari Ini</p>
              <p className="text-2xl font-bold mt-1">
                {myAttendance.checkOut ? 'Sudah Pulang' : myAttendance.checkIn ? 'Sedang Bekerja' : 'Belum Absen'}
              </p>
            </div>
            {myAttendance.checkIn && (
              <div className="text-right">
                <p className="text-sky-100 text-xs">Masuk</p>
                <p className="text-xl font-bold">{formatTime(myAttendance.checkIn)}</p>
              </div>
            )}
          </div>
          {(myAttendance.isOutOfRadius || myAttendance.isAutoCheckout) && (
            <div className="flex gap-2 mt-3 flex-wrap">
              {myAttendance.isAutoCheckout && (
                <span className="bg-white/20 text-white text-xs px-2 py-1 rounded-lg">
                  Pulang otomatis (cutoff)
                </span>
              )}
              {myAttendance.isOutOfRadius && (
                <span className="bg-yellow-400/30 text-white text-xs px-2 py-1 rounded-lg">
                  Di luar radius
                </span>
              )}
            </div>
          )}
        </div>
      ) : (
        <Link href="/attendance" className="block">
          <div className="card bg-gradient-to-r from-sky-500 to-sky-600 text-white border-0 hover:shadow-lg transition-shadow cursor-pointer">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sky-100 text-sm font-medium">Absensi Hari Ini</p>
                <p className="text-2xl font-bold mt-1">Belum Absen Masuk</p>
                <p className="text-sky-200 text-sm mt-1">Tap untuk absen sekarang</p>
              </div>
              <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center">
                <Clock size={28} className="text-white" />
              </div>
            </div>
          </div>
        </Link>
      )}

      {/* Manager/Admin stats */}
      {isManager && stats && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            <StatCard label="Total Karyawan" value={stats.totalEmployees} icon={Users} color="text-blue-500 bg-blue-50" />
            <StatCard label="Hadir Hari Ini" value={stats.presentToday} icon={CheckCircle2} color="text-green-500 bg-green-50" />
            <StatCard label="Tidak Hadir" value={stats.absentToday} icon={Timer} color="text-red-500 bg-red-50" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Diluar Radius" value={stats.outOfRadiusToday} icon={MapPin} color="text-orange-500 bg-orange-50" />
            <StatCard label="Pulang Otomatis" value={stats.autoCutoffToday} icon={Timer} color="text-purple-500 bg-purple-50" />
            <Link href="/corrections">
              <div className={cn('stat-card cursor-pointer hover:shadow-md transition-shadow', stats.pendingCorrections > 0 && 'border-yellow-200 bg-yellow-50/50')}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-2 bg-cyan-50">
                  <Calendar size={18} className="text-cyan-500" />
                </div>
                <p className="text-2xl font-bold text-slate-900">{stats.pendingCorrections}</p>
                <p className="text-xs text-slate-500 font-medium">Koreksi Pending</p>
              </div>
            </Link>
          </div>

          {/* Today list */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="section-title">Kehadiran Hari Ini</h2>
              <Link href="/team" className="text-sm text-sky-500 font-semibold flex items-center gap-1 hover:text-sky-600">
                Lihat semua <ArrowRight size={14} />
              </Link>
            </div>
            <div className="space-y-2">
              {stats.todayAttendances.slice(0, 8).map((a) => (
                <div key={a.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center text-slate-600 font-bold text-sm flex-shrink-0">
                    {a.user?.name?.charAt(0).toUpperCase() || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{a.user?.name}</p>
                    <p className="text-xs text-slate-500">{a.user?.department}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-semibold text-slate-800">{a.checkIn ? formatTime(a.checkIn) : '-'}</p>
                    <span className={cn('badge text-xs', getStatusBadgeColor(a.status))}>{getStatusLabel(a.status)}</span>
                  </div>
                </div>
              ))}
              {stats.todayAttendances.length === 0 && (
                <p className="text-slate-400 text-sm text-center py-8">Belum ada data absensi hari ini.</p>
              )}
            </div>
          </div>
        </>
      )}

      {/* Quick links for regular users */}
      {!isManager && (
        <div className="grid grid-cols-2 gap-3">
          <Link href="/attendance" className="card-hover flex flex-col items-center gap-3 text-center p-6">
            <div className="w-12 h-12 rounded-2xl bg-sky-50 flex items-center justify-center">
              <Clock size={22} className="text-sky-500" />
            </div>
            <div><p className="font-semibold text-slate-800">Absen</p><p className="text-xs text-slate-500">Masuk & Pulang</p></div>
          </Link>
          <Link href="/attendance" className="card-hover flex flex-col items-center gap-3 text-center p-6">
            <div className="w-12 h-12 rounded-2xl bg-green-50 flex items-center justify-center">
              <Calendar size={22} className="text-green-500" />
            </div>
            <div><p className="font-semibold text-slate-800">Riwayat</p><p className="text-xs text-slate-500">Histori Absensi</p></div>
          </Link>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: React.ElementType; color: string }) {
  return (
    <div className="stat-card">
      <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center mb-2', color)}>
        <Icon size={18} />
      </div>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-xs text-slate-500 font-medium">{label}</p>
    </div>
  );
}
