import React, { useState, useEffect } from 'react';
import {
    ArrowRight, Crown, ToggleLeft, ToggleRight,
    Target, Flame, Award, TrendingUp, Zap, Star,
    Plus, Trash2, Edit3, Save, X, ChevronUp, ChevronDown, Shield
} from 'lucide-react';
import { db } from '../../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

interface Props {
    onBack: () => void;
}

export interface VipLevel {
    id: string;
    label: string;
    emoji: string;
    color: string;
    minPoints: number;
}

interface PointValues {
    onTimeAttendance: number;
    streak5Days: number;
    noAbsenceMonth: number;
    employeeOfMonth: number;
    lateDeduction: number;
    absenceDeduction: number;
}

const DEFAULT_POINT_VALUES: PointValues = {
    onTimeAttendance: 10,
    streak5Days: 50,
    noAbsenceMonth: 100,
    employeeOfMonth: 200,
    lateDeduction: 2,
    absenceDeduction: 50,
};

const EMOJI_OPTIONS = ['🥉', '🥈', '👑', '💎', '⭐', '🏆', '🎖️', '🔥', '💫', '🌟', '🎯', '🚀'];
const COLOR_OPTIONS = ['#cd7f32', '#c0c0c0', '#ffd700', '#b9f2ff', '#ef4444', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899', '#06b6d4'];

export default function VipSettingsPage({ onBack }: Props) {
    const [enabled, setEnabled] = useState(true);
    const [levels, setLevels] = useState<VipLevel[]>([]);
    const [defaultLevel, setDefaultLevel] = useState<string>('none');
    const [pointValues, setPointValues] = useState<PointValues>(DEFAULT_POINT_VALUES);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    // Add/Edit form
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formData, setFormData] = useState({ label: '', emoji: '⭐', color: '#ffd700', minPoints: 100 });
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

    // Load from Firestore
    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const snap = await getDoc(doc(db, 'settings', 'vip'));
            if (snap.exists()) {
                const data = snap.data();
                if (data.enabled !== undefined) setEnabled(data.enabled);
                if (data.levels) setLevels(data.levels);
                if (data.defaultLevel) setDefaultLevel(data.defaultLevel);
                if (data.pointValues) setPointValues({ ...DEFAULT_POINT_VALUES, ...data.pointValues });
            }
        } catch (e) {
            console.error('Error loading VIP settings:', e);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await setDoc(doc(db, 'settings', 'vip'), {
                enabled,
                levels: levels.sort((a, b) => a.minPoints - b.minPoints),
                defaultLevel,
                pointValues,
                updatedAt: new Date().toISOString(),
            });
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch (e) {
            console.error('Error saving VIP settings:', e);
            alert('حدث خطأ أثناء الحفظ');
        } finally {
            setSaving(false);
        }
    };

    const openAddForm = () => {
        setEditingId(null);
        setFormData({ label: '', emoji: '⭐', color: '#ffd700', minPoints: 100 });
        setShowForm(true);
    };

    const openEditForm = (level: VipLevel) => {
        setEditingId(level.id);
        setFormData({ label: level.label, emoji: level.emoji, color: level.color, minPoints: level.minPoints });
        setShowForm(true);
    };

    const saveLevel = () => {
        if (!formData.label.trim()) return;
        if (editingId) {
            setLevels(prev => prev.map(l => l.id === editingId ? { ...l, ...formData } : l));
        } else {
            const newLevel: VipLevel = { id: `lvl-${Date.now()}`, ...formData };
            setLevels(prev => [...prev, newLevel].sort((a, b) => a.minPoints - b.minPoints));
        }
        setShowForm(false);
    };

    const deleteLevel = (id: string) => {
        setLevels(prev => prev.filter(l => l.id !== id));
        setDeleteConfirm(null);
    };

    if (loading) {
        return (
            <div className="page-content page-enter" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}>
                <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    <Crown size={32} style={{ margin: '0 auto 10px', display: 'block', opacity: 0.5 }} />
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
                <button
                    onClick={onBack}
                    style={{
                        width: 36, height: 36, borderRadius: 'var(--radius-md)',
                        background: 'var(--bg-glass)', border: '1px solid var(--border-glass)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'var(--text-secondary)',
                    }}
                >
                    <ArrowRight size={18} />
                </button>
                <div>
                    <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>إعدادات VIP</h2>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>تخصيص نظام المستويات والنقاط</p>
                </div>
            </div>

            {/* Enable/Disable Toggle */}
            <div className="glass-card" style={{ padding: '16px', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                            width: 36, height: 36, borderRadius: 'var(--radius-md)',
                            background: enabled ? 'rgba(255,215,0,0.15)' : 'var(--bg-glass-strong)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: enabled ? '#ffd700' : 'var(--text-muted)',
                        }}>
                            <Crown size={18} />
                        </div>
                        <div>
                            <div style={{ fontSize: 14, fontWeight: 700 }}>تفعيل نظام VIP</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                {enabled ? 'النظام مفعّل ويعمل' : 'النظام معطّل'}
                            </div>
                        </div>
                    </div>
                    <button onClick={() => setEnabled(!enabled)} style={{ color: enabled ? 'var(--accent-emerald)' : 'var(--text-muted)' }}>
                        {enabled ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
                    </button>
                </div>
            </div>

            {/* Default Level Selector */}
            <div className="glass-card" style={{ padding: '16px', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <div style={{
                        width: 36, height: 36, borderRadius: 'var(--radius-md)',
                        background: 'rgba(139,92,246,0.15)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#8b5cf6',
                    }}>
                        <Shield size={18} />
                    </div>
                    <div>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>المستوى الدائم</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            مستوى يحصل عليه كل موظف تلقائياً
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <button
                        onClick={() => setDefaultLevel('none')}
                        style={{
                            padding: '8px 14px', borderRadius: 'var(--radius-md)',
                            background: defaultLevel === 'none' ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)',
                            border: defaultLevel === 'none' ? '1.5px solid rgba(255,255,255,0.3)' : '1px solid var(--border-glass)',
                            fontSize: 12, fontWeight: 600,
                            color: defaultLevel === 'none' ? 'var(--text-primary)' : 'var(--text-muted)',
                        }}
                    >
                        ❌ بدون
                    </button>
                    {levels.sort((a, b) => a.minPoints - b.minPoints).map(lvl => (
                        <button
                            key={lvl.id}
                            onClick={() => setDefaultLevel(lvl.id)}
                            style={{
                                padding: '8px 14px', borderRadius: 'var(--radius-md)',
                                background: defaultLevel === lvl.id ? `${lvl.color}25` : 'rgba(255,255,255,0.04)',
                                border: defaultLevel === lvl.id ? `1.5px solid ${lvl.color}60` : '1px solid var(--border-glass)',
                                fontSize: 12, fontWeight: 700,
                                color: defaultLevel === lvl.id ? lvl.color : 'var(--text-muted)',
                                display: 'flex', alignItems: 'center', gap: 6,
                            }}
                        >
                            <span style={{ fontSize: 16 }}>{lvl.emoji}</span>
                            {lvl.label}
                        </button>
                    ))}
                </div>
                {defaultLevel !== 'none' && (() => {
                    const selected = levels.find(l => l.id === defaultLevel);
                    return selected ? (
                        <div style={{
                            marginTop: 10, padding: '8px 12px', borderRadius: 'var(--radius-md)',
                            background: `${selected.color}10`, border: `1px solid ${selected.color}20`,
                            fontSize: 11, color: selected.color, fontWeight: 600,
                            display: 'flex', alignItems: 'center', gap: 6,
                        }}>
                            <Shield size={14} />
                            كل الموظفين سيحصلون على مستوى {selected.emoji} {selected.label} تلقائياً
                        </div>
                    ) : null;
                })()}
            </div>

            {/* ═══════ VIP Levels ═══════ */}
            <h3 className="section-title" style={{ fontSize: 14 }}>
                <Crown size={16} />
                المستويات
                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400, marginRight: 6 }}>
                    ({levels.length})
                </span>
            </h3>

            {levels.length === 0 && !showForm && (
                <div className="glass-card" style={{ textAlign: 'center', padding: '30px 20px', marginBottom: 16 }}>
                    <Crown size={32} style={{ color: 'var(--text-muted)', margin: '0 auto 10px', display: 'block' }} />
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>لا توجد مستويات</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>أضف مستوى جديد لبدء نظام VIP</div>
                </div>
            )}

            {/* Level Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                {levels.sort((a, b) => a.minPoints - b.minPoints).map((level, idx) => (
                    <div key={level.id} className="glass-card" style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{
                                width: 42, height: 42, borderRadius: '50%',
                                background: `${level.color}22`, color: level.color,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 20, flexShrink: 0,
                                border: `2px solid ${level.color}44`,
                            }}>
                                {level.emoji}
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 14, fontWeight: 700, color: level.color }}>{level.label}</div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-numeric)' }}>
                                    الحد الأدنى: {level.minPoints.toLocaleString()} نقطة
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 4 }}>
                                <button
                                    onClick={() => openEditForm(level)}
                                    style={{
                                        width: 30, height: 30, borderRadius: 'var(--radius-md)',
                                        background: 'var(--accent-blue-soft)', color: 'var(--accent-blue)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}
                                >
                                    <Edit3 size={13} />
                                </button>
                                {deleteConfirm === level.id ? (
                                    <>
                                        <button
                                            onClick={() => deleteLevel(level.id)}
                                            style={{
                                                width: 30, height: 30, borderRadius: 'var(--radius-md)',
                                                background: 'var(--accent-rose)', color: 'white',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: 10, fontWeight: 700,
                                            }}
                                        >✓</button>
                                        <button
                                            onClick={() => setDeleteConfirm(null)}
                                            style={{
                                                width: 30, height: 30, borderRadius: 'var(--radius-md)',
                                                background: 'var(--bg-glass-strong)', color: 'var(--text-muted)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            }}
                                        ><X size={13} /></button>
                                    </>
                                ) : (
                                    <button
                                        onClick={() => setDeleteConfirm(level.id)}
                                        style={{
                                            width: 30, height: 30, borderRadius: 'var(--radius-md)',
                                            background: 'var(--accent-rose-soft)', color: 'var(--accent-rose)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        }}
                                    >
                                        <Trash2 size={13} />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Add/Edit Form */}
            {showForm && (
                <div className="glass-card" style={{ padding: '16px', marginBottom: 16, border: '1px solid var(--accent-blue)' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {editingId ? <Edit3 size={14} /> : <Plus size={14} />}
                        {editingId ? 'تعديل المستوى' : 'إضافة مستوى جديد'}
                    </div>

                    {/* Label */}
                    <div style={{ marginBottom: 12 }}>
                        <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>اسم المستوى</label>
                        <input
                            type="text"
                            className="form-input"
                            placeholder="مثال: ذهبي"
                            value={formData.label}
                            onChange={e => setFormData({ ...formData, label: e.target.value })}
                        />
                    </div>

                    {/* Min Points */}
                    <div style={{ marginBottom: 12 }}>
                        <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>الحد الأدنى من النقاط</label>
                        <input
                            type="number"
                            className="form-input"
                            value={formData.minPoints}
                            onChange={e => setFormData({ ...formData, minPoints: Number(e.target.value) })}
                            style={{ fontFamily: 'var(--font-numeric)' }}
                        />
                    </div>

                    {/* Emoji Picker */}
                    <div style={{ marginBottom: 12 }}>
                        <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>الرمز</label>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {EMOJI_OPTIONS.map(e => (
                                <button
                                    key={e}
                                    onClick={() => setFormData({ ...formData, emoji: e })}
                                    style={{
                                        width: 36, height: 36, borderRadius: 'var(--radius-md)',
                                        background: formData.emoji === e ? 'var(--accent-blue-soft)' : 'var(--bg-glass)',
                                        border: `1px solid ${formData.emoji === e ? 'var(--accent-blue)' : 'var(--border-glass)'}`,
                                        fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}
                                >{e}</button>
                            ))}
                        </div>
                    </div>

                    {/* Color Picker */}
                    <div style={{ marginBottom: 14 }}>
                        <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>اللون</label>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {COLOR_OPTIONS.map(c => (
                                <button
                                    key={c}
                                    onClick={() => setFormData({ ...formData, color: c })}
                                    style={{
                                        width: 30, height: 30, borderRadius: '50%',
                                        background: c,
                                        border: `3px solid ${formData.color === c ? 'white' : 'transparent'}`,
                                        boxShadow: formData.color === c ? `0 0 0 2px ${c}` : 'none',
                                    }}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Preview */}
                    <div style={{
                        marginBottom: 14, padding: '12px', borderRadius: 'var(--radius-md)',
                        background: 'var(--bg-glass-strong)', textAlign: 'center',
                    }}>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6 }}>معاينة</div>
                        <span style={{
                            fontSize: 20, marginLeft: 6,
                        }}>{formData.emoji}</span>
                        <span style={{
                            fontSize: 14, fontWeight: 700, color: formData.color,
                        }}>{formData.label || '...'}</span>
                        <div style={{
                            fontSize: 11, color: 'var(--text-muted)', marginTop: 4, fontFamily: 'var(--font-numeric)',
                        }}>≥ {formData.minPoints.toLocaleString()} نقطة</div>
                    </div>

                    {/* Buttons */}
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button
                            onClick={saveLevel}
                            disabled={!formData.label.trim()}
                            style={{
                                flex: 1, padding: '10px', borderRadius: 'var(--radius-md)',
                                background: formData.label.trim() ? 'linear-gradient(135deg, var(--accent-blue), var(--accent-purple))' : 'var(--bg-glass-strong)',
                                color: formData.label.trim() ? 'white' : 'var(--text-muted)',
                                fontSize: 13, fontWeight: 700,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                            }}
                        >
                            <Save size={14} />
                            {editingId ? 'تحديث' : 'إضافة'}
                        </button>
                        <button
                            onClick={() => setShowForm(false)}
                            style={{
                                padding: '10px 16px', borderRadius: 'var(--radius-md)',
                                background: 'var(--bg-glass-strong)', color: 'var(--text-muted)',
                                fontSize: 13, fontWeight: 700,
                            }}
                        >
                            <X size={14} />
                        </button>
                    </div>
                </div>
            )}

            {/* Add Level Button */}
            {!showForm && (
                <button
                    onClick={openAddForm}
                    style={{
                        width: '100%', padding: '12px', marginBottom: 16,
                        borderRadius: 'var(--radius-lg)',
                        background: 'var(--bg-glass)', border: '2px dashed var(--border-glass)',
                        color: 'var(--accent-blue)', fontSize: 13, fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}
                >
                    <Plus size={16} />
                    إضافة مستوى جديد
                </button>
            )}

            {/* ═══════ Point Values ═══════ */}
            <h3 className="section-title" style={{ fontSize: 14 }}>
                <Star size={16} />
                قيم النقاط
            </h3>
            <div className="glass-card" style={{ padding: '16px', marginBottom: 16 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <PointRow
                        icon={<Target size={14} />}
                        label="حضور في الوقت"
                        value={pointValues.onTimeAttendance}
                        onChange={v => setPointValues({ ...pointValues, onTimeAttendance: v })}
                        color="var(--accent-emerald)"
                        prefix="+"
                    />
                    <div style={{ height: 1, background: 'var(--border-glass)' }} />
                    <PointRow
                        icon={<Flame size={14} />}
                        label="حضور 5 أيام متتالية"
                        value={pointValues.streak5Days}
                        onChange={v => setPointValues({ ...pointValues, streak5Days: v })}
                        color="var(--accent-amber)"
                        prefix="+"
                    />
                    <div style={{ height: 1, background: 'var(--border-glass)' }} />
                    <PointRow
                        icon={<Award size={14} />}
                        label="شهر بدون غياب"
                        value={pointValues.noAbsenceMonth}
                        onChange={v => setPointValues({ ...pointValues, noAbsenceMonth: v })}
                        color="var(--accent-blue)"
                        prefix="+"
                    />
                    <div style={{ height: 1, background: 'var(--border-glass)' }} />
                    <PointRow
                        icon={<TrendingUp size={14} />}
                        label="أفضل موظف الشهر"
                        value={pointValues.employeeOfMonth}
                        onChange={v => setPointValues({ ...pointValues, employeeOfMonth: v })}
                        color="var(--accent-purple)"
                        prefix="+"
                    />
                    <div style={{ height: 1, background: 'var(--border-glass)' }} />
                    <PointRow
                        icon={<Zap size={14} />}
                        label="خصم لكل دقيقة تأخير"
                        value={pointValues.lateDeduction}
                        onChange={v => setPointValues({ ...pointValues, lateDeduction: v })}
                        color="var(--accent-rose)"
                        prefix="-"
                    />
                    <div style={{ height: 1, background: 'var(--border-glass)' }} />
                    <PointRow
                        icon={<Zap size={14} />}
                        label="خصم الغياب بلا عذر"
                        value={pointValues.absenceDeduction}
                        onChange={v => setPointValues({ ...pointValues, absenceDeduction: v })}
                        color="var(--accent-rose)"
                        prefix="-"
                    />
                </div>
            </div>

            {/* Save Button */}
            <button
                onClick={handleSave}
                disabled={saving}
                style={{
                    width: '100%', padding: '14px',
                    borderRadius: 'var(--radius-lg)',
                    background: saved
                        ? 'linear-gradient(135deg, var(--accent-emerald), var(--accent-teal))'
                        : 'linear-gradient(135deg, #ffd700, #ff8c00)',
                    color: saved ? 'white' : '#1a1a2e',
                    fontSize: 14, fontWeight: 800,
                    marginBottom: 100,
                    transition: 'all 300ms ease',
                    opacity: saving ? 0.6 : 1,
                }}
            >
                {saving ? 'جاري الحفظ...' : saved ? '✓ تم الحفظ بنجاح' : 'حفظ التغييرات'}
            </button>
        </div>
    );
}

// === Point Value Row ===
function PointRow({ icon, label, value, onChange, color, prefix }: {
    icon: React.ReactNode; label: string; value: number;
    onChange: (v: number) => void; color: string; prefix: string;
}) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
                width: 28, height: 28, borderRadius: 'var(--radius-md)',
                background: `${color}22`, color, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{icon}</div>
            <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button
                    onClick={() => onChange(Math.max(0, value - (value >= 50 ? 10 : 1)))}
                    style={{
                        width: 26, height: 26, borderRadius: 'var(--radius-md)',
                        background: 'var(--bg-glass-strong)', color: 'var(--text-muted)',
                        fontSize: 14, fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                >-</button>
                <span style={{
                    minWidth: 40, textAlign: 'center',
                    fontSize: 13, fontWeight: 800, fontFamily: 'var(--font-numeric)',
                    color,
                }}>{prefix}{value}</span>
                <button
                    onClick={() => onChange(value + (value >= 50 ? 10 : 1))}
                    style={{
                        width: 26, height: 26, borderRadius: 'var(--radius-md)',
                        background: 'var(--bg-glass-strong)', color: 'var(--text-muted)',
                        fontSize: 14, fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                >+</button>
            </div>
        </div>
    );
}
