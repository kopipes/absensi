import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, ok, unauthorized, forbidden, badRequest, serverError } from '@/lib/api';
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

    const attendances = await prisma.attendance.findMany({
      where: {
        ...(targetUserId ? { userId: targetUserId } : {}),
        ...dateFilter,
        ...(status ? { status } : {}),
        ...(department && authUser.role !== 'USER' ? { user: { department } } : {}),
        ...(authUser.role === 'MANAGER' || authUser.role === 'SPV'
          ? { user: { managerId: authUser.userId } }
          : {}),
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

    // Location validation
    let isOutOfRadius = false;
    if (user.office) {
      const distance = calculateDistance(latitude, longitude, user.office.latitude, user.office.longitude);
      isOutOfRadius = distance > user.office.radius;
    }

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

      // Notify manager
      if (user.managerId) {
        const notifications = [];
        if (isOutOfRadius) {
          notifications.push(prisma.notification.create({
            data: {
              type: 'OUT_OF_RADIUS',
              title: 'Absen di Luar Radius',
              message: `${user.name} melakukan absen masuk di luar radius kantor.`,
              recipientId: user.managerId,
              senderId: authUser.userId,
            },
          }));
        }
        if (notifications.length > 0) await Promise.all(notifications);
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
          },
        });
      } catch (err) {
        await deleteAttendancePhoto(checkOutPhotoKey);
        throw err;
      }

      return ok(attendance, 'Absen pulang berhasil.');
    }
  } catch (error) {
    console.error('[POST ATTENDANCE]', error);
    return serverError();
  }
}
