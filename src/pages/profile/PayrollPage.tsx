import React, { useState, useEffect } from 'react';
import {
    ArrowRight, Calendar, DollarSign, Users, Clock,
    TrendingUp, TrendingDown, Check, Loader, ChevronDown,
    ChevronUp, Star, Settings
} from 'lucide-react';
import { db } from '../../firebase';
import { collection, getDocs, doc, getDoc, setDoc, query, orderBy } from 'firebase/firestore';

interface Props {
    onBack: () => void;
}

interface Employee {
    id: string;
    name: string;
    department: string;
    branch: string;
    salary: number;
    shiftStart: string;
    shiftEnd: string;
    isActive?: boolean;
}

interface AttendanceRecord {
    employeeId: string;
    date: string;
    status: 'present' | 'late' | 'absent';
    checkInTime?: string;
    checkOutTime?: string;
    totalHours?: number;
    isLate?: boolean;
    lateMinutes?: number;
}

interface DeptAllowanceFlags {
    changeProfits: boolean;
    issuanceProfits: boolean;
}

interface EmployeePayrollOverrides {
    changesAmount: number;
    issuanceProfitsAmount: number;
}

interface PayrollEntry {
    employee: Employee;
    deptFlags: DeptAllowanceFlags;
    baseSalary: number;
    workDays: number;
    totalDays: number;
    absentDays: number;
    lateDays: number;
    lateMinutes: number;
    totalHours: number;
    // Points
    pointsBalance: number;
    pointsValue: number; // monetary value
    // Additions
    changesAmount: number;
    issuanceProfitsAmount: number;
    pointsBonus: number;
    totalAdditions: number;
    // Deductions
    absentDeduction: number;
    lateDeduction: number;
    pointsDeduction: number;
    totalDeductions: number;
    netSalary: number;
}

const MONTHS = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

export default function PayrollPage({ onBack }: Props) {
    const now = new Date();
    const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
    const [selectedYear, setSelectedYear] = useState(now.getFullYear());
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
    const [deptFlagsMap, setDeptFlagsMap] = useState<Record<string, DeptAllowanceFlags>>({});
    const [overrides, setOverrides] = useState<Record<string, EmployeePayrollOverrides>>({});
    const [pointsBalances, setPointsBalances] = useState<Record<string, number>>({});
    const [pointValuePerPoint, setPointValuePerPoint] = useState(100);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const monthKey = `${selectedYear}-${(selectedMonth + 1).toString().padStart(2, '0')}`;

    useEffect(() => {
        loadData();
    }, [selectedMonth, selectedYear]);

    const loadData = async () => {
        setLoading(true);
        try {
            // 1. Load employees
            const empSnap = await getDocs(collection(db, 'users'));
            const emps: Employee[] = [];
            empSnap.forEach(d => {
                const data = d.data();
                emps.push({
                    id: d.id,
                    name: data.name || 'بدون اسم',
                    department: data.department || 'غير محدد',
                    branch: data.branch || 'المقر الرئيسي',
                    salary: data.salary || 0,
                    shiftStart: data.shiftStart || '08:00',
                    shiftEnd: data.shiftEnd || '16:00',
                    isActive: data.isActive !== false,
                });
            });
            const activeEmps = emps.filter(e => e.isActive !== false);
            setEmployees(activeEmps);

            // 2. Load branches → department flags
            const branchSnap = await getDocs(collection(db, 'branches'));
            const flagsMap: Record<string, DeptAllowanceFlags> = {};
            branchSnap.forEach(d => {
                const data = d.data();
                (data.departments || []).forEach((dept: any) => {
                    if (dept.name) {
                        flagsMap[dept.name] = {
                            changeProfits: dept.allowances?.changeProfits || false,
                            issuanceProfits: dept.allowances?.issuanceProfits || false,
                        };
                    }
                });
            });
            setDeptFlagsMap(flagsMap);

            // 3. Load attendance
            const monthStr = (selectedMonth + 1).toString().padStart(2, '0');
            const startDate = `${selectedYear}-${monthStr}-01`;
            const endDate = `${selectedYear}-${monthStr}-31`;
            const attSnap = await getDocs(collection(db, 'attendance'));
            const atts: AttendanceRecord[] = [];
            attSnap.forEach(d => {
                const data = d.data();
                if (data.date >= startDate && data.date <= endDate) {
                    atts.push({
                        employeeId: data.employeeId,
                        date: data.date,
                        status: data.status || 'absent',
                        checkInTime: data.checkInTime,
                        checkOutTime: data.checkOutTime,
                        totalHours: data.totalHours || 0,
                        isLate: data.isLate || false,
                        lateMinutes: data.lateMinutes || 0,
                    });
                }
            });
            setAttendance(atts);

            // 4. Load payroll overrides
            const overrideSnap = await getDoc(doc(db, 'payroll', monthKey));
            if (overrideSnap.exists()) {
                setOverrides(overrideSnap.data().employees || {});
            } else {
                setOverrides({});
            }

            // 5. Load points settings
            const pointsSettingsSnap = await getDoc(doc(db, 'settings', 'points'));
            if (pointsSettingsSnap.exists()) {
                setPointValuePerPoint(pointsSettingsSnap.data().pointValue ?? 100);
            }

            // 6. Load points balances for all employees
            const balances: Record<string, number> = {};
            for (const emp of activeEmps) {
                try {
                    const txSnap = await getDocs(collection(db, 'users', emp.id, 'pointsTransactions'));
                    let bal = 0;
                    txSnap.forEach(td => {
                        const txData = td.data();
                        if (txData.type === 'add') bal += txData.amount || 0;
                        else bal -= txData.amount || 0;
                    });
                    balances[emp.id] = bal;
                } catch {
                    balances[emp.id] = 0;
                }
            }
            setPointsBalances(balances);
        } catch (e) {
            console.error('Error loading payroll data:', e);
        } finally {
            setLoading(false);
        }
    };

    const saveOverrides = async () => {
        setSaving(true);
        try {
            await setDoc(doc(db, 'payroll', monthKey), {
                employees: overrides,
                updatedAt: new Date().toISOString(),
            }, { merge: true });
        } catch (e) {
            console.error('Error saving overrides:', e);
        } finally {
            setSaving(false);
        }
    };

    const updateOverride = (empId: string, key: keyof EmployeePayrollOverrides, value: number) => {
        setOverrides(prev => ({
            ...prev,
            [empId]: {
                changesAmount: prev[empId]?.changesAmount || 0,
                issuanceProfitsAmount: prev[empId]?.issuanceProfitsAmount || 0,
                [key]: value,
            },
        }));
    };

    const getWorkingDaysInMonth = (): number => {
        const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
        let workDays = 0;
        for (let d = 1; d <= daysInMonth; d++) {
            if (new Date(selectedYear, selectedMonth, d).getDay() !== 5) workDays++;
        }
        return workDays;
    };

    const totalDaysInMonth = getWorkingDaysInMonth();

    const buildPayrollEntries = (): PayrollEntry[] => {
        return employees.map(emp => {
            const empRecords = attendance.filter(a => a.employeeId === emp.id);
            const workDays = empRecords.filter(a => a.status === 'present' || a.status === 'late').length;
            const absentDays = Math.max(0, totalDaysInMonth - workDays);
            const lateDays = empRecords.filter(a => a.status === 'late').length;
            const lateMinutes = empRecords.reduce((sum, a) => sum + (a.lateMinutes || 0), 0);
            const totalHours = empRecords.reduce((sum, a) => sum + (a.totalHours || 0), 0);

            const dailySalary = emp.salary / totalDaysInMonth;
            const absentDeduction = Math.round(absentDays * dailySalary);
            const lateDeduction = Math.round((lateMinutes / 60) * (dailySalary / 8));

            const deptFlags = deptFlagsMap[emp.department] || { changeProfits: false, issuanceProfits: false };
            const empOverrides = overrides[emp.id] || { changesAmount: 0, issuanceProfitsAmount: 0 };
            const changesAmount = deptFlags.changeProfits ? (empOverrides.changesAmount || 0) : 0;
            const issuanceProfitsAmount = deptFlags.issuanceProfits ? (empOverrides.issuanceProfitsAmount || 0) : 0;

            const ptsBalance = pointsBalances[emp.id] || 0;
            const ptsValue = ptsBalance * pointValuePerPoint;

            const pointsBonus = 0;
            const pointsDeduction = 0;

            const totalAdditions = changesAmount + issuanceProfitsAmount + pointsBonus;
            const totalDeductions = absentDeduction + lateDeduction + pointsDeduction;
            const netSalary = emp.salary + totalAdditions - totalDeductions;

            return {
                employee: emp,
                deptFlags,
                baseSalary: emp.salary,
                workDays,
                totalDays: totalDaysInMonth,
                absentDays,
                lateDays,
                lateMinutes,
                totalHours,
                pointsBalance: ptsBalance,
                pointsValue: ptsValue,
                changesAmount,
                issuanceProfitsAmount,
                pointsBonus,
                totalAdditions,
                absentDeduction,
                lateDeduction,
                pointsDeduction,
                totalDeductions,
                netSalary,
            };
        });
    };

    const payrollEntries = loading ? [] : buildPayrollEntries();
    const totalNetSalary = payrollEntries.reduce((sum, e) => sum + e.netSalary, 0);
    const totalBaseSalary = payrollEntries.reduce((sum, e) => sum + e.baseSalary, 0);
    const totalAdditionsAll = payrollEntries.reduce((sum, e) => sum + e.totalAdditions, 0);
    const totalDeductionsAll = payrollEntries.reduce((sum, e) => sum + e.totalDeductions, 0);

    const formatCurrency = (amount: number) => amount.toLocaleString('en-US') + ' د.ع';

    if (loading) {
        return (
            <div className="page-content page-enter" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
                <Loader size={28} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent-blue)' }} />
            </div>
        );
    }

    return (
        <div className="page-content page-enter">
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, padding: '4px 0' }}>
                <button onClick={onBack} style={{
                    width: 36, height: 36, borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-glass)', border: '1px solid var(--border-glass)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--text-secondary)',
                }}>
                    <ArrowRight size={18} />
                </button>
                <div style={{ flex: 1 }}>
                    <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>💰 صرف الرواتب</h2>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
                        {MONTHS[selectedMonth]} {selectedYear} — {employees.length} موظف
                    </p>
                </div>
            </div>

            {/* Month Selector */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 14, overflowX: 'auto', paddingBottom: 4 }}>
                {MONTHS.map((month, idx) => (
                    <button key={idx} onClick={() => setSelectedMonth(idx)}
                        style={{
                            padding: '5px 10px', borderRadius: 'var(--radius-md)',
                            background: selectedMonth === idx
                                ? 'linear-gradient(135deg, rgba(59,130,246,0.25), rgba(139,92,246,0.2))'
                                : 'rgba(255,255,255,0.04)',
                            border: selectedMonth === idx ? '1px solid rgba(59,130,246,0.4)' : '1px solid var(--border-glass)',
                            color: selectedMonth === idx ? '#3b82f6' : 'var(--text-muted)',
                            fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap',
                        }}
                    >
                        {month}
                    </button>
                ))}
            </div>

            {/* Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 12 }}>
                <div className="glass-card" style={{ padding: '10px 8px', textAlign: 'center' }}>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 2 }}>إجمالي الرواتب</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#3b82f6', fontFamily: 'var(--font-numeric)' }}>
                        {formatCurrency(totalBaseSalary)}
                    </div>
                </div>
                <div className="glass-card" style={{ padding: '10px 8px', textAlign: 'center' }}>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 2 }}>صافي الصرف</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#22c55e', fontFamily: 'var(--font-numeric)' }}>
                        {formatCurrency(totalNetSalary)}
                    </div>
                </div>
                <div className="glass-card" style={{ padding: '10px 8px', textAlign: 'center' }}>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 2 }}>
                        <TrendingUp size={10} style={{ display: 'inline', verticalAlign: 'middle' }} /> الإضافات
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#22c55e', fontFamily: 'var(--font-numeric)' }}>
                        +{formatCurrency(totalAdditionsAll)}
                    </div>
                </div>
                <div className="glass-card" style={{ padding: '10px 8px', textAlign: 'center' }}>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 2 }}>
                        <TrendingDown size={10} style={{ display: 'inline', verticalAlign: 'middle' }} /> الاستقطاعات
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#ef4444', fontFamily: 'var(--font-numeric)' }}>
                        -{formatCurrency(totalDeductionsAll)}
                    </div>
                </div>
            </div>

            {/* Work days info */}
            <div style={{
                padding: '6px 12px', borderRadius: 'var(--radius-md)',
                background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.12)',
                fontSize: 10, color: '#3b82f6', fontWeight: 600, marginBottom: 12,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                fontFamily: 'var(--font-numeric)',
            }}>
                <Calendar size={12} />
                أيام الدوام في {MONTHS[selectedMonth]}: {totalDaysInMonth} يوم
            </div>

            {/* Employee Payroll Cards */}
            {payrollEntries.length === 0 ? (
                <div className="glass-card" style={{ textAlign: 'center', padding: '30px 16px' }}>
                    <Users size={30} style={{ color: 'var(--text-muted)', margin: '0 auto 8px', display: 'block', opacity: 0.3 }} />
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>لا يوجد موظفون</div>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 30 }}>
                    {payrollEntries.map(entry => {
                        const isExpanded = expandedId === entry.employee.id;
                        const showChanges = entry.deptFlags.changeProfits;
                        const showIssuance = entry.deptFlags.issuanceProfits;

                        return (
                            <div key={entry.employee.id} className="glass-card" style={{
                                padding: '0', overflow: 'hidden',
                                border: isExpanded ? '1px solid rgba(59,130,246,0.3)' : undefined,
                            }}>
                                {/* Summary row */}
                                <button
                                    onClick={() => setExpandedId(isExpanded ? null : entry.employee.id)}
                                    style={{
                                        width: '100%', padding: '10px 14px',
                                        display: 'flex', alignItems: 'center', gap: 8,
                                        background: 'transparent', textAlign: 'right',
                                    }}
                                >
                                    <div style={{
                                        width: 34, height: 34, borderRadius: 'var(--radius-full)',
                                        background: 'linear-gradient(135deg, rgba(59,130,246,0.2), rgba(139,92,246,0.15))',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 13, fontWeight: 800, color: '#3b82f6', flexShrink: 0,
                                    }}>
                                        {entry.employee.name.slice(0, 2)}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)' }}>
                                            {entry.employee.name}
                                        </div>
                                        <div style={{ fontSize: 9, color: 'var(--text-muted)', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                            <span>{entry.employee.department}</span>
                                            <span>•</span>
                                            <span>{entry.employee.branch}</span>
                                            <span>•</span>
                                            <span style={{ fontFamily: 'var(--font-numeric)' }}>
                                                {entry.workDays}/{entry.totalDays} يوم
                                            </span>
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'left', flexShrink: 0 }}>
                                        <div style={{
                                            fontSize: 12, fontWeight: 800,
                                            color: entry.netSalary >= entry.baseSalary ? '#22c55e' : '#ef4444',
                                            fontFamily: 'var(--font-numeric)',
                                        }}>
                                            {formatCurrency(entry.netSalary)}
                                        </div>
                                        <div style={{ fontSize: 8, color: 'var(--text-muted)' }}>صافي</div>
                                    </div>
                                    {isExpanded ? <ChevronUp size={14} style={{ color: 'var(--text-muted)' }} /> :
                                        <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />}
                                </button>

                                {/* Expanded details */}
                                {isExpanded && (
                                    <div style={{ padding: '0 14px 12px', borderTop: '1px solid var(--border-glass)' }}>
                                        {/* Base salary */}
                                        <div style={{ padding: '8px 0', display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                                            <span style={{ fontWeight: 600 }}>💵 الراتب الاسمي</span>
                                            <span style={{ fontWeight: 800, fontFamily: 'var(--font-numeric)', color: '#3b82f6' }}>
                                                {formatCurrency(entry.baseSalary)}
                                            </span>
                                        </div>

                                        {/* Points Summary */}
                                        <div style={{
                                            padding: '8px 10px', borderRadius: 'var(--radius-md)',
                                            background: 'rgba(234,179,8,0.06)', border: '1px solid rgba(234,179,8,0.12)',
                                            marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <Star size={14} style={{ color: '#eab308' }} />
                                                <span style={{ fontSize: 11, fontWeight: 700, color: '#eab308' }}>رصيد النقاط</span>
                                            </div>
                                            <div style={{ textAlign: 'left' }}>
                                                <span style={{ fontSize: 13, fontWeight: 800, fontFamily: 'var(--font-numeric)', color: '#eab308' }}>
                                                    {entry.pointsBalance.toLocaleString()}
                                                </span>
                                                <span style={{ fontSize: 9, color: 'var(--text-muted)', marginRight: 6, fontFamily: 'var(--font-numeric)' }}>
                                                    {' '}≈ {entry.pointsValue.toLocaleString()} د.ع
                                                </span>
                                            </div>
                                        </div>

                                        {/* Attendance Summary */}
                                        <div style={{
                                            padding: '8px 10px', borderRadius: 'var(--radius-md)',
                                            background: 'rgba(255,255,255,0.03)', marginBottom: 8,
                                        }}>
                                            <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 6, color: 'var(--text-secondary)' }}>
                                                📊 ملخص الحضور
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, fontSize: 9 }}>
                                                <div style={{ textAlign: 'center', padding: '5px 4px', borderRadius: 'var(--radius-sm)', background: 'rgba(34,197,94,0.08)' }}>
                                                    <div style={{ fontSize: 13, fontWeight: 800, color: '#22c55e', fontFamily: 'var(--font-numeric)' }}>{entry.workDays}</div>
                                                    <div style={{ color: 'var(--text-muted)' }}>حضور</div>
                                                </div>
                                                <div style={{ textAlign: 'center', padding: '5px 4px', borderRadius: 'var(--radius-sm)', background: 'rgba(239,68,68,0.08)' }}>
                                                    <div style={{ fontSize: 13, fontWeight: 800, color: '#ef4444', fontFamily: 'var(--font-numeric)' }}>{entry.absentDays}</div>
                                                    <div style={{ color: 'var(--text-muted)' }}>غياب</div>
                                                </div>
                                                <div style={{ textAlign: 'center', padding: '5px 4px', borderRadius: 'var(--radius-sm)', background: 'rgba(245,158,11,0.08)' }}>
                                                    <div style={{ fontSize: 13, fontWeight: 800, color: '#f59e0b', fontFamily: 'var(--font-numeric)' }}>{entry.lateDays}</div>
                                                    <div style={{ color: 'var(--text-muted)' }}>تأخير</div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Changes & Issuance Profits Inputs */}
                                        {(showChanges || showIssuance) && (
                                            <div style={{
                                                padding: '8px 10px', borderRadius: 'var(--radius-md)',
                                                background: 'rgba(139,92,246,0.05)', border: '1px solid rgba(139,92,246,0.12)',
                                                marginBottom: 8,
                                            }}>
                                                <div style={{ fontSize: 10, fontWeight: 700, color: '#8b5cf6', marginBottom: 6 }}>
                                                    💼 مخصصات القسم
                                                </div>
                                                <div style={{ display: 'grid', gridTemplateColumns: showChanges && showIssuance ? '1fr 1fr' : '1fr', gap: 6 }}>
                                                    {showChanges && (
                                                        <div>
                                                            <label style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 3, display: 'block', textAlign: 'center' }}>
                                                                أرباح التغييرات
                                                            </label>
                                                            <input
                                                                type="number"
                                                                value={overrides[entry.employee.id]?.changesAmount || ''}
                                                                onChange={e => updateOverride(entry.employee.id, 'changesAmount', Number(e.target.value) || 0)}
                                                                placeholder="0"
                                                                style={{
                                                                    width: '100%', padding: '5px 8px', borderRadius: 'var(--radius-sm)',
                                                                    background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-glass)',
                                                                    color: 'var(--text-primary)', fontSize: 12, fontFamily: 'var(--font-numeric)',
                                                                    textAlign: 'center',
                                                                }}
                                                            />
                                                        </div>
                                                    )}
                                                    {showIssuance && (
                                                        <div>
                                                            <label style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 3, display: 'block', textAlign: 'center' }}>
                                                                أرباح الإصدارات
                                                            </label>
                                                            <input
                                                                type="number"
                                                                value={overrides[entry.employee.id]?.issuanceProfitsAmount || ''}
                                                                onChange={e => updateOverride(entry.employee.id, 'issuanceProfitsAmount', Number(e.target.value) || 0)}
                                                                placeholder="0"
                                                                style={{
                                                                    width: '100%', padding: '5px 8px', borderRadius: 'var(--radius-sm)',
                                                                    background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-glass)',
                                                                    color: 'var(--text-primary)', fontSize: 12, fontFamily: 'var(--font-numeric)',
                                                                    textAlign: 'center',
                                                                }}
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {/* Additions */}
                                        {entry.totalAdditions > 0 && (
                                            <div style={{
                                                padding: '8px 10px', borderRadius: 'var(--radius-md)',
                                                background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.12)',
                                                marginBottom: 6,
                                            }}>
                                                <div style={{ fontSize: 10, fontWeight: 700, color: '#22c55e', marginBottom: 4 }}>
                                                    ✅ الإضافات
                                                </div>
                                                {entry.changesAmount > 0 && (
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 2 }}>
                                                        <span style={{ color: 'var(--text-muted)' }}>أرباح التغييرات</span>
                                                        <span style={{ color: '#22c55e', fontWeight: 700, fontFamily: 'var(--font-numeric)' }}>+{formatCurrency(entry.changesAmount)}</span>
                                                    </div>
                                                )}
                                                {entry.issuanceProfitsAmount > 0 && (
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 2 }}>
                                                        <span style={{ color: 'var(--text-muted)' }}>أرباح الإصدارات</span>
                                                        <span style={{ color: '#22c55e', fontWeight: 700, fontFamily: 'var(--font-numeric)' }}>+{formatCurrency(entry.issuanceProfitsAmount)}</span>
                                                    </div>
                                                )}
                                                <div style={{ borderTop: '1px solid rgba(34,197,94,0.15)', paddingTop: 3, marginTop: 3, display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                                                    <span style={{ fontWeight: 700, color: '#22c55e' }}>إجمالي الإضافات</span>
                                                    <span style={{ fontWeight: 800, color: '#22c55e', fontFamily: 'var(--font-numeric)' }}>+{formatCurrency(entry.totalAdditions)}</span>
                                                </div>
                                            </div>
                                        )}

                                        {/* Deductions */}
                                        {entry.totalDeductions > 0 && (
                                            <div style={{
                                                padding: '8px 10px', borderRadius: 'var(--radius-md)',
                                                background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.12)',
                                                marginBottom: 6,
                                            }}>
                                                <div style={{ fontSize: 10, fontWeight: 700, color: '#ef4444', marginBottom: 4 }}>
                                                    ❌ الاستقطاعات
                                                </div>
                                                {entry.absentDeduction > 0 && (
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 2 }}>
                                                        <span style={{ color: 'var(--text-muted)' }}>خصم الغياب ({entry.absentDays} يوم)</span>
                                                        <span style={{ color: '#ef4444', fontWeight: 700, fontFamily: 'var(--font-numeric)' }}>-{formatCurrency(entry.absentDeduction)}</span>
                                                    </div>
                                                )}
                                                {entry.lateDeduction > 0 && (
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 2 }}>
                                                        <span style={{ color: 'var(--text-muted)' }}>خصم التأخير ({entry.lateMinutes} دقيقة)</span>
                                                        <span style={{ color: '#ef4444', fontWeight: 700, fontFamily: 'var(--font-numeric)' }}>-{formatCurrency(entry.lateDeduction)}</span>
                                                    </div>
                                                )}
                                                <div style={{ borderTop: '1px solid rgba(239,68,68,0.15)', paddingTop: 3, marginTop: 3, display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                                                    <span style={{ fontWeight: 700, color: '#ef4444' }}>إجمالي الاستقطاعات</span>
                                                    <span style={{ fontWeight: 800, color: '#ef4444', fontFamily: 'var(--font-numeric)' }}>-{formatCurrency(entry.totalDeductions)}</span>
                                                </div>
                                            </div>
                                        )}

                                        {/* Net Salary */}
                                        <div style={{
                                            padding: '10px 12px', borderRadius: 'var(--radius-md)',
                                            background: 'linear-gradient(135deg, rgba(59,130,246,0.1), rgba(139,92,246,0.08))',
                                            border: '1px solid rgba(59,130,246,0.2)',
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        }}>
                                            <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)' }}>
                                                💰 صافي الراتب
                                            </span>
                                            <span style={{
                                                fontSize: 15, fontWeight: 800,
                                                color: entry.netSalary >= 0 ? '#22c55e' : '#ef4444',
                                                fontFamily: 'var(--font-numeric)',
                                            }}>
                                                {formatCurrency(entry.netSalary)}
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {/* Save Button */}
                    <button onClick={saveOverrides} disabled={saving}
                        style={{
                            width: '100%', padding: '10px', borderRadius: 'var(--radius-md)',
                            background: saving ? 'var(--bg-glass-strong)' : 'linear-gradient(135deg, #22c55e, #16a34a)',
                            color: 'white', fontSize: 12, fontWeight: 700,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                            opacity: saving ? 0.6 : 1,
                        }}
                    >
                        {saving ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={14} />}
                        {saving ? 'جاري الحفظ...' : 'حفظ كشف الرواتب'}
                    </button>
                </div>
            )}
        </div>
    );
}
