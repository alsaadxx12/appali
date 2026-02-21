import React, { useState, useEffect } from 'react';
import {
    ArrowRight, Plus, Trash2, Edit3, Save, X, Check,
    Calendar, Shield, ToggleLeft, ToggleRight
} from 'lucide-react';
import { db } from '../../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

interface Props {
    onBack: () => void;
}

interface LeaveType {
    id: string;
    label: string;
    emoji: string;
    color: string;
}



const EMOJI_OPTIONS = ['🏖️', '🏥', '👤', '🚨', '📅', '🎓', '💼', '🏠', '👶', '💒'];
const COLOR_OPTIONS = ['#3b82f6', '#ef4444', '#8b5cf6', '#f97316', '#10b981', '#ec4899', '#06b6d4', '#ffd700', '#84cc16', '#6366f1'];

const DEFAULT_LEAVE_TYPES: LeaveType[] = [
    { id: 'annual', label: 'سنوية', emoji: '🏖️', color: '#3b82f6' },
    { id: 'sick', label: 'مرضية', emoji: '🏥', color: '#ef4444' },
    { id: 'personal', label: 'شخصية', emoji: '👤', color: '#8b5cf6' },
    { id: 'emergency', label: 'طوارئ', emoji: '🚨', color: '#f97316' },
];

export default function LeaveSettingsPage({ onBack }: Props) {
    const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>(DEFAULT_LEAVE_TYPES);
    const [maxConsecutiveDays, setMaxConsecutiveDays] = useState(5);
    const [allowCarryOver, setAllowCarryOver] = useState(false);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    // Leave type form
    const [showTypeForm, setShowTypeForm] = useState(false);
    const [editingTypeId, setEditingTypeId] = useState<string | null>(null);
    const [typeForm, setTypeForm] = useState({ label: '', emoji: '🏖️', color: '#3b82f6' });
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            // Load leave settings
            const leaveSnap = await getDoc(doc(db, 'settings', 'leaves'));
            if (leaveSnap.exists()) {
                const data = leaveSnap.data();
                if (data.leaveTypes) setLeaveTypes(data.leaveTypes);
                if (data.maxConsecutiveDays !== undefined) setMaxConsecutiveDays(data.maxConsecutiveDays);
                if (data.allowCarryOver !== undefined) setAllowCarryOver(data.allowCarryOver);
            }
        } catch (e) {
            console.error('Error loading leave settings:', e);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await setDoc(doc(db, 'settings', 'leaves'), {
                leaveTypes,
                maxConsecutiveDays,
                allowCarryOver,
                updatedAt: new Date().toISOString(),
            });
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch (e) {
            console.error('Error saving leave settings:', e);
            alert('حدث خطأ أثناء الحفظ');
        } finally {
            setSaving(false);
        }
    };

    const handleAddType = () => {
        setEditingTypeId(null);
        setTypeForm({ label: '', emoji: '🏖️', color: '#3b82f6' });
        setShowTypeForm(true);
    };

    const handleEditType = (lt: LeaveType) => {
        setEditingTypeId(lt.id);
        setTypeForm({ label: lt.label, emoji: lt.emoji, color: lt.color });
        setShowTypeForm(true);
    };

    const handleSaveType = () => {
        if (!typeForm.label.trim()) return;
        if (editingTypeId) {
            setLeaveTypes(leaveTypes.map(lt =>
                lt.id === editingTypeId ? { ...lt, ...typeForm } : lt
            ));
        } else {
            const newType: LeaveType = {
                id: `leave-${Date.now()}`,
                ...typeForm,
            };
            setLeaveTypes([...leaveTypes, newType]);
        }
        setShowTypeForm(false);
    };

    const handleDeleteType = (id: string) => {
        setLeaveTypes(leaveTypes.filter(lt => lt.id !== id));
        setDeleteConfirm(null);
    };



    if (loading) {
        return (
            <div className="page-content page-enter" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
                <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    <Calendar size={32} style={{ margin: '0 auto 10px', display: 'block', opacity: 0.5 }} />
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
                <div style={{ flex: 1 }}>
                    <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>إعدادات الإجازات</h2>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>أنواع الإجازات ورصيد كل مستوى</p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    style={{
                        padding: '8px 16px', borderRadius: 'var(--radius-md)',
                        background: saved ? 'rgba(34,197,94,0.2)' : 'rgba(59,130,246,0.2)',
                        border: saved ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(59,130,246,0.3)',
                        color: saved ? '#22c55e' : '#3b82f6',
                        fontSize: 12, fontWeight: 700,
                        display: 'flex', alignItems: 'center', gap: 6,
                        transition: 'all 0.3s ease',
                        opacity: saving ? 0.6 : 1,
                    }}
                >
                    {saved ? <Check size={14} /> : <Save size={14} />}
                    {saved ? 'تم ✓' : 'حفظ'}
                </button>
            </div>

            {/* ═══════ General Settings ═══════ */}
            <div className="glass-card" style={{ padding: '16px', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                    <div style={{
                        width: 36, height: 36, borderRadius: 'var(--radius-md)',
                        background: 'rgba(59,130,246,0.15)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#3b82f6',
                    }}>
                        <Shield size={18} />
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>إعدادات عامة</div>
                </div>

                {/* Max consecutive days */}
                <div style={{ marginBottom: 14 }}>
                    <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        marginBottom: 6,
                    }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                            الحد الأقصى للإجازات المتتالية
                        </span>
                        <span style={{
                            fontSize: 12, fontWeight: 800, fontFamily: 'var(--font-numeric)',
                            color: '#3b82f6',
                        }}>
                            {maxConsecutiveDays} يوم
                        </span>
                    </div>
                    <input
                        type="range" min="1" max="30" value={maxConsecutiveDays}
                        onChange={e => setMaxConsecutiveDays(parseInt(e.target.value))}
                        style={{ width: '100%', accentColor: '#3b82f6', height: 4 }}
                    />
                </div>

                {/* Allow carry over */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                    <div>
                        <div style={{ fontSize: 12, fontWeight: 600 }}>ترحيل الرصيد</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                            {allowCarryOver ? 'يُرحَّل الرصيد المتبقي للسنة التالية' : 'لا يُرحَّل الرصيد'}
                        </div>
                    </div>
                    <button
                        onClick={() => setAllowCarryOver(!allowCarryOver)}
                        style={{ color: allowCarryOver ? 'var(--accent-emerald)' : 'var(--text-muted)' }}
                    >
                        {allowCarryOver ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                    </button>
                </div>
            </div>

            {/* ═══════ Leave Types ═══════ */}
            <h3 className="section-title" style={{ fontSize: 14 }}>
                <Calendar size={16} />
                أنواع الإجازات
                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400, marginRight: 6 }}>
                    ({leaveTypes.length})
                </span>
            </h3>

            {leaveTypes.map(lt => (
                <div key={lt.id} className="glass-card" style={{ padding: '12px 14px', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{
                                width: 36, height: 36, borderRadius: 'var(--radius-md)',
                                background: `${lt.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 18,
                            }}>
                                {lt.emoji}
                            </div>
                            <div>
                                <div style={{ fontSize: 13, fontWeight: 700 }}>{lt.label}</div>
                                <div style={{
                                    fontSize: 10, color: lt.color, fontWeight: 600,
                                    display: 'flex', alignItems: 'center', gap: 4,
                                }}>
                                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: lt.color }} />
                                    {lt.id}
                                </div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                            <button
                                onClick={() => handleEditType(lt)}
                                style={{
                                    width: 30, height: 30, borderRadius: 'var(--radius-sm)',
                                    background: 'rgba(255,255,255,0.06)', display: 'flex',
                                    alignItems: 'center', justifyContent: 'center',
                                    color: 'var(--text-muted)',
                                }}
                            >
                                <Edit3 size={13} />
                            </button>
                            {deleteConfirm === lt.id ? (
                                <button
                                    onClick={() => handleDeleteType(lt.id)}
                                    style={{
                                        width: 30, height: 30, borderRadius: 'var(--radius-sm)',
                                        background: 'rgba(239,68,68,0.15)', display: 'flex',
                                        alignItems: 'center', justifyContent: 'center',
                                        color: '#ef4444',
                                    }}
                                >
                                    <Check size={13} />
                                </button>
                            ) : (
                                <button
                                    onClick={() => setDeleteConfirm(lt.id)}
                                    style={{
                                        width: 30, height: 30, borderRadius: 'var(--radius-sm)',
                                        background: 'rgba(239,68,68,0.08)', display: 'flex',
                                        alignItems: 'center', justifyContent: 'center',
                                        color: '#ef4444',
                                    }}
                                >
                                    <Trash2 size={13} />
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            ))}

            {/* Add/Edit type form */}
            {showTypeForm ? (
                <div className="glass-card" style={{ padding: '16px', marginBottom: 8, border: '1px solid rgba(59,130,246,0.2)' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
                        {editingTypeId ? 'تعديل نوع الإجازة' : 'إضافة نوع جديد'}
                    </div>

                    <input
                        type="text" value={typeForm.label}
                        onChange={e => setTypeForm({ ...typeForm, label: e.target.value })}
                        placeholder="اسم نوع الإجازة"
                        style={{
                            width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-md)',
                            background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-glass)',
                            color: 'var(--text-primary)', fontSize: 13, marginBottom: 10,
                        }}
                    />

                    {/* Emoji selector */}
                    <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>الرمز</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {EMOJI_OPTIONS.map(e => (
                                <button key={e} onClick={() => setTypeForm({ ...typeForm, emoji: e })}
                                    style={{
                                        width: 34, height: 34, borderRadius: 'var(--radius-sm)',
                                        background: typeForm.emoji === e ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)',
                                        border: typeForm.emoji === e ? '1.5px solid rgba(255,255,255,0.3)' : '1px solid transparent',
                                        fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}
                                >{e}</button>
                            ))}
                        </div>
                    </div>

                    {/* Color selector */}
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>اللون</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {COLOR_OPTIONS.map(c => (
                                <button key={c} onClick={() => setTypeForm({ ...typeForm, color: c })}
                                    style={{
                                        width: 28, height: 28, borderRadius: '50%',
                                        background: c, border: typeForm.color === c ? '2px solid white' : '2px solid transparent',
                                        boxShadow: typeForm.color === c ? `0 0 8px ${c}` : 'none',
                                    }}
                                />
                            ))}
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => setShowTypeForm(false)}
                            style={{
                                flex: 1, padding: '10px', borderRadius: 'var(--radius-md)',
                                background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)',
                                fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                            }}>
                            <X size={14} /> إلغاء
                        </button>
                        <button onClick={handleSaveType}
                            style={{
                                flex: 1, padding: '10px', borderRadius: 'var(--radius-md)',
                                background: 'rgba(59,130,246,0.2)', border: '1px solid rgba(59,130,246,0.3)',
                                color: '#3b82f6', fontSize: 12, fontWeight: 700,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                                opacity: typeForm.label.trim() ? 1 : 0.4,
                            }}>
                            <Check size={14} /> {editingTypeId ? 'تعديل' : 'إضافة'}
                        </button>
                    </div>
                </div>
            ) : (
                <button onClick={handleAddType}
                    style={{
                        width: '100%', padding: '12px', borderRadius: 'var(--radius-lg)',
                        background: 'rgba(59,130,246,0.08)', border: '1px dashed rgba(59,130,246,0.3)',
                        color: '#3b82f6', fontSize: 12, fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        marginBottom: 16,
                    }}>
                    <Plus size={16} /> إضافة نوع جديد
                </button>
            )}



            {/* Bottom save button */}
            <button
                onClick={handleSave}
                disabled={saving}
                style={{
                    width: '100%', padding: '14px', borderRadius: 'var(--radius-lg)',
                    background: saved ? 'linear-gradient(135deg, #22c55e, #16a34a)' : 'linear-gradient(135deg, #3b82f6, #2563eb)',
                    color: 'white', fontSize: 14, fontWeight: 800,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    transition: 'all 0.3s ease',
                    opacity: saving ? 0.6 : 1,
                    marginBottom: 30,
                }}
            >
                {saved ? <Check size={18} /> : <Save size={18} />}
                {saved ? 'تم الحفظ بنجاح ✓' : 'حفظ إعدادات الإجازات'}
            </button>
        </div>
    );
}
