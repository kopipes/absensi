/**
 * Idempotent sample data seeder — creates 15 sample employees and 5 days of
 * attendance with varied cases so features can be exercised end-to-end.
 *
 * Usage:
 *   npx tsx prisma/sample-data.ts                 # password: Sample123!
 *   SAMPLE_PASSWORD='MyPass123' npx tsx prisma/sample-data.ts
 *
 * Safe to re-run: users are upserted by NIK, attendance by (userId, date).
 * It never touches existing (non-sample) users or their data.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { promises as fs } from 'fs';
import path from 'path';

const prisma = new PrismaClient();
const PASSWORD = process.env.SAMPLE_PASSWORD || 'Sample123!';
const TZ_OFFSET_HOURS = 7;

// 1x1 JPEG (placeholder) used to exercise the photo storage + auth route
const PLACEHOLDER_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64'
);

const USERS = [
  { nik: 'SAMPLE001', name: 'Budi Santoso', role: 'USER', department: 'Engineering', position: 'Software Engineer', schedule: 'Reguler', office: 'Kantor Pusat' },
  { nik: 'SAMPLE002', name: 'Siti Aminah', role: 'USER', department: 'Finance', position: 'Staff Akuntansi', schedule: 'Reguler', office: 'Kantor Pusat' },
  { nik: 'SAMPLE003', name: 'Agus Pratama', role: 'USER', department: 'Operations', position: 'Operator', schedule: 'Shift Pagi', office: 'Kantor Cabang' },
  { nik: 'SAMPLE004', name: 'Dewi Lestari', role: 'USER', department: 'HR', position: 'Staff HRD', schedule: 'Reguler', office: 'Kantor Pusat' },
  { nik: 'SAMPLE005', name: 'Rizky Ramadhan', role: 'USER', department: 'Engineering', position: 'QA Engineer', schedule: 'Hari Kerja Saja', office: 'Kantor Pusat' },
  { nik: 'SAMPLE006', name: 'Putri Maharani', role: 'USER', department: 'Finance', position: 'Kasir', schedule: 'Reguler', office: 'Kantor Cabang' },
  { nik: 'SAMPLE007', name: 'Eko Prasetyo', role: 'USER', department: 'Operations', position: 'Driver', schedule: 'Shift Pagi', office: 'Kantor Cabang' },
  { nik: 'SAMPLE008', name: 'Maya Sari', role: 'USER', department: 'HR', position: 'Recruiter', schedule: 'Reguler', office: 'Kantor Pusat' },
  { nik: 'SAMPLE009', name: 'Fajar Nugroho', role: 'USER', department: 'Engineering', position: 'DevOps', schedule: 'Hari Kerja Saja', office: 'Kantor Pusat' },
  { nik: 'SAMPLE010', name: 'Indah Permata', role: 'USER', department: 'Finance', position: 'Analis', schedule: 'Reguler', office: 'Kantor Pusat' },
  { nik: 'SAMPLE011', name: 'Hendra Wijaya', role: 'USER', department: 'Operations', position: 'Supervisor Lapangan', schedule: 'Shift Pagi', office: 'Kantor Cabang' },
  { nik: 'SAMPLE012', name: 'Ratna Kusuma', role: 'USER', department: 'HR', position: 'Payroll', schedule: 'Reguler', office: 'Kantor Pusat' },
  { nik: 'SAMPLE013', name: 'Yoga Saputra', role: 'USER', department: 'Engineering', position: 'Mobile Dev', schedule: null, office: 'Kantor Pusat' },
  { nik: 'SAMPLE014', name: 'Bagus Setiawan', role: 'MANAGER', department: 'Operations', position: 'Operations Manager', schedule: 'Reguler', office: 'Kantor Pusat' },
  { nik: 'SAMPLE015', name: 'Nadia Safitri', role: 'SPV', department: 'Engineering', position: 'Engineering Lead', schedule: 'Reguler', office: 'Kantor Pusat' },
];

const DEPARTMENTS = [
  { name: 'Engineering', description: 'Teknologi & Produk' },
  { name: 'Finance', description: 'Keuangan & Akuntansi' },
  { name: 'Operations', description: 'Operasional' },
  { name: 'HR', description: 'Sumber Daya Manusia' },
];

const OFFICES = [
  { name: 'Kantor Pusat', address: 'Jl. Jend. Sudirman No. 1, Jakarta', latitude: -6.2088, longitude: 106.8456, radius: 150 },
  { name: 'Kantor Cabang', address: 'Jl. Asia Afrika No. 8, Bandung', latitude: -6.9175, longitude: 107.6191, radius: 150 },
];

const SCHEDULES = [
  { name: 'Reguler', checkInTime: '08:00', checkOutTime: '17:00', workDays: '1,2,3,4,5' },
  { name: 'Shift Pagi', checkInTime: '07:00', checkOutTime: '16:00', workDays: '1,2,3,4,5,6' },
  { name: 'Hari Kerja Saja', checkInTime: null, checkOutTime: null, workDays: '1,2,3,4,5' },
];

function wibDate(offsetDays: number): string {
  const d = new Date(Date.now() + TZ_OFFSET_HOURS * 3600 * 1000);
  d.setUTCDate(d.getUTCDate() - offsetDays);
  return d.toISOString().slice(0, 10);
}

function at(date: string, hhmm: string): Date {
  return new Date(`${date}T${hhmm}:00+07:00`);
}

type Case = 'FULL' | 'SHORT' | 'CUTOFF' | 'OUTSIDE' | 'ABSENT' | 'LATE' | 'LONG' | 'OPEN';
const CASES: Case[] = ['FULL', 'SHORT', 'CUTOFF', 'OUTSIDE', 'ABSENT', 'LATE', 'LONG'];

async function savePlaceholderPhoto(date: string, userId: string, kind: 'in' | 'out'): Promise<string> {
  const base = process.env.UPLOAD_DIR ? path.resolve(process.env.UPLOAD_DIR) : path.join(process.cwd(), 'uploads');
  const root = path.join(base, 'absensi');
  const year = date.slice(0, 4);
  const month = date.slice(5, 7);
  const key = `${year}/${month}/${kind}_${userId}_sample_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
  await fs.mkdir(path.join(root, year, month), { recursive: true });
  await fs.writeFile(path.join(root, key), PLACEHOLDER_JPEG);
  return key;
}

async function main() {
  console.log('Seeding sample data (password for all samples: ' + PASSWORD + ')');
  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  // Departments
  for (const d of DEPARTMENTS) {
    await prisma.department.upsert({ where: { name: d.name }, update: {}, create: d });
  }

  // Offices
  const offices: Record<string, string> = {};
  for (const o of OFFICES) {
    const existing = await prisma.office.findFirst({ where: { name: o.name } });
    const office = existing ?? (await prisma.office.create({ data: o }));
    offices[o.name] = office.id;
  }

  // Work schedules
  const schedules: Record<string, string> = {};
  for (const s of SCHEDULES) {
    const existing = await prisma.workSchedule.findFirst({ where: { name: s.name } });
    const schedule = existing ?? (await prisma.workSchedule.create({ data: { ...s, officeId: offices['Kantor Pusat'] } }));
    schedules[s.name] = schedule.id;
  }

  // Users
  const userIds: Record<string, string> = {};
  for (const u of USERS) {
    const user = await prisma.user.upsert({
      where: { nik: u.nik },
      update: {
        name: u.name,
        role: u.role,
        department: u.department,
        position: u.position,
        officeId: offices[u.office],
        workScheduleId: u.schedule ? schedules[u.schedule] : null,
        isActive: true,
      },
      create: {
        nik: u.nik,
        name: u.name,
        email: `${u.nik.toLowerCase()}@absensi.devop.my.id`,
        phone: `0812000${u.nik.slice(-4)}`,
        role: u.role,
        department: u.department,
        position: u.position,
        password: passwordHash,
        officeId: offices[u.office],
        workScheduleId: u.schedule ? schedules[u.schedule] : null,
      },
    });
    userIds[u.nik] = user.id;
  }

  // Manager relationships: first 12 report to SAMPLE014, last two report to SAMPLE015
  await prisma.user.updateMany({
    where: { nik: { in: USERS.slice(0, 12).map((u) => u.nik) } },
    data: { managerId: userIds['SAMPLE014'] },
  });
  await prisma.user.update({
    where: { nik: 'SAMPLE014' },
    data: { managerId: userIds['SAMPLE015'] },
  });

  // Attendance: 5 days, varied cases
  const days = Array.from({ length: 5 }, (_, i) => wibDate(i)); // day 0 = today
  let created = 0;
  let updated = 0;

  for (let ui = 0; ui < USERS.length; ui++) {
    const u = USERS[ui];
    const userId = userIds[u.nik];
    const office = OFFICES.find((o) => o.name === u.office)!;

    for (let di = 0; di < days.length; di++) {
      const date = days[di];
      let c: Case = CASES[(ui * 2 + di) % CASES.length];
      // Today: a couple of employees are still clocked in (belum lengkap)
      if (di === 0 && (ui === 0 || ui === 1)) c = 'OPEN';

      let data: Record<string, unknown> = {
        userId,
        date,
        status: 'PRESENT',
        isOutOfRadius: false,
        isAutoCheckout: false,
        checkIn: null,
        checkOut: null,
        checkInPhoto: null,
        checkOutPhoto: null,
        checkInLat: office.latitude,
        checkInLng: office.longitude,
        checkInAddress: office.address,
        checkOutLat: office.latitude,
        checkOutLng: office.longitude,
        checkOutAddress: office.address,
        notes: null,
      };

      switch (c) {
        case 'FULL':
          data.checkIn = at(date, '08:00');
          data.checkOut = at(date, '17:00');
          break;
        case 'LONG':
          data.checkIn = at(date, '07:30');
          data.checkOut = at(date, '17:30');
          data.notes = 'Lembur mandiri (contoh data)';
          break;
        case 'SHORT':
          data.checkIn = at(date, '08:00');
          data.checkOut = at(date, '15:00');
          data.notes = 'Pulang lebih awal (contoh data)';
          break;
        case 'LATE':
          data.checkIn = at(date, '09:30');
          data.checkOut = at(date, '17:00');
          break;
        case 'CUTOFF':
          data.checkIn = at(date, '08:00');
          data.checkOut = at(date, '19:00');
          data.isAutoCheckout = true;
          data.notes = 'Auto cutoff 19:00 WIB - harap koreksi jika salah';
          break;
        case 'OUTSIDE':
          data.checkIn = at(date, '08:00');
          data.checkOut = at(date, '17:00');
          data.isOutOfRadius = true;
          data.checkInLat = -6.1751;
          data.checkInLng = 106.8272;
          data.checkInAddress = 'Monas, Jakarta Pusat (di luar radius)';
          break;
        case 'ABSENT':
          data.status = 'ABSENT';
          break;
        case 'OPEN':
          data.checkIn = at(date, '08:00');
          data.notes = 'Belum absen pulang (contoh data)';
          break;
      }

      // Photos for one employee to exercise the photo pipeline
      if (u.nik === 'SAMPLE005') {
        if (di === 0 && c !== 'ABSENT') data.checkInPhoto = await savePlaceholderPhoto(date, userId, 'in');
        if (di === 1 && c !== 'ABSENT' && c !== 'OPEN') data.checkOutPhoto = await savePlaceholderPhoto(date, userId, 'out');
      }

      const existing = await prisma.attendance.findUnique({ where: { userId_date: { userId, date } } });
      if (existing) {
        await prisma.attendance.update({ where: { id: existing.id }, data });
        updated++;
      } else {
        await prisma.attendance.create({ data: data as never });
        created++;
      }
    }
  }

  // Durable "belum lengkap" samples: dated outside the auto-cutoff lookback
  // window (7 days) so the cron never fills them and the column can be tested.
  const openDate = wibDate(8);
  for (const nik of ['SAMPLE001', 'SAMPLE002']) {
    const uid = userIds[nik];
    const office = OFFICES[0];
    await prisma.attendance.upsert({
      where: { userId_date: { userId: uid, date: openDate } },
      update: {
        checkIn: at(openDate, '08:00'),
        checkOut: null,
        isAutoCheckout: false,
        isOutOfRadius: false,
        status: 'PRESENT',
        notes: 'Belum absen pulang (di luar window cutoff, contoh data)',
      },
      create: {
        userId: uid,
        date: openDate,
        checkIn: at(openDate, '08:00'),
        status: 'PRESENT',
        checkInLat: office.latitude,
        checkInLng: office.longitude,
        checkInAddress: office.address,
        notes: 'Belum absen pulang (di luar window cutoff, contoh data)',
      },
    });
  }

  // One pending correction to exercise the approval flow.
  // Targets a durably-incomplete day (no checkout) so approving it fills the checkout.
  const correctionTarget = await prisma.attendance.findUnique({
    where: { userId_date: { userId: userIds['SAMPLE002'], date: openDate } },
  });
  if (correctionTarget) {
    const reason = 'Lupa tap absen pulang, seharusnya 17:00 (contoh data)';
    const existing = await prisma.attendanceCorrection.findFirst({
      where: { attendanceId: correctionTarget.id, requestedById: userIds['SAMPLE002'] },
    });
    if (existing) {
      await prisma.attendanceCorrection.update({
        where: { id: existing.id },
        data: {
          status: 'PENDING',
          oldCheckIn: correctionTarget.checkIn,
          oldCheckOut: correctionTarget.checkOut,
          newCheckIn: null,
          newCheckOut: at(openDate, '17:00'),
          reason,
          approvedById: null,
        },
      });
    } else {
      await prisma.attendanceCorrection.create({
        data: {
          attendanceId: correctionTarget.id,
          requestedById: userIds['SAMPLE002'],
          oldCheckIn: correctionTarget.checkIn,
          oldCheckOut: correctionTarget.checkOut,
          newCheckIn: null,
          newCheckOut: at(openDate, '17:00'),
          reason,
          status: 'PENDING',
        },
      });
    }

    // Drop the obsolete sample correction that targeted a different day/reason.
    await prisma.attendanceCorrection.deleteMany({
      where: {
        requestedById: userIds['SAMPLE002'],
        reason: { contains: '(contoh data)' },
        attendanceId: { not: correctionTarget.id },
      },
    });
  }

  // Notifications sample for the manager
  const managerId = userIds['SAMPLE014'];
  const notifCount = await prisma.notification.count({ where: { recipientId: managerId } });
  if (notifCount === 0) {
    await prisma.notification.createMany({
      data: [
        { type: 'OUT_OF_RADIUS', title: 'Absen di Luar Radius', message: 'Rizky Ramadhan absen di luar radius kantor (contoh data).', recipientId: managerId, senderId: userIds['SAMPLE005'] },
        { type: 'MISSING_CHECKOUT', title: 'Auto Cutoff Karyawan', message: 'Siti Aminah lupa absen pulang, sistem mencatat 19:00 WIB (contoh data).', recipientId: managerId, senderId: userIds['SAMPLE002'] },
        { type: 'CORRECTION_REQUEST', title: 'Permintaan Koreksi Absen', message: 'Siti Aminah mengajukan koreksi jam masuk (contoh data).', recipientId: managerId, senderId: userIds['SAMPLE002'] },
      ],
    });
  }

  const total = await prisma.attendance.count();
  console.log(`Sample users: ${USERS.length} (roles: 13 USER, 1 MANAGER, 1 SPV)`);
  console.log(`Attendance rows created: ${created}, updated: ${updated} (dates: ${days.join(', ')})`);
  console.log(`Total attendance rows now: ${total}`);
  console.log(`Extra open "belum lengkap" rows on ${openDate} (outside cutoff window): SAMPLE001, SAMPLE002`);
  console.log('Login examples: SAMPLE001 / ' + PASSWORD + '  |  SAMPLE014 (MANAGER) / ' + PASSWORD);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
