import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, ok, unauthorized, forbidden, badRequest, serverError } from '@/lib/api';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import * as XLSX from 'xlsx';

const VALID_ROLES = ['ADMIN', 'MANAGER', 'SPV', 'USER'];
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_ROWS = 1000;
const ALLOWED_EXTENSIONS = ['.xlsx', '.xls', '.csv'];

interface SheetRow {
  [key: string]: unknown;
}

function normalizeHeader(header: string): string {
  return header.toString().trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function pick(row: SheetRow, keys: string[]): string | undefined {
  for (const key of keys) {
    if (key in row) {
      const value = row[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        return String(value).trim();
      }
    }
  }
  return undefined;
}

function resolveByName<T extends { name: string }>(items: T[], value?: string): T | undefined {
  if (!value) return undefined;
  const target = value.trim().toLowerCase();
  return items.find((item) => item.name.trim().toLowerCase() === target);
}

function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  return Array.from(randomBytes(10))
    .map((byte) => chars[byte % chars.length])
    .join('');
}

// GET: download the import template
export async function GET(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();
  if (authUser.role !== 'ADMIN') return forbidden();

  const headers = ['NIK', 'Nama', 'Email', 'No HP', 'Alamat', 'Departemen', 'Jabatan', 'Role', 'Kantor', 'Jadwal Kerja', 'Atasan', 'Password'];
  const example = {
    NIK: 'EMP100',
    Nama: 'Contoh Karyawan',
    Email: 'contoh@absensi.id',
    'No HP': '081200001234',
    Alamat: 'Jl. Contoh No. 1, Jakarta',
    Departemen: 'Engineering',
    Jabatan: 'Staff',
    Role: 'USER',
    Kantor: 'Kantor Pusat',
    'Jadwal Kerja': 'Reguler (08:00 - 17:00)',
    Atasan: 'MGR001',
    Password: '',
  };

  const ws = XLSX.utils.json_to_sheet([example], { header: headers });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Template');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="template-import-karyawan.xlsx"',
    },
  });
}

export async function POST(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();
  if (authUser.role !== 'ADMIN') return forbidden();

  try {
    const formData = await req.formData();
    const file = formData.get('file');
    if (!file || typeof file === 'string') {
      return badRequest('File Excel wajib diunggah.');
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return badRequest('Ukuran file terlalu besar. Maksimal 5MB.');
    }
    const fileName = file.name.toLowerCase();
    if (!ALLOWED_EXTENSIONS.some((ext) => fileName.endsWith(ext))) {
      return badRequest('Format file harus .xlsx, .xls, atau .csv.');
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length > MAX_UPLOAD_BYTES) {
      return badRequest('Ukuran file terlalu besar. Maksimal 5MB.');
    }

    let rawRows: SheetRow[];
    try {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) return badRequest('File Excel tidak memiliki sheet.');
      rawRows = XLSX.utils.sheet_to_json<SheetRow>(workbook.Sheets[sheetName], { defval: '' });
    } catch {
      return badRequest('File Excel tidak valid atau rusak.');
    }

    if (rawRows.length > MAX_ROWS) {
      return badRequest(`Terlalu banyak baris. Maksimal ${MAX_ROWS} baris per import.`);
    }

    // Normalize row keys so header variants (Nama/Name, No HP/Phone, ...) map consistently
    const rows = rawRows.map((raw) => {
      const normalized: SheetRow = {};
      for (const [key, value] of Object.entries(raw)) {
        normalized[normalizeHeader(key)] = value;
      }
      return normalized;
    });

    const [offices, schedules, allUsers] = await Promise.all([
      prisma.office.findMany({ select: { id: true, name: true } }),
      prisma.workSchedule.findMany({ select: { id: true, name: true } }),
      prisma.user.findMany({ select: { id: true, nik: true, name: true } }),
    ]);

    // In-memory index so newly created rows (e.g. a manager defined in the same file) resolve
    const userIndex = allUsers.map((u) => ({ id: u.id, nik: u.nik, name: u.name }));
    const findByNikOrName = (raw: string) => {
      const target = raw.toLowerCase();
      return userIndex.find(
        (u) => u.nik.toLowerCase() === target || u.name.toLowerCase() === target
      );
    };

    const errors: string[] = [];
    const generatedCredentials: { nik: string; name: string; password: string }[] = [];
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNumber = i + 2; // +1 header, +1 to 1-based

      const nik = pick(row, ['nik']);
      const name = pick(row, ['nama', 'name']);

      if (!nik || !name) {
        skipped++;
        errors.push(`Baris ${rowNumber}: NIK dan Nama wajib diisi.`);
        continue;
      }

      const email = pick(row, ['email']);
      const phone = pick(row, ['nohp', 'hp', 'phone', 'telepon', 'notelp', 'nomorhp']);
      const address = pick(row, ['alamat', 'address']);
      const position = pick(row, ['jabatan', 'position', 'posisi']);
      const department = pick(row, ['departemen', 'department', 'dept', 'divisi']);
      const password = pick(row, ['password', 'sandi']);

      const roleCell = pick(row, ['role', 'peran']);
      let roleProvided = roleCell !== undefined;
      let role = 'USER';
      if (roleCell !== undefined) {
        const upper = roleCell.toUpperCase();
        if (VALID_ROLES.includes(upper)) {
          role = upper;
        } else {
          errors.push(`Baris ${rowNumber}: role "${roleCell}" tidak valid, kolom role diabaikan.`);
          roleProvided = false;
        }
      }

      const officeName = pick(row, ['kantor', 'office', 'lokasi']);
      const scheduleName = pick(row, ['jadwal', 'jadwalkerja', 'schedule', 'shift']);
      const managerRaw = pick(row, ['atasan', 'manager', 'managernik', 'nikatasan']);

      const office = resolveByName(offices, officeName);
      const schedule = resolveByName(schedules, scheduleName);
      const manager = managerRaw ? findByNikOrName(managerRaw) : undefined;

      if (officeName !== undefined && !office) {
        errors.push(`Baris ${rowNumber}: kantor "${officeName}" tidak ditemukan, kolom kantor diabaikan.`);
      }
      if (scheduleName !== undefined && !schedule) {
        errors.push(`Baris ${rowNumber}: jadwal "${scheduleName}" tidak ditemukan, kolom jadwal diabaikan.`);
      }
      if (managerRaw !== undefined && !manager) {
        errors.push(`Baris ${rowNumber}: atasan "${managerRaw}" tidak ditemukan, kolom atasan diabaikan.`);
      }

      const existing = userIndex.find((u) => u.nik === nik);

      try {
        if (existing) {
          // Only touch fields that were actually provided, so a partial sheet never clears data
          const updateData: Record<string, unknown> = { name };
          if (email !== undefined) updateData.email = email;
          if (phone !== undefined) updateData.phone = phone;
          if (address !== undefined) updateData.address = address;
          if (position !== undefined) updateData.position = position;
          if (department !== undefined) updateData.department = department;
          if (roleProvided) updateData.role = role;
          if (office) updateData.officeId = office.id;
          if (schedule) updateData.workScheduleId = schedule.id;
          if (manager) updateData.managerId = manager.id;
          if (password) updateData.password = await bcrypt.hash(password, 12);

          await prisma.user.update({ where: { id: existing.id }, data: updateData });
          existing.name = name;
          updated++;
        } else {
          let plainPassword = password;
          if (!plainPassword) {
            plainPassword = generatePassword();
            generatedCredentials.push({ nik, name, password: plainPassword });
          }

          const createdUser = await prisma.user.create({
            data: {
              nik,
              name,
              email: email ?? null,
              phone: phone ?? null,
              address: address ?? null,
              position: position ?? null,
              department: department ?? null,
              role,
              password: await bcrypt.hash(plainPassword, 12),
              officeId: office?.id ?? null,
              workScheduleId: schedule?.id ?? null,
              managerId: manager?.id ?? null,
            },
          });

          userIndex.push({ id: createdUser.id, nik, name });
          created++;
        }
      } catch (err) {
        skipped++;
        const code = (err as { code?: string }).code;
        if (code === 'P2002') {
          errors.push(`Baris ${rowNumber}: email ${email} sudah digunakan karyawan lain.`);
        } else {
          errors.push(`Baris ${rowNumber}: gagal menyimpan data.`);
        }
      }
    }

    return ok(
      { total: rows.length, created, updated, skipped, errors, generatedCredentials },
      `Import selesai: ${created} baru, ${updated} diperbarui, ${skipped} dilewati.`
    );
  } catch (error) {
    console.error('[IMPORT USERS]', error);
    return serverError();
  }
}
