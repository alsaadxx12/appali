import React, { useState } from 'react';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import { getDaysInMonth, getFirstDayOfMonth, getMonthYearArabic } from '../utils/timeUtils';
import { AttendanceRecord, DayStatus } from '../types';

// Saturday-start week
const WEEKDAY_LABELS = ['سب', 'أح', 'اث', 'ثل', 'أر', 'خم', 'جم'];

interface CalendarProps {
    records: AttendanceRecord[];
    onDateSelect?: (dateStr: string) => void;
}

export default function Calendar({ records, onDateSelect }: CalendarProps) {
    const today = new Date();
    const [currentMonth, setCurrentMonth] = useState(today.getMonth());
    const [currentYear, setCurrentYear] = useState(today.getFullYear());

    const daysInMonth = getDaysInMonth(currentYear, currentMonth);
    const firstDay = getFirstDayOfMonth(currentYear, currentMonth);

    const prevMonth = () => {
        if (currentMonth === 0) {
            setCurrentMonth(11);
            setCurrentYear(y => y - 1);
        } else {
            setCurrentMonth(m => m - 1);
        }
    };

    const nextMonth = () => {
        if (currentMonth === 11) {
            setCurrentMonth(0);
            setCurrentYear(y => y + 1);
        } else {
            setCurrentMonth(m => m + 1);
        }
    };

    const getStatusForDay = (day: number): DayStatus | undefined => {
        const dateStr = `${currentYear}-${(currentMonth + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        const record = records.find(r => r.date === dateStr);
        return record?.status;
    };

    const isToday = (day: number): boolean => {
        return day === today.getDate() &&
            currentMonth === today.getMonth() &&
            currentYear === today.getFullYear();
    };

    const isWeekendDay = (day: number): boolean => {
        const date = new Date(currentYear, currentMonth, day);
        const dow = date.getDay();
        return dow === 5 || dow === 6; // Friday or Saturday
    };

    const handleDayClick = (day: number) => {
        const dateStr = `${currentYear}-${(currentMonth + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        onDateSelect?.(dateStr);
    };

    // Build calendar grid
    const cells: React.ReactNode[] = [];

    // Empty cells before first day
    for (let i = 0; i < firstDay; i++) {
        cells.push(<div key={`empty-${i}`} className="calendar-day empty" />);
    }

    // Day cells
    for (let day = 1; day <= daysInMonth; day++) {
        const status = getStatusForDay(day);
        const todayClass = isToday(day) ? 'today' : '';
        const weekendClass = isWeekendDay(day) ? 'weekend' : '';
        const statusClass = status || '';

        cells.push(
            <button
                key={day}
                className={`calendar-day ${todayClass} ${weekendClass} ${statusClass}`}
                onClick={() => handleDayClick(day)}
            >
                {day}
                {status && <span className={`dot ${status}`} />}
            </button>
        );
    }

    return (
        <div className="calendar-container glass-card">
            <div className="calendar-header">
                <button className="calendar-nav" onClick={nextMonth} style={{ background: 'none', border: 'none' }}>
                    <div style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-md)', background: 'var(--bg-glass)', border: '1px solid var(--border-glass)', color: 'var(--text-secondary)' }}>
                        <ChevronRight size={18} />
                    </div>
                </button>
                <h3 className="calendar-title">
                    {getMonthYearArabic(currentMonth, currentYear)}
                </h3>
                <button className="calendar-nav" onClick={prevMonth} style={{ background: 'none', border: 'none' }}>
                    <div style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-md)', background: 'var(--bg-glass)', border: '1px solid var(--border-glass)', color: 'var(--text-secondary)' }}>
                        <ChevronLeft size={18} />
                    </div>
                </button>
            </div>

            <div className="calendar-weekdays">
                {WEEKDAY_LABELS.map(label => (
                    <div key={label} className="weekday-label">{label}</div>
                ))}
            </div>

            <div className="calendar-days">
                {cells}
            </div>

            <div className="calendar-legend">
                <div className="legend-item">
                    <span className="legend-dot present" />
                    <span>حاضر</span>
                </div>
                <div className="legend-item">
                    <span className="legend-dot late" />
                    <span>متأخر</span>
                </div>
                <div className="legend-item">
                    <span className="legend-dot absent" />
                    <span>غائب</span>
                </div>
                <div className="legend-item">
                    <span className="legend-dot today" />
                    <span>اليوم</span>
                </div>
            </div>
        </div>
    );
}
