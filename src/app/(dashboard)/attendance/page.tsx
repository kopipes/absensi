'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { CameraOff, MapPin, CheckCircle2, XCircle, Loader2, Clock, History, AlertTriangle, X, Save, Edit2 } from 'lucide-react';
import Webcam from 'react-webcam';
import toast from 'react-hot-toast';
import { cn, formatTime, formatDate, getStatusBadgeColor, getStatusLabel, AUTO_CHECKOUT_CUTOFF_TIME } from '@/lib/utils';
import type { Attendance } from '@/types';

type Tab = 'checkin' | 'history';

export default function AttendancePage() {
  const [tab, setTab] = useState<Tab>('checkin');
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [location, setLocation] = useState<{ lat: number; lng: number; address?: string } | null>(null);
  const [locationError, setLocationError] = useState('');
  const [todayAttendance, setTodayAttendance] = useState<Attendance | null>(null);
  const [history, setHistory] = useState<Attendance[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [hasSchedule, setHasSchedule] = useState<boolean>(true);
  const [profile, setProfile] = useState<{ name: string; nik: string } | null>(null);

  // Correction state
  const [correctionTarget, setCorrectionTarget] = useState<Attendance | null>(null);
  const [correctionForm, setCorrectionForm] = useState({ newCheckIn: '', newCheckOut: '', reason: '' });
  const [submittingCorrection, setSubmittingCorrection] = useState(false);

  const webcamRef = useRef<Webcam>(null);

  const loadTodayAttendance = useCallback(async () => {
    const today = getTodayWib();
    try {
      const res = await fetch(`/api/attendances?date=${today}&self=true`);
      const data = await res.json();
      if (data.success && data.data.length > 0) {
        setTodayAttendance(data.data[0]);
      } else {
        setTodayAttendance(null);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadTodayAttendance();
    fetch('/api/auth/me').then(r => r.json()).then(d => {
      if (d.success) {
        setHasSchedule(!!d.data.workScheduleId);
        setProfile({ name: d.data.name, nik: d.data.nik });
      }
    });
    getLocation();
  }, [loadTodayAttendance]);

  async function loadHistory() {
    setHistoryLoading(true);
    const end = getTodayWib();
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const start = new Date(startDate.getTime() + 7 * 60 * 60 * 1000).toISOString().split('T')[0];
    try {
      const res = await fetch(`/api/attendances?startDate=${start}&endDate=${end}&self=true`);
      const data = await res.json();
      if (data.success) setHistory(data.data);
    } catch { /* ignore */ }
    setHistoryLoading(false);
  }

  useEffect(() => {
    if (tab === 'history') loadHistory();
  }, [tab]);

  function getLocation() {
    setLocating(true);
    setLocationError('');
    if (!navigator.geolocation) {
      setLocationError('Browser tidak mendukung GPS.');
      setLocating(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setLocation({ lat, lng });
        setLocating(false);
        try {
          const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
          const d = await r.json();
          setLocation({ lat, lng, address: d.display_name?.split(',').slice(0, 3).join(', ') });
        } catch { /* ignore */ }
      },
      (err) => {
        setLocationError(
          err.code === 1
            ? 'Izin lokasi ditolak. Silakan aktifkan GPS di browser.'
            : 'Gagal mendapatkan lokasi. Pastikan GPS aktif.'
        );
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }

  // Get today's date string in WIB (UTC+7)
  function getTodayWib(): string {
    const nowWib = new Date(Date.now() + 7 * 60 * 60 * 1000);
    return nowWib.toISOString().split('T')[0];
  }

  const canCheckIn = !todayAttendance?.checkIn;
  const canCheckOut = !!(todayAttendance?.checkIn && !todayAttendance?.checkOut);

  function buildWatermarkLines(): string[] {
    // WIB wall-clock stamp (UTC+7), independent of the device timezone
    const wib = new Date(Date.now() + 7 * 60 * 60 * 1000);
    const stamp = wib.toISOString().slice(0, 16).replace('T', ' ');
    const lines: string[] = [];
    if (profile) lines.push(`${profile.name} (${profile.nik})`);
    lines.push(`${stamp} WIB`);
    if (location) lines.push(`${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}`);
    if (location?.address) lines.push(location.address);
    return lines;
  }

  // Capture the live video frame at up to 1280px wide, burn in a location/identity
  // watermark, and adaptively compress so the payload stays small but readable.
  function capturePhoto(): string | null {
    const video = webcamRef.current?.video as HTMLVideoElement | undefined;
    if (!video || !video.videoWidth || !video.videoHeight) return null;

    const maxWidth = 1280;
    const scale = Math.min(1, maxWidth / video.videoWidth);
    const width = Math.round(video.videoWidth * scale);
    const height = Math.round(video.videoHeight * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, width, height);

    const lines = buildWatermarkLines();
    const fontSize = Math.max(12, Math.round(width * 0.022));
    const lineHeight = Math.round(fontSize * 1.35);
    const padding = Math.round(fontSize * 0.7);
    const barHeight = lines.length * lineHeight + padding * 2;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(0, height - barHeight, width, barHeight);
    ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 3;
    lines.forEach((line, index) => {
      ctx.fillText(line, padding, height - barHeight + padding + index * lineHeight, width - padding * 2);
    });

    // Adaptive quality: keep as much detail as possible, only shrink when the file is big
    const maxBase64Length = 350_000; // ~255 KB binary, under the 400 KB server cap
    let quality = 0.75;
    let dataUrl = canvas.toDataURL('image/jpeg', quality);
    while (dataUrl.length > maxBase64Length && quality > 0.55) {
      quality = Math.round((quality - 0.05) * 100) / 100;
      dataUrl = canvas.toDataURL('image/jpeg', quality);
    }
    return dataUrl;
  }

  async function handleAttendance(type: 'checkin' | 'checkout') {
    if (!location) { toast.error('Lokasi belum terdeteksi. Tap "Perbarui Lokasi".'); return; }
    if (!webcamRef.current) { toast.error('Kamera belum siap.'); return; }
    const photo = capturePhoto();
    if (!photo) { toast.error('Gagal mengambil foto. Pastikan kamera aktif.'); return; }

    setLoading(true);
    try {
      const res = await fetch('/api/attendances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type, photo,
          latitude: location.lat,
          longitude: location.lng,
          address: location.address,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) { toast.error(data.error || 'Absen gagal.'); return; }
      toast.success(type === 'checkin' ? 'Absen masuk berhasil!' : 'Absen pulang berhasil!');
      await loadTodayAttendance();
    } catch {
      toast.error('Gagal terhubung ke server.');
    } finally {
      setLoading(false);
    }
  }

  async function handleCorrectionSubmit() {
    if (!correctionTarget) return;
    if (!correctionForm.reason.trim()) { toast.error('Alasan wajib diisi.'); return; }
    if (!correctionForm.newCheckIn && !correctionForm.newCheckOut) {
      toast.error('Isi minimal satu waktu yang dikoreksi (masuk atau pulang).');
      return;
    }
    setSubmittingCorrection(true);
    try {
      const res = await fetch('/api/attendances/corrections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attendanceId: correctionTarget.id,
          newCheckIn: correctionForm.newCheckIn
            ? new Date(`${correctionTarget.date}T${correctionForm.newCheckIn}:00+07:00`).toISOString()
            : null,
          newCheckOut: correctionForm.newCheckOut
            ? new Date(`${correctionTarget.date}T${correctionForm.newCheckOut}:00+07:00`).toISOString()
            : null,
          reason: correctionForm.reason,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Permintaan koreksi berhasil dikirim!');
        setCorrectionTarget(null);
        setCorrectionForm({ newCheckIn: '', newCheckOut: '', reason: '' });
        await loadHistory();
      } else {
        toast.error(data.error || 'Gagal mengajukan koreksi.');
      }
    } catch {
      toast.error('Gagal terhubung ke server.');
    } finally {
      setSubmittingCorrection(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto space-y-4">
      {/* Tabs */}
      <div className="flex bg-gray-100 p-1 rounded-2xl">
        <button
          className={cn('flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all', tab === 'checkin' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500')}
          onClick={() => setTab('checkin')}
        >
          <span className="flex items-center justify-center gap-1.5"><Clock size={15} /> Absen</span>
        </button>
        <button
          className={cn('flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all', tab === 'history' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500')}
          onClick={() => setTab('history')}
        >
          <span className="flex items-center justify-center gap-1.5"><History size={15} /> Riwayat</span>
        </button>
      </div>

      {tab === 'checkin' && (
        <div className="space-y-4 animate-fade-in">
          {/* Today status */}
          {todayAttendance && (
            <div className="card bg-gradient-to-r from-green-50 to-emerald-50 border-green-100">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="text-green-500 flex-shrink-0" size={20} />
                <div className="flex-1">
                  <p className="font-semibold text-slate-800">Status Hari Ini</p>
                  <div className="flex gap-4 mt-1 text-sm text-slate-600">
                    {todayAttendance.checkIn && <span>Masuk: <strong>{formatTime(todayAttendance.checkIn)}</strong></span>}
                    {todayAttendance.checkOut && <span>Pulang: <strong>{formatTime(todayAttendance.checkOut)}</strong></span>}
                  </div>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {todayAttendance.isAutoCheckout && (
                      <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">
                        Pulang otomatis (cutoff {AUTO_CHECKOUT_CUTOFF_TIME})
                      </span>
                    )}
                    {todayAttendance.isOutOfRadius && (
                      <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                        <AlertTriangle size={11} /> Di luar radius
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* No schedule warning */}
          {!hasSchedule && (
            <div className="flex items-start gap-3 p-3 bg-yellow-50 border border-yellow-200 rounded-xl text-sm text-yellow-800">
              <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
              <p>Jadwal kerja tidak dipilih (opsional). Absensi tetap bisa dilakukan; perhitungan tetap 8 jam kerja per hari dan kekurangannya dicatat di laporan.</p>
            </div>
          )}

          {/* Camera */}
          <div className="card p-0 overflow-hidden">
            <div className="relative bg-slate-900 aspect-[4/3] max-h-64 sm:max-h-none flex items-center justify-center">
              {!cameraError ? (
                <Webcam
                  ref={webcamRef}
                  audio={false}
                  screenshotFormat="image/jpeg"
                  videoConstraints={{ facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }}
                  className="w-full h-full object-cover camera-preview"
                  onUserMedia={() => setCameraReady(true)}
                  onUserMediaError={(e) => setCameraError(typeof e === 'string' ? e : 'Izin kamera ditolak.')}
                />
              ) : (
                <div className="flex flex-col items-center gap-2 text-slate-400 p-6 text-center">
                  <CameraOff size={36} />
                  <p className="text-sm">{cameraError}</p>
                  <button onClick={() => setCameraError('')} className="btn-secondary btn-sm">Coba Lagi</button>
                </div>
              )}
              {!cameraReady && !cameraError && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
                  <Loader2 className="animate-spin text-white" size={32} />
                </div>
              )}
              {cameraReady && (
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute inset-3 border-2 border-white/40 border-dashed rounded-xl" />
                  <p className="absolute bottom-2 inset-x-0 text-center text-[11px] font-medium text-white/85">
                    Pastikan wajah &amp; latar sekitar (gedung/lokasi) terlihat
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Location */}
          <div className="card">
            <div className="flex items-start gap-3">
              <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0',
                location ? 'bg-green-50' : locationError ? 'bg-red-50' : 'bg-gray-100')}>
                <MapPin size={18} className={location ? 'text-green-500' : locationError ? 'text-red-500' : 'text-slate-400'} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-700">Lokasi</p>
                {locating ? (
                  <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5"><Loader2 size={12} className="animate-spin" /> Mencari lokasi...</p>
                ) : location ? (
                  <p className="text-xs text-slate-500 mt-0.5 truncate">{location.address || `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`}</p>
                ) : (
                  <p className="text-xs text-red-500 mt-0.5">{locationError || 'Lokasi tidak tersedia'}</p>
                )}
              </div>
              <button onClick={getLocation} className="btn-secondary btn-sm flex-shrink-0" disabled={locating}>
                {locating ? <Loader2 size={14} className="animate-spin" /> : 'Perbarui'}
              </button>
            </div>
          </div>

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handleAttendance('checkin')}
              disabled={!canCheckIn || loading || !cameraReady || !location}
              className={cn('btn btn-lg flex-col gap-1 h-auto py-4',
                canCheckIn && cameraReady && location
                  ? 'bg-sky-500 text-white hover:bg-sky-600 shadow-sm'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed')}
            >
              {loading ? <Loader2 size={24} className="animate-spin" /> : <CheckCircle2 size={24} />}
              <span>Absen Masuk</span>
            </button>
            <button
              onClick={() => handleAttendance('checkout')}
              disabled={!canCheckOut || loading || !cameraReady || !location}
              className={cn('btn btn-lg flex-col gap-1 h-auto py-4',
                canCheckOut && cameraReady && location
                  ? 'bg-green-500 text-white hover:bg-green-600 shadow-sm'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed')}
            >
              {loading ? <Loader2 size={24} className="animate-spin" /> : <XCircle size={24} />}
              <span>Absen Pulang</span>
            </button>
          </div>

          <p className="text-center text-xs text-slate-400">
            Lupa absen pulang? Sistem otomatis mencatat jam pulang pukul {AUTO_CHECKOUT_CUTOFF_TIME} WIB (cutoff).
          </p>

          {!cameraReady && !cameraError && (
            <p className="text-center text-xs text-slate-400">Memuat kamera, harap tunggu...</p>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="space-y-3 animate-fade-in">
          <h2 className="section-title">Riwayat 30 Hari Terakhir</h2>
          {historyLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
            </div>
          ) : history.length === 0 ? (
            <div className="card text-center py-12">
              <p className="text-slate-400">Belum ada riwayat absensi.</p>
            </div>
          ) : (
            history.map((a) => (
              <div key={a.id} className="card hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3">
                  <div className="text-center w-10 flex-shrink-0">
                    <p className="text-xs text-slate-400 uppercase">{new Date(a.date).toLocaleDateString('id-ID', { weekday: 'short' })}</p>
                    <p className="text-lg font-bold text-slate-800">{new Date(a.date).getDate()}</p>
                    <p className="text-xs text-slate-400">{new Date(a.date).toLocaleDateString('id-ID', { month: 'short' })}</p>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn('badge', getStatusBadgeColor(a.status))}>{getStatusLabel(a.status)}</span>
                      {a.isAutoCheckout && <span className="badge bg-purple-50 text-purple-700 border-purple-200">Pulang Otomatis</span>}
                    </div>
                    <div className="flex gap-4 mt-1.5 text-sm text-slate-600">
                      <span>Masuk: <strong>{a.checkIn ? formatTime(a.checkIn) : '-'}</strong></span>
                      <span>Pulang: <strong>{a.checkOut ? formatTime(a.checkOut) : '-'}</strong></span>
                    </div>
                    {a.notes && <p className="text-xs text-slate-400 mt-1 truncate">{a.notes}</p>}
                  </div>
                  {/* Correction button */}
                  <div className="flex flex-col gap-1 flex-shrink-0">
                    <button
                      onClick={() => {
                        setCorrectionTarget(a);
                        setCorrectionForm({
                          newCheckIn: a.checkIn ? formatTime(a.checkIn) : '',
                          newCheckOut: a.checkOut ? formatTime(a.checkOut) : '',
                          reason: '',
                        });
                      }}
                      className="btn-ghost btn-sm p-1.5 text-slate-400 hover:text-sky-500"
                      title="Ajukan koreksi"
                    >
                      <Edit2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Correction Request Modal */}
      {correctionTarget && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-y-auto animate-slide-up">
            <div className="border-b border-gray-100 px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Ajukan Koreksi Absen</h2>
                <p className="text-sm text-slate-500">{formatDate(correctionTarget.date, 'dd MMM yyyy')}</p>
              </div>
              <button onClick={() => setCorrectionTarget(null)} className="btn-ghost p-1.5"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-xl text-sm text-blue-700">
                <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
                <p>Koreksi akan dikirim ke atasan Anda untuk disetujui. Data absen baru berlaku setelah disetujui.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Jam Masuk Baru</label>
                  <input
                    type="time"
                    className="input"
                    value={correctionForm.newCheckIn}
                    onChange={e => setCorrectionForm(f => ({ ...f, newCheckIn: e.target.value }))}
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    Saat ini: {correctionTarget.checkIn ? formatTime(correctionTarget.checkIn) : '-'}
                  </p>
                </div>
                <div>
                  <label className="label">Jam Pulang Baru</label>
                  <input
                    type="time"
                    className="input"
                    value={correctionForm.newCheckOut}
                    onChange={e => setCorrectionForm(f => ({ ...f, newCheckOut: e.target.value }))}
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    Saat ini: {correctionTarget.checkOut ? formatTime(correctionTarget.checkOut) : '-'}
                  </p>
                </div>
              </div>

              <div>
                <label className="label">Alasan Koreksi *</label>
                <textarea
                  className="input"
                  rows={3}
                  value={correctionForm.reason}
                  onChange={e => setCorrectionForm(f => ({ ...f, reason: e.target.value }))}
                  placeholder="Jelaskan alasan koreksi absen..."
                  maxLength={300}
                  autoFocus
                />
                <p className="text-xs text-slate-400 mt-1 text-right">{correctionForm.reason.length}/300</p>
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setCorrectionTarget(null)} className="btn-secondary flex-1">Batal</button>
                <button
                  onClick={handleCorrectionSubmit}
                  disabled={submittingCorrection || !correctionForm.reason.trim() || (!correctionForm.newCheckIn && !correctionForm.newCheckOut)}
                  className="btn-primary flex-1"
                >
                  <Save size={15} /> {submittingCorrection ? 'Mengirim...' : 'Kirim Koreksi'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
