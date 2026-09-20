export type Role = 'ADMIN' | 'MANAGER' | 'SPV' | 'USER';
export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'HOLIDAY' | 'OFF';
export type CorrectionStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type NotificationType =
  | 'OUT_OF_RADIUS'
  | 'MISSING_CHECKOUT'
  | 'CORRECTION_REQUEST'
  | 'CORRECTION_APPROVED'
  | 'CORRECTION_REJECTED'
  | 'SYSTEM';

export interface UserProfile {
  id: string;
  nik: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  position?: string | null;
  department?: string | null;
  role: Role;
  avatar?: string | null;
  isActive: boolean;
  managerId?: string | null;
  officeId?: string | null;
  workScheduleId?: string | null;
  createdAt: string;
  manager?: { id: string; name: string; role: string } | null;
  office?: Office | null;
  workSchedule?: WorkSchedule | null;
}

export interface Office {
  id: string;
  name: string;
  address?: string | null;
  latitude: number;
  longitude: number;
  radius: number;
  isActive: boolean;
}

export interface WorkSchedule {
  id: string;
  name: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  workDays: string;
  isActive: boolean;
  officeId?: string | null;
}

export interface Attendance {
  id: string;
  userId: string;
  date: string;
  checkIn?: string | null;
  checkOut?: string | null;
  checkInPhoto?: string | null;
  checkOutPhoto?: string | null;
  checkInLat?: number | null;
  checkInLng?: number | null;
  checkOutLat?: number | null;
  checkOutLng?: number | null;
  checkInAddress?: string | null;
  checkOutAddress?: string | null;
  isOutOfRadius: boolean;
  isAutoCheckout: boolean;
  status: AttendanceStatus;
  notes?: string | null;
  createdAt: string;
  user?: UserProfile;
}

export interface AttendanceCorrection {
  id: string;
  attendanceId: string;
  requestedById: string;
  approvedById?: string | null;
  oldCheckIn?: string | null;
  newCheckIn?: string | null;
  oldCheckOut?: string | null;
  newCheckOut?: string | null;
  reason: string;
  status: CorrectionStatus;
  createdAt: string;
  requestedBy?: UserProfile;
  approvedBy?: UserProfile;
  attendance?: Attendance;
}

export interface Holiday {
  id: string;
  name: string;
  date: string;
  isNational: boolean;
  createdAt: string;
}

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  recipientId: string;
  senderId?: string | null;
  isRead: boolean;
  metadata?: string | null;
  createdAt: string;
  sender?: UserProfile | null;
  recipient?: { id: string; name: string; nik: string; role: Role } | null;
}

export interface DashboardStats {
  totalEmployees: number;
  presentToday: number;
  absentToday: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
