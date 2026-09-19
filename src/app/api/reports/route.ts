import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getAuthUser, ok, unauthorized, forbidden, badRequest, serverError } from '@/lib/api';
import { userScopeFilter } from '@/lib/rbac';
import { calculateWorkedMinutes, calculateShortageMinutes, STANDARD_WORK_MINUTES, formatMinutes } from '@/lib/utils';
import * as XLSX from 'xlsx';

const VALID_STATUSES = ['PRESENT', 'ABSENT', 'HOLIDAY', 'OFF'];
const STANDARD_LABEL = formatMinutes(STANDARD_WORK_MINUTES);

interface SummaryAttendance {
  userId: string;
  checkIn: Date | null;
  checkOut: Date | null;
  isAutoCheckout: boolean;
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
  cutoffDays: number;
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
      cutoffDays: 0,
      incompleteDays: 0,
      shortMinutes: 0,
    };

    row.totalDays += 1;

    if (a.isAutoCheckout && a.checkOut) {
      // Checkout filled by the system: not a genuine complete day, tracked separately
      row.cutoffDays += 1;
    } else if (a.checkOut) {
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
    const view = searchParams.get('view') || 'detail';

    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(searchParams.get('pageSize') || '50', 10) || 50));
    const search = (searchParams.get('search') || '').trim().slice(0, 100);

    // Validate format
    if (!['json', 'xlsx'].includes(format)) return badRequest('Format tidak valid.');
    if (!['detail', 'summary'].includes(view)) return badRequest('View tidak valid.');

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

    // Merge user-level filters so multiple conditions don't overwrite each other
    const userWhere: Prisma.UserWhereInput = {};
    if (department) userWhere.department = department;
    const scope = userScopeFilter(authUser.role, authUser.userId);
    const userAnd: Prisma.UserWhereInput[] = [];
    if (scope) userAnd.push(scope);
    if (search) {
      userAnd.push({ OR: [{ name: { contains: search } }, { nik: { contains: search } }] });
    }
    if (userAnd.length) userWhere.AND = userAnd;

    const where = {
      ...(startDate && endDate ? { date: { gte: startDate, lte: endDate } } : {}),
      ...(userId ? { userId } : {}),
      ...(status ? { status } : {}),
      ...(Object.keys(userWhere).length ? { user: userWhere } : {}),
    };

    // One lightweight pass over the range powers both the stats and the recap
    const aggregateRows = await prisma.attendance.findMany({
      where,
      select: {
        userId: true,
        checkIn: true,
        checkOut: true,
        isAutoCheckout: true,
        isOutOfRadius: true,
        status: true,
        user: { select: { id: true, nik: true, name: true, department: true } },
      },
    });

    const total = aggregateRows.length;
    const stats = {
      total,
      present: aggregateRows.filter((a) => a.status === 'PRESENT').length,
      absent: aggregateRows.filter((a) => a.status === 'ABSENT').length,
      shortage: aggregateRows.filter(
        (a) =>
          !!a.checkIn &&
          !!a.checkOut &&
          !a.isAutoCheckout &&
          calculateShortageMinutes(calculateWorkedMinutes(a.checkIn, a.checkOut)) > 0
      ).length,
      autoCutoff: aggregateRows.filter((a) => a.isAutoCheckout).length,
      outOfRadius: aggregateRows.filter((a) => a.isOutOfRadius).length,
    };
    const summary = buildUserSummary(aggregateRows);

    // Sanitize filename parts
    const safeStart = startDate.replace(/[^0-9-]/g, '') || 'all';
    const safeEnd = endDate.replace(/[^0-9-]/g, '') || 'all';

    if (format === 'xlsx') {
      // Export needs the full set for the range (no pagination)
      const exportRows = await prisma.attendance.findMany({
        where,
        include: {
          user: { select: { id: true, nik: true, name: true, department: true, position: true } },
        },
        orderBy: [{ date: 'asc' }, { user: { name: 'asc' } }],
      });

      const wb = XLSX.utils.book_new();
      let filename: string;

      if (view === 'summary') {
        const summaryRows = summary.map((s) => ({
          NIK: s.nik,
          Nama: s.name,
          Departemen: s.department,
          'Total Hari Absen': s.totalDays,
          [`Hari >= ${STANDARD_LABEL}`]: s.enoughDays,
          [`Hari < ${STANDARD_LABEL}`]: s.shortDays,
          Cutoff: s.cutoffDays,
          'Hari Belum Lengkap': s.incompleteDays,
          'Total Kekurangan (menit)': s.shortMinutes,
          'Total Kekurangan': s.shortMinutes > 0 ? formatMinutes(s.shortMinutes) : '-',
        }));

        const ws = XLSX.utils.json_to_sheet(summaryRows);
        ws['!cols'] = [
          { wch: 16 }, { wch: 26 }, { wch: 18 }, { wch: 16 }, { wch: 14 },
          { wch: 14 }, { wch: 10 }, { wch: 16 }, { wch: 22 }, { wch: 20 },
        ];
        XLSX.utils.book_append_sheet(wb, ws, 'Rekap per Karyawan');
        filename = `rekap-absensi-${safeStart}-${safeEnd}.xlsx`;
      } else {
        const rows = exportRows.map((a) => {
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
            [`Kurang dari ${STANDARD_LABEL}`]: a.checkIn && a.checkOut && !a.isAutoCheckout && shortage > 0 ? formatMinutes(shortage) : '-',
            'Auto Cutoff': a.isAutoCheckout ? 'Ya' : 'Tidak',
            'Di Luar Radius': a.isOutOfRadius ? 'Ya' : 'Tidak',
            'Lokasi Masuk': a.checkInAddress || '',
            'Lokasi Pulang': a.checkOutAddress || '',
            Catatan: a.notes || '',
          };
        });

        const ws = XLSX.utils.json_to_sheet(rows);
        ws['!cols'] = [
          { wch: 16 }, { wch: 26 }, { wch: 18 }, { wch: 20 }, { wch: 12 },
          { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 18 },
          { wch: 12 }, { wch: 14 }, { wch: 32 }, { wch: 32 }, { wch: 32 },
        ];
        const headerCount = Object.keys(rows[0] || {}).length;
        if (headerCount > 0) {
          ws['!autofilter'] = {
            ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: headerCount - 1 } }),
          };
        }
        XLSX.utils.book_append_sheet(wb, ws, 'Detail Absensi');
        filename = `detail-absensi-${safeStart}-${safeEnd}.xlsx`;
      }

      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      return new Response(buf, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    // Paginated detail rows for the current page only
    const attendances = await prisma.attendance.findMany({
      where,
      include: {
        user: { select: { id: true, nik: true, name: true, department: true, position: true } },
      },
      orderBy: [{ date: 'desc' }, { user: { name: 'asc' } }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return ok({
      attendances,
      stats,
      summary,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    });
  } catch (error) {
    console.error('[REPORTS]', error);
    return serverError();
  }
}
