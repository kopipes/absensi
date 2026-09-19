import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { parseISO } from 'date-fns';
import { formatInTimeZone, toZonedTime } from 'date-fns-tz';
import { id as idLocale } from 'date-fns/locale';

const TZ = 'Asia/Jakarta';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string, fmt = 'dd MMMM yyyy'): string {
  try {
    const d = typeof date === 'string' ? parseISO(date) : date;
    return formatInTimeZone(d, TZ, fmt, { locale: idLocale });
  } catch {
    return String(date);
  }
}

export function formatTime(date: Date | string | number | null | undefined): string {
  if (date === null || date === undefined) return '-';
  try {
    const d = typeof date === 'number' ? new Date(date)
            : typeof date === 'string' ? new Date(date)
            : date;
    if (isNaN(d.getTime())) return '-';
    return formatInTimeZone(d, TZ, 'HH:mm');
  } catch {
    return '-';
  }
}

export function formatDateTime(date: Date | string | number | null | undefined): string {
  if (date === null || date === undefined) return '-';
  try {
    const d = typeof date === 'number' ? new Date(date)
            : typeof date === 'string' ? new Date(date)
            : date;
    if (isNaN(d.getTime())) return '-';
    return formatInTimeZone(d, TZ, 'dd MMM yyyy, HH:mm', { locale: idLocale });
  } catch {
    return '-';
  }
}

/** Returns today's date as YYYY-MM-DD in WIB (Asia/Jakarta) */
export function getTodayString(): string {
  return formatInTimeZone(new Date(), TZ, 'yyyy-MM-dd');
}

/** Calculate distance between two lat/lng points in meters (Haversine) */
export function calculateDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function isWithinRadius(
  userLat: number, userLng: number,
  officeLat: number, officeLng: number,
  radiusMeters: number
): boolean {
  return calculateDistance(userLat, userLng, officeLat, officeLng) <= radiusMeters;
}

/**
 * Calculate how many minutes late a check-in is.
 * scheduledTime is "HH:mm" in WIB.
 */
export function calculateLateMinutes(
  checkInTime: Date,
  scheduledTime: string,
  gracePeriod: number
): number {
  const [h, m] = scheduledTime.split(':').map(Number);
  const zoned = toZonedTime(checkInTime, TZ);
  const scheduled = new Date(zoned);
  scheduled.setHours(h, m, 0, 0);

  const graceEnd = scheduled.getTime() + gracePeriod * 60_000;
  if (zoned.getTime() <= graceEnd) return 0;
  return Math.floor((zoned.getTime() - scheduled.getTime()) / 60_000);
}

/** Standard working day in minutes (8 hours). */
export const STANDARD_WORK_MINUTES = 8 * 60;

/** Jam cutoff absen pulang otomatis (WIB) bila karyawan lupa absen pulang. */
export const AUTO_CHECKOUT_CUTOFF_TIME = '19:00';

/**
 * Build a displayable URL for a stored attendance photo.
 * Supports both the new storage key (relative path) and legacy base64 data URLs.
 */
export function getPhotoUrl(value?: string | null): string {
  if (!value) return '';
  if (value.startsWith('data:') || value.startsWith('/') || value.startsWith('http')) return value;
  return `/api/attendance-photos/${value}`;
}

/** Minutes actually worked between check-in and check-out (0 if incomplete/invalid). */
export function calculateWorkedMinutes(
  checkIn: Date | string | null | undefined,
  checkOut: Date | string | null | undefined
): number {
  if (!checkIn || !checkOut) return 0;
  const start = typeof checkIn === 'string' ? new Date(checkIn) : checkIn;
  const end = typeof checkOut === 'string' ? new Date(checkOut) : checkOut;
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
  const diff = Math.floor((end.getTime() - start.getTime()) / 60_000);
  return diff > 0 ? diff : 0;
}

/** Shortfall against the standard 8-hour day (0 when met or exceeded). */
export function calculateShortageMinutes(workedMinutes: number): number {
  return Math.max(0, STANDARD_WORK_MINUTES - workedMinutes);
}

export function getRoleBadgeColor(role: string): string {
  switch (role) {
    case 'ADMIN':   return 'bg-purple-100 text-purple-700 border-purple-200';
    case 'MANAGER': return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'SPV':     return 'bg-cyan-100 text-cyan-700 border-cyan-200';
    default:        return 'bg-gray-100 text-gray-700 border-gray-200';
  }
}

export function getRoleLabel(role: string): string {
  const map: Record<string, string> = {
    ADMIN: 'Admin', MANAGER: 'Manager', SPV: 'Supervisor', USER: 'Karyawan',
  };
  return map[role] ?? role;
}

export function getStatusBadgeColor(status: string): string {
  switch (status) {
    case 'PRESENT': return 'bg-green-100 text-green-700 border-green-200';
    case 'ABSENT':  return 'bg-red-100 text-red-700 border-red-200';
    case 'HOLIDAY': return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'OFF':     return 'bg-gray-100 text-gray-600 border-gray-200';
    default:        return 'bg-gray-100 text-gray-600 border-gray-200';
  }
}

export function getStatusLabel(status: string): string {
  const map: Record<string, string> = {
    PRESENT: 'Hadir', ABSENT: 'Tidak Hadir',
    HOLIDAY: 'Libur', OFF: 'Hari Libur',
  };
  return map[status] ?? status;
}

export function formatMinutes(minutes: number): string {
  if (minutes <= 0) return '0 menit';
  if (minutes < 60) return `${minutes} menit`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h} jam ${m} menit` : `${h} jam`;
}
