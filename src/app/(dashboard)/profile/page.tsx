'use client';

import { useEffect, useState, useCallback } from 'react';
import { User, Edit2, Save, X, LogOut, BookOpen } from 'lucide-react';
import toast from 'react-hot-toast';
import { getRoleLabel } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import type { UserProfile } from '@/types';

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', address: '', password: '', currentPassword: '' });

  const loadProfile = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me');
      const d = await res.json();
      if (d.success) {
        setProfile(d.data);
        setForm({ name: d.data.name, email: d.data.email || '', phone: d.data.phone || '', address: d.data.address || '', password: '', currentPassword: '' });
      }
    } catch {
      toast.error('Gagal memuat profil.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  async function handleSave() {
    if (!profile) return;
    if (!form.name.trim()) { toast.error('Nama tidak boleh kosong.'); return; }
    if (form.password.trim() && form.password.trim().length < 8) {
      toast.error('Password baru minimal 8 karakter.'); return;
    }
    if (form.password.trim() && !form.currentPassword.trim()) {
      toast.error('Masukkan password saat ini untuk mengubah password.'); return;
    }
    setSaving(true);
    try {
      // Only send password if it was filled in
      const payload: Record<string, string> = {
        name: form.name,
        email: form.email,
        phone: form.phone,
        address: form.address,
      };
      if (form.password.trim()) {
        payload.password = form.password;
        payload.currentPassword = form.currentPassword;
      }

      const res = await fetch(`/api/users/${profile.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        setEditing(false);
        setForm(f => ({ ...f, password: '', currentPassword: '' }));
        // Re-fetch to get fresh data
        await loadProfile();
        toast.success('Profil berhasil diperbarui.');
      } else {
        toast.error(data.error || 'Gagal menyimpan.');
      }
    } catch {
      toast.error('Gagal terhubung ke server.');
    } finally {
      setSaving(false);
    }
  }

  function handleCancelEdit() {
    if (profile) {
      setForm({ name: profile.name, email: profile.email || '', phone: profile.phone || '', address: profile.address || '', password: '', currentPassword: '' });
    }
    setEditing(false);
  }

  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      router.push('/login');
    }
  }

  if (loading) {
    return (
      <div className="max-w-lg mx-auto space-y-4 animate-pulse">
        <div className="h-32 bg-gray-200 rounded-2xl" />
        <div className="h-64 bg-gray-200 rounded-2xl" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="max-w-lg mx-auto">
        <div className="card text-center py-12 text-slate-400">
          <User size={36} className="mx-auto mb-2 opacity-40" />
          <p>Profil tidak ditemukan.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-5">
      {/* Hero */}
      <div className="card bg-gradient-to-br from-sky-500 to-sky-700 text-white border-0">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center text-white font-bold text-2xl">
            {profile.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="text-xl font-bold">{profile.name}</h2>
            <p className="text-sky-100 text-sm">{profile.position || profile.department || 'Karyawan'}</p>
            <span className="mt-1 inline-block text-xs bg-white/20 text-white px-2 py-0.5 rounded-full font-medium">
              {getRoleLabel(profile.role)}
            </span>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="section-title">Data Diri</h3>
          {!editing ? (
            <button onClick={() => setEditing(true)} className="btn-secondary btn-sm" aria-label="Edit profil">
              <Edit2 size={14} /> Edit
            </button>
          ) : (
            <div className="flex gap-2">
              <button onClick={handleCancelEdit} className="btn-ghost btn-sm" aria-label="Batal"><X size={14} /></button>
              <button onClick={handleSave} disabled={saving} className="btn-primary btn-sm" aria-label="Simpan perubahan">
                <Save size={14} /> {saving ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <InfoRow label="NIK" value={profile.nik} />
          {editing ? (
            <>
              <div><label className="label">Nama</label><input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div><label className="label">Email</label><input className="input" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
              <div><label className="label">No. HP</label><input className="input" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
              <div><label className="label">Alamat</label><textarea className="input" rows={3} value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></div>
              <div>
                <label className="label">Password Baru</label>
                <input className="input" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Kosongkan jika tidak diubah (min. 8 karakter)" autoComplete="new-password" />
              </div>
              {form.password.trim() && (
                <div>
                  <label className="label">Password Saat Ini</label>
                  <input className="input" type="password" value={form.currentPassword} onChange={e => setForm(f => ({ ...f, currentPassword: e.target.value }))} placeholder="Wajib diisi untuk mengubah password" autoComplete="current-password" />
                </div>
              )}
            </>
          ) : (
            <>
              <InfoRow label="Nama" value={profile.name} />
              <InfoRow label="Email" value={profile.email || '-'} />
              <InfoRow label="No. HP" value={profile.phone || '-'} />
              <InfoRow label="Alamat" value={profile.address || '-'} />
              <InfoRow label="Jabatan" value={profile.position || '-'} />
              <InfoRow label="Departemen" value={profile.department || '-'} />
              <InfoRow label="Atasan" value={(profile as UserProfile & { manager?: { name: string } }).manager?.name || '-'} />
              <InfoRow label="Kantor" value={(profile as UserProfile & { office?: { name: string } }).office?.name || '-'} />
              <InfoRow label="Jadwal" value={
                (profile as UserProfile & { workSchedule?: { name: string; checkInTime: string; checkOutTime: string } }).workSchedule
                  ? `${(profile as UserProfile & { workSchedule?: { name: string; checkInTime: string; checkOutTime: string } }).workSchedule!.name}`
                  : '-'
              } />
            </>
          )}
        </div>
      </div>

      <a href="/guide" target="_blank" rel="noreferrer" className="btn-secondary w-full btn-lg">
        <BookOpen size={18} /> Panduan Pengguna
      </a>

      <button onClick={handleLogout} className="btn-danger w-full btn-lg" aria-label="Keluar dari aplikasi">
        <LogOut size={18} /> Keluar
      </button>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between items-start gap-4 py-2 border-b border-gray-50 last:border-0">
      <span className="text-sm text-slate-500 flex-shrink-0">{label}</span>
      <span className="text-sm font-semibold text-slate-800 text-right">{value || '-'}</span>
    </div>
  );
}
