import React, { useState } from 'react';
import {
    ArrowRight, Clock, AlertTriangle, Save, TrendingDown, TrendingUp,
    Timer, UserX, UserCheck, Search, X, Shield
} from 'lucide-react';


interface Props {
    onBack: () => void;
}

export default function AttendanceSettingsPage({ onBack }: Props) {
    // Grace period
    const [gracePeriod, setGracePeriod] = useState(15);

    // Points rules
    const [lateDeductionPerMinute, setLateDeductionPerMinute] = useState(2);
    const [maxLateDeduction, setMaxLateDeduction] = useState(50);
    const [overtimeBonusPerHour, setOvertimeBonusPerHour] = useState(15);
    const [maxOvertimeBonus, setMaxOvertimeBonus] = useState(60);

    // Exemptions
    const [exemptedIds, setExemptedIds] = useState<string[]>([]);
    const [searchQuery, setSearchQuery] = useState('');

    const [saved, setSaved] = useState(false);

    const handleSave = () => {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    const toggleExemption = (id: string) => {
        setExemptedIds(prev =>
            prev.includes(id) ? prev.filter(eid => eid !== id) : [...prev, id]
        );
    };

    const employees: any[] = []; // Will be loaded from Firestore
    const filteredEmployees = employees.filter((u: any) =>
        u.name.includes(searchQuery) || u.username?.includes(searchQuery) || u.id.includes(searchQuery)
    );

    return (
        <div className="page-content page-enter">
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <button
                    onClick={onBack}
                    style={{
                        width: 36, height: 36, borderRadius: 'var(--radius-md)',
                        background: 'var(--bg-glass)', border: '1px solid var(--border-glass)',
                        color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                >
                    <ArrowRight size={18} />
                </button>
                <div>
                    <h2 style={{ fontSize: 18, fontWeight: 800 }}>إعدادات الحضور</h2>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>النقاط والسماحية والاستثناءات</p>
                </div>
            </div>

            {/* ═══════════════════════════════════════ */}
            {/* Grace Period Section */}
            {/* ═══════════════════════════════════════ */}
            <h3 className="section-title" style={{ fontSize: 14 }}>
                <Timer size={16} />
                سماحية التأخير
            </h3>
            <div className="glass-card" style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
                    لن يتم خصم نقاط إذا كان التأخير ضمن فترة السماح المحددة
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <input
                        type="range"
                        min="0"
                        max="60"
                        value={gracePeriod}
                        onChange={e => setGracePeriod(Number(e.target.value))}
                        style={{ flex: 1, accentColor: 'var(--accent-teal)' }}
                    />
                    <div style={{
                        minWidth: 60, textAlign: 'center', padding: '8px 12px',
                        borderRadius: 'var(--radius-md)', background: 'var(--accent-teal-soft, rgba(20,184,166,0.15))',
                        color: 'var(--accent-teal)', fontWeight: 800, fontSize: 16,
                        fontFamily: 'var(--font-numeric)',
                    }}>
                        {gracePeriod} <span style={{ fontSize: 10, fontWeight: 600 }}>د</span>
                    </div>
                </div>

                {/* Visual indicator */}
                <div style={{
                    marginTop: 12, padding: '10px 14px', borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-glass-strong)', border: '1px solid var(--border-glass)',
                    display: 'flex', alignItems: 'center', gap: 8,
                }}>
                    <Clock size={14} style={{ color: 'var(--accent-teal)', flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        مثال: إذا بدأ الدوام الساعة <strong>8:00</strong> فسيتم احتساب التأخير بعد <strong style={{ color: 'var(--accent-teal)' }}>8:{gracePeriod.toString().padStart(2, '0')}</strong>
                    </span>
                </div>
            </div>

            {/* ═══════════════════════════════════════ */}
            {/* Late Deduction Section */}
            {/* ═══════════════════════════════════════ */}
            <h3 className="section-title" style={{ fontSize: 14 }}>
                <TrendingDown size={16} />
                خصم النقاط على التأخير
            </h3>
            <div className="glass-card" style={{ marginBottom: 16 }}>
                {/* Per minute deduction */}
                <div style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <div>
                            <div style={{ fontSize: 13, fontWeight: 700 }}>الخصم لكل دقيقة تأخير</div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>عدد النقاط المخصومة لكل دقيقة بعد فترة السماح</div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <button
                            onClick={() => setLateDeductionPerMinute(Math.max(0, lateDeductionPerMinute - 1))}
                            style={{
                                width: 36, height: 36, borderRadius: 'var(--radius-md)',
                                background: 'var(--bg-glass-strong)', border: '1px solid var(--border-glass)',
                                color: 'var(--text-secondary)', fontSize: 18, fontWeight: 700,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                        >−</button>
                        <div style={{
                            flex: 1, textAlign: 'center', padding: '10px',
                            borderRadius: 'var(--radius-md)', background: 'var(--accent-rose-soft)',
                            color: 'var(--accent-rose)', fontWeight: 800, fontSize: 22,
                            fontFamily: 'var(--font-numeric)',
                        }}>
                            −{lateDeductionPerMinute}
                            <span style={{ fontSize: 11, fontWeight: 600, display: 'block', marginTop: 2 }}>نقطة / دقيقة</span>
                        </div>
                        <button
                            onClick={() => setLateDeductionPerMinute(lateDeductionPerMinute + 1)}
                            style={{
                                width: 36, height: 36, borderRadius: 'var(--radius-md)',
                                background: 'var(--bg-glass-strong)', border: '1px solid var(--border-glass)',
                                color: 'var(--text-secondary)', fontSize: 18, fontWeight: 700,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                        >+</button>
                    </div>
                </div>

                <div style={{ height: 1, background: 'var(--border-glass)', margin: '4px 0 16px' }} />

                {/* Max deduction */}
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <div>
                            <div style={{ fontSize: 13, fontWeight: 700 }}>الحد الأقصى للخصم</div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>أقصى نقاط يمكن خصمها في اليوم الواحد</div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <input
                            type="range"
                            min="10"
                            max="200"
                            step="5"
                            value={maxLateDeduction}
                            onChange={e => setMaxLateDeduction(Number(e.target.value))}
                            style={{ flex: 1, accentColor: 'var(--accent-rose)' }}
                        />
                        <div style={{
                            minWidth: 55, textAlign: 'center', padding: '6px 10px',
                            borderRadius: 'var(--radius-md)', background: 'var(--accent-rose-soft)',
                            color: 'var(--accent-rose)', fontWeight: 800, fontSize: 15,
                            fontFamily: 'var(--font-numeric)',
                        }}>
                            {maxLateDeduction}
                        </div>
                    </div>
                </div>

                {/* Example calculation */}
                <div style={{
                    marginTop: 14, padding: '10px 14px', borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-glass-strong)', border: '1px solid var(--border-glass)',
                }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                        <AlertTriangle size={12} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: 3 }} />
                        مثال: تأخير 30 دقيقة
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        الخصم = {Math.min(30 * lateDeductionPerMinute, maxLateDeduction)} نقطة
                        <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>
                            {' ('}30 × {lateDeductionPerMinute} = {30 * lateDeductionPerMinute}
                            {30 * lateDeductionPerMinute > maxLateDeduction ? ` → الحد الأقصى ${maxLateDeduction}` : ''}
                            {')'}
                        </span>
                    </div>
                </div>
            </div>

            {/* ═══════════════════════════════════════ */}
            {/* Overtime Bonus Section */}
            {/* ═══════════════════════════════════════ */}
            <h3 className="section-title" style={{ fontSize: 14 }}>
                <TrendingUp size={16} />
                زيادة النقاط على الوقت الإضافي
            </h3>
            <div className="glass-card" style={{ marginBottom: 16 }}>
                {/* Per hour bonus */}
                <div style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <div>
                            <div style={{ fontSize: 13, fontWeight: 700 }}>المكافأة لكل ساعة إضافية</div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>عدد النقاط المضافة لكل ساعة عمل إضافية</div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <button
                            onClick={() => setOvertimeBonusPerHour(Math.max(0, overtimeBonusPerHour - 1))}
                            style={{
                                width: 36, height: 36, borderRadius: 'var(--radius-md)',
                                background: 'var(--bg-glass-strong)', border: '1px solid var(--border-glass)',
                                color: 'var(--text-secondary)', fontSize: 18, fontWeight: 700,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                        >−</button>
                        <div style={{
                            flex: 1, textAlign: 'center', padding: '10px',
                            borderRadius: 'var(--radius-md)', background: 'var(--accent-emerald-soft)',
                            color: 'var(--accent-emerald)', fontWeight: 800, fontSize: 22,
                            fontFamily: 'var(--font-numeric)',
                        }}>
                            +{overtimeBonusPerHour}
                            <span style={{ fontSize: 11, fontWeight: 600, display: 'block', marginTop: 2 }}>نقطة / ساعة</span>
                        </div>
                        <button
                            onClick={() => setOvertimeBonusPerHour(overtimeBonusPerHour + 1)}
                            style={{
                                width: 36, height: 36, borderRadius: 'var(--radius-md)',
                                background: 'var(--bg-glass-strong)', border: '1px solid var(--border-glass)',
                                color: 'var(--text-secondary)', fontSize: 18, fontWeight: 700,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                        >+</button>
                    </div>
                </div>

                <div style={{ height: 1, background: 'var(--border-glass)', margin: '4px 0 16px' }} />

                {/* Max overtime bonus */}
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <div>
                            <div style={{ fontSize: 13, fontWeight: 700 }}>الحد الأقصى للمكافأة</div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>أقصى نقاط يمكن إضافتها للوقت الإضافي يومياً</div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <input
                            type="range"
                            min="10"
                            max="200"
                            step="5"
                            value={maxOvertimeBonus}
                            onChange={e => setMaxOvertimeBonus(Number(e.target.value))}
                            style={{ flex: 1, accentColor: 'var(--accent-emerald)' }}
                        />
                        <div style={{
                            minWidth: 55, textAlign: 'center', padding: '6px 10px',
                            borderRadius: 'var(--radius-md)', background: 'var(--accent-emerald-soft)',
                            color: 'var(--accent-emerald)', fontWeight: 800, fontSize: 15,
                            fontFamily: 'var(--font-numeric)',
                        }}>
                            {maxOvertimeBonus}
                        </div>
                    </div>
                </div>

                {/* Example */}
                <div style={{
                    marginTop: 14, padding: '10px 14px', borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-glass-strong)', border: '1px solid var(--border-glass)',
                }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                        <TrendingUp size={12} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: 3 }} />
                        مثال: ساعتين إضافية
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        المكافأة = {Math.min(2 * overtimeBonusPerHour, maxOvertimeBonus)} نقطة
                        <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>
                            {' ('}2 × {overtimeBonusPerHour} = {2 * overtimeBonusPerHour}
                            {2 * overtimeBonusPerHour > maxOvertimeBonus ? ` → الحد الأقصى ${maxOvertimeBonus}` : ''}
                            {')'}
                        </span>
                    </div>
                </div>
            </div>

            {/* ═══════════════════════════════════════ */}
            {/* Employee Exemptions */}
            {/* ═══════════════════════════════════════ */}
            <h3 className="section-title" style={{ fontSize: 14 }}>
                <Shield size={16} />
                استثناء من بصمة الحضور
            </h3>
            <div className="glass-card" style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
                    الموظفون المستثنون لن يُطلب منهم تسجيل البصمة
                </p>

                {/* Search */}
                <div style={{ position: 'relative', marginBottom: 12 }}>
                    <Search size={16} style={{
                        position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                        color: 'var(--text-muted)',
                    }} />
                    <input
                        type="text"
                        className="form-input"
                        placeholder="ابحث عن موظف..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        style={{ paddingRight: 38 }}
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            style={{
                                position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                                color: 'var(--text-muted)',
                            }}
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>

                {/* Exempted count */}
                {exemptedIds.length > 0 && (
                    <div style={{
                        padding: '8px 12px', borderRadius: 'var(--radius-md)',
                        background: 'var(--accent-amber-soft, rgba(245,158,11,0.15))',
                        color: 'var(--accent-amber)',
                        fontSize: 12, fontWeight: 600,
                        marginBottom: 12,
                        display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                        <Shield size={14} />
                        {exemptedIds.length} موظف مستثنى من البصمة
                    </div>
                )}

                {/* Employee List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {filteredEmployees.map(emp => {
                        const isExempted = exemptedIds.includes(emp.id);
                        return (
                            <button
                                key={emp.id}
                                onClick={() => toggleExemption(emp.id)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10,
                                    padding: '10px 12px',
                                    borderRadius: 'var(--radius-md)',
                                    background: isExempted ? 'var(--accent-amber-soft, rgba(245,158,11,0.1))' : 'var(--bg-glass)',
                                    border: `1px solid ${isExempted ? 'var(--accent-amber, #f59e0b)' : 'var(--border-glass)'}`,
                                    width: '100%',
                                    textAlign: 'right',
                                    transition: 'all 200ms ease',
                                }}
                            >
                                <div style={{
                                    width: 34, height: 34, borderRadius: '50%',
                                    background: isExempted
                                        ? 'var(--accent-amber, #f59e0b)'
                                        : 'var(--bg-glass-strong)',
                                    color: isExempted ? 'white' : 'var(--text-muted)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 12, fontWeight: 700,
                                    transition: 'all 200ms ease',
                                    flexShrink: 0,
                                }}>
                                    {isExempted ? <UserX size={16} /> : <UserCheck size={16} />}
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 1 }}>{emp.name}</div>
                                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                                        {emp.department} • {emp.id}
                                    </div>
                                </div>
                                <span style={{
                                    padding: '3px 10px',
                                    borderRadius: 'var(--radius-full)',
                                    fontSize: 10,
                                    fontWeight: 700,
                                    background: isExempted ? 'var(--accent-amber-soft, rgba(245,158,11,0.15))' : 'var(--accent-emerald-soft)',
                                    color: isExempted ? 'var(--accent-amber, #f59e0b)' : 'var(--accent-emerald)',
                                }}>
                                    {isExempted ? 'مستثنى' : 'مطلوب'}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ═══════════════════════════════════════ */}
            {/* Save Button */}
            {/* ═══════════════════════════════════════ */}
            <button
                onClick={handleSave}
                style={{
                    width: '100%',
                    padding: '14px',
                    borderRadius: 'var(--radius-lg)',
                    background: saved
                        ? 'var(--accent-emerald)'
                        : 'linear-gradient(135deg, var(--accent-blue), var(--accent-purple))',
                    color: 'white',
                    fontSize: 14,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    marginBottom: 16,
                    transition: 'all 300ms ease',
                }}
            >
                <Save size={18} />
                {saved ? 'تم الحفظ بنجاح ✓' : 'حفظ الإعدادات'}
            </button>
        </div>
    );
}
