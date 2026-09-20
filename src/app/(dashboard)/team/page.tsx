'use client';

import { useEffect, useState } from 'react';
import { Search, Filter, Download, RefreshCw, CheckCircle2, XCircle, Clock, AlertTriangle, MapPin } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn, formatTime, getStatusBadgeColor, getStatusLabel, formatDate, getTodayString } from '@/lib/utils';
import type { Attendance } from '@/types';

export default function TeamPage() {
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [date, setDate] = useState(getTodayString());
  const [departments, setDepartments] = useState<string[]>([]);

  async function load() {
    setLoading(true);
    const params = new URLSearchParams({ date });
    if (filterDept) params.set('department', filterDept);
    if (filterStatus) params.set('status', filterStatus);
    const res = await fetch(`/api/attendances?${params}`);
    const data = await res.json();
    if (data.success) {
      setAttendances(data.data);
      const depts = Array.from(new Set(data.data.map((a: Attendance) => a.user?.department).filter(Boolean))) as string[];
      setDepartments(depts);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, [date, filterDept, filterStatus]);

  const filtered = attendances.filter((a) =>
    !search ||
    a.user?.name?.toLowerCase().includes(search.toLowerCase()) ||
    a.user?.nik?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Kehadiran Tim</h1>
          <p className="text-sm text-slate-500 mt-0.5">{formatDate(date)}</p>
        </div>
        <button onClick={load} className="btn-secondary btn-sm">
          <RefreshCw size={14} /> Muat Ulang
        </button>
      </div>

      {/* Filters */}
      <div className="card space-y-3">
        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              className="input pl-9"
              placeholder="Cari nama atau NIK..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <input
            type="date"
            className="input w-auto"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <select className="input w-auto" value={filterDept} onChange={(e) => setFilterDept(e.target.value)}>
            <option value="">Semua Departemen</option>
            {departments.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select className="input w-auto" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">Semua Status</option>
            <option value="PRESENT">Hadir</option>
            <option value="ABSENT">Tidak Hadir</option>
          </select>
        </div>
      </div>

      {/* Summary badges */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'Hadir', count: filtered.filter(a => a.status === 'PRESENT').length, color: 'bg-green-50 text-green-700' },
          { label: 'Pulang Otomatis', count: filtered.filter(a => a.isAutoCheckout).length, color: 'bg-purple-50 text-purple-700' },
          { label: 'Diluar Radius', count: filtered.filter(a => a.isOutOfRadius).length, color: 'bg-orange-50 text-orange-700' },
        ].map((s) => (
          <div key={s.label} className={cn('rounded-xl px-3 py-2 text-center', s.color)}>
            <p className="text-xl font-bold">{s.count}</p>
            <p className="text-xs font-medium">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="space-y-0.5">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-16 bg-gray-100 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <Clock size={36} className="mx-auto mb-2 opacity-40" />
            <p>Belum ada data absensi untuk tanggal ini.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-slate-500 text-xs font-semibold uppercase tracking-wide">
                  <th className="text-left px-5 py-3">Karyawan</th>
                  <th className="text-left px-4 py-3">Masuk</th>
                  <th className="text-left px-4 py-3">Pulang</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Catatan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center text-slate-600 font-bold text-xs flex-shrink-0">
                          {a.user?.name?.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800">{a.user?.name}</p>
                          <p className="text-xs text-slate-400">{a.user?.nik} · {a.user?.department}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-slate-800">
                        {a.checkIn ? formatTime(a.checkIn) : '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-slate-800">
                        {a.checkOut ? formatTime(a.checkOut) : '-'}
                      </span>
                      {a.isAutoCheckout && (
                        <span className="ml-1.5 text-xs text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded-full">Auto</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <span className={cn('badge w-fit', getStatusBadgeColor(a.status))}>
                          {getStatusLabel(a.status)}
                        </span>
                        {a.isOutOfRadius && (
                          <span className="badge w-fit bg-orange-50 text-orange-600 border-orange-200 text-xs">
                            <MapPin size={10} /> Luar Radius
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs max-w-xs truncate">
                      {a.notes || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
