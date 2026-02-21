import React, { useState, useEffect, useMemo } from 'react';
import {
    Calendar, Clock, Check, X, Send, Plus, CalendarDays,
    ChevronDown, Loader, AlertTriangle, Palmtree, HeartPulse,
    User, Siren, Timer, Sparkles, FileText, Briefcase,
    GraduationCap, Home, Baby, CalendarCheck, ArrowLeftRight
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { doc, getDoc, collection, addDoc, query, where, getDocs, orderBy } from 'firebase/firestore';

interface LeaveType {
    id: string;
    label: string;
    emoji: string;
    color: string;
}

interface VipLevelData {
    id: string;
    label: string;
    emoji: string;
    color: string;
    minPoints: number;
}

interface LeaveRequest {
    id: string;
    employeeId: string;
    employeeName: string;
    type: string;
    startDate: string;
    endDate: string;
    reason: string;
    status: 'pending' | 'approved' | 'rejected';
    createdAt: string;
    reviewedBy?: string;
    reviewedAt?: string;
    days: number;
}

// Modern icon mapper — maps leave type labels/ids to lucide-react icons
const getLeaveIcon = (label: string, id: string): React.ReactNode => {
    const lower = (label + ' ' + id).toLowerCase();
    if (lower.includes('سنوي') || lower.includes('annual')) return <Palmtree size={20} />;
    if (lower.includes('مرضي') || lower.includes('sick')) return <HeartPulse size={20} />;
    if (lower.includes('شخصي') || lower.includes('personal')) return <User size={20} />;
    if (lower.includes('طوارئ') || lower.includes('emergency')) return <Siren size={20} />;
    if (lower.includes('زمني') || lower.includes('ساع') || lower.includes('time')) return <Timer size={20} />;
    if (lower.includes('ظرف') || lower.includes('خاص') || lower.includes('special')) return <Sparkles size={20} />;
    if (lower.includes('دراس') || lower.includes('study')) return <GraduationCap size={20} />;
    if (lower.includes('أمومة') || lower.includes('أبوة') || lower.includes('maternity')) return <Baby size={20} />;
    if (lower.includes('عمل') || lower.includes('work')) return <Briefcase size={20} />;
    if (lower.includes('منزل') || lower.includes('home')) return <Home size={20} />;
    return <CalendarDays size={20} />;
};

// Circular progress ring component
const ProgressRing = ({ pct, color, size = 52, strokeWidth = 3.5 }: { pct: number; color: string; size?: number; strokeWidth?: number }) => {
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (pct / 100) * circumference;
    return (
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', position: 'absolute', inset: 0 }}>
            <circle
                cx={size / 2} cy={size / 2} r={radius}
                fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={strokeWidth}
            />
            <circle
                cx={size / 2} cy={size / 2} r={radius}
                fill="none" stroke={color} strokeWidth={strokeWidth}
                strokeDasharray={circumference} strokeDashoffset={offset}
                strokeLinecap="round"
                style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.4,0,0.2,1)' }}
            />
        </svg>
    );
};

export default function LeavePage() {
    const { user } = useAuth();
    const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
    const [levelAllowances, setLevelAllowances] = useState<Record<string, Record<string, number>>>({});
    const [vipLevels, setVipLevels] = useState<VipLevelData[]>([]);
    const [defaultLevel, setDefaultLevel] = useState<string>('none');
    const [requests, setRequests] = useState<LeaveRequest[]>([]);
    const [loading, setLoading] = useState(true);

    // Form
    const [showForm, setShowForm] = useState(false);
    const [formType, setFormType] = useState('');
    const [formStartDate, setFormStartDate] = useState('');
    const [formEndDate, setFormEndDate] = useState('');
    const [formStartTime, setFormStartTime] = useState('');
    const [formEndTime, setFormEndTime] = useState('');
    const [formReason, setFormReason] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    // Check if selected type is time-based
    const isTimeBased = (() => {
        const selectedType = leaveTypes.find(lt => lt.id === formType);
        return selectedType?.label?.includes('زمنية') || selectedType?.label?.includes('ساع') || false;
    })();

    useEffect(() => {
        if (user) loadData();
    }, [user]);

    const loadData = async () => {
        try {
            // Load VIP levels
            const vipSnap = await getDoc(doc(db, 'settings', 'vip'));
            let lvls: VipLevelData[] = [];
            let defLvl = 'none';
            if (vipSnap.exists()) {
                const data = vipSnap.data();
                if (data.levels) { lvls = data.levels; setVipLevels(data.levels); }
                if (data.defaultLevel) { defLvl = data.defaultLevel; setDefaultLevel(data.defaultLevel); }
            }

            // Load leave settings
            const leaveSnap = await getDoc(doc(db, 'settings', 'leaves'));
            if (leaveSnap.exists()) {
                const data = leaveSnap.data();
                if (data.leaveTypes) setLeaveTypes(data.leaveTypes);
                if (data.levelAllowances) setLevelAllowances(data.levelAllowances);
            }

            // Also check vipBenefits for leave allowances (source of truth)
            const benefitsSnap = await getDoc(doc(db, 'settings', 'vipBenefits'));
            if (benefitsSnap.exists()) {
                const bData = benefitsSnap.data();
                if (bData.benefits) {
                    const allowances: Record<string, Record<string, number>> = {};
                    Object.entries(bData.benefits).forEach(([levelId, b]: [string, any]) => {
                        if (b.leaveAllowances) allowances[levelId] = b.leaveAllowances;
                    });
                    if (Object.keys(allowances).length > 0) setLevelAllowances(allowances);
                }
            }

            // Load user's leave requests
            if (user) {
                const q = query(
                    collection(db, 'leaves'),
                    where('employeeId', '==', user.id),
                );
                const snap = await getDocs(q);
                const reqs: LeaveRequest[] = [];
                snap.forEach(d => {
                    reqs.push({ id: d.id, ...d.data() } as LeaveRequest);
                });
                reqs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
                setRequests(reqs);
            }
        } catch (e) {
            console.error('Error loading leave data:', e);
        } finally {
            setLoading(false);
        }
    };

    // Compute user's VIP level
    const getUserLevel = (): string => {
        if (!user) return 'none';
        const userPoints = (user as any).points || 0;
        const sorted = [...vipLevels].sort((a, b) => b.minPoints - a.minPoints);
        for (const lvl of sorted) {
            if (userPoints >= lvl.minPoints) return lvl.id;
        }
        if (defaultLevel && defaultLevel !== 'none') return defaultLevel;
        return 'none';
    };

    const userLevel = getUserLevel();
    const userAllowances = levelAllowances[userLevel] || {};

    // Compute used days per type (approved + pending)
    const getUsedDays = (typeId: string): number => {
        return requests
            .filter(r => r.type === typeId && (r.status === 'approved' || r.status === 'pending'))
            .reduce((sum, r) => sum + (r.days || 0), 0);
    };

    const calcDays = (start: string, end: string): number => {
        if (!start || !end) return 0;
        const s = new Date(start);
        const e = new Date(end);
        const diff = Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        return Math.max(0, diff);
    };

    const handleSubmit = async () => {
        if (!user || !formType || !formStartDate || !formEndDate || !formReason.trim()) return;
        if (isTimeBased && (!formStartTime || !formEndTime)) return;
        const days = calcDays(formStartDate, formEndDate);
        if (days <= 0) return;

        setSubmitting(true);
        try {
            const leaveData: any = {
                employeeId: user.id,
                employeeName: user.name,
                type: formType,
                startDate: formStartDate,
                endDate: formEndDate,
                reason: formReason.trim(),
                status: 'pending',
                days,
                createdAt: new Date().toISOString(),
            };
            if (isTimeBased) {
                leaveData.isTimeBased = true;
                leaveData.startTime = formStartTime;
                leaveData.endTime = formEndTime;
            }
            await addDoc(collection(db, 'leaves'), leaveData);
            setSubmitted(true);
            setTimeout(() => {
                setSubmitted(false);
                setShowForm(false);
                setFormType('');
                setFormStartDate('');
                setFormEndDate('');
                setFormStartTime('');
                setFormEndTime('');
                setFormReason('');
                loadData();
            }, 1500);
        } catch (e) {
            console.error('Error submitting leave:', e);
            alert('حدث خطأ أثناء تقديم الطلب');
        } finally {
            setSubmitting(false);
        }
    };

    const getStatusConfig = (status: string) => {
        switch (status) {
            case 'approved': return { label: 'مقبول', color: '#22c55e', bg: 'rgba(34,197,94,0.1)', icon: <Check size={13} strokeWidth={2.5} /> };
            case 'rejected': return { label: 'مرفوض', color: '#ef4444', bg: 'rgba(239,68,68,0.1)', icon: <X size={13} strokeWidth={2.5} /> };
            default: return { label: 'قيد المراجعة', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', icon: <Clock size={13} strokeWidth={2.5} /> };
        }
    };

    const currentLevelData = vipLevels.find(l => l.id === userLevel);

    if (loading) {
        return (
            <div className="page-content page-enter" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
                <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    <div className="leave-loading-icon">
                        <CalendarDays size={28} style={{ opacity: 0.5 }} />
                    </div>
                    <div style={{ fontSize: 13, marginTop: 12 }}>جاري التحميل...</div>
                </div>
            </div>
        );
    }

    return (
        <div className="page-content page-enter">
            {/* === Header Card === */}
            <div className="leave-header-card glass-card" style={{
                padding: '22px 20px', marginBottom: 18,
                background: 'linear-gradient(135deg, rgba(59,130,246,0.12), rgba(139,92,246,0.08), rgba(59,130,246,0.05))',
                border: '1px solid rgba(99,102,241,0.15)',
                position: 'relative',
                overflow: 'hidden',
            }}>
                {/* Decorative glow */}
                <div style={{
                    position: 'absolute', top: -30, left: -30,
                    width: 100, height: 100, borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)',
                    pointerEvents: 'none',
                }} />
                <div style={{
                    position: 'absolute', bottom: -20, right: -20,
                    width: 80, height: 80, borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(59,130,246,0.1) 0%, transparent 70%)',
                    pointerEvents: 'none',
                }} />

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, position: 'relative' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                            width: 42, height: 42, borderRadius: 14,
                            background: 'linear-gradient(135deg, rgba(99,102,241,0.25), rgba(139,92,246,0.2))',
                            border: '1px solid rgba(139,92,246,0.2)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#a78bfa',
                        }}>
                            <CalendarCheck size={22} />
                        </div>
                        <div>
                            <h2 style={{ fontSize: 19, fontWeight: 900, margin: 0, letterSpacing: '-0.3px' }}>الإجازات</h2>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, fontWeight: 500 }}>رصيدك وطلبات الإجازة</div>
                        </div>
                    </div>
                    {currentLevelData && (
                        <div className="leave-vip-badge" style={{
                            padding: '5px 14px', borderRadius: 20,
                            background: `${currentLevelData.color}15`,
                            border: `1px solid ${currentLevelData.color}25`,
                            fontSize: 11, fontWeight: 700, color: currentLevelData.color,
                            display: 'flex', alignItems: 'center', gap: 5,
                        }}>
                            <Sparkles size={13} />
                            {currentLevelData.label}
                        </div>
                    )}
                </div>

                {/* Leave Balance Cards */}
                {leaveTypes.length > 0 ? (
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(${Math.min(leaveTypes.length, 4)}, 1fr)`,
                        gap: 10,
                    }}>
                        {leaveTypes.map((lt, idx) => {
                            const total = userAllowances[lt.id] || 0;
                            const used = getUsedDays(lt.id);
                            const remaining = Math.max(0, total - used);
                            const pct = total > 0 ? (remaining / total) * 100 : 0;

                            return (
                                <div
                                    key={lt.id}
                                    className="leave-balance-card"
                                    style={{
                                        textAlign: 'center', padding: '14px 6px 12px',
                                        borderRadius: 16,
                                        background: 'rgba(255,255,255,0.03)',
                                        border: `1px solid ${lt.color}18`,
                                        position: 'relative',
                                        animationDelay: `${idx * 80}ms`,
                                        transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)',
                                    }}
                                >
                                    {/* Icon with progress ring */}
                                    <div style={{
                                        width: 52, height: 52, margin: '0 auto 8px',
                                        position: 'relative',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}>
                                        <ProgressRing pct={pct} color={lt.color} />
                                        <div style={{
                                            width: 36, height: 36, borderRadius: 12,
                                            background: `linear-gradient(135deg, ${lt.color}20, ${lt.color}10)`,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            color: lt.color,
                                            position: 'relative', zIndex: 1,
                                        }}>
                                            {getLeaveIcon(lt.label, lt.id)}
                                        </div>
                                    </div>

                                    <div style={{
                                        fontSize: 9, color: 'var(--text-muted)', fontWeight: 600,
                                        marginBottom: 4, letterSpacing: '0.2px',
                                    }}>
                                        {lt.label}
                                    </div>

                                    <div style={{
                                        fontSize: 24, fontWeight: 900, fontFamily: 'var(--font-numeric)',
                                        color: remaining > 0 ? lt.color : 'var(--text-muted)',
                                        lineHeight: 1.1,
                                    }}>
                                        {remaining}
                                    </div>
                                    <div style={{
                                        fontSize: 8, color: 'var(--text-muted)', marginTop: 2,
                                        fontFamily: 'var(--font-numeric)',
                                    }}>
                                        من {total} يوم
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: 12 }}>
                        <div style={{
                            width: 44, height: 44, borderRadius: 14, margin: '0 auto 10px',
                            background: 'rgba(245,158,11,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#f59e0b',
                        }}>
                            <AlertTriangle size={22} />
                        </div>
                        لم يتم إعداد أنواع الإجازات بعد
                    </div>
                )}
            </div>

            {/* === Request Leave Button / Form === */}
            {showForm ? (
                <div className="glass-card leave-form-card" style={{
                    padding: '20px', marginBottom: 18,
                    border: '1px solid rgba(99,102,241,0.2)',
                    background: 'rgba(255,255,255,0.03)',
                }}>
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        fontSize: 15, fontWeight: 800, marginBottom: 16,
                    }}>
                        <div style={{
                            width: 34, height: 34, borderRadius: 10,
                            background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.15))',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#a78bfa',
                        }}>
                            <FileText size={17} />
                        </div>
                        طلب إجازة جديد
                    </div>

                    {/* Leave type select */}
                    <div style={{ marginBottom: 14 }}>
                        <div style={{
                            fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8,
                            display: 'flex', alignItems: 'center', gap: 5,
                        }}>
                            <CalendarDays size={13} />
                            نوع الإجازة
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {leaveTypes.map(lt => {
                                const total = userAllowances[lt.id] || 0;
                                const used = getUsedDays(lt.id);
                                const remaining = Math.max(0, total - used);
                                const isSelected = formType === lt.id;
                                return (
                                    <button key={lt.id} onClick={() => setFormType(lt.id)}
                                        className={`leave-type-chip ${isSelected ? 'active' : ''}`}
                                        style={{
                                            padding: '9px 14px', borderRadius: 12,
                                            background: isSelected ? `${lt.color}18` : 'rgba(255,255,255,0.04)',
                                            border: isSelected ? `1.5px solid ${lt.color}60` : '1px solid rgba(255,255,255,0.08)',
                                            color: isSelected ? lt.color : 'var(--text-secondary)',
                                            fontSize: 11, fontWeight: 700,
                                            display: 'flex', alignItems: 'center', gap: 7,
                                            opacity: remaining <= 0 ? 0.35 : 1,
                                            transition: 'all 0.25s ease',
                                        }}
                                        disabled={remaining <= 0}
                                    >
                                        <span style={{
                                            width: 26, height: 26, borderRadius: 8,
                                            background: isSelected ? `${lt.color}20` : 'rgba(255,255,255,0.06)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            color: isSelected ? lt.color : 'var(--text-muted)',
                                            flexShrink: 0,
                                        }}>
                                            {React.cloneElement(getLeaveIcon(lt.label, lt.id) as React.ReactElement, { size: 14 })}
                                        </span>
                                        {lt.label}
                                        <span style={{
                                            fontSize: 9, fontFamily: 'var(--font-numeric)',
                                            color: remaining > 0 ? (isSelected ? lt.color : 'var(--text-muted)') : '#ef4444',
                                            fontWeight: 800,
                                        }}>({remaining})</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Date range */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                        <div>
                            <div style={{
                                fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6,
                                display: 'flex', alignItems: 'center', gap: 4,
                            }}>
                                <Calendar size={12} /> من
                            </div>
                            <input type="date" value={formStartDate}
                                onChange={e => setFormStartDate(e.target.value)}
                                className="leave-date-input"
                                style={{
                                    width: '100%', padding: '11px 10px', borderRadius: 12,
                                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                                    color: 'var(--text-primary)', fontSize: 12, fontFamily: 'var(--font-numeric)',
                                    outline: 'none', transition: 'all 0.25s ease',
                                }}
                            />
                        </div>
                        <div>
                            <div style={{
                                fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6,
                                display: 'flex', alignItems: 'center', gap: 4,
                            }}>
                                <Calendar size={12} /> إلى
                            </div>
                            <input type="date" value={formEndDate}
                                onChange={e => setFormEndDate(e.target.value)}
                                min={formStartDate}
                                className="leave-date-input"
                                style={{
                                    width: '100%', padding: '11px 10px', borderRadius: 12,
                                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                                    color: 'var(--text-primary)', fontSize: 12, fontFamily: 'var(--font-numeric)',
                                    outline: 'none', transition: 'all 0.25s ease',
                                }}
                            />
                        </div>
                    </div>

                    {/* Time inputs for time-based leave */}
                    {isTimeBased && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                            <div>
                                <div style={{
                                    fontSize: 11, fontWeight: 600, color: '#a78bfa', marginBottom: 6,
                                    display: 'flex', alignItems: 'center', gap: 5,
                                }}>
                                    <Timer size={13} /> من الساعة
                                </div>
                                <input type="time" value={formStartTime}
                                    onChange={e => setFormStartTime(e.target.value)}
                                    className="leave-date-input"
                                    style={{
                                        width: '100%', padding: '11px 10px', borderRadius: 12,
                                        background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.18)',
                                        color: 'var(--text-primary)', fontSize: 12, fontFamily: 'var(--font-numeric)',
                                        outline: 'none', transition: 'all 0.25s ease',
                                    }}
                                />
                            </div>
                            <div>
                                <div style={{
                                    fontSize: 11, fontWeight: 600, color: '#a78bfa', marginBottom: 6,
                                    display: 'flex', alignItems: 'center', gap: 5,
                                }}>
                                    <Timer size={13} /> إلى الساعة
                                </div>
                                <input type="time" value={formEndTime}
                                    onChange={e => setFormEndTime(e.target.value)}
                                    className="leave-date-input"
                                    style={{
                                        width: '100%', padding: '11px 10px', borderRadius: 12,
                                        background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.18)',
                                        color: 'var(--text-primary)', fontSize: 12, fontFamily: 'var(--font-numeric)',
                                        outline: 'none', transition: 'all 0.25s ease',
                                    }}
                                />
                            </div>
                        </div>
                    )}

                    {/* Days summary */}
                    {formStartDate && formEndDate && (
                        <div style={{
                            padding: '10px 14px', borderRadius: 12,
                            background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(59,130,246,0.06))',
                            border: '1px solid rgba(99,102,241,0.12)',
                            fontSize: 12, fontWeight: 700, color: '#818cf8',
                            textAlign: 'center', marginBottom: 12,
                            fontFamily: 'var(--font-numeric)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        }}>
                            <CalendarDays size={15} />
                            {calcDays(formStartDate, formEndDate)} يوم
                            {isTimeBased && formStartTime && formEndTime && (
                                <span style={{ color: '#a78bfa', display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <Timer size={13} /> {formStartTime} → {formEndTime}
                                </span>
                            )}
                        </div>
                    )}

                    {/* Reason */}
                    <div style={{ marginBottom: 16 }}>
                        <div style={{
                            fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6,
                            display: 'flex', alignItems: 'center', gap: 4,
                        }}>
                            <FileText size={12} /> السبب
                        </div>
                        <textarea
                            value={formReason}
                            onChange={e => setFormReason(e.target.value)}
                            placeholder="اكتب سبب الإجازة..."
                            rows={3}
                            style={{
                                width: '100%', padding: '12px 14px', borderRadius: 12,
                                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                                color: 'var(--text-primary)', fontSize: 12, resize: 'vertical',
                                outline: 'none', transition: 'all 0.25s ease',
                                lineHeight: 1.6,
                            }}
                        />
                    </div>

                    {/* Buttons */}
                    <div style={{ display: 'flex', gap: 10 }}>
                        <button onClick={() => setShowForm(false)}
                            style={{
                                flex: 1, padding: '13px', borderRadius: 14,
                                background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)',
                                fontSize: 12, fontWeight: 600,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                                border: '1px solid rgba(255,255,255,0.08)',
                                transition: 'all 0.25s ease',
                            }}>
                            <X size={15} /> إلغاء
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={submitting || !formType || !formStartDate || !formEndDate || !formReason.trim() || (isTimeBased && (!formStartTime || !formEndTime))}
                            className="leave-submit-btn"
                            style={{
                                flex: 2, padding: '13px', borderRadius: 14,
                                background: submitted
                                    ? 'linear-gradient(135deg, rgba(34,197,94,0.2), rgba(16,185,129,0.15))'
                                    : 'linear-gradient(135deg, #6366f1, #4f46e5)',
                                color: submitted ? '#22c55e' : 'white',
                                fontSize: 13, fontWeight: 800,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                                opacity: (!formType || !formStartDate || !formEndDate || !formReason.trim() || (isTimeBased && (!formStartTime || !formEndTime))) ? 0.4 : 1,
                                transition: 'all 0.3s ease',
                                border: submitted ? '1px solid rgba(34,197,94,0.2)' : 'none',
                                boxShadow: submitted ? 'none' : '0 4px 16px rgba(99,102,241,0.3)',
                            }}>
                            {submitted ? (
                                <><Check size={17} strokeWidth={2.5} /> تم إرسال الطلب</>
                            ) : submitting ? (
                                <><Loader size={17} style={{ animation: 'spin 1s linear infinite' }} /> جاري الإرسال...</>
                            ) : (
                                <><Send size={17} /> إرسال الطلب</>
                            )}
                        </button>
                    </div>
                </div>
            ) : (
                <button onClick={() => setShowForm(true)}
                    className="leave-new-request-btn"
                    style={{
                        width: '100%', padding: '15px', borderRadius: 16,
                        background: 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(139,92,246,0.1))',
                        border: '1px solid rgba(99,102,241,0.2)',
                        color: '#818cf8', fontSize: 14, fontWeight: 800,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                        marginBottom: 20,
                        transition: 'all 0.3s ease',
                    }}>
                    <div style={{
                        width: 30, height: 30, borderRadius: 10,
                        background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.15))',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <Plus size={18} strokeWidth={2.5} />
                    </div>
                    طلب إجازة جديد
                </button>
            )}

            {/* === Leave History === */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                marginBottom: 14, padding: '0 2px',
            }}>
                <div style={{
                    width: 30, height: 30, borderRadius: 10,
                    background: 'rgba(59,130,246,0.12)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#60a5fa',
                }}>
                    <CalendarDays size={16} />
                </div>
                <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0, flex: 1 }}>
                    سجل الإجازات
                </h3>
                <span style={{
                    fontSize: 11, color: 'var(--text-muted)', fontWeight: 600,
                    padding: '3px 10px', borderRadius: 8,
                    background: 'rgba(255,255,255,0.05)',
                    fontFamily: 'var(--font-numeric)',
                }}>
                    {requests.length}
                </span>
            </div>

            {requests.length === 0 ? (
                <div className="glass-card" style={{
                    textAlign: 'center', padding: '36px 20px',
                    background: 'rgba(255,255,255,0.02)',
                }}>
                    <div style={{
                        width: 56, height: 56, borderRadius: 18, margin: '0 auto 14px',
                        background: 'rgba(255,255,255,0.04)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'var(--text-muted)',
                    }}>
                        <CalendarDays size={26} style={{ opacity: 0.5 }} />
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>
                        لا توجد طلبات إجازة
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', opacity: 0.7 }}>
                        اضغط على "طلب إجازة جديد" لتقديم طلب
                    </div>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 24 }}>
                    {requests.map((req, idx) => {
                        const lt = leaveTypes.find(t => t.id === req.type);
                        const sc = getStatusConfig(req.status);
                        const accentColor = lt?.color || '#6366f1';
                        return (
                            <div key={req.id}
                                className="leave-history-card glass-card"
                                style={{
                                    padding: '16px 18px',
                                    borderRight: `3px solid ${accentColor}`,
                                    position: 'relative',
                                    overflow: 'hidden',
                                    animationDelay: `${idx * 60}ms`,
                                }}
                            >
                                {/* Subtle accent glow */}
                                <div style={{
                                    position: 'absolute', top: 0, right: 0,
                                    width: 60, height: '100%',
                                    background: `linear-gradient(to left, ${accentColor}08, transparent)`,
                                    pointerEvents: 'none',
                                }} />

                                <div style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    marginBottom: 10, position: 'relative',
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <div style={{
                                            width: 38, height: 38, borderRadius: 12,
                                            background: `linear-gradient(135deg, ${accentColor}20, ${accentColor}10)`,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            color: accentColor,
                                            flexShrink: 0,
                                        }}>
                                            {getLeaveIcon(lt?.label || '', lt?.id || req.type)}
                                        </div>
                                        <div>
                                            <div style={{ fontSize: 13, fontWeight: 700 }}>{lt?.label || req.type}</div>
                                            <div style={{
                                                fontSize: 10, color: 'var(--text-muted)',
                                                fontFamily: 'var(--font-numeric)', marginTop: 1,
                                            }}>
                                                {new Date(req.createdAt).toLocaleDateString('ar-SA')}
                                            </div>
                                        </div>
                                    </div>
                                    <div className={`leave-status-badge ${req.status === 'pending' ? 'pending' : ''}`}
                                        style={{
                                            padding: '4px 12px', borderRadius: 10,
                                            background: sc.bg, color: sc.color,
                                            fontSize: 10, fontWeight: 700,
                                            display: 'flex', alignItems: 'center', gap: 4,
                                            border: `1px solid ${sc.color}20`,
                                        }}>
                                        {sc.icon} {sc.label}
                                    </div>
                                </div>

                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: 12,
                                    padding: '9px 12px', borderRadius: 10,
                                    background: 'rgba(255,255,255,0.03)',
                                    border: '1px solid rgba(255,255,255,0.05)',
                                    fontSize: 11, color: 'var(--text-secondary)',
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1 }}>
                                        <Calendar size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                                        <span style={{ fontFamily: 'var(--font-numeric)' }}>{req.startDate}</span>
                                        <ArrowLeftRight size={11} style={{ color: 'var(--text-muted)' }} />
                                        <span style={{ fontFamily: 'var(--font-numeric)' }}>{req.endDate}</span>
                                    </div>
                                    <div style={{
                                        fontWeight: 800, color: accentColor,
                                        fontFamily: 'var(--font-numeric)',
                                        padding: '2px 8px', borderRadius: 6,
                                        background: `${accentColor}10`,
                                        fontSize: 11,
                                    }}>
                                        {req.days} يوم
                                    </div>
                                </div>

                                {req.reason && (
                                    <div style={{
                                        fontSize: 11, color: 'var(--text-muted)',
                                        marginTop: 8, lineHeight: 1.6,
                                        paddingRight: 4,
                                    }}>
                                        {req.reason}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
