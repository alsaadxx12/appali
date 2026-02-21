import React, { useState, useEffect } from 'react';
import { ArrowRight, Star, Award, TrendingUp, Zap, Save, Gift, Trophy, DollarSign, Repeat } from 'lucide-react';
import { db } from '../../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

interface Props {
    onBack: () => void;
}

type TabId = 'rules' | 'pricing';

export default function PointsSettingsPage({ onBack }: Props) {
    const [activeTab, setActiveTab] = useState<TabId>('rules');

    // === Rules State ===
    const [pointsPerDay, setPointsPerDay] = useState(10);
    const [latePenalty, setLatePenalty] = useState(5);
    const [absentPenalty, setAbsentPenalty] = useState(10);
    const [earlyBonus, setEarlyBonus] = useState(2);
    const [overtimeBonus, setOvertimeBonus] = useState(15);
    const [perfectWeekBonus, setPerfectWeekBonus] = useState(20);
    const [perfectMonthBonus, setPerfectMonthBonus] = useState(100);

    // === Pricing State ===
    const [pointValue, setPointValue] = useState(100); // 1 point = X dinars
    const [minRedeemPoints, setMinRedeemPoints] = useState(50);
    const [maxRedeemPerMonth, setMaxRedeemPerMonth] = useState(500);

    const [saved, setSaved] = useState(false);
    const [loading, setLoading] = useState(true);

    // Load settings from Firestore
    useEffect(() => {
        const loadSettings = async () => {
            try {
                const snap = await getDoc(doc(db, 'settings', 'points'));
                if (snap.exists()) {
                    const d = snap.data();
                    setPointsPerDay(d.pointsPerDay ?? 10);
                    setLatePenalty(d.latePenalty ?? 5);
                    setAbsentPenalty(d.absentPenalty ?? 10);
                    setEarlyBonus(d.earlyBonus ?? 2);
                    setOvertimeBonus(d.overtimeBonus ?? 15);
                    setPerfectWeekBonus(d.perfectWeekBonus ?? 20);
                    setPerfectMonthBonus(d.perfectMonthBonus ?? 100);
                    setPointValue(d.pointValue ?? 100);
                    setMinRedeemPoints(d.minRedeemPoints ?? 50);
                    setMaxRedeemPerMonth(d.maxRedeemPerMonth ?? 500);
                }
            } catch (e) {
                console.error('Error loading points settings:', e);
            } finally {
                setLoading(false);
            }
        };
        loadSettings();
    }, []);

    const handleSave = async () => {
        try {
            await setDoc(doc(db, 'settings', 'points'), {
                pointsPerDay, latePenalty, absentPenalty, earlyBonus,
                overtimeBonus, perfectWeekBonus, perfectMonthBonus,
                pointValue, minRedeemPoints, maxRedeemPerMonth,
                updatedAt: new Date().toISOString(),
            });
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch (e) {
            console.error('Error saving points settings:', e);
        }
    };

    const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
        { id: 'rules', label: 'قواعد النقاط', icon: <Award size={14} /> },
        { id: 'pricing', label: 'تسعيرة النقاط', icon: <DollarSign size={14} /> },
    ];

    if (loading) {
        return (
            <div className="page-content page-enter" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>جاري التحميل...</div>
            </div>
        );
    }

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
                <div>
                    <h2 style={{ fontSize: 18, fontWeight: 800 }}>إعدادات النقاط</h2>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>نظام المكافآت والخصومات والتسعيرة</p>
                </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'var(--bg-glass)', borderRadius: 'var(--radius-lg)', padding: 3 }}>
                {tabs.map(tab => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                        flex: 1, padding: '10px 8px', borderRadius: 'var(--radius-md)',
                        background: activeTab === tab.id ? 'var(--bg-card)' : 'transparent',
                        color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-muted)',
                        fontSize: 12, fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                        boxShadow: activeTab === tab.id ? '0 2px 8px rgba(0,0,0,0.2)' : 'none',
                        transition: 'all 200ms ease',
                    }}>
                        {tab.icon} {tab.label}
                    </button>
                ))}
            </div>

            {/* ═══ RULES TAB ═══ */}
            {activeTab === 'rules' && (
                <>
                    <h3 className="section-title" style={{ fontSize: 14 }}>
                        <Award size={16} /> قواعد المكافآت
                    </h3>
                    <div className="glass-card" style={{ marginBottom: 16 }}>
                        <PointsRow label="نقاط الحضور اليومي" description="نقاط تمنح عند تسجيل الحضور في الموعد"
                            value={pointsPerDay} onChange={setPointsPerDay} color="var(--accent-emerald)" icon={<Star size={16} />} />
                        <div style={{ height: 1, background: 'var(--border-glass)', margin: '12px 0' }} />
                        <PointsRow label="مكافأة الحضور المبكر" description="نقاط إضافية للحضور قبل الموعد"
                            value={earlyBonus} onChange={setEarlyBonus} color="var(--accent-teal)" icon={<Zap size={16} />} />
                        <div style={{ height: 1, background: 'var(--border-glass)', margin: '12px 0' }} />
                        <PointsRow label="مكافأة الوقت الإضافي" description="نقاط إضافية لكل ساعة عمل إضافية"
                            value={overtimeBonus} onChange={setOvertimeBonus} color="var(--accent-blue)" icon={<TrendingUp size={16} />} />
                        <div style={{ height: 1, background: 'var(--border-glass)', margin: '12px 0' }} />
                        <PointsRow label="مكافأة الأسبوع الكامل" description="مكافأة إضافية عند حضور أسبوع كامل بدون تأخير"
                            value={perfectWeekBonus} onChange={setPerfectWeekBonus} color="var(--accent-amber)" icon={<Gift size={16} />} />
                        <div style={{ height: 1, background: 'var(--border-glass)', margin: '12px 0' }} />
                        <PointsRow label="مكافأة الشهر الكامل" description="مكافأة إضافية عند حضور شهر كامل"
                            value={perfectMonthBonus} onChange={setPerfectMonthBonus} color="var(--accent-purple)" icon={<Trophy size={16} />} />
                    </div>

                    <h3 className="section-title" style={{ fontSize: 14 }}>
                        <Zap size={16} /> قواعد الخصم
                    </h3>
                    <div className="glass-card" style={{ marginBottom: 16 }}>
                        <PointsRow label="خصم التأخير" description="نقاط تخصم عند التأخير عن الموعد"
                            value={latePenalty} onChange={setLatePenalty} color="var(--accent-amber)" icon={<Star size={16} />} negative />
                        <div style={{ height: 1, background: 'var(--border-glass)', margin: '12px 0' }} />
                        <PointsRow label="خصم الغياب" description="نقاط تخصم عند الغياب بدون عذر"
                            value={absentPenalty} onChange={setAbsentPenalty} color="var(--accent-rose)" icon={<Star size={16} />} negative />
                    </div>
                </>
            )}

            {/* ═══ PRICING TAB ═══ */}
            {activeTab === 'pricing' && (
                <>
                    {/* Point Value Card */}
                    <div className="glass-card" style={{ marginBottom: 16, textAlign: 'center', padding: '24px 16px' }}>
                        <div style={{
                            width: 56, height: 56, borderRadius: '50%', margin: '0 auto 12px',
                            background: 'linear-gradient(135deg, var(--accent-amber), var(--accent-orange))',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <DollarSign size={28} color="white" />
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 6 }}>
                            سعر النقطة الواحدة
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                            <button onClick={() => setPointValue(Math.max(1, pointValue - 10))} style={{
                                width: 36, height: 36, borderRadius: 'var(--radius-md)',
                                background: 'var(--bg-glass-strong)', border: '1px solid var(--border-glass)',
                                color: 'var(--text-secondary)', fontSize: 18, fontWeight: 700,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>−</button>
                            <div style={{
                                fontSize: 32, fontWeight: 900, fontFamily: 'var(--font-numeric)',
                                color: 'var(--accent-amber)', minWidth: 100, textAlign: 'center',
                            }}>
                                {pointValue.toLocaleString()}
                            </div>
                            <button onClick={() => setPointValue(pointValue + 10)} style={{
                                width: 36, height: 36, borderRadius: 'var(--radius-md)',
                                background: 'var(--bg-glass-strong)', border: '1px solid var(--border-glass)',
                                color: 'var(--text-secondary)', fontSize: 18, fontWeight: 700,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>+</button>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                            دينار عراقي لكل نقطة
                        </div>

                        {/* Quick preview */}
                        <div style={{
                            marginTop: 14, padding: '10px', borderRadius: 'var(--radius-md)',
                            background: 'var(--bg-glass)', border: '1px solid var(--border-glass)',
                            display: 'flex', justifyContent: 'space-around',
                        }}>
                            <div>
                                <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>10 نقاط =</div>
                                <div style={{ fontSize: 14, fontWeight: 800, fontFamily: 'var(--font-numeric)', color: 'var(--accent-emerald)' }}>
                                    {(10 * pointValue).toLocaleString()} د.ع
                                </div>
                            </div>
                            <div style={{ width: 1, background: 'var(--border-glass)' }} />
                            <div>
                                <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>100 نقطة =</div>
                                <div style={{ fontSize: 14, fontWeight: 800, fontFamily: 'var(--font-numeric)', color: 'var(--accent-emerald)' }}>
                                    {(100 * pointValue).toLocaleString()} د.ع
                                </div>
                            </div>
                            <div style={{ width: 1, background: 'var(--border-glass)' }} />
                            <div>
                                <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>1000 نقطة =</div>
                                <div style={{ fontSize: 14, fontWeight: 800, fontFamily: 'var(--font-numeric)', color: 'var(--accent-emerald)' }}>
                                    {(1000 * pointValue).toLocaleString()} د.ع
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Redemption Settings */}
                    <h3 className="section-title" style={{ fontSize: 14 }}>
                        <Repeat size={16} /> إعدادات الاستبدال
                    </h3>
                    <div className="glass-card" style={{ marginBottom: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                            <div style={{
                                width: 36, height: 36, borderRadius: 'var(--radius-md)',
                                background: 'var(--accent-blue-soft)', color: 'var(--accent-blue)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                            }}>
                                <Star size={16} />
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 13, fontWeight: 700 }}>الحد الأدنى للاستبدال</div>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>أقل عدد نقاط يمكن استبداله</div>
                            </div>
                            <input type="number" className="form-input" value={minRedeemPoints}
                                onChange={e => setMinRedeemPoints(Number(e.target.value))}
                                style={{ width: 80, textAlign: 'center', fontFamily: 'var(--font-numeric)', fontWeight: 700 }} />
                        </div>
                        <div style={{ height: 1, background: 'var(--border-glass)', margin: '0 0 14px' }} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{
                                width: 36, height: 36, borderRadius: 'var(--radius-md)',
                                background: 'var(--accent-purple-soft)', color: 'var(--accent-purple)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                            }}>
                                <TrendingUp size={16} />
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 13, fontWeight: 700 }}>الحد الأقصى شهرياً</div>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>أقصى عدد نقاط يمكن استبدالها شهرياً</div>
                            </div>
                            <input type="number" className="form-input" value={maxRedeemPerMonth}
                                onChange={e => setMaxRedeemPerMonth(Number(e.target.value))}
                                style={{ width: 80, textAlign: 'center', fontFamily: 'var(--font-numeric)', fontWeight: 700 }} />
                        </div>
                    </div>

                    {/* Value Examples */}
                    <h3 className="section-title" style={{ fontSize: 14 }}>
                        <DollarSign size={16} /> أمثلة على قيمة النقاط
                    </h3>
                    <div className="glass-card" style={{ marginBottom: 16 }}>
                        {[
                            { label: 'حضور يومي', points: pointsPerDay, color: 'var(--accent-emerald)' },
                            { label: 'خصم تأخير', points: -latePenalty, color: 'var(--accent-rose)' },
                            { label: 'خصم غياب', points: -absentPenalty, color: 'var(--accent-rose)' },
                            { label: 'مكافأة شهر كامل', points: perfectMonthBonus, color: 'var(--accent-purple)' },
                        ].map((item, i) => (
                            <React.Fragment key={i}>
                                {i > 0 && <div style={{ height: 1, background: 'var(--border-glass)', margin: '8px 0' }} />}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
                                    <span style={{ fontSize: 12, fontWeight: 600 }}>{item.label}</span>
                                    <div style={{ textAlign: 'left' }}>
                                        <span style={{
                                            fontSize: 13, fontWeight: 800, fontFamily: 'var(--font-numeric)',
                                            color: item.color,
                                        }}>
                                            {item.points > 0 ? '+' : ''}{item.points} نقطة
                                        </span>
                                        <span style={{
                                            fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-numeric)',
                                            marginRight: 8,
                                        }}>
                                            = {(Math.abs(item.points) * pointValue).toLocaleString()} د.ع
                                        </span>
                                    </div>
                                </div>
                            </React.Fragment>
                        ))}
                    </div>
                </>
            )}

            {/* Save */}
            <button onClick={handleSave} style={{
                width: '100%', padding: '14px', borderRadius: 'var(--radius-lg)',
                background: saved ? 'var(--accent-emerald)' : 'linear-gradient(135deg, var(--accent-amber), var(--accent-orange))',
                color: 'white', fontSize: 14, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                marginBottom: 16, transition: 'all 300ms ease',
            }}>
                <Save size={18} />
                {saved ? 'تم الحفظ ✓' : 'حفظ الإعدادات'}
            </button>
        </div>
    );
}

// === Points Row Component ===
function PointsRow({ label, description, value, onChange, color, icon, negative }: {
    label: string;
    description: string;
    value: number;
    onChange: (v: number) => void;
    color: string;
    icon: React.ReactNode;
    negative?: boolean;
}) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
                width: 36, height: 36, borderRadius: 'var(--radius-md)',
                background: `${color}22`, color, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
                {icon}
            </div>
            <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 1 }}>{label}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{description}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button onClick={() => onChange(Math.max(0, value - 1))} style={{
                    width: 28, height: 28, borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-glass-strong)', border: '1px solid var(--border-glass)',
                    color: 'var(--text-secondary)', fontSize: 16, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>−</button>
                <span style={{
                    minWidth: 32, textAlign: 'center', fontSize: 15, fontWeight: 800,
                    color: negative ? 'var(--accent-rose)' : color,
                    fontFamily: 'var(--font-numeric)',
                }}>
                    {negative ? `-${value}` : value}
                </span>
                <button onClick={() => onChange(value + 1)} style={{
                    width: 28, height: 28, borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-glass-strong)', border: '1px solid var(--border-glass)',
                    color: 'var(--text-secondary)', fontSize: 16, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>+</button>
            </div>
        </div>
    );
}
