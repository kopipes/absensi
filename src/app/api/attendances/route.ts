import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getAuthUser, ok, unauthorized, forbidden, badRequest, serverError } from '@/lib/api';
import { userScopeFilter, audienceUserIds } from '@/lib/rbac';
import { calculateDistance, getTodayString } from '@/lib/utils';
import { saveAttendancePhoto, deleteAttendancePhoto, MAX_PHOTO_BYTES } from '@/lib/photos';

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
    const { type, photo, latitude, longitude, address } = body;

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
      return badRequest('Ukuran foto terlalu besar. Maksimal 400KB.');
    }
    if (typeof latitude !== 'number' || typeof longitude !== 'number' ||
        isNaN(latitude) || isNaN(longitude) ||
        latitude < -90 || latitude > 90 ||
        longitude < -180 || longitude > 180) {
      return badRequest('Koordinat GPS tidak valid. Pastikan GPS aktif dan izin lokasi diberikan.');
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
      try {
        checkInPhotoKey = await saveAttendancePhoto(photo, {
          userId: authUser.userId,
          date: today,
          kind: 'in',
        });
      } catch (err) {
        if ((err as Error).message === 'photo-too-large') {
          return badRequest('Ukuran foto terlalu besar. Maksimal 400KB.');
        }
        return badRequest('Format foto tidak valid.');
      }

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
            isOutOfRadius,
            status: 'PRESENT',
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

      // Notify the whole manager chain (e.g. USER's SPV and MANAGER)
      if (isOutOfRadius) {
        const recipients = await audienceUserIds(authUser.userId);
        if (recipients.length > 0) {
          await prisma.notification.createMany({
            data: recipients.map((recipientId) => ({
              type: 'OUT_OF_RADIUS',
              title: 'Absen di Luar Radius',
              message: `${user.name} melakukan absen masuk di luar radius kantor.`,
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
      try {
        checkOutPhotoKey = await saveAttendancePhoto(photo, {
          userId: authUser.userId,
          date: today,
          kind: 'out',
        });
      } catch (err) {
        if ((err as Error).message === 'photo-too-large') {
          return badRequest('Ukuran foto terlalu besar. Maksimal 400KB.');
        }
        return badRequest('Format foto tidak valid.');
      }

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
          },
        });
      } catch (err) {
        await deleteAttendancePhoto(checkOutPhotoKey);
        throw err;
      }

      // Check-out geofence alert, unless the employee has no fixed working
      // hours (days-only schedule or no schedule at all) — those are free days.
      if (checkOutOutOfRadius && hasFixedHours) {
        const recipients = await audienceUserIds(authUser.userId);
        if (recipients.length > 0) {
          await prisma.notification.createMany({
            data: recipients.map((recipientId) => ({
              type: 'OUT_OF_RADIUS',
              title: 'Absen Pulang di Luar Radius',
              message: `${user.name} melakukan absen pulang di luar radius kantor.`,
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
