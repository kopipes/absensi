'use client';

import { useCallback, useEffect, useState } from 'react';
import { ScrollText, RefreshCw, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn, formatDateTime } from '@/lib/utils';

interface AuditLog {
  id: string;
  actorId: string | null;
  actorName: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  details: string | null;
  ip: string | null;
  createdAt: string;
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

const ACTION_LABELS: Record<string, string> = {
  LOGIN_SUCCESS: 'Login berhasil',
  LOGIN_FAILED: 'Login gagal',
  LOGIN_BLOCKED: 'Login diblokir (terkunci)',
  ACCOUNT_LOCKED: 'Akun terkunci',
  LOGOUT: 'Logout',
  USER_CREATE: 'Tambah karyawan',
  USER_UPDATE: 'Ubah karyawan',
  USER_DELETE: 'Hapus karyawan',
  PASSWORD_CHANGE: 'Ubah password',
  ATTENDANCE_CHECK_IN: 'Absen masuk',
  ATTENDANCE_CHECK_OUT: 'Absen pulang',
  CORRECTION_REQUEST: 'Ajukan koreksi',
  CORRECTION_APPROVE: 'Setujui koreksi',
  CORRECTION_REJECT: 'Tolak koreksi',
  OFFICE_CREATE: 'Tambah kantor',
  OFFICE_UPDATE: 'Ubah kantor',
  OFFICE_DEACTIVATE: 'Nonaktifkan kantor',
  SCHEDULE_CREATE: 'Tambah jadwal',
  SCHEDULE_UPDATE: 'Ubah jadwal',
  SCHEDULE_DELETE: 'Hapus jadwal',
  DEPARTMENT_CREATE: 'Tambah departemen',
  DEPARTMENT_UPDATE: 'Ubah departemen',
  DEPARTMENT_DELETE: 'Hapus departemen',
  HOLIDAY_CREATE: 'Tambah hari libur',
  HOLIDAY_UPDATE: 'Ubah hari libur',
  HOLIDAY_DELETE: 'Hapus hari libur',
  SETTINGS_UPDATE: 'Ubah pengaturan',
  PHOTO_DELETE: 'Hapus foto',
};

export default function AdminAuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (targetPage = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(targetPage), pageSize: '25' });
      if (action) params.set('action', action);
      const res = await fetch(`/api/admin/audit-logs?${params}`);
      const data = await res.json();
      if (data.success) {
        setLogs(data.data.logs);
        setActions(data.data.actions);
        setPagination(data.data.pagination);
        setPage(data.data.pagination.page);
      } else {
        toast.error(data.error || 'Gagal memuat audit log.');
      }
    } catch {
      toast.error('Gagal terhubung ke server.');
    } finally {
      setLoading(false);
    }
  }, [action]);

  useEffect(() => { load(1); }, [load]);

  const filtered = search
    ? logs.filter((l) =>
        (l.actorName || '').toLowerCase().includes(search.toLowerCase()) ||
        (l.action || '').toLowerCase().includes(search.toLowerCase()) ||
        (l.details || '').toLowerCase().includes(search.toLowerCase()))
    : logs;

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="page-title">Audit Log</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {pagination ? `${pagination.total} aktivitas tercatat` : 'Memuat...'}
          </p>
        </div>
        <button onClick={() => load(page)} className="btn-secondary btn-sm">
          <RefreshCw size={14} /> Muat Ulang
        </button>
      </div>

      <div className="card flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-9"
            placeholder="Cari pelaku, aksi, atau detail (di halaman ini)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className="input w-auto" value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">Semua aksi</option>
          {actions.map((a) => (
            <option key={a} value={a}>{ACTION_LABELS[a] || a}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-14 bg-gray-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-16">
          <ScrollText size={32} className="mx-auto text-slate-300" />
          <p className="text-slate-500 mt-3 text-sm">Belum ada aktivitas.</p>
        </div>
      ) : (
        <div className="card divide-y divide-gray-50 p-0">
          {filtered.map((log) => (
            <div key={log.id} className="flex items-start gap-3 p-3">
              <span className={cn(
                'badge mt-0.5 shrink-0',
                log.action.includes('DELETE') || log.action.includes('LOCK') || log.action.includes('BLOCK')
                  ? 'bg-red-50 text-red-600 border-red-200'
                  : log.action.includes('FAILED')
                    ? 'bg-orange-50 text-orange-600 border-orange-200'
                    : 'bg-slate-50 text-slate-600 border-slate-200'
              )}>
                {ACTION_LABELS[log.action] || log.action}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-800">
                  <span className="font-semibold">{log.actorName || 'Sistem'}</span>
                  {log.targetType && <span className="text-slate-500"> · {log.targetType}</span>}
                </p>
                {log.details && (
                  <p className="text-xs text-slate-500 mt-0.5 break-words">{log.details}</p>
                )}
                <p className="text-xs text-slate-400 mt-1">
                  {formatDateTime(log.createdAt)}{log.ip ? ` · ${log.ip}` : ''}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <button className="btn-secondary btn-sm" disabled={page === 1} onClick={() => load(page - 1)}>Sebelumnya</button>
          <span className="text-sm text-slate-500">Halaman {page} / {pagination.totalPages}</span>
          <button className="btn-secondary btn-sm" disabled={page === pagination.totalPages} onClick={() => load(page + 1)}>Berikutnya</button>
        </div>
      )}
    </div>
  );
}