import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, ok, unauthorized, forbidden, badRequest, serverError } from '@/lib/api';
import bcrypt from 'bcryptjs';
import * as XLSX from 'xlsx';

const DEFAULT_PASSWORD = 'user123';
const VALID_ROLES = ['ADMIN', 'MANAGER', 'SPV', 'USER'];

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
    Password: 'user123',
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

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return badRequest('File Excel tidak memiliki sheet.');

    const rawRows = XLSX.utils.sheet_to_json<SheetRow>(workbook.Sheets[sheetName], { defval: '' });

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

    const defaultPasswordHash = await bcrypt.hash(DEFAULT_PASSWORD, 12);
    const errors: string[] = [];
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
      const roleRaw = (pick(row, ['role', 'peran']) || 'USER').toUpperCase();
      const role = VALID_ROLES.includes(roleRaw) ? roleRaw : 'USER';
      const password = pick(row, ['password', 'sandi']);

      const office = resolveByName(offices, pick(row, ['kantor', 'office', 'lokasi']));
      const schedule = resolveByName(schedules, pick(row, ['jadwal', 'jadwalkerja', 'schedule', 'shift']));
      const managerRaw = pick(row, ['atasan', 'manager', 'managernik', 'nikatasan']);
      const manager = managerRaw
        ? allUsers.find(
            (u) =>
              u.nik.toLowerCase() === managerRaw.toLowerCase() ||
              u.name.toLowerCase() === managerRaw.toLowerCase()
          )
        : undefined;

      try {
        const existing = await prisma.user.findUnique({ where: { nik } });

        if (existing) {
          await prisma.user.update({
            where: { id: existing.id },
            data: {
              name,
              email: email || null,
              phone: phone || null,
              address: address || null,
              position: position || null,
              department: department || null,
              role,
              officeId: office?.id ?? null,
              workScheduleId: schedule?.id ?? null,
              managerId: manager?.id ?? null,
              ...(password ? { password: await bcrypt.hash(password, 12) } : {}),
            },
          });
          updated++;
        } else {
          await prisma.user.create({
            data: {
              nik,
              name,
              email: email || null,
              phone: phone || null,
              address: address || null,
              position: position || null,
              department: department || null,
              role,
              password: password ? await bcrypt.hash(password, 12) : defaultPasswordHash,
              officeId: office?.id ?? null,
              workScheduleId: schedule?.id ?? null,
              managerId: manager?.id ?? null,
            },
          });
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
      { total: rows.length, created, updated, skipped, errors },
      `Import selesai: ${created} baru, ${updated} diperbarui, ${skipped} dilewati.`
    );
  } catch (error) {
    console.error('[IMPORT USERS]', error);
    return serverError();
  }
}
