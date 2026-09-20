'use client';

import { useCallback, useEffect, useState } from 'react';
import { Camera, LogIn, LogOut, MapPin, RefreshCw, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn, formatTime, formatDate, getPhotoUrl, getTodayString } from '@/lib/utils';

interface PhotoRow {
  id: string;
  userId: string;
  checkIn: string | null;
  checkOut: string | null;
  checkInPhoto: string | null;
  checkOutPhoto: string | null;
  isOutOfRadius: boolean;
  checkOutOutOfRadius: boolean;
  user: { id: string; nik: string; name: string; department: string | null };
}

export default function AdminPhotosPage() {
  const [date, setDate] = useState(getTodayString());
  const [rows, setRows] = useState<PhotoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/attendance-photos?date=${date}`);
      const data = await res.json();
      if (data.success) setRows(data.data);
      else toast.error(data.error || 'Gagal memuat foto.');
    } catch {
      toast.error('Gagal terhubung ke server.');
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(key: string, label: string) {
    if (!confirm(`Hapus foto ${label}? Tindakan ini tidak dapat dibatalkan.`)) return;
    setDeleting(key);
    try {
      const res = await fetch(`/api/admin/attendance-photos?key=${encodeURIComponent(key)}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        toast.success('Foto dihapus.');
        setRows((prev) => prev.map((r) => ({
          ...r,
          checkInPhoto: r.checkInPhoto === key ? null : r.checkInPhoto,
          checkOutPhoto: r.checkOutPhoto === key ? null : r.checkOutPhoto,
        })));
      } else {
        toast.error(data.error || 'Gagal menghapus foto.');
      }
    } catch {
      toast.error('Gagal terhubung ke server.');
    } finally {
      setDeleting(null);
    }
  }

  const withPhotos = rows.filter((r) => r.checkInPhoto || r.checkOutPhoto);

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="page-title">Foto Absensi</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {withPhotos.length} karyawan dengan foto · {rows.length} baris absensi
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            className="input w-auto"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <button onClick={load} className="btn-secondary btn-sm">
            <RefreshCw size={14} /> Muat Ulang
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-gray-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : withPhotos.length === 0 ? (
        <div className="card text-center py-16">
          <Camera size={32} className="mx-auto text-slate-300" />
          <p className="text-slate-500 mt-3 text-sm">Tidak ada foto absensi pada {formatDate(date)}.</p>
        </div>
      ) : (
        <div className="card divide-y divide-gray-50 p-0">
          {withPhotos.map((row) => (
            <div key={row.id} className="flex items-center gap-3 p-3">
              <div className="min-w-40">
                <p className="font-semibold text-slate-800 text-sm">{row.user.name}</p>
                <p className="text-xs text-slate-500">{row.user.nik} · {row.user.department || '-'}</p>
              </div>

              <PhotoCell
                label="Masuk"
                icon={LogIn}
                time={row.checkIn}
                photo={row.checkInPhoto}
                outOfRadius={row.isOutOfRadius}
                deleting={deleting}
                onDelete={handleDelete}
              />
              <PhotoCell
                label="Pulang"
                icon={LogOut}
                time={row.checkOut}
                photo={row.checkOutPhoto}
                outOfRadius={row.checkOutOutOfRadius}
                deleting={deleting}
                onDelete={handleDelete}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PhotoCell({
  label, icon: Icon, time, photo, outOfRadius, deleting, onDelete,
}: {
  label: string;
  icon: React.ElementType;
  time: string | null;
  photo: string | null;
  outOfRadius: boolean;
  deleting: string | null;
  onDelete: (key: string, label: string) => void;
}) {
  if (!photo) {
    return (
      <div className="flex-1 text-xs text-slate-400">
        <p className="flex items-center gap-1 font-medium"><Icon size={12} /> {label}</p>
        <p className="mt-1">-</p>
      </div>
    );
  }

  return (
    <div className="flex-1">
      <p className="flex items-center gap-1 text-xs font-medium text-slate-600">
        <Icon size={12} /> {label} {time ? `· ${formatTime(time)}` : ''}
        {outOfRadius && (
          <span className="badge bg-orange-50 text-orange-600 border-orange-200 text-[10px] ml-1">
            <MapPin size={9} /> Luar radius
          </span>
        )}
      </p>
      <div className="flex items-center gap-2 mt-1">
        <a href={getPhotoUrl(photo)} target="_blank" rel="noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={getPhotoUrl(photo)}
            alt={`Foto ${label}`}
            className="w-14 h-14 rounded-lg object-cover border border-gray-200"
          />
        </a>
        <button
          onClick={() => onDelete(photo, label)}
          disabled={deleting === photo}
          className={cn('btn-danger btn-sm', deleting === photo && 'opacity-60')}
          title="Hapus foto"
        >
          <Trash2 size={13} /> {deleting === photo ? '...' : 'Hapus'}
        </button>
      </div>
    </div>
  );
}
