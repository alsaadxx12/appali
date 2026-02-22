import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { AttendanceRecord, GeoLocation } from '../types';
import { DEFAULT_SHIFT } from '../data/demoData';
import { getCurrentTimeString, getCurrentDateString, calculateHours, isLate, getLateMinutes } from '../utils/timeUtils';
import { useAuth } from './AuthContext';
import { db } from '../firebase';
import { collection, getDocs, addDoc, updateDoc, doc, query, where, orderBy } from 'firebase/firestore';

interface AttendanceContextType {
    records: AttendanceRecord[];
    todayRecord: AttendanceRecord | null;
    isCheckedIn: boolean;
    checkIn: (location?: GeoLocation) => void;
    checkOut: (location?: GeoLocation) => void;
    getRecordsByMonth: (year: number, month: number) => AttendanceRecord[];
    getRecordByDate: (dateStr: string) => AttendanceRecord | undefined;
    refreshRecords: () => Promise<void>;
    todayTotalHours: number;
    monthStats: {
        present: number;
        absent: number;
        late: number;
        totalHours: number;
    };
}

const AttendanceContext = createContext<AttendanceContextType | undefined>(undefined);

export function AttendanceProvider({ children }: { children: ReactNode }) {
    const { user } = useAuth();
    const [records, setRecords] = useState<AttendanceRecord[]>([]);

    // Load records from Firestore
    const loadRecords = async () => {
        if (!user) return;
        try {
            const snap = await getDocs(
                query(collection(db, 'attendance'), where('employeeId', '==', user.id))
            );
            const firestoreRecords = snap.docs.map(d => ({
                ...d.data(),
                id: d.id,
            })) as AttendanceRecord[];
            setRecords(firestoreRecords);
        } catch (err) {
            console.error('Error loading attendance records:', err);
            const saved = localStorage.getItem(`attendance-${user.id}`);
            if (saved) {
                try { setRecords(JSON.parse(saved)); } catch { /* ignore */ }
            }
        }
    };

    useEffect(() => {
        if (!user) return;
        loadRecords();
    }, [user?.id]);

    // Save to localStorage as backup
    useEffect(() => {
        if (records.length > 0 && user) {
            localStorage.setItem(`attendance-${user.id}`, JSON.stringify(records));
        }
    }, [records, user?.id]);

    const today = getCurrentDateString();
    const todayRecord = records.find(r => r.date === today && r.employeeId === user?.id) || null;
    const isCheckedIn = todayRecord?.checkInTime !== null && todayRecord?.checkInTime !== undefined && !todayRecord?.checkOutTime;

    const todayTotalHours = todayRecord?.checkInTime && todayRecord?.checkOutTime
        ? calculateHours(todayRecord.checkInTime, todayRecord.checkOutTime)
        : todayRecord?.checkInTime
            ? calculateHours(todayRecord.checkInTime, getCurrentTimeString())
            : 0;

    const checkIn = async (location?: GeoLocation) => {
        if (!user) return;
        const now = getCurrentTimeString();
        const late = isLate(now, DEFAULT_SHIFT.startTime, DEFAULT_SHIFT.gracePeriodMinutes);
        const lateMins = getLateMinutes(now, DEFAULT_SHIFT.startTime);

        const newRecord: Omit<AttendanceRecord, 'id'> & { id?: string } = {
            employeeId: user.id,
            employeeName: user.name,
            date: today,
            checkInTime: now,
            checkOutTime: null,
            status: late ? 'late' : 'present',
            location,
            isLate: late,
            lateMinutes: lateMins,
        };

        try {
            const docRef = await addDoc(collection(db, 'attendance'), newRecord);
            const savedRecord: AttendanceRecord = { ...newRecord, id: docRef.id } as AttendanceRecord;
            setRecords(prev => {
                const filtered = prev.filter(r => !(r.date === today && r.employeeId === user.id));
                return [...filtered, savedRecord];
            });
        } catch (err) {
            console.error('Error saving check-in:', err);
            // Fallback to local
            const localRecord: AttendanceRecord = { ...newRecord, id: `local-${today}` } as AttendanceRecord;
            setRecords(prev => {
                const filtered = prev.filter(r => !(r.date === today && r.employeeId === user.id));
                return [...filtered, localRecord];
            });
        }
    };

    const checkOut = async (location?: GeoLocation) => {
        if (!user || !todayRecord) return;
        const now = getCurrentTimeString();
        const hours = todayRecord.checkInTime
            ? calculateHours(todayRecord.checkInTime, now)
            : 0;

        const updates = {
            checkOutTime: now,
            totalHours: Math.round(hours * 100) / 100,
        };

        try {
            if (todayRecord.id && !todayRecord.id.startsWith('local-')) {
                await updateDoc(doc(db, 'attendance', todayRecord.id), updates);
            }
        } catch (err) {
            console.error('Error saving check-out:', err);
        }

        setRecords(prev =>
            prev.map(r =>
                r.date === today && r.employeeId === user.id
                    ? { ...r, ...updates, location }
                    : r
            )
        );
    };

    const getRecordsByMonth = (year: number, month: number): AttendanceRecord[] => {
        const monthStr = (month + 1).toString().padStart(2, '0');
        const prefix = `${year}-${monthStr}`;
        return records.filter(r => r.date.startsWith(prefix) && r.employeeId === user?.id);
    };

    const getRecordByDate = (dateStr: string): AttendanceRecord | undefined => {
        return records.find(r => r.date === dateStr && r.employeeId === user?.id);
    };

    // Month statistics
    const now = new Date();
    const monthRecords = getRecordsByMonth(now.getFullYear(), now.getMonth());
    const monthStats = {
        present: monthRecords.filter(r => r.status === 'present').length,
        absent: monthRecords.filter(r => r.status === 'absent').length,
        late: monthRecords.filter(r => r.status === 'late').length,
        totalHours: monthRecords.reduce((sum, r) => sum + (r.totalHours || 0), 0),
    };

    return (
        <AttendanceContext.Provider
            value={{
                records,
                todayRecord,
                isCheckedIn,
                checkIn,
                checkOut,
                getRecordsByMonth,
                getRecordByDate,
                refreshRecords: loadRecords,
                todayTotalHours,
                monthStats,
            }}
        >
            {children}
        </AttendanceContext.Provider>
    );
}

export function useAttendance(): AttendanceContextType {
    const context = useContext(AttendanceContext);
    if (!context) {
        throw new Error('useAttendance must be used within an AttendanceProvider');
    }
    return context;
}
