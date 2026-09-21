import fs from 'node:fs/promises';
import path from 'node:path';

const SHOTS = './shots';
const OUT = process.argv[2] || './userguide.html';
const APP = 'Absensi';
const PROD = 'https://absensi.devop.my.id';

/** Embed an image as a base64 data URI so the guide is fully self-contained. */
async function img(name) {
  const buf = await fs.readFile(path.join(SHOTS, `${name}.png`));
  return `data:image/png;base64,${buf.toString('base64')}`;
}

/** Build the clickable sidebar + content from the section model. */
const sections = [
  {
    id: 'pendahuluan',
    group: 'Mulai',
    title: 'Pendahuluan',
    shots: [],
    html: (ctx) => `
      <p><strong>${APP}</strong> adalah aplikasi absensi karyawan berbasis web: absen masuk/pulang dengan
      <em>selfie</em> + GPS, validasi radius kantor, laporan jam kerja 8 jam/hari, rekap per karyawan,
      cutoff otomatis, koreksi absen, serta notifikasi ke atasan.</p>

      <h3>Apa yang dibutuhkan</h3>
      <ul>
        <li>Browser modern (Chrome/Safari/Edge/Firefox terbaru) — <strong>kamera</strong> dan <strong>GPS</strong> wajib diizinkan.</li>
        <li>Login memakai <strong>NIK</strong>, <strong>email</strong>, atau <strong>nomor HP</strong> (tanpa membedakan huruf besar/kecil).</li>
        <li>Alamat aplikasi: <a href="${PROD}" target="_blank" rel="noreferrer">${PROD}</a></li>
      </ul>

      <h3>Peran & hak akses</h3>
      <table>
        <thead><tr><th>Peran</th><th>Cakupan data</th><th>Bisa apa</th></tr></thead>
        <tbody>
          <tr><td><strong>Karyawan (USER)</strong></td><td>Dirinya sendiri</td><td>Absen, lihat riwayat, ajukan koreksi, ubah profil &amp; password</td></tr>
          <tr><td><strong>SPV</strong></td><td>Dirinya + bawahan langsung</td><td>Tim, laporan, koreksi bawahan, notifikasi bawahan</td></tr>
          <tr><td><strong>Manager</strong></td><td><strong>Semua karyawan</strong></td><td>Semua laporan &amp; koreksi, menerima notifikasi dari SPV/bawahannya</td></tr>
          <tr><td><strong>Admin</strong></td><td>Semua + data master</td><td>Kelola karyawan, kantor, jadwal, libur, foto, audit log</td></tr>
        </tbody>
      </table>

      <div class="note">
        <strong>Cara memakai panduan ini:</strong> klik menu di kolom kiri. Setiap halaman berisi langkah,
        aturan penting, dan tangkapan layar. Panduan ini berdiri sendiri (tanpa koneksi internet).
      </div>`,
  },
  {
    id: 'mulai-login',
    group: 'Mulai',
    title: 'Login &amp; Keluar',
    shots: ['01-login'],
    html: (ctx) => `
      <ol>
        <li>Buka <a href="${PROD}" target="_blank" rel="noreferrer">${PROD}</a>.</li>
        <li>Isi <strong>NIK / Email / No. HP</strong> lalu <strong>Password</strong>.</li>
        <li>Klik <strong>Masuk</strong>. Anda akan diarahkan ke halaman <em>Dashboard</em>.</li>
      </ol>
      <h3>Keamanan login</h3>
      <ul>
        <li>Setelah <strong>5 kali salah password</strong>, akun <strong>terkunci 15 menit</strong>.</li>
        <li>Ada juga pembatas <strong>20 percobaan / 5 menit per jaringan</strong>.</li>
        <li>Lupa password? Minta <strong>Admin</strong> melakukan reset, atau ubah sendiri di menu <em>Profil</em>.</li>
      </ul>
      <h3>Keluar</h3>
      <p>Buka <em>Profil</em> → tombol <strong>Keluar</strong> di bagian bawah.</p>`,
  },
  {
    id: 'user-absensi',
    group: 'Karyawan',
    title: 'Absen Masuk &amp; Pulang',
    shots: ['03-user-attendance'],
    html: (ctx) => `
      <p>Halaman <strong>Absensi</strong> adalah halaman utama karyawan.</p>
      <h3>Langkah absen masuk</h3>
      <ol>
        <li>Pastikan muncul <strong>lokasi</strong> (klik <strong>Perbarui Lokasi</strong> bila perlu) dan izinkan akses GPS.</li>
        <li>Izinkan kamera. Wajah terlihat pada panel kamera.</li>
        <li>Klik <strong>Absen Masuk</strong>. Selfie otomatis diberi watermark (nama/NIK, waktu WIB, koordinat, alamat).</li>
      </ol>
      <h3>Absen pulang</h3>
      <ul>
        <li>Tombol <strong>Absen Pulang</strong> hanya aktif <strong>setelah</strong> absen masuk, dan hanya untuk <strong>hari ini</strong>.</li>
        <li>Setelah lewat tengah malam, absen pulang terkunci — gunakan <strong>koreksi absen</strong>.</li>
      </ul>
      <div class="warn">
        <strong>Wajib foto:</strong> absen masuk dan pulang <strong>tidak dapat dilakukan tanpa selfie</strong>.
        Foto divalidasi di server (format &amp; ukuran maksimal 400 KB) dan diperiksa keasliannya.
      </div>
      <h3>Jika di luar radius kantor</h3>
      <ul>
        <li>Absen tetap <strong>tersimpan</strong>, tetapi ditandai <span class="pill">Luar radius</span>.</li>
        <li>Atasan langsung (dan atasannya) menerima notifikasi.</li>
        <li>Karyawan dengan jadwal <em>tanpa jam</em> (mis. “Hari Kerja Saja”) tidak memicu notifikasi saat pulang.</li>
      </ul>`,
  },
  {
    id: 'user-riwayat',
    group: 'Karyawan',
    title: 'Riwayat Absensi',
    shots: ['04-user-history'],
    html: () => `
      <p>Tab <strong>Riwayat</strong> menampilkan absensi Anda (default 30 hari terakhir) beserta status:</p>
      <ul>
        <li><strong>Jam masuk &amp; pulang</strong> (WIB) dan <strong>durasi kerja</strong>.</li>
        <li>Penanda <span class="pill">Luar radius</span>, <span class="pill">Pulang otomatis</span> (cutoff), dan <span class="pill">Belum Lengkap</span>.</li>
        <li>Tombol <strong>Koreksi</strong> pada baris tertentu untuk mengajukan perbaikan jam.</li>
      </ul>`,
  },
  {
    id: 'user-koreksi',
    group: 'Karyawan',
    title: 'Mengajukan Koreksi Absen',
    shots: [],
    html: () => `
      <h3>Kapan dipakai</h3>
      <ul>
        <li>Lupa absen pulang, salah tap jam, atau tanggal yang jamnya perlu diperbaiki.</li>
      </ul>
      <h3>Langkah</h3>
      <ol>
        <li>Buka <strong>Absensi → Riwayat</strong>, pilih baris, klik <strong>Koreksi</strong>.</li>
        <li>Isi <strong>jam masuk</strong> dan/atau <strong>jam pulang</strong> yang benar (format <code>HH:mm</code>).</li>
        <li>Tulis <strong>alasan</strong> (wajib), lalu kirim.</li>
        <li>Atasan menerima notifikasi dan menyetujui/menolak. Anda mendapat notifikasi hasilnya.</li>
      </ol>
      <div class="note">
        <strong>Aturan:</strong> hanya boleh <strong>satu koreksi menunggu</strong> per hari absen. Anda tidak bisa
        menyetujui koreksi Anda sendiri, dan “lupa absen masuk” tidak bisa dikoreksi bila tidak ada record absen hari itu.
      </div>`,
  },
  {
    id: 'user-dashboard',
    group: 'Karyawan',
    title: 'Dashboard (Karyawan)',
    shots: ['02-user-dashboard'],
    html: () => `
      <p>Ringkasan hari ini: jumlah kehadiran, keterlambatan tidak dihitung (aplikasi ini fokus pada pemenuhan
      <strong>8 jam</strong>), serta tombol cepat menuju absen.</p>`,
  },
  {
    id: 'user-notifikasi',
    group: 'Karyawan',
    title: 'Notifikasi',
    shots: ['05-user-notifications'],
    html: () => `
      <p>Berisi pemberitahuan pribadi, mis. <strong>koreksi disetujui/ditolak</strong> dan pengingat absen pulang.</p>
      <ul>
        <li>Angka pada ikon lonceng menandakan notifikasi belum dibaca.</li>
        <li>Klik <strong>Tandai Semua Dibaca</strong> untuk membersihkan.</li>
      </ul>`,
  },
  {
    id: 'user-profil',
    group: 'Karyawan',
    title: 'Profil &amp; Ganti Password',
    shots: ['06-user-profile'],
    html: () => `
      <ol>
        <li>Buka <strong>Profil</strong> → <strong>Edit</strong>.</li>
        <li>Ubah <strong>nama, email, no. HP, alamat</strong>.</li>
        <li>Untuk mengganti password: isi <strong>Password Baru</strong> (min. 8 karakter) <em>dan</em>
            <strong>Password Saat Ini</strong>.</li>
        <li>Klik <strong>Simpan</strong>.</li>
      </ol>
      <div class="note">Admin dapat mereset password tanpa meminta password lama. Reset password otomatis membuka kunci akun.</div>`,
  },
  {
    id: 'manager-dashboard',
    group: 'Atasan (Manager &amp; SPV)',
    title: 'Dashboard Atasan',
    shots: ['10-manager-dashboard'],
    html: () => `
      <p>Menampilkan ringkasan hari ini untuk <strong>cakupan Anda</strong>.</p>
      <table>
        <thead><tr><th>Peran</th><th>Yang terlihat</th></tr></thead>
        <tbody>
          <tr><td>SPV</td><td>Dirinya + bawahan langsung</td></tr>
          <tr><td>Manager</td><td><strong>Seluruh karyawan</strong></td></tr>
        </tbody>
      </table>`,
  },
  {
    id: 'manager-tim',
    group: 'Atasan (Manager &amp; SPV)',
    title: 'Tim Saya',
    shots: ['11-manager-team', '15-spv-team'],
    shotsLabel: ['Tampilan Manager (semua karyawan)', 'Tampilan SPV (dirinya + bawahan)'],
    html: () => `
      <p>Daftar kehadiran per tanggal. Pilih tanggal di bagian atas untuk melihat hari lain.</p>
      <ul>
        <li>Menampilkan jam masuk/pulang, status, dan penanda luar radius.</li>
        <li>Klik baris untuk melihat detail termasuk <strong>foto</strong> dan titik lokasi (Google Maps).</li>
      </ul>
      <div class="note">Cakupan berbeda: Manager melihat <strong>semua</strong>; SPV hanya dirinya &amp; bawahan langsung.</div>`,
  },
  {
    id: 'manager-laporan',
    group: 'Atasan (Manager &amp; SPV)',
    title: 'Laporan Absensi',
    shots: ['12-manager-reports', '13-manager-reports-summary', '16-spv-reports'],
    shotsLabel: [
      'Tab Detail Absensi (per baris, + foto)',
      'Tab Rekap per Karyawan',
      'Tampilan SPV (cakupan lebih kecil)',
    ],
    html: () => `
      <h3>Filter</h3>
      <ul>
        <li><strong>Rentang tanggal</strong> (maksimal 366 hari), <strong>departemen</strong>, dan <strong>pencarian</strong> nama/NIK.</li>
      </ul>
      <h3>Dua tab</h3>
      <ul>
        <li><strong>Detail Absensi</strong> — satu baris per absen; klik baris untuk melihat foto &amp; lokasi.</li>
        <li><strong>Rekap per Karyawan</strong> — Total Hari, Cukup 8 Jam, Kurang 8 Jam, Cutoff, Belum Lengkap, Total Kekurangan.</li>
      </ul>
      <h3>Ekspor Excel</h3>
      <p>Tombol <strong>Export</strong> menghasilkan <code>.xlsx</code> sesuai tabel yang aktif (lebar kolom &amp; autofilter sudah diatur).</p>
      <h3>Arti kolom rekap</h3>
      <table>
        <thead><tr><th>Kolom</th><th>Arti</th></tr></thead>
        <tbody>
          <tr><td>Cukup 8 Jam</td><td>Hari lengkap dengan durasi kerja ≥ 480 menit</td></tr>
          <tr><td>Kurang 8 Jam</td><td>Hari lengkap tetapi &lt; 480 menit</td></tr>
          <tr><td>Cutoff</td><td>Jam pulang diisi otomatis oleh sistem (jam sebenarnya tidak diketahui)</td></tr>
          <tr><td>Belum Lengkap</td><td>Ada jam masuk, jam pulang kosong</td></tr>
          <tr><td>Total Kekurangan</td><td>Akumulasi menit kurang dari 8 jam</td></tr>
        </tbody>
      </table>`,
  },
  {
    id: 'manager-koreksi',
    group: 'Atasan (Manager &amp; SPV)',
    title: 'Menyetujui Koreksi Absen',
    shots: ['14-manager-corrections', '17-spv-corrections'],
    shotsLabel: ['Daftar koreksi di sisi Manager', 'Daftar koreksi di sisi SPV'],
    html: () => `
      <ol>
        <li>Buka menu <strong>Koreksi Absen</strong>.</li>
        <li>Tinjau <strong>alasan</strong>, jam lama vs jam yang diusulkan, dan foto bila ada.</li>
        <li>Klik <strong>Setujui</strong> atau <strong>Tolak</strong>. Karyawan menerima notifikasi.</li>
      </ol>
      <div class="note">
        Bila disetujui, jam absen diperbarui otomatis. Anda <strong>tidak bisa</strong> menyetujui koreksi yang Anda ajukan sendiri
        (Admin boleh). SPV hanya melihat koreksi dirinya &amp; bawahannya; Manager melihat semua.
      </div>`,
  },
  {
    id: 'admin-karyawan',
    group: 'Administrasi (Admin)',
    title: 'Kelola Karyawan',
    shots: ['21-admin-users'],
    html: () => `
      <p>Menu <strong>Kelola Karyawan</strong> hanya tersedia untuk <strong>Admin</strong> (Manager/SPV tidak dapat mengaksesnya).</p>
      <h3>Tambah karyawan</h3>
      <ol>
        <li>Klik <strong>Tambah Karyawan</strong>.</li>
        <li>Isi NIK, nama, jabatan, departemen, peran (USER/SPV/MANAGER/ADMIN), <strong>atasan</strong>,
            <strong>kantor</strong>, <strong>jadwal kerja</strong>, password awal.</li>
        <li>Simpan.</li>
      </ol>
      <h3>Import Excel</h3>
      <ol>
        <li>Klik <strong>Import</strong> → unduh <strong>template</strong>.</li>
        <li>Isi data, unggah kembali. Kantor dicocokkan berdasarkan nama.</li>
      </ol>
      <h3>Catatan penting</h3>
      <ul>
        <li><strong>Atasan (managerId)</strong> menentukan <strong>notifikasi</strong> dan cakupan SPV.</li>
        <li>Menghapus karyawan ikut menghapus absensinya, koreksinya, dan <strong>file fotonya</strong>.</li>
        <li>Reset password oleh Admin <strong>membuka kunci</strong> akun.</li>
      </ul>`,
  },
  {
    id: 'admin-departemen',
    group: 'Administrasi (Admin)',
    title: 'Departemen',
    shots: ['22-admin-departments'],
    html: () => `
      <p>Tambah/ubah departemen. Departemen yang masih dipakai karyawan <strong>tidak dapat dihapus</strong>.</p>`,
  },
  {
    id: 'admin-kantor',
    group: 'Administrasi (Admin)',
    title: 'Lokasi Kantor &amp; Radius',
    shots: ['23-admin-offices'],
    html: () => `
      <ol>
        <li>Klik <strong>Tambah Kantor</strong> atau <strong>Edit</strong>.</li>
        <li>Klik <strong>Gunakan Lokasi Saya Sekarang</strong> untuk mengisi koordinat dari GPS perangkat Admin.</li>
        <li>Atur <strong>radius (meter)</strong>. Simpan.</li>
      </ol>
      <div class="warn">
        <strong>Dampak:</strong> absen masuk <em>dan</em> pulang divalidasi terhadap radius ini. Di luar radius, absen tetap
        tersimpan tetapi ditandai dan memicu notifikasi ke atasan. Menonaktifkan kantor bersifat <em>soft delete</em> —
        absen karyawan yang masih tertaut tetap divalidasi.
      </div>`,
  },
  {
    id: 'admin-jadwal',
    group: 'Administrasi (Admin)',
    title: 'Jadwal Kerja &amp; Cutoff',
    shots: ['25-admin-workhours'],
    html: () => `
      <h3>Jadwal kerja</h3>
      <ul>
        <li>Boleh punya jam masuk/pulang, <strong>hari saja tanpa jam</strong>, atau karyawan tanpa jadwal.</li>
        <li>Format jam <code>HH:mm</code>; hari kerja <code>1–7</code> (1 = Senin).</li>
        <li>Jadwal <em>tanpa jam</em> dipakai untuk karyawan dengan jam kerja bebas (tidak memicu notifikasi radius saat pulang).</li>
      </ul>
      <h3>Cutoff otomatis</h3>
      <ul>
        <li>Aktifkan/nonaktifkan dan tetapkan <strong>jam cutoff</strong> (default 19:00 WIB).</li>
        <li>Jam pulang yang kosong pada hari berjalan akan diisi otomatis dan ditandai <span class="pill">Pulang otomatis</span>.</li>
        <li>Hari cutoff <strong>tidak</strong> dihitung cukup/kurang karena jam sebenarnya tidak diketahui.</li>
      </ul>`,
  },
  {
    id: 'admin-libur',
    group: 'Administrasi (Admin)',
    title: 'Hari Libur',
    shots: ['24-admin-holidays'],
    html: () => `<p>Kelola daftar hari libur nasional/perusahaan per tahun untuk keperluan laporan.</p>`,
  },
  {
    id: 'admin-foto',
    group: 'Administrasi (Admin)',
    title: 'Foto Absensi',
    shots: ['26-admin-photos'],
    html: () => `
      <p>Menelusuri <strong>foto absensi semua karyawan per tanggal</strong>, dengan penanda luar radius, dan
      tombol <strong>Hapus</strong> per foto.</p>
      <h3>Kegunaan</h3>
      <ul>
        <li><strong>Retensi/kebersihan bukti</strong>: hapus foto lama atau tidak relevan.</li>
        <li>Meninjau foto yang ditandai sistem (duplikat/identik dengan absen lain).</li>
      </ul>
      <div class="note">
        Menghapus foto <strong>tidak</strong> mengubah jam kerja atau status — perhitungan 8 jam hanya dari jam masuk/pulang.
        Menu ini berbeda dari <em>Laporan</em>: Laporan untuk verifikasi per baris, menu ini untuk <em>kelola/hapus</em> foto.
        Retensi otomatis juga berjalan (default 180 hari).
      </div>`,
  },
  {
    id: 'admin-audit',
    group: 'Administrasi (Admin)',
    title: 'Audit Log',
    shots: ['27-admin-audit'],
    html: () => `
      <p>Jejak aktivitas penting: login (berhasil/gagal/terkunci), perubahan karyawan &amp; password,
      absen, koreksi, perubahan kantor/jadwal/departemen/libur/pengaturan, dan hapus foto.</p>
      <ul>
        <li>Filter berdasarkan <strong>jenis aksi</strong> dan <strong>pencarian</strong> pada kolom teks.</li>
        <li>Menampilkan pelaku, waktu, jenis aksi, target, detail, dan IP.</li>
      </ul>`,
  },
  {
    id: 'admin-laporan',
    group: 'Administrasi (Admin)',
    title: 'Laporan &amp; Tim (Admin)',
    shots: ['28-admin-reports', '29-admin-team', '30-admin-corrections'],
    shotsLabel: ['Laporan (Admin melihat semua)', 'Tim (Admin)', 'Koreksi Absen (Admin)'],
    html: () => `
      <p>Admin melihat <strong>seluruh karyawan</strong> pada Laporan, Tim, dan Koreksi, serta dapat menyetujui koreksi siapa pun.</p>`,
  },
  {
    id: 'admin-profil',
    group: 'Administrasi (Admin)',
    title: 'Profil Admin',
    shots: ['31-admin-profile'],
    html: () => `<p>Sama seperti peran lain: ubah data diri dan ganti password (wajib menyertakan password saat ini).</p>`,
  },
  {
    id: 'aturan',
    group: 'Referensi',
    title: 'Aturan Bisnis Penting',
    shots: [],
    html: () => `
      <table>
        <thead><tr><th>Aturan</th><th>Detail</th></tr></thead>
        <tbody>
          <tr><td>Hari “cukup”</td><td>Jam masuk → jam pulang ≥ <strong>480 menit</strong>, bukan cutoff, dan lengkap</td></tr>
          <tr><td>Hari cutoff</td><td>Tidak dihitung cukup/kurang; masuk kolom <strong>Cutoff</strong></td></tr>
          <tr><td>Belum Lengkap</td><td>Ada jam masuk, jam pulang kosong</td></tr>
          <tr><td>Absen pulang</td><td>Hanya untuk hari ini; setelah tengah malam lewat <strong>koreksi</strong></td></tr>
          <tr><td>Foto</td><td><strong>Wajib</strong> saat masuk &amp; pulang; maksimal 400 KB; divalidasi server</td></tr>
          <tr><td>Radius</td><td>Divalidasi saat masuk &amp; pulang; tidak memblokir, hanya menandai + notifikasi</td></tr>
          <tr><td>Jam kerja bebas</td><td>Jadwal tanpa jam / tanpa jadwal → tidak ada notifikasi radius saat pulang</td></tr>
          <tr><td>Notifikasi</td><td>Naik ke seluruh rantai atasan (karyawan → SPV → Manager); Admin melihat semua</td></tr>
          <tr><td>Zona waktu</td><td>Semua waktu memakai <strong>WIB</strong> (Asia/Jakarta)</td></tr>
          <tr><td>Keamanan</td><td>Lockout 5× salah / 15 menit; rate limit 20/5 menit per IP</td></tr>
        </tbody>
      </table>`,
  },
  {
    id: 'faq',
    group: 'Referensi',
    title: 'Tanya Jawab / Pemecahan Masalah',
    shots: [],
    html: () => `
      <h3>Kamera tidak muncul</h3>
      <ul><li>Izinkan akses kamera di browser (ikon 🔒 di address bar), lalu muat ulang halaman.</li></ul>
      <h3>Lokasi tidak terdeteksi</h3>
      <ul><li>Aktifkan GPS dan izin lokasi; klik <strong>Perbarui Lokasi</strong>. Di dalam ruangan akurasi bisa menurun dan diberi catatan.</li></ul>
      <h3>Tombol Absen Pulang tidak aktif</h3>
      <ul><li>Pastikan sudah absen masuk hari ini. Jika sudah lewat tengah malam, ajukan <strong>koreksi</strong>.</li></ul>
      <h3>Akun terkunci</h3>
      <ul><li>Tunggu 15 menit, atau minta Admin mereset password (reset otomatis membuka kunci).</li></ul>
      <h3>Menu yang saya cari tidak ada</h3>
      <ul><li>Menu mengikuti peran. Menu <strong>Administrasi</strong> hanya untuk Admin; Manager/SPV hanya melihat menu Tim/Laporan/Koreksi.</li></ul>
      <h3>Laporan kurang akurat?</h3>
      <ul><li>Periksa kolom <strong>Cutoff</strong> (jam pulang otomatis) dan <strong>Belum Lengkap</strong> sebelum menyimpulkan kekurangan jam.</li></ul>`,
  },
];

const groups = [];
for (const s of sections) {
  if (!groups.includes(s.group)) groups.push(s.group);
}

// Pre-embed every screenshot once, reuse in nav/content.
const embeds = new Map();
for (const s of sections) {
  for (const shot of s.shots || []) {
    if (!embeds.has(shot)) embeds.set(shot, await img(shot));
  }
}

const navHtml = groups
  .map((g) => {
    const items = sections.filter((s) => s.group === g);
    return `<div class="nav-group">
      <div class="nav-group-title">${g}</div>
      ${items
        .map(
          (s) =>
            `<a class="nav-item" href="#${s.id}" data-target="${s.id}">${s.title}</a>`
        )
        .join('')}
    </div>`;
  })
  .join('');

const contentHtml = sections
  .map((s) => {
    const gallery = (s.shots || [])
      .map(
        (shot, i) => `
        <figure>
          <img src="${embeds.get(shot)}" alt="${s.title}" loading="lazy" />
          <figcaption>${(s.shotsLabel && s.shotsLabel[i]) || s.title}</figcaption>
        </figure>`
      )
      .join('');
    return `<section class="doc" id="${s.id}">
      <p class="crumb">${s.group}</p>
      <h1>${s.title}</h1>
      ${s.html()}
      ${gallery ? `<div class="gallery">${gallery}</div>` : ''}
    </section>`;
  })
  .join('');

const total = sections.length;
const html = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Panduan Pengguna ${APP}</title>
<style>
  :root{
    --bg:#f6f8fb; --panel:#ffffff; --ink:#0f172a; --muted:#5b6b84;
    --line:#e3e9f2; --brand:#0ea5e9; --brand-dark:#0369a1; --radius:14px;
    --sidebar:#0f172a;
  }
  *{box-sizing:border-box}
  html,body{margin:0;padding:0}
  body{background:var(--bg);color:var(--ink);
    font:15px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
  a{color:var(--brand-dark)}
  code{background:#eef2f7;padding:1px 6px;border-radius:6px;font-size:.9em}
  h1{font-size:1.6rem;margin:0 0 .6rem}
  h3{margin:1.4rem 0 .4rem;font-size:1rem}
  ul,ol{margin:.4rem 0 .8rem;padding-left:1.2rem}
  li{margin:.25rem 0}
  p{margin:.5rem 0}

  .layout{display:grid;grid-template-columns:320px 1fr;min-height:100vh}
  /* Sidebar */
  aside{background:var(--sidebar);color:#cbd5e1;position:sticky;top:0;height:100vh;overflow:auto;padding:18px 14px}
  .brand{display:flex;align-items:center;gap:10px;padding:6px 8px 14px}
  .brand .logo{width:34px;height:34px;border-radius:9px;background:linear-gradient(135deg,#38bdf8,#0284c7);display:grid;place-items:center;color:#fff;font-weight:800}
  .brand b{color:#fff;font-size:1.05rem;display:block}
  .brand small{color:#94a3b8;font-size:.78rem}
  .searchbox{position:relative;margin:4px 0 12px}
  .searchbox input{width:100%;padding:9px 10px;border-radius:10px;border:1px solid #1e293b;background:#0b1220;color:#e2e8f0;outline:none}
  .searchbox input::placeholder{color:#64748b}
  .nav-group{margin:10px 0 4px}
  .nav-group-title{font-size:.72rem;letter-spacing:.08em;text-transform:uppercase;color:#64748b;padding:6px 8px}
  .nav-item{display:block;padding:8px 10px;border-radius:10px;color:#cbd5e1;text-decoration:none;font-size:.92rem;border:1px solid transparent}
  .nav-item:hover{background:#172033;color:#fff}
  .nav-item.active{background:linear-gradient(135deg,#0ea5e9,#0284c7);color:#fff;border-color:#0ea5e9}
  .sidefoot{margin-top:16px;padding:10px;border-top:1px solid #1e293b;color:#64748b;font-size:.76rem}

  /* Content */
  main{padding:0}
  .topbar{position:sticky;top:0;z-index:5;background:rgba(246,248,251,.9);backdrop-filter:blur(8px);border-bottom:1px solid var(--line);padding:12px 28px;display:flex;align-items:center;justify-content:space-between;gap:12px}
  .topbar .title{font-weight:600;color:var(--muted);font-size:.9rem}
  .topbar .actions{display:flex;gap:8px}
  .btn{border:1px solid var(--line);background:#fff;border-radius:10px;padding:7px 12px;font-size:.85rem;cursor:pointer;color:var(--ink);text-decoration:none;display:inline-flex;gap:6px;align-items:center}
  .btn:hover{border-color:#cbd5e1}
  .btn.primary{background:var(--brand);border-color:var(--brand);color:#fff}

  .docs{padding:26px 28px 80px;max-width:1080px}
  .doc{display:none;background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:26px 28px;box-shadow:0 1px 2px rgba(15,23,42,.04)}
  .doc.visible{display:block}
  .crumb{margin:0 0 2px;font-size:.75rem;letter-spacing:.06em;text-transform:uppercase;color:var(--brand-dark);font-weight:600}

  table{width:100%;border-collapse:collapse;margin:.8rem 0;font-size:.92rem}
  th,td{border:1px solid var(--line);padding:8px 10px;text-align:left;vertical-align:top}
  th{background:#f1f6fb}
  .note,.warn{border-radius:12px;padding:12px 14px;margin:12px 0;font-size:.92rem}
  .note{background:#eff6ff;border:1px solid #bfdbfe;color:#1e3a8a}
  .warn{background:#fff7ed;border:1px solid #fed7aa;color:#9a3412}
  .pill{display:inline-block;background:#eef2f7;border:1px solid #dbe3ee;border-radius:999px;padding:0 8px;font-size:.78rem;white-space:nowrap}

  .gallery{display:grid;gap:16px;margin-top:18px}
  figure{margin:0;border:1px solid var(--line);border-radius:12px;overflow:hidden;background:#fff}
  figure img{display:block;width:100%;height:auto}
  figcaption{padding:8px 12px;font-size:.82rem;color:var(--muted);border-top:1px solid var(--line);background:#fafcff}

  .pager{display:flex;justify-content:space-between;gap:10px;margin-top:22px;padding-top:14px;border-top:1px solid var(--line)}

  @media (max-width:900px){
    .layout{grid-template-columns:1fr}
    aside{position:relative;height:auto}
    .docs{padding:18px}
  }
  @media print{
    aside,.topbar,.pager{display:none!important}
    .doc{display:block!important;break-inside:avoid;box-shadow:none}
    body{background:#fff}
  }
</style>
</head>
<body>
<div class="layout">
  <aside>
    <div class="brand">
      <div class="logo">A</div>
      <div><b>Panduan ${APP}</b><small>Dokumentasi pengguna</small></div>
    </div>
    <div class="searchbox"><input id="q" type="search" placeholder="Cari menu/panduan..." autocomplete="off" /></div>
    <nav id="nav">${navHtml}</nav>
    <div class="sidefoot">${total} bagian · ${embeds.size} tangkapan layar<br/>Versi dokumen: 1.0</div>
  </aside>

  <main>
    <div class="topbar">
      <div class="title" id="current">Pendahuluan</div>
      <div class="actions">
        <a class="btn" href="${PROD}" target="_blank" rel="noreferrer">Buka Aplikasi</a>
        <button class="btn primary" id="printBtn">Cetak / PDF</button>
      </div>
    </div>
    <div class="docs" id="docs">${contentHtml}</div>
  </main>
</div>

<script>
(function(){
  var docs = Array.prototype.slice.call(document.querySelectorAll('.doc'));
  var navItems = Array.prototype.slice.call(document.querySelectorAll('.nav-item'));
  var current = document.getElementById('current');
  var q = document.getElementById('q');

  function show(id, push){
    var found = false;
    docs.forEach(function(d){
      var on = d.id === id;
      d.classList.toggle('visible', on);
      if(on) found = true;
    });
    if(!found){ docs[0].classList.add('visible'); id = docs[0].id; }
    navItems.forEach(function(a){
      a.classList.toggle('active', a.getAttribute('data-target') === id);
    });
    var active = navItems.filter(function(a){return a.getAttribute('data-target')===id;})[0];
    if(active){
      current.textContent = active.textContent;
      active.scrollIntoView({block:'nearest'});
    }
    if(push && location.hash !== '#'+id) history.replaceState(null,'','#'+id);
    window.scrollTo({top:0});
  }

  navItems.forEach(function(a){
    a.addEventListener('click', function(ev){
      ev.preventDefault();
      show(a.getAttribute('data-target'), true);
    });
  });

  document.getElementById('printBtn').addEventListener('click', function(){ window.print(); });

  window.addEventListener('hashchange', function(){
    show(location.hash.replace('#','') || docs[0].id, false);
  });

  // Simple filter: hides nav items (and their group) that don't match.
  q.addEventListener('input', function(){
    var term = q.value.trim().toLowerCase();
    navItems.forEach(function(a){
      var hit = !term || a.textContent.toLowerCase().indexOf(term) !== -1;
      a.style.display = hit ? 'block' : 'none';
    });
    Array.prototype.slice.call(document.querySelectorAll('.nav-group')).forEach(function(g){
      var anyVisible = Array.prototype.slice.call(g.querySelectorAll('.nav-item')).some(function(a){return a.style.display !== 'none';});
      g.style.display = anyVisible ? '' : 'none';
    });
  });

  show(location.hash.replace('#','') || docs[0].id, false);
})();
</script>
</body>
</html>`;

await fs.writeFile(OUT, html);
const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`Wrote ${OUT} (${kb} KB, self-contained, ${embeds.size} images embedded)`);