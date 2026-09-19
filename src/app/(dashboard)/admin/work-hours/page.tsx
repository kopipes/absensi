'use client';

import { useEffect, useState } from 'react';
import { Plus, Edit2, Trash2, Clock, X, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import type { WorkSchedule } from '@/types';

interface ScheduleForm {
  name: string; checkInTime: string; checkOutTime: string;
  daysOnly: boolean; workDays: string;
  officeId: string; isActive: boolean;
}

const emptyForm: ScheduleForm = {
  name: '', checkInTime: '08:00', checkOutTime: '17:00',
  daysOnly: false, workDays: '1,2,3,4,5',
  officeId: '', isActive: true,
};

const dayNames = ['', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

export default function AdminWorkHoursPage() {
  const [schedules, setSchedules] = useState<WorkSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<WorkSchedule | null>(null);
  const [form, setForm] = useState<ScheduleForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WorkSchedule | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    const res = await fetch('/api/work-schedules');
    const data = await res.json();
    if (data.success) setSchedules(data.data);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setShowModal(true);
  }

  function openEdit(s: WorkSchedule) {
    setEditing(s);
    setForm({
      name: s.name,
      checkInTime: s.checkInTime || '08:00',
      checkOutTime: s.checkOutTime || '17:00',
      daysOnly: !s.checkInTime && !s.checkOutTime,
      workDays: s.workDays,
      officeId: s.officeId || '',
      isActive: s.isActive,
    });
    setShowModal(true);
  }

  function toggleDay(day: string) {
    const days = form.workDays.split(',').filter(Boolean);
    const updated = days.includes(day) ? days.filter(d => d !== day) : [...days, day].sort();
    setForm(f => ({ ...f, workDays: updated.join(',') }));
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error('Nama jadwal wajib diisi.');
      return;
    }
    setSaving(true);
    const url = editing ? `/api/work-schedules/${editing.id}` : '/api/work-schedules';
    const method = editing ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        checkInTime: form.daysOnly ? null : (form.checkInTime || null),
        checkOutTime: form.daysOnly ? null : (form.checkOutTime || null),
        workDays: form.workDays,
        officeId: form.officeId || null,
        isActive: form.isActive,
      }),
    });
    const data = await res.json();
    if (data.success) {
      toast.success(editing ? 'Jadwal diperbarui.' : 'Jadwal ditambahkan.');
      setShowModal(false);
      await load();
    } else {
      toast.error(data.error || 'Gagal menyimpan.');
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const res = await fetch(`/api/work-schedules/${deleteTarget.id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      toast.success('Jadwal berhasil dihapus.');
      setDeleteTarget(null);
      await load();
    } else {
      toast.error(data.error || 'Gagal menghapus.');
    }
    setDeleting(false);
  }

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Jadwal Kerja</h1>
        <button onClick={openCreate} className="btn-primary">
          <Plus size={16} /> Tambah Jadwal
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-28 bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : (
        <div className="space-y-3">
          {schedules.map((s) => {
            const days = s.workDays.split(',').filter(Boolean);
            return (
              <div key={s.id} className={cn('card', !s.isActive && 'opacity-60')}>
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-sky-50 flex items-center justify-center flex-shrink-0">
                    <Clock size={22} className="text-sky-500" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-slate-800">{s.name}</h3>
                      <span className={`badge ${s.isActive ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                        {s.isActive ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </div>
                    <div className="flex gap-4 mt-1.5 text-sm text-slate-600 flex-wrap">
                      {s.checkInTime || s.checkOutTime ? (
                        <>
                          <span>Masuk: <strong>{s.checkInTime || '-'}</strong></span>
                          <span>Pulang: <strong>{s.checkOutTime || '-'}</strong></span>
                        </>
                      ) : (
                        <span className="text-slate-500">Hanya hari kerja (tanpa jam)</span>
                      )}
                    </div>
                    <div className="flex gap-1.5 mt-2 flex-wrap">
                      {[1,2,3,4,5,6,7].map((d) => (
                        <span key={d} className={`text-xs px-2 py-0.5 rounded-full font-medium ${days.includes(d.toString()) ? 'bg-sky-100 text-sky-700' : 'bg-gray-100 text-gray-400'}`}>
                          {dayNames[d]}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => openEdit(s)} className="btn-ghost btn-sm p-1.5" title="Edit">
                      <Edit2 size={14} />
                    </button>
                    <button onClick={() => setDeleteTarget(s)} className="btn-ghost btn-sm p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50" title="Hapus">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          {schedules.length === 0 && (
            <div className="card text-center py-12 text-slate-400">
              <Clock size={36} className="mx-auto mb-2 opacity-40" />
              <p>Belum ada jadwal kerja.</p>
            </div>
          )}
        </div>
      )}

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-slide-up">
            <div className="border-b border-gray-100 px-6 py-4 flex items-center justify-between sticky top-0 bg-white rounded-t-3xl">
              <h2 className="text-lg font-bold">{editing ? 'Edit Jadwal Kerja' : 'Tambah Jadwal Kerja'}</h2>
              <button onClick={() => setShowModal(false)} className="btn-ghost p-1.5"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="label">Nama Jadwal *</label>
                <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Reguler (08:00–17:00)" autoFocus />
              </div>
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <input
                  type="checkbox"
                  id="daysOnly"
                  checked={form.daysOnly}
                  onChange={e => setForm(f => ({ ...f, daysOnly: e.target.checked }))}
                  className="w-4 h-4 accent-sky-500"
                />
                <label htmlFor="daysOnly" className="text-sm font-medium text-slate-700 cursor-pointer">
                  Hanya hari kerja (tanpa jam masuk/pulang)
                </label>
              </div>
              {!form.daysOnly && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Jam Masuk (opsional)</label>
                    <input className="input" type="time" value={form.checkInTime} onChange={e => setForm(f => ({ ...f, checkInTime: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label">Jam Pulang (opsional)</label>
                    <input className="input" type="time" value={form.checkOutTime} onChange={e => setForm(f => ({ ...f, checkOutTime: e.target.value }))} />
                  </div>
                </div>
              )}
              <div>
                <label className="label">Hari Kerja</label>
                <div className="flex gap-2 flex-wrap">
                  {[1,2,3,4,5,6,7].map((d) => {
                    const active = form.workDays.split(',').includes(d.toString());
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => toggleDay(d.toString())}
                        className={`px-3 py-1.5 rounded-xl text-sm font-medium border transition-all ${active ? 'bg-sky-500 text-white border-sky-500' : 'bg-white text-slate-600 border-gray-200 hover:border-sky-300'}`}
                      >
                        {dayNames[d]}
                      </button>
                    );
                  })}
                </div>
              </div>
              {editing && (
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                  <input
                    type="checkbox"
                    id="schedActive"
                    checked={form.isActive}
                    onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
                    className="w-4 h-4 accent-sky-500"
                  />
                  <label htmlFor="schedActive" className="text-sm font-medium text-slate-700 cursor-pointer">
                    Jadwal Aktif
                  </label>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowModal(false)} className="btn-secondary flex-1">Batal</button>
                <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
                  <Save size={15} /> {saving ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm animate-slide-up">
            <div className="p-6">
              <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
                <Trash2 size={22} className="text-red-500" />
              </div>
              <h2 className="text-lg font-bold text-slate-900 text-center">Hapus Jadwal?</h2>
              <p className="text-slate-500 text-sm text-center mt-2">
                Jadwal <strong className="text-slate-800">{deleteTarget.name}</strong> akan dihapus permanen.
              </p>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setDeleteTarget(null)} className="btn-secondary flex-1" disabled={deleting}>Batal</button>
                <button onClick={handleDelete} disabled={deleting} className="btn-danger flex-1">
                  <Trash2 size={15} /> {deleting ? 'Menghapus...' : 'Hapus'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
