import React, { useState } from 'react';
import {
    ArrowRight, Plus, Trash2, Edit3, Save, X,
    Layers, Settings, DollarSign, Utensils, Bus, TrendingUp, FileText, Users, UserCog
} from 'lucide-react';

interface Props {
    branch: {
        id: string;
        name: string;
        departments: Department[];
    };
    onBack: () => void;
    onUpdateDepartments: (branchId: string, departments: Department[]) => void;
}

export interface Department {
    id: string;
    name: string;
    manager: string;
    employeeCount: number;
    allowances: {
        changeProfits: boolean;
        issuanceProfits: boolean;
        foodAllowance: number;
        transportAllowance: number;
    };
}

export default function DepartmentPage({ branch, onBack, onUpdateDepartments }: Props) {
    const [departments, setDepartments] = useState<Department[]>(branch.departments);
    const [showAddForm, setShowAddForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [settingsId, setSettingsId] = useState<string | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
    const [deptName, setDeptName] = useState('');
    const [allowanceForm, setAllowanceForm] = useState({
        changeProfits: false, issuanceProfits: false, foodAllowance: 0, transportAllowance: 0,
    });

    const save = (updated: Department[]) => {
        setDepartments(updated);
        onUpdateDepartments(branch.id, updated);
    };

    const handleAdd = () => {
        if (!deptName.trim()) return;
        const newDept: Department = {
            id: `dept-${Date.now()}`,
            name: deptName.trim(),
            manager: 'غير محدد',
            employeeCount: 0,
            allowances: { changeProfits: false, issuanceProfits: false, foodAllowance: 0, transportAllowance: 0 },
        };
        save([...departments, newDept]);
        setDeptName('');
        setShowAddForm(false);
    };

    const handleDelete = (id: string) => {
        save(departments.filter(d => d.id !== id));
        setDeleteConfirm(null);
    };

    const handleSaveEdit = (id: string) => {
        save(departments.map(d => d.id === id ? { ...d, name: deptName } : d));
        setEditingId(null);
        setDeptName('');
    };

    const handleSaveAllowances = (id: string) => {
        save(departments.map(d => d.id === id ? { ...d, allowances: { ...allowanceForm } } : d));
        setSettingsId(null);
    };

    const openSettings = (dept: Department) => {
        setAllowanceForm({ ...dept.allowances });
        setSettingsId(dept.id);
        setEditingId(null);
    };

    const startEdit = (dept: Department) => {
        setDeptName(dept.name);
        setEditingId(dept.id);
        setSettingsId(null);
    };

    const formatCurrency = (amount: number) => amount.toLocaleString('en-US');
    const parseCurrency = (val: string) => {
        const num = parseInt(val.replace(/,/g, ''), 10);
        return isNaN(num) ? 0 : num;
    };

    const hasAnyAllowance = (dept: Department) => {
        const a = dept.allowances;
        return a.changeProfits || a.issuanceProfits || a.foodAllowance > 0 || a.transportAllowance > 0;
    };
    const totalMoney = (dept: Department) => dept.allowances.foodAllowance + dept.allowances.transportAllowance;

    return (
        <div className="page-content page-enter">
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <button onClick={onBack} style={{
                    width: 36, height: 36, borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-glass)', border: '1px solid var(--border-glass)',
                    color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <ArrowRight size={18} />
                </button>
                <div style={{ flex: 1 }}>
                    <h2 style={{ fontSize: 18, fontWeight: 800 }}>أقسام {branch.name}</h2>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>إدارة الأقسام والمخصصات المالية</p>
                </div>
            </div>

            {/* Stats */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <div className="glass-card" style={{ flex: 1, textAlign: 'center', padding: '14px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--accent-purple-soft)', color: 'var(--accent-purple)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Layers size={16} />
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent-purple)', fontFamily: 'var(--font-numeric)' }}>{departments.length}</div>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600 }}>الأقسام</div>
                </div>
                <div className="glass-card" style={{ flex: 1, textAlign: 'center', padding: '14px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--accent-blue-soft)', color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Users size={16} />
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent-blue)', fontFamily: 'var(--font-numeric)' }}>
                        {departments.reduce((s, d) => s + d.employeeCount, 0)}
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600 }}>الموظفين</div>
                </div>
            </div>

            {/* Add Form */}
            {showAddForm && (
                <div className="glass-card" style={{ marginBottom: 14, padding: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <h3 style={{ fontSize: 14, fontWeight: 700 }}>إضافة قسم جديد</h3>
                        <button onClick={() => setShowAddForm(false)} style={{
                            width: 26, height: 26, borderRadius: 'var(--radius-sm)',
                            background: 'var(--accent-rose-soft)', color: 'var(--accent-rose)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}><X size={12} /></button>
                    </div>
                    <input className="form-input" value={deptName}
                        onChange={e => setDeptName(e.target.value)}
                        placeholder="اسم القسم" autoFocus style={{ marginBottom: 10 }} />
                    <button onClick={handleAdd} disabled={!deptName.trim()} style={{
                        width: '100%', padding: 12, borderRadius: 'var(--radius-md)',
                        background: deptName.trim() ? 'linear-gradient(135deg, var(--accent-emerald), var(--accent-teal))' : 'var(--bg-glass-strong)',
                        color: deptName.trim() ? 'white' : 'var(--text-muted)',
                        fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}>
                        <Save size={14} /> إضافة القسم
                    </button>
                </div>
            )}

            {/* Department Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 80 }}>
                {departments.length === 0 && !showAddForm && (
                    <div className="glass-card" style={{ textAlign: 'center', padding: '40px 20px' }}>
                        <Layers size={40} style={{ color: 'var(--text-muted)', display: 'block', margin: '0 auto 12px', opacity: 0.5 }} />
                        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>
                            لا يوجد أقسام
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
                            اضغط على زر الإضافة لإنشاء قسم جديد
                        </div>
                    </div>
                )}

                {departments.map(dept => {
                    const isEditing = editingId === dept.id;
                    const isSettings = settingsId === dept.id;
                    const hasAllowance = hasAnyAllowance(dept);

                    return (
                        <div key={dept.id} className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                            {/* Department Header */}
                            <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{
                                    width: 44, height: 44, borderRadius: 'var(--radius-lg)',
                                    background: 'linear-gradient(135deg, var(--accent-purple-soft), rgba(139,92,246,0.08))',
                                    color: 'var(--accent-purple)', border: '1px solid rgba(139,92,246,0.15)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                }}>
                                    <Layers size={20} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    {isEditing ? (
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            <input className="form-input" value={deptName}
                                                onChange={e => setDeptName(e.target.value)}
                                                placeholder="اسم القسم"
                                                style={{ flex: 1, padding: '6px 10px', fontSize: 13 }} autoFocus />
                                            <button onClick={() => handleSaveEdit(dept.id)} style={{
                                                padding: '6px 12px', borderRadius: 'var(--radius-sm)',
                                                background: 'var(--accent-emerald)', color: 'white', fontSize: 11, fontWeight: 700,
                                            }}>حفظ</button>
                                            <button onClick={() => setEditingId(null)} style={{
                                                padding: '6px 8px', borderRadius: 'var(--radius-sm)',
                                                background: 'var(--bg-glass)', color: 'var(--text-muted)',
                                            }}><X size={12} /></button>
                                        </div>
                                    ) : (
                                        <>
                                            <div style={{ fontSize: 15, fontWeight: 700 }}>{dept.name}</div>
                                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, display: 'flex', gap: 10, alignItems: 'center' }}>
                                                <span style={{ fontFamily: 'var(--font-numeric)' }}>{dept.employeeCount} موظف</span>
                                                <span>•</span>
                                                <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: 'var(--accent-purple)' }}>
                                                    <UserCog size={11} />
                                                    {dept.manager || 'غير محدد'}
                                                </span>
                                            </div>
                                        </>
                                    )}
                                </div>
                                {!isEditing && (
                                    <div style={{ display: 'flex', gap: 4 }}>
                                        <button onClick={() => openSettings(dept)} style={{
                                            width: 30, height: 30, borderRadius: 'var(--radius-sm)',
                                            background: isSettings ? 'var(--accent-amber)' : 'var(--accent-amber-soft)',
                                            color: isSettings ? 'white' : 'var(--accent-amber)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        }}><Settings size={13} /></button>
                                        <button onClick={() => startEdit(dept)} style={{
                                            width: 30, height: 30, borderRadius: 'var(--radius-sm)',
                                            background: 'var(--accent-blue-soft)', color: 'var(--accent-blue)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        }}><Edit3 size={13} /></button>
                                        <button onClick={() => deleteConfirm === dept.id ? handleDelete(dept.id) : setDeleteConfirm(dept.id)} style={{
                                            width: 30, height: 30, borderRadius: 'var(--radius-sm)',
                                            background: deleteConfirm === dept.id ? 'var(--accent-rose)' : 'var(--accent-rose-soft)',
                                            color: deleteConfirm === dept.id ? 'white' : 'var(--accent-rose)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        }}><Trash2 size={13} /></button>
                                    </div>
                                )}
                            </div>

                            {/* Allowance summary chips - always visible */}
                            {!isSettings && !isEditing && (
                                <div style={{ padding: '0 16px 12px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                    {hasAllowance ? (
                                        <>
                                            {dept.allowances.changeProfits && <ToggleChip label="أرباح تغيرات" active color="var(--accent-emerald)" />}
                                            {dept.allowances.issuanceProfits && <ToggleChip label="أرباح إصدارات" active color="var(--accent-blue)" />}
                                            {dept.allowances.foodAllowance > 0 && <AllowanceChip label="طعام" amount={dept.allowances.foodAllowance} color="var(--accent-amber)" />}
                                            {dept.allowances.transportAllowance > 0 && <AllowanceChip label="نقل" amount={dept.allowances.transportAllowance} color="var(--accent-purple)" />}
                                        </>
                                    ) : (
                                        <span style={{
                                            fontSize: 10, fontWeight: 600, padding: '3px 10px',
                                            borderRadius: 'var(--radius-full)',
                                            background: 'rgba(255,255,255,0.04)',
                                            color: 'var(--text-muted)',
                                            border: '1px dashed var(--border-glass)',
                                        }}>
                                            المخصصات مقفلة — اضغط ⚙ للتفعيل
                                        </span>
                                    )}
                                </div>
                            )}

                            {/* Financial Settings Panel */}
                            {isSettings && (
                                <div style={{
                                    borderTop: '1px solid var(--border-glass)',
                                    background: 'rgba(245,158,11,0.03)',
                                    padding: '14px 16px',
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
                                        <DollarSign size={16} style={{ color: 'var(--accent-amber)' }} />
                                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-amber)' }}>المخصصات المالية</span>
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                        <ToggleRow
                                            icon={<TrendingUp size={16} />}
                                            label="أرباح تغيرات"
                                            active={allowanceForm.changeProfits}
                                            color="var(--accent-emerald)"
                                            onToggle={() => setAllowanceForm({ ...allowanceForm, changeProfits: !allowanceForm.changeProfits })}
                                        />
                                        <ToggleRow
                                            icon={<FileText size={16} />}
                                            label="أرباح إصدارات"
                                            active={allowanceForm.issuanceProfits}
                                            color="var(--accent-blue)"
                                            onToggle={() => setAllowanceForm({ ...allowanceForm, issuanceProfits: !allowanceForm.issuanceProfits })}
                                        />
                                        <AllowanceField
                                            icon={<Utensils size={16} />}
                                            label="بدل الطعام"
                                            value={allowanceForm.foodAllowance}
                                            color="var(--accent-amber)"
                                            onChange={v => setAllowanceForm({ ...allowanceForm, foodAllowance: v })}
                                        />
                                        <AllowanceField
                                            icon={<Bus size={16} />}
                                            label="بدل النقل"
                                            value={allowanceForm.transportAllowance}
                                            color="var(--accent-purple)"
                                            onChange={v => setAllowanceForm({ ...allowanceForm, transportAllowance: v })}
                                        />
                                    </div>

                                    {/* Total */}
                                    <div style={{
                                        marginTop: 12, padding: '10px 14px', borderRadius: 'var(--radius-md)',
                                        background: 'linear-gradient(135deg, rgba(16,185,129,0.1), rgba(20,184,166,0.08))',
                                        border: '1px solid rgba(16,185,129,0.15)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    }}>
                                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-emerald)' }}>إجمالي البدلات</span>
                                        <span style={{
                                            fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-numeric)',
                                            color: 'var(--accent-emerald)',
                                        }}>
                                            {formatCurrency(allowanceForm.foodAllowance + allowanceForm.transportAllowance)} د.ع
                                        </span>
                                    </div>

                                    {/* Actions */}
                                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                                        <button onClick={() => handleSaveAllowances(dept.id)} style={{
                                            flex: 1, padding: 12, borderRadius: 'var(--radius-md)',
                                            background: 'linear-gradient(135deg, var(--accent-emerald), var(--accent-teal))',
                                            color: 'white', fontSize: 13, fontWeight: 700,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                        }}>
                                            <Save size={14} /> حفظ المخصصات
                                        </button>
                                        <button onClick={() => setSettingsId(null)} style={{
                                            padding: '12px 16px', borderRadius: 'var(--radius-md)',
                                            background: 'var(--bg-glass)', color: 'var(--text-muted)',
                                            fontSize: 13, fontWeight: 700,
                                        }}>إلغاء</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* FAB */}
            {!showAddForm && (
                <button className="fab-btn" onClick={() => { setShowAddForm(true); setDeptName(''); }}>
                    <Plus size={24} />
                </button>
            )}
        </div>
    );
}

// === Allowance Field ===
function AllowanceField({ icon, label, value, color, onChange }: {
    icon: React.ReactNode; label: string; value: number; color: string;
    onChange: (v: number) => void;
}) {
    const formatDisplay = (n: number) => n === 0 ? '' : n.toLocaleString('en-US');
    const parse = (v: string) => {
        const num = parseInt(v.replace(/,/g, ''), 10);
        return isNaN(num) ? 0 : num;
    };

    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 12px', borderRadius: 'var(--radius-md)',
            background: 'var(--bg-glass)', border: '1px solid var(--border-glass)',
        }}>
            <div style={{
                width: 34, height: 34, borderRadius: 'var(--radius-sm)',
                background: `${color}18`, color,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
                {icon}
            </div>
            <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</div>
                <input
                    type="text"
                    value={formatDisplay(value)}
                    onChange={e => onChange(parse(e.target.value))}
                    placeholder="0"
                    style={{
                        width: '100%', background: 'transparent', border: 'none', outline: 'none',
                        fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-numeric)',
                        color: value > 0 ? color : 'var(--text-muted)', textAlign: 'left', direction: 'ltr',
                    }}
                />
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, flexShrink: 0 }}>د.ع</span>
        </div>
    );
}

// === Allowance Chip ===
function AllowanceChip({ label, amount, color }: { label: string; amount: number; color: string }) {
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '3px 8px', borderRadius: 'var(--radius-full)',
            fontSize: 10, fontWeight: 600, background: `${color}15`, color,
            fontFamily: 'var(--font-numeric)',
        }}>
            {label}: {amount.toLocaleString('en-US')}
        </span>
    );
}

// === Toggle Chip (for boolean status display) ===
function ToggleChip({ label, active, color }: { label: string; active: boolean; color: string }) {
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '3px 8px', borderRadius: 'var(--radius-full)',
            fontSize: 10, fontWeight: 600,
            background: active ? `${color}15` : 'var(--bg-glass)',
            color: active ? color : 'var(--text-muted)',
        }}>
            <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: active ? color : 'var(--text-muted)',
            }} />
            {label}
        </span>
    );
}

// === Toggle Row (on/off switch) ===
function ToggleRow({ icon, label, active, color, onToggle }: {
    icon: React.ReactNode; label: string; active: boolean; color: string;
    onToggle: () => void;
}) {
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 12px', borderRadius: 'var(--radius-md)',
            background: active ? `${color}08` : 'var(--bg-glass)',
            border: `1px solid ${active ? `${color}30` : 'var(--border-glass)'}`,
            transition: 'all 200ms ease',
        }}>
            <div style={{
                width: 34, height: 34, borderRadius: 'var(--radius-sm)',
                background: `${color}18`, color,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
                {icon}
            </div>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: active ? color : 'var(--text-secondary)' }}>
                {label}
            </span>
            <button onClick={onToggle} style={{
                width: 46, height: 26, borderRadius: 13, padding: 2,
                background: active ? color : 'var(--bg-glass-strong)',
                border: `1px solid ${active ? 'transparent' : 'var(--border-glass)'}`,
                cursor: 'pointer', position: 'relative', transition: 'all 250ms ease',
            }}>
                <div style={{
                    width: 20, height: 20, borderRadius: '50%',
                    background: 'white', transition: 'all 250ms ease',
                    transform: active ? 'translateX(0px)' : 'translateX(20px)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                }} />
            </button>
        </div>
    );
}
