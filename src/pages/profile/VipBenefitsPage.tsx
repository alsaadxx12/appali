import React, { useState, useEffect } from 'react';
import {
    ArrowRight, Crown, Save, Check, Gift, Calendar,
    Zap, Star, Trophy, Target
} from 'lucide-react';
import { db } from '../../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

interface Props {
    onBack: () => void;
}

interface VipLevelData {
    id: string;
    label: string;
    emoji: string;
    color: string;
    minPoints: number;
}

interface LeaveType {
    id: string;
    label: string;
    emoji: string;
    color: string;
}

interface LevelBenefits {
    dailyPoints: number;
    weeklyPoints: number;
    monthlyPoints: number;
    yearlyPoints: number;
    leaveAllowances: Record<string, number>; // leaveTypeId -> days
}

const DEFAULT_BENEFITS: LevelBenefits = {
    dailyPoints: 0,
    weeklyPoints: 0,
    monthlyPoints: 0,
    yearlyPoints: 0,
    leaveAllowances: {},
};

const BONUS_TYPES = [
    { key: 'dailyPoints', label: 'مكافأة يومية', emoji: '⚡', color: '#f59e0b', unit: 'نقطة/يوم' },
    { key: 'weeklyPoints', label: 'مكافأة أسبوعية', emoji: '🌟', color: '#8b5cf6', unit: 'نقطة/أسبوع' },
    { key: 'monthlyPoints', label: 'مكافأة شهرية', emoji: '🏆', color: '#3b82f6', unit: 'نقطة/شهر' },
    { key: 'yearlyPoints', label: 'مكافأة سنوية', emoji: '🎯', color: '#10b981', unit: 'نقطة/سنة' },
];

export default function VipBenefitsPage({ onBack }: Props) {
    const [vipLevels, setVipLevels] = useState<VipLevelData[]>([]);
    const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
    const [benefits, setBenefits] = useState<Record<string, LevelBenefits>>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [expandedLevel, setExpandedLevel] = useState<string | null>(null);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            // Load VIP levels
            const vipSnap = await getDoc(doc(db, 'settings', 'vip'));
            if (vipSnap.exists()) {
                const data = vipSnap.data();
                if (data.levels) setVipLevels(data.levels);
            }

            // Load leave types
            const leaveSnap = await getDoc(doc(db, 'settings', 'leaves'));
            if (leaveSnap.exists()) {
                const data = leaveSnap.data();
                if (data.leaveTypes) setLeaveTypes(data.leaveTypes);
            }

            // Load benefits
            const benefitsSnap = await getDoc(doc(db, 'settings', 'vipBenefits'));
            if (benefitsSnap.exists()) {
                const data = benefitsSnap.data();
                if (data.benefits) setBenefits(data.benefits);
            }
        } catch (e) {
            console.error('Error loading benefits:', e);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await setDoc(doc(db, 'settings', 'vipBenefits'), {
                benefits,
                updatedAt: new Date().toISOString(),
            });
            // Also update leave allowances in settings/leaves for LeavePage to read
            const leaveSnap = await getDoc(doc(db, 'settings', 'leaves'));
            const leaveData = leaveSnap.exists() ? leaveSnap.data() : {};
            const levelAllowances: Record<string, Record<string, number>> = {};
            Object.entries(benefits).forEach(([levelId, b]) => {
                levelAllowances[levelId] = b.leaveAllowances || {};
            });
            await setDoc(doc(db, 'settings', 'leaves'), {
                ...leaveData,
                levelAllowances,
                updatedAt: new Date().toISOString(),
            });
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch (e) {
            console.error('Error saving benefits:', e);
            alert('حدث خطأ أثناء الحفظ');
        } finally {
            setSaving(false);
        }
    };

    const getBenefits = (levelId: string): LevelBenefits => benefits[levelId] || { ...DEFAULT_BENEFITS };

    const updateBenefit = (levelId: string, key: string, value: number) => {
        const current = getBenefits(levelId);
        setBenefits({
            ...benefits,
            [levelId]: { ...current, [key]: Math.max(0, value) },
        });
    };

    const updateLeaveAllowance = (levelId: string, typeId: string, value: number) => {
        const current = getBenefits(levelId);
        setBenefits({
            ...benefits,
            [levelId]: {
                ...current,
                leaveAllowances: {
                    ...(current.leaveAllowances || {}),
                    [typeId]: Math.max(0, value),
                },
            },
        });
    };

    const sortedLevels = [...vipLevels].sort((a, b) => a.minPoints - b.minPoints);

    if (loading) {
        return (
            <div className="page-content page-enter" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
                <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    <Gift size={32} style={{ margin: '0 auto 10px', display: 'block', opacity: 0.5 }} />
                    <div style={{ fontSize: 13 }}>جاري التحميل...</div>
                </div>
            </div>
        );
    }

    return (
        <div className="page-content page-enter">
            {/* Header */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                marginBottom: 20, padding: '4px 0',
            }}>
                <button onClick={onBack} style={{
                    width: 36, height: 36, borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-glass)', border: '1px solid var(--border-glass)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--text-secondary)',
                }}>
                    <ArrowRight size={18} />
                </button>
                <div style={{ flex: 1 }}>
                    <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>🎁 مزايا VIP</h2>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>مكافآت النقاط ورصيد الإجازات لكل مستوى</p>
                </div>
                <button onClick={handleSave} disabled={saving}
                    style={{
                        padding: '8px 16px', borderRadius: 'var(--radius-md)',
                        background: saved ? 'rgba(34,197,94,0.2)' : 'rgba(59,130,246,0.2)',
                        border: saved ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(59,130,246,0.3)',
                        color: saved ? '#22c55e' : '#3b82f6',
                        fontSize: 12, fontWeight: 700,
                        display: 'flex', alignItems: 'center', gap: 6,
                        transition: 'all 0.3s ease', opacity: saving ? 0.6 : 1,
                    }}>
                    {saved ? <Check size={14} /> : <Save size={14} />}
                    {saved ? 'تم ✓' : 'حفظ'}
                </button>
            </div>

            {sortedLevels.length === 0 ? (
                <div className="glass-card" style={{ textAlign: 'center', padding: '30px 16px' }}>
                    <Crown size={36} style={{ color: 'var(--text-muted)', margin: '0 auto 10px', display: 'block' }} />
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>
                        لا توجد مستويات VIP
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                        أضف مستويات من إعدادات VIP أولاً
                    </div>
                </div>
            ) : (
                sortedLevels.map((lvl, lvlIdx) => {
                    const b = getBenefits(lvl.id);
                    const isExpanded = expandedLevel === lvl.id;
                    const totalBonuses = b.dailyPoints + b.weeklyPoints + b.monthlyPoints + b.yearlyPoints;
                    const totalLeave = Object.values(b.leaveAllowances || {}).reduce((s, v) => s + v, 0);

                    return (
                        <div key={lvl.id} className="glass-card" style={{
                            padding: 0, marginBottom: 12, overflow: 'hidden',
                            border: isExpanded ? `1px solid ${lvl.color}30` : '1px solid var(--border-glass)',
                            transition: 'all 0.3s ease',
                        }}>
                            {/* Level header - clickable */}
                            <button
                                onClick={() => setExpandedLevel(isExpanded ? null : lvl.id)}
                                style={{
                                    width: '100%', padding: '14px 16px',
                                    display: 'flex', alignItems: 'center', gap: 12,
                                    background: isExpanded ? `${lvl.color}08` : 'transparent',
                                    transition: 'all 0.2s ease',
                                }}
                            >
                                <span style={{ fontSize: 28 }}>{lvl.emoji}</span>
                                <div style={{ flex: 1, textAlign: 'right' }}>
                                    <div style={{ fontSize: 14, fontWeight: 800, color: lvl.color }}>{lvl.label}</div>
                                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-numeric)' }}>
                                        من {lvl.minPoints.toLocaleString()} نقطة
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                    {totalBonuses > 0 && (
                                        <span style={{
                                            fontSize: 9, fontWeight: 700, padding: '2px 8px',
                                            borderRadius: 10, background: 'rgba(245,158,11,0.12)', color: '#f59e0b',
                                        }}>⚡ {totalBonuses}</span>
                                    )}
                                    {totalLeave > 0 && (
                                        <span style={{
                                            fontSize: 9, fontWeight: 700, padding: '2px 8px',
                                            borderRadius: 10, background: 'rgba(59,130,246,0.12)', color: '#3b82f6',
                                        }}>📅 {totalLeave}ي</span>
                                    )}
                                </div>
                                <div style={{
                                    transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                                    transition: 'transform 0.2s ease', color: 'var(--text-muted)',
                                    fontSize: 11,
                                }}>▼</div>
                            </button>

                            {/* Expanded content */}
                            {isExpanded && (
                                <div style={{ padding: '0 16px 16px' }}>
                                    {/* ══ Point Bonuses ══ */}
                                    <div style={{
                                        fontSize: 12, fontWeight: 700, color: '#f59e0b',
                                        display: 'flex', alignItems: 'center', gap: 6,
                                        marginBottom: 10, marginTop: 4,
                                    }}>
                                        <Zap size={14} /> مكافآت النقاط
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
                                        {BONUS_TYPES.map(bt => (
                                            <div key={bt.key} style={{
                                                padding: '10px', borderRadius: 'var(--radius-md)',
                                                background: `${bt.color}08`, border: `1px solid ${bt.color}15`,
                                                textAlign: 'center',
                                            }}>
                                                <div style={{ fontSize: 16, marginBottom: 2 }}>{bt.emoji}</div>
                                                <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 6 }}>
                                                    {bt.label}
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                                                    <button
                                                        onClick={() => updateBenefit(lvl.id, bt.key, (b as any)[bt.key] - 5)}
                                                        style={{
                                                            width: 24, height: 24, borderRadius: 'var(--radius-sm)',
                                                            background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)',
                                                            fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        }}>−</button>
                                                    <input
                                                        type="number"
                                                        value={(b as any)[bt.key] || 0}
                                                        onChange={e => updateBenefit(lvl.id, bt.key, parseInt(e.target.value) || 0)}
                                                        style={{
                                                            width: 50, textAlign: 'center', fontSize: 16, fontWeight: 900,
                                                            fontFamily: 'var(--font-numeric)', color: bt.color,
                                                            background: 'transparent', border: 'none',
                                                        }}
                                                    />
                                                    <button
                                                        onClick={() => updateBenefit(lvl.id, bt.key, (b as any)[bt.key] + 5)}
                                                        style={{
                                                            width: 24, height: 24, borderRadius: 'var(--radius-sm)',
                                                            background: `${bt.color}15`, color: bt.color,
                                                            fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        }}>+</button>
                                                </div>
                                                <div style={{ fontSize: 8, color: 'var(--text-muted)', marginTop: 2 }}>{bt.unit}</div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* ══ Leave Allowances ══ */}
                                    {leaveTypes.length > 0 && (
                                        <>
                                            <div style={{
                                                fontSize: 12, fontWeight: 700, color: '#3b82f6',
                                                display: 'flex', alignItems: 'center', gap: 6,
                                                marginBottom: 10,
                                            }}>
                                                <Calendar size={14} /> رصيد الإجازات
                                            </div>

                                            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(leaveTypes.length, 4)}, 1fr)`, gap: 8 }}>
                                                {leaveTypes.map(lt => (
                                                    <div key={lt.id} style={{
                                                        textAlign: 'center', padding: '10px 4px',
                                                        borderRadius: 'var(--radius-md)',
                                                        background: `${lt.color}08`, border: `1px solid ${lt.color}15`,
                                                    }}>
                                                        <div style={{ fontSize: 16, marginBottom: 2 }}>{lt.emoji}</div>
                                                        <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600 }}>
                                                            {lt.label}
                                                        </div>
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                                                            <button
                                                                onClick={() => updateLeaveAllowance(lvl.id, lt.id, (b.leaveAllowances?.[lt.id] || 0) - 1)}
                                                                style={{
                                                                    width: 22, height: 22, borderRadius: 'var(--radius-sm)',
                                                                    background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)',
                                                                    fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                }}>−</button>
                                                            <span style={{
                                                                fontSize: 16, fontWeight: 900, fontFamily: 'var(--font-numeric)',
                                                                color: lt.color, minWidth: 24, textAlign: 'center',
                                                            }}>
                                                                {b.leaveAllowances?.[lt.id] || 0}
                                                            </span>
                                                            <button
                                                                onClick={() => updateLeaveAllowance(lvl.id, lt.id, (b.leaveAllowances?.[lt.id] || 0) + 1)}
                                                                style={{
                                                                    width: 22, height: 22, borderRadius: 'var(--radius-sm)',
                                                                    background: `${lt.color}15`, color: lt.color,
                                                                    fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                }}>+</button>
                                                        </div>
                                                        <div style={{ fontSize: 8, color: 'var(--text-muted)', marginTop: 2 }}>يوم</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })
            )}

            {/* Bottom save */}
            <button onClick={handleSave} disabled={saving}
                style={{
                    width: '100%', padding: '14px', borderRadius: 'var(--radius-lg)',
                    background: saved ? 'linear-gradient(135deg, #22c55e, #16a34a)' : 'linear-gradient(135deg, #f59e0b, #d97706)',
                    color: 'white', fontSize: 14, fontWeight: 800,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    transition: 'all 0.3s ease', opacity: saving ? 0.6 : 1,
                    marginBottom: 30,
                }}>
                {saved ? <Check size={18} /> : <Save size={18} />}
                {saved ? 'تم الحفظ بنجاح ✓' : 'حفظ مزايا VIP'}
            </button>
        </div>
    );
}
