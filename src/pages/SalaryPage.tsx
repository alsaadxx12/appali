import React, { useState } from 'react';
import {
    Wallet, TrendingUp, TrendingDown, Calendar, Clock,
    ChevronDown, ChevronUp, DollarSign, Award, Minus, Plus,
    CheckCircle, AlertTriangle, Timer
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function SalaryPage() {
    const { user } = useAuth();
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
    const [showBreakdown, setShowBreakdown] = useState(false);

    if (!user) return null;

    const months = [
        'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
        'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
    ];

    // Salary data — will be loaded from Firestore
    const baseSalary = 0;
    const attendanceBonus = 0;
    const overtimeBonus = 0;
    const lateDeduction = 0;
    const absentDeduction = 0;
    const totalAdditions = attendanceBonus + overtimeBonus;
    const totalDeductions = lateDeduction + absentDeduction;
    const netSalary = baseSalary + totalAdditions - totalDeductions;

    const salaryItems = [
        { label: 'الراتب الأساسي', amount: baseSalary, type: 'base' as const },
        { label: 'مكافأة الحضور', amount: attendanceBonus, type: 'add' as const },
        { label: 'مكافأة الوقت الإضافي', amount: overtimeBonus, type: 'add' as const },
        { label: 'خصم التأخير', amount: lateDeduction, type: 'deduct' as const },
        { label: 'خصم الغياب', amount: absentDeduction, type: 'deduct' as const },
    ];

    // Force English numerals
    const formatCurrency = (amount: number) => {
        return amount.toLocaleString('en-US') + ' د.ع';
    };

    // Attendance summary — will be loaded from Firestore
    const attendanceSummary = {
        totalDays: 0,
        presentDays: 0,
        lateDays: 0,
        absentDays: 0,
        overtimeHours: 0,
    };

    return (
        <div className="page-content page-enter">

            {/* Month Selector */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
                {months.map((month, idx) => (
                    <button
                        key={idx}
                        onClick={() => setSelectedMonth(idx)}
                        style={{
                            padding: '8px 14px',
                            borderRadius: 'var(--radius-full)',
                            fontSize: 11,
                            fontWeight: 700,
                            whiteSpace: 'nowrap',
                            border: '1px solid',
                            borderColor: selectedMonth === idx ? 'var(--accent-blue)' : 'var(--border-glass)',
                            background: selectedMonth === idx ? 'var(--accent-blue-soft)' : 'var(--bg-glass)',
                            color: selectedMonth === idx ? 'var(--accent-blue)' : 'var(--text-muted)',
                            transition: 'all 200ms ease',
                        }}
                    >
                        {month}
                    </button>
                ))}
            </div>

            {/* Net Salary Card */}
            <div className="glass-card" style={{
                padding: '24px 20px', marginBottom: 16,
                textAlign: 'center', position: 'relative', overflow: 'hidden',
            }}>
                <div style={{
                    position: 'absolute', top: -40, right: -40, width: 120, height: 120,
                    borderRadius: '50%', background: 'var(--accent-emerald)', opacity: 0.06, filter: 'blur(30px)',
                }} />
                <div style={{
                    position: 'absolute', bottom: -30, left: -30, width: 100, height: 100,
                    borderRadius: '50%', background: 'var(--accent-blue)', opacity: 0.06, filter: 'blur(25px)',
                }} />

                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
                    صافي الراتب — {months[selectedMonth]}
                </div>
                <div style={{
                    fontSize: 32, fontWeight: 800, fontFamily: 'var(--font-numeric)',
                    background: 'linear-gradient(135deg, var(--accent-emerald), var(--accent-teal))',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    marginBottom: 8,
                }}>
                    {formatCurrency(netSalary)}
                </div>

                {/* Additions & Deductions summary */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: 20, fontSize: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--accent-emerald)' }}>
                        <TrendingUp size={14} />
                        <span style={{ fontFamily: 'var(--font-numeric)' }}>+{formatCurrency(totalAdditions)}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--accent-rose)' }}>
                        <TrendingDown size={14} />
                        <span style={{ fontFamily: 'var(--font-numeric)' }}>-{formatCurrency(totalDeductions)}</span>
                    </div>
                </div>
            </div>

            {/* Attendance Summary - Horizontal Row */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <div className="glass-card" style={{
                    flex: 1, padding: '14px 8px', textAlign: 'center',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                }}>
                    <div style={{
                        width: 34, height: 34, borderRadius: '50%',
                        background: 'var(--accent-emerald-soft)', color: 'var(--accent-emerald)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <CheckCircle size={16} />
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent-emerald)', fontFamily: 'var(--font-numeric)' }}>
                        {attendanceSummary.presentDays}
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600 }}>يوم حضور</div>
                </div>

                <div className="glass-card" style={{
                    flex: 1, padding: '14px 8px', textAlign: 'center',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                }}>
                    <div style={{
                        width: 34, height: 34, borderRadius: '50%',
                        background: 'var(--accent-amber-soft, rgba(245,158,11,0.15))', color: 'var(--accent-amber)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <AlertTriangle size={16} />
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent-amber)', fontFamily: 'var(--font-numeric)' }}>
                        {attendanceSummary.lateDays}
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600 }}>يوم تأخير</div>
                </div>

                <div className="glass-card" style={{
                    flex: 1, padding: '14px 8px', textAlign: 'center',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                }}>
                    <div style={{
                        width: 34, height: 34, borderRadius: '50%',
                        background: 'var(--accent-blue-soft)', color: 'var(--accent-blue)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <Timer size={16} />
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent-blue)', fontFamily: 'var(--font-numeric)' }}>
                        {attendanceSummary.overtimeHours}
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600 }}>ساعة إضافية</div>
                </div>
            </div>

            {/* Salary Breakdown */}
            <button
                onClick={() => setShowBreakdown(!showBreakdown)}
                className="glass-card"
                style={{
                    width: '100%', padding: '14px 16px', marginBottom: 2,
                    display: 'flex', alignItems: 'center', gap: 10,
                    textAlign: 'right', cursor: 'pointer',
                    borderRadius: showBreakdown ? 'var(--radius-lg) var(--radius-lg) 0 0' : 'var(--radius-lg)',
                }}
            >
                <Wallet size={18} style={{ color: 'var(--accent-blue)' }} />
                <span style={{ flex: 1, fontSize: 14, fontWeight: 700 }}>تفاصيل الراتب</span>
                {showBreakdown ? <ChevronUp size={18} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={18} style={{ color: 'var(--text-muted)' }} />}
            </button>

            {showBreakdown && (
                <div style={{
                    padding: '4px 0 8px',
                    background: 'var(--bg-glass)',
                    border: '1px solid var(--border-glass)',
                    borderTop: 'none',
                    borderRadius: '0 0 var(--radius-lg) var(--radius-lg)',
                    marginBottom: 16,
                }}>
                    {salaryItems.map((item, idx) => (
                        <div
                            key={idx}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                padding: '12px 16px',
                                borderBottom: idx < salaryItems.length - 1 ? '1px solid var(--border-glass)' : 'none',
                            }}
                        >
                            <div style={{
                                width: 32, height: 32, borderRadius: 'var(--radius-md)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                background: item.type === 'deduct' ? 'var(--accent-rose-soft)' : item.type === 'add' ? 'var(--accent-emerald-soft)' : 'var(--accent-blue-soft)',
                                color: item.type === 'deduct' ? 'var(--accent-rose)' : item.type === 'add' ? 'var(--accent-emerald)' : 'var(--accent-blue)',
                            }}>
                                {item.type === 'deduct' ? <Minus size={14} /> : item.type === 'add' ? <Plus size={14} /> : <DollarSign size={14} />}
                            </div>
                            <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{item.label}</span>
                            <span style={{
                                fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-numeric)',
                                color: item.type === 'deduct' ? 'var(--accent-rose)' : item.type === 'add' ? 'var(--accent-emerald)' : 'var(--text-primary)',
                            }}>
                                {item.type === 'deduct' ? '-' : item.type === 'add' ? '+' : ''}{formatCurrency(item.amount)}
                            </span>
                        </div>
                    ))}

                    {/* Net total */}
                    <div style={{
                        display: 'flex', alignItems: 'center',
                        padding: '14px 16px', margin: '4px 12px 0',
                        borderRadius: 'var(--radius-md)',
                        background: 'linear-gradient(135deg, rgba(16,185,129,0.1), rgba(20,184,166,0.1))',
                        border: '1px solid rgba(16,185,129,0.2)',
                    }}>
                        <Award size={18} style={{ color: 'var(--accent-emerald)', marginLeft: 10 }} />
                        <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: 'var(--accent-emerald)' }}>
                            صافي الراتب
                        </span>
                        <span style={{
                            fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-numeric)',
                            color: 'var(--accent-emerald)',
                        }}>
                            {formatCurrency(netSalary)}
                        </span>
                    </div>
                </div>
            )}

            {/* Salary History */}
            <h3 className="section-title" style={{ fontSize: 14, marginTop: 16 }}>
                <Calendar size={16} />
                سجل الرواتب
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div className="glass-card" style={{ textAlign: 'center', padding: '30px 20px' }}>
                    <Wallet size={32} style={{ color: 'var(--text-muted)', margin: '0 auto 10px', display: 'block' }} />
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>لا يوجد سجل رواتب</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>ستظهر بيانات الرواتب هنا عند توفرها</div>
                </div>
            </div>
        </div>
    );
}
