// === User & Auth Types ===
export interface User {
    id: string;
    name: string;
    username: string;
    phone: string;
    role: 'employee' | 'admin';
    department: string;
    avatar?: string;
    branchId?: string;
    branch?: string;
    shiftStart?: string;
    shiftEnd?: string;
}

// === Attendance Types ===
export type AttendanceStatus = 'checked-in' | 'checked-out';
export type DayStatus = 'present' | 'absent' | 'late' | 'weekend' | 'holiday';

export interface AttendanceRecord {
    id: string;
    employeeId: string;
    employeeName: string;
    date: string; // YYYY-MM-DD
    checkInTime: string | null; // HH:mm
    checkOutTime: string | null; // HH:mm
    status: DayStatus;
    location?: GeoLocation;
    totalHours?: number;
    isLate?: boolean;
    lateMinutes?: number;
    earlyLeaveMinutes?: number;
    note?: string;
}

export interface GeoLocation {
    latitude: number;
    longitude: number;
    accuracy?: number;
    timestamp?: number;
}

// === Shift Configuration ===
export interface ShiftConfig {
    startTime: string; // HH:mm (e.g. "08:00")
    endTime: string;   // HH:mm (e.g. "16:00")
    gracePeriodMinutes: number; // e.g. 15
    workDays: number[]; // 0=Sun, 1=Mon, ... 6=Sat
}

// === Branch / Location ===
export interface Branch {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    radiusMeters: number; // Allowed geofence radius
}

// === Page Types ===
export type PageType = 'home' | 'history' | 'vip' | 'profile' | 'salary' | 'leaves' | 'notificationInbox' | 'chat';

// === Calendar Day ===
export interface CalendarDay {
    date: number;
    dayOfWeek: number;
    status?: DayStatus;
    record?: AttendanceRecord;
    isToday?: boolean;
    isWeekend?: boolean;
}
