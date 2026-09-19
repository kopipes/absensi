'use client';

import { useEffect, useState, useMemo } from 'react';
import { Download, Search, BarChart3, Filter, MapPin, X, ExternalLink, Camera } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  cn, formatDate, formatTime, getStatusBadgeColor, getStatusLabel, formatMinutes, getPhotoUrl,
  calculateWorkedMinutes, calculateShortageMinutes, STANDARD_WORK_MINUTES,
} from '@/lib/utils';
import type { Attendance } from '@/types';

interface Stats {
  total: number; present: number; absent: number;
  shortage: number; autoCutoff: number; outOfRadius: number;
}

interface UserSummaryRow {
  userId: string;
  nik: string;
  name: string;
  department: string;
  totalDays: number;
  enoughDays: number;
  shortDays: number;
  incompleteDays: number;
  shortMinutes: number;
}

export default function ReportsPage() {
  const today = new Date().toISOString().split('T')[0];
  const firstOfMonth = today.slice(0, 8) + '01';

  const [startDate, setStartDate] = useState(firstOfMonth);
  const [endDate, setEndDate] = useState(today);
  const [department, setDepartment] = useState('');
  const [search, setSearch] = useState('');
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [summary, setSummary] = useState<UserSummaryRow[]>([]);
  const [view, setView] = useState<'detail' | 'summary'>('detail');
  const [departments, setDepartments] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [selected, setSelected] = useState<Attendance | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  // Load departments from master data
  useEffect(() => {
    fetch('/api/departments')
      .then(r => r.json())
      .then(d => { if (d.success) setDepartments(d.data.map((dept: { name: string }) => dept.name)); })
      .catch(() => {});
  }, []);

  async function loadReport() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ startDate, endDate });
      if (department) params.set('department', department);
      const res = await fetch(`/api/reports?${params}`);
      const data = await res.json();
      if (data.success) {
        setAttendances(data.data.attendances);
        setStats(data.data.stats);
        setSummary(data.data.summary || []);
      } else {
        toast.error(data.error || 'Gagal memuat laporan.');
      }
    } catch {
      toast.error('Gagal terhubung ke server.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadReport(); }, []);

  async function handleExport() {
    setExporting(true);
    try {
      const params = new URLSearchParams({ startDate, endDate, format: 'xlsx', view });
      if (department) params.set('department', department);
      const res = await fetch(`/api/reports?${params}`);
      if (!res.ok) { toast.error('Gagal mengekspor.'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `laporan-absensi-${startDate}-${endDate}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Laporan berhasil diexport!');
    } catch {
      toast.error('Gagal mengekspor laporan.');
    } finally {
      setExporting(false);
    }
  }

  // Reset page when search/data changes
  const filtered = useMemo(() => {
    setPage(1);
    return attendances
      .filter((a) =>
        !search ||
        a.user?.name?.toLowerCase().includes(search.toLowerCase()) ||
        a.user?.nik?.toLowerCase().includes(search.toLowerCase())
      )
      .sort((a, b) => b.date.localeCompare(a.date)); // terbaru di atas
  }, [attendances, search]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Laporan Absensi</h1>
        <button
          onClick={handleExport}
          disabled={exporting || (view === 'summary' ? summary.length === 0 : attendances.length === 0)}
          className="btn-primary btn-sm"
        >
          <Download size={14} />
          {exporting ? 'Mengekspor...' : view === 'summary' ? 'Export Rekap' : 'Export Detail'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex bg-gray-100 p-1 rounded-2xl">
        <button
          className={cn('flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all', view === 'detail' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500')}
          onClick={() => setView('detail')}
        >
          Detail Absensi
        </button>
        <button
          className={cn('flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all', view === 'summary' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500')}
          onClick={() => setView('summary')}
        >
          Rekap per Karyawan
        </button>
      </div>

      {/* Filters */}
      <div className="card space-y-3">
        <div className="flex gap-2 flex-wrap items-end">
          <div>
            <label className="label">Dari Tanggal</label>
            <input type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <label className="label">Sampai Tanggal</label>
            <input type="date" className="input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div>
            <label className="label">Departemen</label>
            <select className="input" value={department} onChange={(e) => setDepartment(e.target.value)}>
              <option value="">Semua Departemen</option>
              {departments.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <button onClick={loadReport} disabled={loading} className="btn-primary self-end">
            <Filter size={15} /> {loading ? 'Memuat...' : 'Tampilkan'}
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total Records',  value: stats.total,       color: 'text-slate-700 bg-gray-100' },
            { label: 'Hadir',          value: stats.present,     color: 'text-green-700 bg-green-50' },
            { label: 'Tidak Hadir',    value: stats.absent,      color: 'text-red-700 bg-red-50' },
            { label: 'Kurang Jam Kerja', value: stats.shortage,  color: 'text-orange-700 bg-orange-50' },
            { label: 'Pulang Otomatis', value: stats.autoCutoff, color: 'text-purple-700 bg-purple-50' },
            { label: 'Luar Radius',    value: stats.outOfRadius, color: 'text-sky-700 bg-sky-50' },
            { label: '% Kehadiran',    value: stats.total ? Math.round((stats.present / stats.total) * 100) + '%' : '-', color: 'text-sky-700 bg-sky-50' },
          ].map((s) => (
            <div key={s.label} className={cn('rounded-xl px-4 py-3', s.color)}>
              <p className="text-2xl font-bold">{s.value}</p>
              <p className="text-xs font-medium opacity-75">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Rekap per Karyawan */}
      {view === 'summary' && (
      <div className="card p-0 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="section-title">Rekap per Karyawan</h2>
          <p className="text-xs text-slate-500 mt-0.5">Standar {formatMinutes(STANDARD_WORK_MINUTES)} per hari</p>
        </div>
        {summary.length === 0 ? (
          <p className="text-center py-10 text-slate-400 text-sm">Tidak ada data untuk filter yang dipilih.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-slate-500 text-xs font-semibold uppercase tracking-wide">
                  <th className="text-left px-5 py-3">Karyawan</th>
                  <th className="text-left px-4 py-3">Departemen</th>
                  <th className="text-right px-4 py-3">Total Hari Absen</th>
                  <th className="text-right px-4 py-3">Cukup 8 Jam</th>
                  <th className="text-right px-4 py-3">Kurang 8 Jam</th>
                  <th className="text-right px-4 py-3">Belum Lengkap</th>
                  <th className="text-right px-5 py-3">Total Kekurangan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {summary.map((s) => (
                  <tr key={s.userId} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-2.5">
                      <p className="font-semibold text-slate-800">{s.name}</p>
                      <p className="text-xs text-slate-400">{s.nik}</p>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{s.department || '-'}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-slate-800">{s.totalDays}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-green-700">{s.enoughDays}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-red-600">{s.shortDays}</td>
                    <td className="px-4 py-2.5 text-right text-slate-500">{s.incompleteDays}</td>
                    <td className="px-5 py-2.5 text-right font-semibold text-orange-600">
                      {s.shortMinutes > 0 ? formatMinutes(s.shortMinutes) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {view === 'detail' && (
      <>
      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          className="input pl-9"
          placeholder="Cari nama atau NIK..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Hint */}
      {filtered.length > 0 && (
        <p className="text-xs text-slate-400 -mt-2">Klik baris untuk melihat detail foto & lokasi GPS</p>
      )}

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="space-y-0.5 p-2">
            {[...Array(8)].map((_, i) => <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <BarChart3 size={36} className="mx-auto mb-2 opacity-40" />
            <p>Tidak ada data untuk filter yang dipilih.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-slate-500 text-xs font-semibold uppercase tracking-wide">
                  <th className="text-left px-5 py-3">Karyawan</th>
                  <th className="text-left px-4 py-3">Tanggal</th>
                  <th className="text-left px-4 py-3">Masuk</th>
                  <th className="text-left px-4 py-3">Pulang</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Jam Kerja</th>
                  <th className="text-left px-4 py-3">Kekurangan</th>
                  <th className="text-left px-4 py-3">Lokasi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginated.map((a) => {
                  const worked = calculateWorkedMinutes(a.checkIn, a.checkOut);
                  const shortage = a.checkIn && a.checkOut ? calculateShortageMinutes(worked) : 0;
                  return (
                  <tr
                    key={a.id}
                    onClick={() => setSelected(a)}
                    className="hover:bg-sky-50 transition-colors cursor-pointer"
                  >
                    <td className="px-5 py-2.5">
                      <p className="font-semibold text-slate-800">{a.user?.name}</p>
                      <p className="text-xs text-slate-400">{a.user?.nik} · {a.user?.department}</p>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{formatDate(a.date, 'dd MMM yyyy')}</td>
                    <td className="px-4 py-2.5 font-semibold text-slate-800">{a.checkIn ? formatTime(a.checkIn) : '-'}</td>
                    <td className="px-4 py-2.5 font-semibold text-slate-800">{a.checkOut ? formatTime(a.checkOut) : '-'}</td>
                    <td className="px-4 py-2.5">
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
                    <td className="px-4 py-2.5">
                      {a.checkIn && a.checkOut
                        ? <span className="font-semibold text-slate-800">{formatMinutes(worked)}</span>
                        : <span className="text-slate-400">-</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      {a.checkIn && a.checkOut ? (
                        shortage > 0
                          ? <span className="font-semibold text-red-600">Kurang {formatMinutes(shortage)}</span>
                          : <span className="text-green-600">Cukup</span>
                      ) : <span className="text-slate-400">-</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      {a.checkInLat
                        ? <span className="flex items-center gap-1 text-sky-600 text-xs font-medium">
                            <MapPin size={12} /> Ada
                          </span>
                        : <span className="text-slate-400 text-xs">-</span>}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">
            Menampilkan {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} dari {filtered.length} data
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(1)}
              disabled={page === 1}
              className="btn-secondary btn-sm px-2 py-1.5 disabled:opacity-40"
            >«</button>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="btn-secondary btn-sm disabled:opacity-40"
            >‹ Prev</button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                // Show pages around current page
                let pageNum: number;
                if (totalPages <= 5) pageNum = i + 1;
                else if (page <= 3) pageNum = i + 1;
                else if (page >= totalPages - 2) pageNum = totalPages - 4 + i;
                else pageNum = page - 2 + i;
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={cn(
                      'w-8 h-8 rounded-lg text-sm font-semibold transition-all',
                      page === pageNum
                        ? 'bg-sky-500 text-white'
                        : 'bg-white border border-gray-200 text-slate-600 hover:border-sky-300'
                    )}
                  >{pageNum}</button>
                );
              })}
            </div>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="btn-secondary btn-sm disabled:opacity-40"
            >Next ›</button>
            <button
              onClick={() => setPage(totalPages)}
              disabled={page === totalPages}
              className="btn-secondary btn-sm px-2 py-1.5 disabled:opacity-40"
            >»</button>
          </div>
        </div>
      )}
      </>
      )}

      {/* Detail Modal */}
      {selected && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setSelected(null); }}
        >
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-slide-up">
            {/* Header */}
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-3xl">
              <div>
                <h2 className="text-lg font-bold text-slate-900">{selected.user?.name}</h2>
                <p className="text-sm text-slate-500">{formatDate(selected.date, 'EEEE, dd MMMM yyyy')}</p>
              </div>
              <button onClick={() => setSelected(null)} className="btn-ghost p-1.5" aria-label="Tutup">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Basic info */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <InfoBox label="Jam Masuk" value={selected.checkIn ? formatTime(selected.checkIn) : '-'} />
                <InfoBox label="Jam Pulang" value={selected.checkOut ? formatTime(selected.checkOut) : '-'} />
                <InfoBox label="Status" value={getStatusLabel(selected.status)} />
                <InfoBox
                  label="Jam Kerja"
                  value={selected.checkIn && selected.checkOut ? formatMinutes(calculateWorkedMinutes(selected.checkIn, selected.checkOut)) : '-'}
                />
                <InfoBox
                  label={`Kekurangan dari ${formatMinutes(STANDARD_WORK_MINUTES)}`}
                  value={
                    selected.checkIn && selected.checkOut
                      ? (calculateShortageMinutes(calculateWorkedMinutes(selected.checkIn, selected.checkOut)) > 0
                          ? `Kurang ${formatMinutes(calculateShortageMinutes(calculateWorkedMinutes(selected.checkIn, selected.checkOut)))}`
                          : 'Cukup')
                      : '-'
                  }
                  highlight={
                    !!selected.checkIn && !!selected.checkOut &&
                    calculateShortageMinutes(calculateWorkedMinutes(selected.checkIn, selected.checkOut)) > 0
                  }
                />
                <InfoBox label="Pulang Otomatis" value={selected.isAutoCheckout ? 'Ya (cutoff)' : 'Tidak'} highlight={selected.isAutoCheckout} />
                <InfoBox label="Luar Radius" value={selected.isOutOfRadius ? 'Ya' : 'Tidak'} highlight={selected.isOutOfRadius} />
              </div>

              {/* Check-in location */}
              {(selected.checkInLat || selected.checkInAddress) && (
                <div>
                  <h3 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-1.5">
                    <MapPin size={14} className="text-sky-500" /> Lokasi Masuk
                  </h3>
                  <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                    {selected.checkInAddress && (
                      <p className="text-sm text-slate-700">{selected.checkInAddress}</p>
                    )}
                    {selected.checkInLat && selected.checkInLng && (
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-slate-500 font-mono">
                          {selected.checkInLat.toFixed(6)}, {selected.checkInLng.toFixed(6)}
                        </p>
                        <a
                          href={`https://www.google.com/maps?q=${selected.checkInLat},${selected.checkInLng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-secondary btn-sm text-xs"
                          onClick={e => e.stopPropagation()}
                        >
                          <ExternalLink size={12} /> Google Maps
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Check-out location */}
              {(selected.checkOutLat || selected.checkOutAddress) && (
                <div>
                  <h3 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-1.5">
                    <MapPin size={14} className="text-green-500" /> Lokasi Pulang
                  </h3>
                  <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                    {selected.checkOutAddress && (
                      <p className="text-sm text-slate-700">{selected.checkOutAddress}</p>
                    )}
                    {selected.checkOutLat && selected.checkOutLng && (
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-slate-500 font-mono">
                          {selected.checkOutLat.toFixed(6)}, {selected.checkOutLng.toFixed(6)}
                        </p>
                        <a
                          href={`https://www.google.com/maps?q=${selected.checkOutLat},${selected.checkOutLng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-secondary btn-sm text-xs"
                          onClick={e => e.stopPropagation()}
                        >
                          <ExternalLink size={12} /> Google Maps
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Selfie photos */}
              <div className="grid grid-cols-2 gap-4">
                {selected.checkInPhoto && (
                  <div>
                    <h3 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-1.5">
                      <Camera size={14} className="text-sky-500" /> Foto Masuk
                    </h3>
                    <img
                      src={getPhotoUrl(selected.checkInPhoto)}
                      alt="Foto selfie masuk"
                      className="w-full rounded-xl object-cover"
                    />
                  </div>
                )}
                {selected.checkOutPhoto && (
                  <div>
                    <h3 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-1.5">
                      <Camera size={14} className="text-green-500" /> Foto Pulang
                    </h3>
                    <img
                      src={getPhotoUrl(selected.checkOutPhoto)}
                      alt="Foto selfie pulang"
                      className="w-full rounded-xl object-cover"
                    />
                  </div>
                )}
              </div>

              {/* No photo message */}
              {!selected.checkInPhoto && !selected.checkOutPhoto && (
                <div className="flex items-center gap-2 text-slate-400 text-sm bg-gray-50 rounded-xl p-3">
                  <Camera size={16} />
                  <span>Tidak ada foto tersimpan</span>
                </div>
              )}

              {selected.notes && (
                <div>
                  <h3 className="text-sm font-bold text-slate-700 mb-1">Catatan</h3>
                  <p className="text-sm text-slate-600 bg-gray-50 rounded-xl p-3">{selected.notes}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoBox({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="bg-gray-50 rounded-xl px-3 py-2.5">
      <p className="text-xs text-slate-500 mb-0.5">{label}</p>
      <p className={cn('text-sm font-semibold', highlight ? 'text-orange-600' : 'text-slate-800')}>{value}</p>
    </div>
  );
}
