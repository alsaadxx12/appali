const ARABIC_DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const ARABIC_MONTHS = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];

/**
 * Format time as HH:mm in Arabic style
 */
export function formatTime(date: Date): string {
    const hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const period = hours >= 12 ? 'م' : 'ص';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes} ${period}`;
}

/**
 * Format time from HH:mm string
 */
export function formatTimeString(time: string): string {
    const [h, m] = time.split(':').map(Number);
    const period = h >= 12 ? 'م' : 'ص';
    const displayH = h % 12 || 12;
    return `${displayH}:${m.toString().padStart(2, '0')} ${period}`;
}

/**
 * Get current time as HH:mm
 */
export function getCurrentTimeString(): string {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
}

/**
 * Get current date as YYYY-MM-DD
 */
export function getCurrentDateString(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = (now.getMonth() + 1).toString().padStart(2, '0');
    const d = now.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/**
 * Format date in Arabic
 */
export function formatDateArabic(date: Date): string {
    const dayName = ARABIC_DAYS[date.getDay()];
    const day = date.getDate();
    const month = date.getMonth() + 1;
    return `${dayName}، ${day}/${month}`;
}

/**
 * Format full date with year
 */
export function formatFullDateArabic(dateStr: string): string {
    const date = new Date(dateStr);
    const day = date.getDate();
    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

/**
 * Get month and year in Arabic
 */
export function getMonthYearArabic(month: number, year: number): string {
    return `${month + 1}/${year}`;
}

/**
 * Calculate hours between two time strings (HH:mm)
 */
export function calculateHours(checkIn: string, checkOut: string): number {
    const [inH, inM] = checkIn.split(':').map(Number);
    const [outH, outM] = checkOut.split(':').map(Number);
    const totalMinutes = (outH * 60 + outM) - (inH * 60 + inM);
    return Math.max(0, totalMinutes / 60);
}

/**
 * Check if a given time is late compared to shift start
 */
export function isLate(checkInTime: string, shiftStart: string, gracePeriod: number = 15): boolean {
    const [inH, inM] = checkInTime.split(':').map(Number);
    const [startH, startM] = shiftStart.split(':').map(Number);
    const diffMinutes = (inH * 60 + inM) - (startH * 60 + startM);
    return diffMinutes > gracePeriod;
}

/**
 * Get late minutes
 */
export function getLateMinutes(checkInTime: string, shiftStart: string): number {
    const [inH, inM] = checkInTime.split(':').map(Number);
    const [startH, startM] = shiftStart.split(':').map(Number);
    const diffMinutes = (inH * 60 + inM) - (startH * 60 + startM);
    return Math.max(0, diffMinutes);
}

/**
 * Format minutes to hours and minutes display
 */
export function formatDuration(totalMinutes: number): string {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = Math.round(totalMinutes % 60);
    if (hours === 0) return `${minutes} دقيقة`;
    if (minutes === 0) return `${hours} ساعة`;
    return `${hours}:${minutes.toString().padStart(2, '0')}`;
}

/**
 * Format hours as display string
 */
export function formatHours(hours: number): string {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}:${m.toString().padStart(2, '0')}`;
}

/**
 * Get days in a month
 */
export function getDaysInMonth(year: number, month: number): number {
    return new Date(year, month + 1, 0).getDate();
}

/**
 * Get first day of month (0=Sun, 1=Mon, ... 6=Sat)
 * Adjusted for Saturday-start week
 */
export function getFirstDayOfMonth(year: number, month: number): number {
    const day = new Date(year, month, 1).getDay();
    // Convert to Saturday-start: (day + 1) % 7
    return (day + 1) % 7;
}

/**
 * Check if a day is a weekend (Friday & Saturday)
 */
export function isWeekend(date: Date): boolean {
    const day = date.getDay();
    return day === 5 || day === 6; // Friday or Saturday
}

export { ARABIC_DAYS, ARABIC_MONTHS };
