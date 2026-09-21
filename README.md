# Absensi — Aplikasi Absensi Karyawan Digital

![Absensi](https://img.shields.io/badge/Absensi-v1.0-0ea5e9?style=for-the-badge)
![Next.js](https://img.shields.io/badge/Next.js-14-black?style=for-the-badge&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?style=for-the-badge&logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-38bdf8?style=for-the-badge&logo=tailwindcss)
![Prisma](https://img.shields.io/badge/Prisma-5-2d3748?style=for-the-badge&logo=prisma)

**Absensi** adalah aplikasi absensi karyawan berbasis web/mobile yang memungkinkan karyawan melakukan check-in dan check-out mandiri menggunakan smartphone, dilengkapi verifikasi foto selfie, geotagging lokasi GPS, perhitungan keterlambatan & lembur otomatis, serta modul pelaporan dengan export Excel.

---

## Fitur Utama

- **Self Check-in/Check-out** — Absen via kamera selfie + GPS langsung dari browser
- **Verifikasi Lokasi** — Validasi radius kantor menggunakan Haversine formula
- **Perhitungan Otomatis** — Keterlambatan dan lembur dihitung otomatis berdasarkan jadwal kerja
- **Lembur dengan Approval** — Lembur otomatis saat checkout telat, atau diajukan manual via riwayat
- **Dua Jenis Lembur** — Pulang Terlambat (`CHECKOUT_LATE`) dan Datang Lebih Awal (`CHECKIN_EARLY`), masing-masing approval terpisah
- **Re-review Lembur** — Admin dapat override keputusan lembur yang sudah diproses
- **Notifikasi Real-time** — Manajer/SPV mendapat notifikasi saat karyawan terlambat, luar radius, atau lembur
- **Koreksi Absen** — Alur permintaan dan persetujuan koreksi absen
- **Foto Absensi** — Admin dapat menelusuri & menghapus foto absensi per tanggal
- **Izin Pulang Awal** — Karyawan dapat mengajukan early leave dengan approval atasan
- **Laporan & Export** — Filter laporan kehadiran dan export ke Excel (.xlsx)
- **Multi-role** — Admin, Manager, SPV, dan Karyawan dengan akses berbeda
- **Mobile-first** — Desain responsif dengan bottom navigation untuk penggunaan HP

---

## Tech Stack

| Layer | Teknologi |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Database | SQLite via Prisma ORM |
| Auth | JWT (jose) + httpOnly cookies |
| Camera | react-webcam |
| Export | xlsx |
| Notifications | react-hot-toast |

---

## Struktur Role

| Role | Akses |
|---|---|
| **Admin** | Kelola karyawan, kantor, jadwal kerja, hari libur, semua laporan, koreksi absen, override lembur |
| **Manager** | Pantau **seluruh karyawan**, approve/reject koreksi, terima notifikasi |
| **SPV** | Pantau **dirinya & anak buah langsung** (`managerId`), approve/reject koreksi anak buah, terima notifikasi |
| **User** | Check-in/out, ajukan lembur manual, izin pulang awal, lihat riwayat pribadi |

> **Cakupan data:** ADMIN & MANAGER melihat seluruh karyawan; SPV melihat dirinya sendiri dan bawahan langsung (`managerId`); USER hanya data pribadi.

---

## Instalasi & Menjalankan

### Prasyarat
- Node.js >= 20.0.0
- npm

### Langkah

```bash
# Clone repository
git clone https://github.com/kopipes/absensi.git
cd absensi

# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Edit .env: set DATABASE_URL dan JWT_SECRET

# Setup database
npx prisma generate
npx prisma db push

# Seed data demo
npm run db:seed

# Jalankan development server
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000) di browser.

---

## Struktur Project

```
src/
├── app/
│   ├── (auth)/login/          # Halaman login
│   ├── (dashboard)/
│   │   ├── dashboard/         # Dashboard utama
│   │   ├── attendance/        # Check-in/out + riwayat + ajukan lembur manual
│   │   ├── overtime/          # Approval lembur (Manager/SPV/Admin)
│   │   ├── team/              # Monitoring tim (Manager/SPV/Admin)
│   │   ├── reports/           # Laporan + export Excel
│   │   ├── notifications/     # Notifikasi in-app
│   │   ├── profile/           # Profil karyawan
│   │   └── admin/
│   │       ├── users/         # Kelola karyawan
│   │       ├── offices/       # Lokasi kantor & radius
│   │       ├── holidays/      # Hari libur nasional
│   │       └── work-hours/    # Jadwal kerja
│   └── api/                   # REST API routes
├── components/
│   └── layout/                # Sidebar, TopBar, MobileNav
├── lib/
│   ├── auth.ts                # JWT sign/verify
│   ├── prisma.ts              # Prisma client singleton
│   ├── api.ts                 # API helpers & response utils
│   └── utils.ts               # Helpers (distance, late calc, formatting)
├── types/                     # TypeScript interfaces
└── middleware.ts              # Auth + RBAC middleware (UI & API)
prisma/
├── schema.prisma              # Database schema
└── seed.ts                    # Data seeder
doc/
├── PRD-Absensi.md            # Product Requirements Document
└── userguide.html            # Panduan pengguna (HTML mandiri, siap dibuka)
scripts/
└── build-userguide.sh        # Regenerasi doc/userguide.html + screenshots
```

---

## Scripts

```bash
npm run dev          # Development server
npm run build        # Production build
npm run db:generate  # Generate Prisma client
npm run db:push      # Push schema ke database
npm run db:seed      # Seed data demo
npm run db:studio    # Prisma Studio (GUI database)
npm test             # Test inti (aturan jam kerja, geofence, RBAC, foto, dll.)
./scripts/build-userguide.sh   # Regenerate panduan pengguna (doc/userguide.html)
```

---

## Panduan Pengguna

Panduan pengguna lengkap (per peran: Karyawan, SPV, Manager, Admin) tersedia sebagai **satu file HTML
mandiri**: [`doc/userguide.html`](doc/userguide.html) — cukup dibuka di browser, tanpa server dan tanpa
folder aset (semua screenshot ter-embed). Berisi menu di sisi kiri yang bisa diklik, pencarian, tombol
Cetak/PDF, dan tangkapan layar tiap halaman.

Untuk membuat ulang setelah UI berubah (aplikasi harus sedang berjalan; butuh Google Chrome):

```bash
npm run dev                      # di terminal lain
./scripts/build-userguide.sh     # atau: BASE=http://localhost:3100 ./scripts/build-userguide.sh
```

---

## Logika Bisnis

### Keterlambatan
- Dihitung jika check-in > `checkInTime + gracePeriod` (default toleransi 15 menit)
- `lateMinutes` = selisih waktu check-in aktual dengan batas toleransi

### Lembur
- **Otomatis saat checkout**: jika checkout > `checkOutTime + overtimeAfter` (default 30 menit, configurable per jadwal kerja), sistem otomatis buat `OvertimeApproval` dengan tipe `CHECKOUT_LATE` dan tampilkan modal alasan
- **Manual via riwayat**: karyawan bisa ajukan lembur dari tab Riwayat untuk tanggal yang sudah checkout tapi belum ada approval, dengan pilihan tipe:
  - `CHECKOUT_LATE` — pulang terlambat
  - `CHECKIN_EARLY` — datang lebih awal (durasi auto-dihitung dari selisih checkIn vs jadwal masuk)
- Satu attendance bisa punya **dua `OvertimeApproval` terpisah** (satu per tipe), masing-masing diproses independen
- `Attendance.overtimeMinutes` = total menit dari semua approval yang `APPROVED`
- `Attendance.overtimeStatus` = `NONE | PENDING | APPROVED | REJECTED | PARTIAL`
  - `PARTIAL` = satu approved, satu rejected dalam hari yang sama
- Jika lembur **ditolak**: `overtimeMinutes` di-reset ke 0, `isOvertime` = false (untuk tipe yang ditolak)
- Jika karyawan tidak punya atasan (`managerId` kosong): notifikasi dikirim ke Admin pertama yang aktif

### Re-review Lembur
- MANAGER/SPV: hanya bisa approve/reject lembur status `PENDING`
- ADMIN: dapat override keputusan yang sudah `APPROVED` atau `REJECTED` (tombol "Override" di halaman Persetujuan Lembur)

### Radius & Lokasi
- Validasi jarak Haversine antara koordinat karyawan dan kantor
- Berlaku untuk **absen masuk dan absen pulang**. Jika di luar radius: absen tetap masuk, ditandai `isOutOfRadius` (masuk) / `checkOutOutOfRadius` (pulang), notifikasi ke rantai atasan
- Karyawan **tanpa jam kerja tetap** (jadwal tanpa jam, mis. "Hari Kerja Saja", atau tanpa jadwal sama sekali) tetap dicatat di luar radius saat pulang tetapi **tidak memicu notifikasi**
- Radius default 100 meter, configurable per kantor

### Keamanan Login
- Akun terkunci **15 menit setelah 5 percobaan gagal**; counter direset saat berhasil login atau saat masa kunci berakhir.
- **Rate limit per-IP** 20 percobaan / 5 menit, plus `limit_req` di nginx untuk `/api/auth/login`.
- Ganti password di halaman Profil wajib menyertakan **password saat ini** (admin mereset tanpa syarat ini); reset otomatis membuka kunci akun.
- **Audit log** (Admin → Audit Log) mencatat login, perubahan karyawan/password, absen, koreksi, master data, pengaturan, dan hapus foto.

### Integritas Bukti Absen
- Selfie diverifikasi **magic bytes** (JPEG/PNG) di server, bukan hanya prefix data URL.
- Foto di-hash (SHA-256); foto yang **identik dengan absen sebelumnya atau milik karyawan lain** otomatis ditandai di catatan dan dinotifikasi ke atasan untuk ditinjau.
- **Akurasi GPS** dari perangkat ikut disimpan; akurasi rendah (>100 m) diberi catatan.
- Retensi foto otomatis lewat cron `/api/cron/photo-retention` (default 180 hari), dan folder `uploads/` ikut di-backup saat deploy.

### Test
- `npm test` — test inti (aturan 8 jam, geofence, RBAC scope, magic bytes foto).

### Foto Absensi (Admin)
- Menu **Admin → Foto Absensi**: riwayat foto per tanggal + hapus satuan. Menghapus user juga membersihkan file fotonya; admin juga bisa menghapus foto tertentu dari menu ini.

### Notifikasi
- Otomatis dikirim ke **seluruh atasan di rantai `managerId`** (mis. karyawan → SPV → Manager; karyawan → Manager bila tanpa SPV) saat: absen di luar radius, koreksi absen diajukan, serta lupa absen pulang (checkout reminder & auto cutoff).
- Tidak ada fallback otomatis ke Admin: jika `managerId` kosong, tidak ada notifikasi ke atasan. Admin dapat melihat **semua** notifikasi di halaman Notifikasi.

---

## Deploy

SOT kode: GitHub (`main` branch)
SOT database: VPS (SQLite di `/var/www/absensi/prisma/dev.db`)

```bash
# Deploy ke VPS (jalankan di VPS)
sudo bash /var/www/deploy-absensi.sh

# Rollback
sudo bash /var/www/deploy-absensi.sh rollback
```

Deploy script otomatis: backup kode & DB, pull GitHub, `npm install`, `prisma db push`, `next build`, restart service.

---

## Lisensi

MIT License — bebas digunakan dan dimodifikasi.
