import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getAuthUser, ok, unauthorized, forbidden, badRequest, serverError } from '@/lib/api';
import { userScopeFilter, audienceUserIds } from '@/lib/rbac';
import { calculateDistance, getTodayString } from '@/lib/utils';
import { saveAttendancePhotoWithMeta, deleteAttendancePhoto, MAX_PHOTO_BYTES } from '@/lib/photos';
import { recordAudit, getClientIp } from '@/lib/audit';

export async function GET(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();

  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const date = searchParams.get('date');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const department = searchParams.get('department');
    const status = searchParams.get('status');

    const selfOnly = searchParams.get('self') === 'true';
    const targetUserId = (authUser.role === 'USER' || selfOnly) ? authUser.userId : (userId || undefined);

    // Build date filter — date takes priority over range
    const dateFilter = date
      ? { date }
      : startDate && endDate
        ? { date: { gte: startDate, lte: endDate } }
        : {};

    const userFilter: Prisma.UserWhereInput = {};
    if (department && authUser.role !== 'USER') userFilter.department = department;
    const scope = userScopeFilter(authUser.role, authUser.userId);
    if (scope) Object.assign(userFilter, scope);

    const attendances = await prisma.attendance.findMany({
      where: {
        ...(targetUserId ? { userId: targetUserId } : {}),
        ...dateFilter,
        ...(status ? { status } : {}),
        ...(Object.keys(userFilter).length ? { user: userFilter } : {}),
      },
      include: {
        user: {
          select: { id: true, name: true, nik: true, department: true, position: true, avatar: true },
        },
      },
      orderBy: [{ date: 'desc' }, { checkIn: 'desc' }],
      take: 500,
    });

    return ok(attendances);
  } catch (error) {
    console.error('[GET ATTENDANCES]', error);
    return serverError();
  }
}

export async function POST(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser) return unauthorized();

  try {
    const body = await req.json();
    const { type, photo, latitude, longitude, address, accuracy, capturedAt } = body;

    // Input validation
    if (!type || !['checkin', 'checkout'].includes(type)) {
      return badRequest('Tipe absen tidak valid.');
    }
    if (!photo || typeof photo !== 'string') {
      return badRequest('Foto selfie wajib disertakan.');
    }
    if (!photo.startsWith('data:image/')) {
      return badRequest('Format foto tidak valid.');
    }
    if (photo.length > MAX_PHOTO_BYTES * 1.4) { // base64 overhead
      return badRequest(`Ukuran foto terlalu besar. Maksimal ${Math.round(MAX_PHOTO_BYTES / 1024)}KB.`);
    }
    if (typeof latitude !== 'number' || typeof longitude !== 'number' ||
        isNaN(latitude) || isNaN(longitude) ||
        latitude < -90 || latitude > 90 ||
        longitude < -180 || longitude > 180) {
      return badRequest('Koordinat GPS tidak valid. Pastikan GPS aktif dan izin lokasi diberikan.');
    }

    // GPS accuracy (meters) is optional but must be sane when provided
    const gpsAccuracy =
      typeof accuracy === 'number' && isFinite(accuracy) && accuracy >= 0 && accuracy <= 100000
        ? accuracy
        : null;

    // Client-reported capture time (ISO). Accept only if plausible: within the
    // last hour and not in the future, otherwise ignore it.
    let capturedAtDate: Date | null = null;
    if (typeof capturedAt === 'string' && capturedAt) {
      const parsed = new Date(capturedAt);
      if (!isNaN(parsed.getTime())) {
        const skew = Date.now() - parsed.getTime();
        if (skew >= -60_000 && skew <= 60 * 60_000) capturedAtDate = parsed;
      }
    }

    const today = getTodayString();

    const user = await prisma.user.findUnique({
      where: { id: authUser.userId },
      include: { office: true, workSchedule: true },
    });
    if (!user) return badRequest('User tidak ditemukan.');
    if (!user.isActive) return badRequest('Akun Anda tidak aktif.');

    // Location validation (applies to both check-in and check-out)
    let isOutOfRadius = false;
    if (user.office) {
      const distance = calculateDistance(latitude, longitude, user.office.latitude, user.office.longitude);
      isOutOfRadius = distance > user.office.radius;
    }
    // A schedule with no times (days-only) or no schedule at all counts as
    // having no fixed working hours: no out-of-radius *notification* on checkout.
    const hasFixedHours = !!user.workSchedule?.checkInTime && !!user.workSchedule?.checkOutTime;
    const checkOutOutOfRadius = isOutOfRadius;

    const now = new Date();

    if (type === 'checkin') {
      const existing = await prisma.attendance.findUnique({
        where: { userId_date: { userId: authUser.userId, date: today } },
      });
      if (existing?.checkIn) {
        return badRequest('Anda sudah melakukan absen masuk hari ini.');
      }

      let checkInPhotoKey: string;
      let checkInHash: string;
      try {
        const saved = await saveAttendancePhotoWithMeta(photo, {
          userId: authUser.userId,
          date: today,
          kind: 'in',
        });
        checkInPhotoKey = saved.key;
        checkInHash = saved.hash;
      } catch (err) {
        if ((err as Error).message === 'photo-too-large') {
          return badRequest(`Ukuran foto terlalu besar. Maksimal ${Math.round(MAX_PHOTO_BYTES / 1024)}KB.`);
        }
        return badRequest('Format foto tidak valid.');
      }

      // Reused-photo detection: same bytes already used by this employee, or by
      // a different employee (strong signal of a shared/replayed selfie).
      const [sameUserReuse, anyUserReuse] = await Promise.all([
        prisma.attendance.findFirst({
          where: { userId: authUser.userId, OR: [{ checkInHash }, { checkOutHash: checkInHash }] },
          select: { id: true },
        }),
        prisma.attendance.findFirst({
          where: { userId: { not: authUser.userId }, OR: [{ checkInHash }, { checkOutHash: checkInHash }] },
          select: { id: true },
        }),
      ]);
      const reusedPhoto = sameUserReuse !== null;
      const duplicateAcrossUsers = anyUserReuse !== null;

      const checkInNotes =
        [
          duplicateAcrossUsers
            ? 'Foto sama dipakai karyawan lain (perlu ditinjau)'
            : reusedPhoto
              ? 'Foto identik dengan absen sebelumnya (perlu ditinjau)'
              : null,
          gpsAccuracy !== null && gpsAccuracy > 100
            ? `Akurasi GPS rendah (~${Math.round(gpsAccuracy)} m)`
            : null,
        ]
          .filter(Boolean)
          .join(' | ') || null;

      let attendance;
      try {
        attendance = await prisma.attendance.create({
          data: {
            userId: authUser.userId,
            date: today,
            checkIn: now,
            checkInPhoto: checkInPhotoKey,
            checkInLat: latitude,
            checkInLng: longitude,
            checkInAddress: address?.trim() || null,
            checkInAccuracy: gpsAccuracy,
            checkInCapturedAt: capturedAtDate,
            checkInHash,
            isOutOfRadius,
            status: 'PRESENT',
            notes: checkInNotes,
          },
        });
      } catch (e: unknown) {
        await deleteAttendancePhoto(checkInPhotoKey);
        // P2002 = unique constraint — duplicate check-in race condition
        if ((e as { code?: string }).code === 'P2002') {
          return badRequest('Anda sudah melakukan absen masuk hari ini.');
        }
        throw e;
      }

      await recordAudit({
        actor: authUser,
        action: 'ATTENDANCE_CHECK_IN',
        targetType: 'Attendance',
        targetId: attendance.id,
        details: { isOutOfRadius, reusedPhoto, duplicateAcrossUsers, gpsAccuracy },
        ip: getClientIp(req),
      });

      // Notify the whole manager chain (e.g. USER's SPV and MANAGER)
      if (isOutOfRadius || reusedPhoto || duplicateAcrossUsers) {
        const recipients = await audienceUserIds(authUser.userId);
        if (recipients.length > 0) {
          await prisma.notification.createMany({
            data: recipients.map((recipientId) => ({
              type: 'OUT_OF_RADIUS',
              title:
                duplicateAcrossUsers || reusedPhoto
                  ? 'Foto Absen Perlu Ditinjau'
                  : 'Absen di Luar Radius',
              message: duplicateAcrossUsers
                ? `${user.name} melakukan absen masuk dengan foto yang sama seperti absen karyawan lain.`
                : reusedPhoto
                  ? `${user.name} melakukan absen masuk dengan foto yang identik dengan absen sebelumnya.`
                  : `${user.name} melakukan absen masuk di luar radius kantor.`,
              recipientId,
              senderId: authUser.userId,
            })),
          });
        }
      }

      return ok(attendance, 'Absen masuk berhasil.');

    } else {
      // checkout
      const existing = await prisma.attendance.findUnique({
        where: { userId_date: { userId: authUser.userId, date: today } },
      });
      if (!existing) return badRequest('Anda belum melakukan absen masuk hari ini.');
      if (existing.checkOut) return badRequest('Anda sudah melakukan absen pulang hari ini.');

      let checkOutPhotoKey: string;
      let checkOutHash: string;
      try {
        const saved = await saveAttendancePhotoWithMeta(photo, {
          userId: authUser.userId,
          date: today,
          kind: 'out',
        });
        checkOutPhotoKey = saved.key;
        checkOutHash = saved.hash;
      } catch (err) {
        if ((err as Error).message === 'photo-too-large') {
          return badRequest(`Ukuran foto terlalu besar. Maksimal ${Math.round(MAX_PHOTO_BYTES / 1024)}KB.`);
        }
        return badRequest('Format foto tidak valid.');
      }

      // Reused-photo detection on check-out too: same selfie as an earlier
      // check-in/out (own) or as another employee's (shared/replayed evidence).
      const [ownReuse, crossReuse, sameDayReuse] = await Promise.all([
        prisma.attendance.findFirst({
          where: {
            userId: authUser.userId,
            id: { not: existing.id },
            OR: [{ checkInHash: checkOutHash }, { checkOutHash }],
          },
          select: { id: true },
        }),
        prisma.attendance.findFirst({
          where: {
            userId: { not: authUser.userId },
            OR: [{ checkInHash: checkOutHash }, { checkOutHash }],
          },
          select: { id: true },
        }),
        prisma.attendance.findFirst({
          where: { id: existing.id, checkInHash: checkOutHash },
          select: { id: true },
        }),
      ]);
      const reusedPhoto = ownReuse !== null || sameDayReuse !== null;
      const duplicateAcrossUsers = crossReuse !== null;
      const reuseNote =
        duplicateAcrossUsers
          ? 'Foto pulang sama dipakai karyawan lain (perlu ditinjau)'
          : reusedPhoto
            ? 'Foto pulang identik dengan absen sebelumnya (perlu ditinjau)'
            : null;
      const mergedNotes =
        [existing.notes, reuseNote].filter(Boolean).join(' | ').slice(0, 500) || null;

      let attendance;
      try {
        attendance = await prisma.attendance.update({
          where: { id: existing.id },
          data: {
            checkOut: now,
            checkOutPhoto: checkOutPhotoKey,
            checkOutLat: latitude,
            checkOutLng: longitude,
            checkOutAddress: address?.trim() || null,
            isAutoCheckout: false,
            checkOutOutOfRadius,
            checkOutAccuracy: gpsAccuracy,
            checkOutCapturedAt: capturedAtDate,
            checkOutHash,
            notes: mergedNotes,
          },
        });
      } catch (err) {
        await deleteAttendancePhoto(checkOutPhotoKey);
        throw err;
      }

      await recordAudit({
        actor: authUser,
        action: 'ATTENDANCE_CHECK_OUT',
        targetType: 'Attendance',
        targetId: attendance.id,
        details: { checkOutOutOfRadius, hasFixedHours, reusedPhoto, duplicateAcrossUsers, gpsAccuracy },
        ip: getClientIp(req),
      });

      // Alerts: geofence (unless no fixed hours) and/or suspicious photo reuse.
      const needsNotification = (checkOutOutOfRadius && hasFixedHours) || reusedPhoto || duplicateAcrossUsers;
      if (needsNotification) {
        const recipients = await audienceUserIds(authUser.userId);
        if (recipients.length > 0) {
          const suspicious = duplicateAcrossUsers || reusedPhoto;
          await prisma.notification.createMany({
            data: recipients.map((recipientId) => ({
              type: 'OUT_OF_RADIUS',
              title: suspicious ? 'Foto Absen Perlu Ditinjau' : 'Absen Pulang di Luar Radius',
              message: duplicateAcrossUsers
                ? `${user.name} melakukan absen pulang dengan foto yang sama seperti absen karyawan lain.`
                : reusedPhoto
                  ? `${user.name} melakukan absen pulang dengan foto yang identik dengan absen sebelumnya.`
                  : `${user.name} melakukan absen pulang di luar radius kantor.`,
              recipientId,
              senderId: authUser.userId,
            })),
          });
        }
      }

      return ok(attendance, 'Absen pulang berhasil.');
    }
  } catch (error) {
    console.error('[POST ATTENDANCE]', error);
    return serverError();
  }
}
