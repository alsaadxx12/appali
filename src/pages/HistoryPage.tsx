import React, { useState } from 'react';
import { CalendarDays, Clock, ArrowLeftRight } from 'lucide-react';
import Calendar from '../components/Calendar';
import { useAttendance } from '../context/AttendanceContext';
import { formatFullDateArabic, formatTimeString, formatHours } from '../utils/timeUtils';

export default function HistoryPage() {
    const { records, getRecordsByMonth, monthStats } = useAttendance();
    const [selectedDate, setSelectedDate] = useState<string | null>(null);

    const now = new Date();
    const currentMonthRecords = getRecordsByMonth(now.getFullYear(), now.getMonth());

    // Sort records by date descending
    const sortedRecords = [...currentMonthRecords].sort((a, b) => b.date.localeCompare(a.date));

    const handleDateSelect = (dateStr: string) => {
        setSelectedDate(dateStr === selectedDate ? null : dateStr);
    };

    const statusLabels: Record<string, string> = {
        present: 'حاضر',
        absent: 'غائب',
        late: 'متأخر',
        weekend: 'عطلة',
        holiday: 'إجازة',
    };

    return (
        <div className="page-content page-enter">
            {/* Month Summary */}
            <div className="month-summary">
                <div className="month-stat">
                    <div className="month-stat-value" style={{ color: 'var(--accent-emerald)' }}>
                        {monthStats.present}
                    </div>
                    <div className="month-stat-label">حضور</div>
                </div>
                <div className="month-stat">
                    <div className="month-stat-value" style={{ color: 'var(--accent-amber)' }}>
                        {monthStats.late}
                    </div>
                    <div className="month-stat-label">تأخير</div>
                </div>
                <div className="month-stat">
                    <div className="month-stat-value" style={{ color: 'var(--accent-rose)' }}>
                        {monthStats.absent}
                    </div>
                    <div className="month-stat-label">غياب</div>
                </div>
            </div>

            {/* Calendar */}
            <Calendar
                records={records}
                onDateSelect={handleDateSelect}
            />

            {/* Selected Date Detail */}
            {selectedDate && (() => {
                const record = currentMonthRecords.find(r => r.date === selectedDate);
                if (!record) return null;
                return (
                    <div className="glass-card" style={{ marginBottom: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                            <h4 style={{ fontSize: 14, fontWeight: 700 }}>
                                {formatFullDateArabic(selectedDate)}
                            </h4>
                            <span className={`employee-status ${record.status}`}>
                                {statusLabels[record.status]}
                            </span>
                        </div>
                        {record.checkInTime && (
                            <div style={{ display: 'flex', gap: 20, fontSize: 13, color: 'var(--text-secondary)' }}>
                                <span>🟢 الحضور: {formatTimeString(record.checkInTime)}</span>
                                {record.checkOutTime && <span>🔴 الانصراف: {formatTimeString(record.checkOutTime)}</span>}
                            </div>
                        )}
                        {record.totalHours !== undefined && (
                            <div style={{ marginTop: 8, fontSize: 13, color: 'var(--accent-blue)' }}>
                                ⏱️ إجمالي الساعات: {formatHours(record.totalHours)}
                            </div>
                        )}
                        {record.isLate && (
                            <div style={{ marginTop: 4, fontSize: 12, color: 'var(--accent-amber)' }}>
                                ⚠️ تأخير: {record.lateMinutes} دقيقة
                            </div>
                        )}
                    </div>
                );
            })()}

            {/* History List */}
            <h3 className="section-title" style={{ marginTop: 8 }}>
                <CalendarDays size={20} />
                سجل الحضور
            </h3>
            <div className="history-list">
                {sortedRecords.length === 0 ? (
                    <div className="glass-card" style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
                        لا توجد سجلات لهذا الشهر
                    </div>
                ) : (
                    sortedRecords.map(record => (
                        <div key={record.id} className="history-item">
                            <div className={`history-status-dot ${record.status}`} />
                            <div className="history-details">
                                <div className="history-date">{formatFullDateArabic(record.date)}</div>
                                <div className="history-times">
                                    {record.checkInTime ? (
                                        <>
                                            <span>الحضور: {formatTimeString(record.checkInTime)}</span>
                                            {record.checkOutTime && (
                                                <span>الانصراف: {formatTimeString(record.checkOutTime)}</span>
                                            )}
                                        </>
                                    ) : (
                                        <span style={{ color: 'var(--accent-rose)' }}>غائب</span>
                                    )}
                                </div>
                            </div>
                            <div className="history-hours">
                                {record.totalHours !== undefined ? formatHours(record.totalHours) : '--'}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
