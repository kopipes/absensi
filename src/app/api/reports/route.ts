import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, ok, unauthorized, forbidden, badRequest, serverError } from '@/lib/api';
import { calculateWorkedMinutes, calculateShortageMinutes, STANDARD_WORK_MINUTES, formatMinutes } from '@/lib/utils';
import * as XLSX from 'xlsx';

const VALID_STATUSES = ['PRESENT', 'ABSENT', 'HOLIDAY', 'OFF'];
const STANDARD_LABEL = formatMinutes(STANDARD_WORK_MINUTES);

interface SummaryAttendance {
  userId: string;
  checkIn: Date | null;
  checkOut: Date | null;
  user?: { id: string; nik: string; name: string; department: string | null } | null;
}

interface UserSummaryRow {
  userId: string;
  nik: string;
  name: string;
  department: string;
  totalDays: number;
  enoughDays: number;
  shortDays: number;
  incompleteDays: number;
  shortMinutes: number;
}

/** Group attendance per employee: total days, days >= 8h, days < 8h, total shortfall. */
function buildUserSummary(attendances: SummaryAttendance[]): UserSummaryRow[] {
  const map = new Map<string, UserSummaryRow>();

  for (const a of attendances) {
    if (!a.user || !a.checkIn) continue;

    const row = map.get(a.userId) ?? {
      userId: a.userId,
      nik: a.user.nik,
      name: a.user.name,
      department: a.user.department || '',
      totalDays: 0,
      enoughDays: 0,
      shortDays: 0,
      incompleteDays: 0,
      shortMinutes: 0,
    };

    row.totalDays += 1;

    if (a.checkOut) {
      const worked = calculateWorkedMinutes(a.checkIn, a.checkOut);
      const shortage = calculateShortageMinutes(worked);
      if (shortage > 0) {
        row.shortDays += 1;
        row.shortMinutes += shortage;
      } else {
        row.enoughDays += 1;
      }
    } else {
      row.incompleteDays += 1;
    }

    map.set(a.userId, row);
  }

  return Array.from(map.values()).sort((x, y) => x.name.localeCompare(y.name));
}

export async function GET(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();
  if (!['ADMIN', 'MANAGER', 'SPV'].includes(authUser.role)) return forbidden();

  try {
    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get('startDate') || '';
    const endDate = searchParams.get('endDate') || '';
    const department = searchParams.get('department') || '';
    const userId = searchParams.get('userId') || '';
    const format = searchParams.get('format') || 'json';
    const status = searchParams.get('status') || '';

    // Validate format
    if (!['json', 'xlsx'].includes(format)) return badRequest('Format tidak valid.');

    // Validate date formats
    if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      return badRequest('Format startDate tidak valid.');
    }
    if (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return badRequest('Format endDate tidak valid.');
    }
    if (status && !VALID_STATUSES.includes(status)) {
      return badRequest('Status tidak valid.');
    }

    const attendances = await prisma.attendance.findMany({
      where: {
        ...(startDate && endDate ? { date: { gte: startDate, lte: endDate } } : {}),
        ...(userId ? { userId } : {}),
        ...(department ? { user: { department } } : {}),
        ...(status ? { status } : {}),
        ...(authUser.role !== 'ADMIN' ? { user: { managerId: authUser.userId } } : {}),
      },
      include: {
        user: {
          select: { id: true, nik: true, name: true, department: true, position: true },
        },
      },
      orderBy: [{ date: 'asc' }, { user: { name: 'asc' } }],
    });

    if (format === 'xlsx') {
      const rows = attendances.map((a) => {
        const worked = calculateWorkedMinutes(a.checkIn, a.checkOut);
        const shortage = calculateShortageMinutes(worked);
        return {
          NIK: a.user?.nik || '',
          Nama: a.user?.name || '',
          Departemen: a.user?.department || '',
          Jabatan: a.user?.position || '',
          Tanggal: a.date,
          'Jam Masuk': a.checkIn ? new Date(a.checkIn).toTimeString().slice(0, 5) : '-',
          'Jam Pulang': a.checkOut ? new Date(a.checkOut).toTimeString().slice(0, 5) : '-',
          Status: a.status,
          'Jam Kerja': a.checkIn && a.checkOut ? formatMinutes(worked) : '-',
          [`Kurang dari ${STANDARD_LABEL}`]: a.checkIn && a.checkOut && shortage > 0 ? formatMinutes(shortage) : '-',
          'Auto Cutoff': a.isAutoCheckout ? 'Ya' : 'Tidak',
          'Di Luar Radius': a.isOutOfRadius ? 'Ya' : 'Tidak',
          'Lokasi Masuk': a.checkInAddress || '',
          'Lokasi Pulang': a.checkOutAddress || '',
          Catatan: a.notes || '',
        };
      });

      const summaryRows = buildUserSummary(attendances).map((s) => ({
        NIK: s.nik,
        Nama: s.name,
        Departemen: s.department,
        'Total Hari Absen': s.totalDays,
        [`Hari >= ${STANDARD_LABEL}`]: s.enoughDays,
        [`Hari < ${STANDARD_LABEL}`]: s.shortDays,
        'Hari Belum Lengkap': s.incompleteDays,
        'Total Kekurangan (menit)': s.shortMinutes,
        'Total Kekurangan': s.shortMinutes > 0 ? formatMinutes(s.shortMinutes) : '-',
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'Laporan Absensi');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Rekap per Karyawan');
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      // Sanitize filename
      const safeStart = startDate.replace(/[^0-9-]/g, '') || 'all';
      const safeEnd = endDate.replace(/[^0-9-]/g, '') || 'all';

      return new Response(buf, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="laporan-absensi-${safeStart}-${safeEnd}.xlsx"`,
        },
      });
    }

    const stats = {
      total: attendances.length,
      present: attendances.filter((a) => a.status === 'PRESENT').length,
      absent: attendances.filter((a) => a.status === 'ABSENT').length,
      shortage: attendances.filter(
        (a) =>
          !!a.checkIn &&
          !!a.checkOut &&
          calculateShortageMinutes(calculateWorkedMinutes(a.checkIn, a.checkOut)) > 0
      ).length,
      autoCutoff: attendances.filter((a) => a.isAutoCheckout).length,
      outOfRadius: attendances.filter((a) => a.isOutOfRadius).length,
    };

    return ok({ attendances, stats, summary: buildUserSummary(attendances) });
  } catch (error) {
    console.error('[REPORTS]', error);
    return serverError();
  }
}
