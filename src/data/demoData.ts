import { User, AttendanceRecord, Branch, ShiftConfig } from '../types';

// === Demo Users ===
export const DEMO_USERS: User[] = [
    {
        id: 'emp-001',
        name: 'أحمد محمد',
        username: 'ahmed',
        phone: '0770123456',
        role: 'admin',
        department: 'الإدارة',
    },
    {
        id: 'emp-002',
        name: 'فاطمة علي',
        username: 'fatima',
        phone: '0771234567',
        role: 'employee',
        department: 'المحاسبة',
    },
    {
        id: 'emp-003',
        name: 'عمر حسن',
        username: 'omar',
        phone: '0772345678',
        role: 'employee',
        department: 'تقنية المعلومات',
    },
    {
        id: 'emp-004',
        name: 'نور الدين',
        username: 'nour',
        phone: '0773456789',
        role: 'employee',
        department: 'الموارد البشرية',
    },
    {
        id: 'emp-005',
        name: 'سارة أحمد',
        username: 'sara',
        phone: '0774567890',
        role: 'employee',
        department: 'التسويق',
    },
];

// === Default Branch ===
export const DEFAULT_BRANCH: Branch = {
    id: 'branch-001',
    name: 'المقر الرئيسي',
    latitude: 33.3152,  // Baghdad coordinates (example)
    longitude: 44.3661,
    radiusMeters: 500,
};

// === VIP Demo Data ===
export const VIP_DATA: Record<string, { points: number; badges: string[] }> = {
    'emp-001': { points: 1200, badges: ['💎 ملتزم', '🏆 قائد', '⭐ متميز'] },
    'emp-002': { points: 850, badges: ['👑 منتج', '⭐ متميز'] },
    'emp-003': { points: 420, badges: ['🥈 مجتهد'] },
    'emp-004': { points: 150, badges: ['🥉 نشيط'] },
    'emp-005': { points: 680, badges: ['👑 منتج', '⭐ مبدع'] },
};

// === Default Shift Config ===
export const DEFAULT_SHIFT: ShiftConfig = {
    startTime: '08:00',
    endTime: '16:00',
    gracePeriodMinutes: 15,
    workDays: [0, 1, 2, 3, 4], // Sun-Thu
};

// === Generate Demo Attendance Records ===
function generateDemoRecords(): AttendanceRecord[] {
    const records: AttendanceRecord[] = [];
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    // Generate records for current month
    for (let day = 1; day <= today.getDate() - 1; day++) {
        const date = new Date(currentYear, currentMonth, day);
        const dayOfWeek = date.getDay();

        // Skip weekends (Friday & Saturday)
        if (dayOfWeek === 5 || dayOfWeek === 6) continue;

        const dateStr = `${currentYear}-${(currentMonth + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;

        // Random attendance patterns
        const rand = Math.random();

        if (rand < 0.1) {
            // Absent (10%)
            records.push({
                id: `rec-${dateStr}`,
                employeeId: 'emp-001',
                employeeName: 'أحمد محمد',
                date: dateStr,
                checkInTime: null,
                checkOutTime: null,
                status: 'absent',
                note: 'إجازة',
            });
        } else if (rand < 0.3) {
            // Late (20%)
            const lateMin = Math.floor(Math.random() * 45) + 16;
            const checkInH = 8 + Math.floor(lateMin / 60);
            const checkInM = lateMin % 60;
            const checkIn = `${checkInH.toString().padStart(2, '0')}:${checkInM.toString().padStart(2, '0')}`;
            const totalHours = 16 - checkInH - (checkInM / 60);

            records.push({
                id: `rec-${dateStr}`,
                employeeId: 'emp-001',
                employeeName: 'أحمد محمد',
                date: dateStr,
                checkInTime: checkIn,
                checkOutTime: '16:00',
                status: 'late',
                isLate: true,
                lateMinutes: lateMin,
                totalHours: Math.round(totalHours * 100) / 100,
            });
        } else {
            // On time (70%)
            const earlyMin = Math.floor(Math.random() * 15);
            const checkInM = 60 - earlyMin;
            const checkIn = earlyMin === 0 ? '08:00' : `07:${checkInM.toString().padStart(2, '0')}`;

            records.push({
                id: `rec-${dateStr}`,
                employeeId: 'emp-001',
                employeeName: 'أحمد محمد',
                date: dateStr,
                checkInTime: checkIn,
                checkOutTime: '16:00',
                status: 'present',
                isLate: false,
                lateMinutes: 0,
                totalHours: 8,
            });
        }
    }

    return records;
}

export const DEMO_RECORDS = generateDemoRecords();

// === Demo data for other employees (for admin view) ===
export function getEmployeeStatuses(): Array<{
    user: User;
    status: 'present' | 'absent' | 'late';
    checkInTime?: string;
}> {
    return [
        { user: DEMO_USERS[0], status: 'present', checkInTime: '07:55' },
        { user: DEMO_USERS[1], status: 'present', checkInTime: '08:10' },
        { user: DEMO_USERS[2], status: 'late', checkInTime: '08:32' },
        { user: DEMO_USERS[3], status: 'absent' },
        { user: DEMO_USERS[4], status: 'present', checkInTime: '07:58' },
    ];
}

// === Avatar colors ===
export const AVATAR_COLORS = [
    'linear-gradient(135deg, #10b981, #14b8a6)',
    'linear-gradient(135deg, #3b82f6, #6366f1)',
    'linear-gradient(135deg, #f59e0b, #f97316)',
    'linear-gradient(135deg, #8b5cf6, #a855f7)',
    'linear-gradient(135deg, #ec4899, #f43f5e)',
];
