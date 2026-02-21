import React, { useState } from 'react';
import {
    ArrowRight, Bell, BellOff, Save, Check,
    Shield, Star, TrendingDown, Crown, Calendar,
    CheckCircle, XCircle, Volume2, Vibrate, Clock
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface Props {
    onBack: () => void;
}

type NotifTab = 'employee' | 'admin';

export default function NotificationsPage({ onBack }: Props) {
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin';
    const [activeTab, setActiveTab] = useState<NotifTab>('employee');
    const [saved, setSaved] = useState(false);

    // ══ Employee notification settings ══
    const [pointsAdd, setPointsAdd] = useState(true);
    const [pointsDeduct, setPointsDeduct] = useState(true);
    const [leaveApproved, setLeaveApproved] = useState(true);
    const [leaveRejected, setLeaveRejected] = useState(true);
    const [vipUpgrade, setVipUpgrade] = useState(true);
    const [dailyBonus, setDailyBonus] = useState(true);
    const [weeklyBonus, setWeeklyBonus] = useState(true);
    const [monthlyBonus, setMonthlyBonus] = useState(true);

    // ══ Admin notification settings ══
    const [leaveRequest, setLeaveRequest] = useState(true);
    const [employeeAbsent, setEmployeeAbsent] = useState(true);
    const [employeeLate, setEmployeeLate] = useState(true);
    const [newEmployee, setNewEmployee] = useState(true);

    // ══ General settings ══
    const [soundEnabled, setSoundEnabled] = useState(true);
    const [vibrationEnabled, setVibrationEnabled] = useState(true);

    const handleSave = () => {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

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
                    <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>🔔 إعدادات الإشعارات</h2>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>تفعيل وإطفاء التنبيهات</p>
                </div>
                <button onClick={handleSave} style={{
                    padding: '8px 16px', borderRadius: 'var(--radius-md)',
                    background: saved ? 'rgba(34,197,94,0.2)' : 'rgba(59,130,246,0.2)',
                    border: saved ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(59,130,246,0.3)',
                    color: saved ? '#22c55e' : '#3b82f6',
                    fontSize: 12, fontWeight: 700,
                    display: 'flex', alignItems: 'center', gap: 6,
                    transition: 'all 0.3s ease',
                }}>
                    {saved ? <Check size={14} /> : <Save size={14} />}
                    {saved ? 'تم ✓' : 'حفظ'}
                </button>
            </div>

            {/* Tabs */}
            <div style={{
                display: 'flex', gap: 6, marginBottom: 16,
                padding: '4px', borderRadius: 'var(--radius-lg)',
                background: 'var(--bg-glass)', border: '1px solid var(--border-glass)',
            }}>
                <button
                    onClick={() => setActiveTab('employee')}
                    style={{
                        flex: 1, padding: '10px 12px', borderRadius: 'var(--radius-md)',
                        background: activeTab === 'employee'
                            ? 'linear-gradient(135deg, rgba(59,130,246,0.2), rgba(139,92,246,0.15))'
                            : 'transparent',
                        border: activeTab === 'employee' ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent',
                        color: activeTab === 'employee' ? '#3b82f6' : 'var(--text-muted)',
                        fontSize: 12, fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        transition: 'all 0.2s ease',
                    }}
                >
                    <Bell size={14} />
                    إشعارات الموظفين
                </button>
                {isAdmin && (
                    <button
                        onClick={() => setActiveTab('admin')}
                        style={{
                            flex: 1, padding: '10px 12px', borderRadius: 'var(--radius-md)',
                            background: activeTab === 'admin'
                                ? 'linear-gradient(135deg, rgba(245,158,11,0.2), rgba(234,88,12,0.15))'
                                : 'transparent',
                            border: activeTab === 'admin' ? '1px solid rgba(245,158,11,0.3)' : '1px solid transparent',
                            color: activeTab === 'admin' ? '#f59e0b' : 'var(--text-muted)',
                            fontSize: 12, fontWeight: 700,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                            transition: 'all 0.2s ease',
                        }}
                    >
                        <Shield size={14} />
                        إشعارات المسؤولين
                    </button>
                )}
            </div>

            {/* ═══ Employee Tab ═══ */}
            {activeTab === 'employee' && (
                <>
                    {/* Points Notifications */}
                    <h3 className="section-title" style={{ fontSize: 13 }}>
                        <Star size={15} />
                        إشعارات النقاط
                    </h3>
                    <div className="glass-card" style={{ marginBottom: 16 }}>
                        <ToggleRow
                            icon={<Star size={16} />}
                            label="إضافة نقاط"
                            description="إشعار عند إضافة نقاط لرصيدك"
                            color="#22c55e"
                            enabled={pointsAdd}
                            onToggle={() => setPointsAdd(!pointsAdd)}
                        />
                        <Divider />
                        <ToggleRow
                            icon={<TrendingDown size={16} />}
                            label="خصم نقاط"
                            description="إشعار عند خصم نقاط من رصيدك"
                            color="#ef4444"
                            enabled={pointsDeduct}
                            onToggle={() => setPointsDeduct(!pointsDeduct)}
                        />
                    </div>

                    {/* VIP Notifications */}
                    <h3 className="section-title" style={{ fontSize: 13 }}>
                        <Crown size={15} />
                        إشعارات VIP
                    </h3>
                    <div className="glass-card" style={{ marginBottom: 16 }}>
                        <ToggleRow
                            icon={<Crown size={16} />}
                            label="ترقية مستوى VIP"
                            description="إشعار عند الانتقال إلى مستوى VIP جديد"
                            color="#f59e0b"
                            enabled={vipUpgrade}
                            onToggle={() => setVipUpgrade(!vipUpgrade)}
                        />
                        <Divider />
                        <ToggleRow
                            icon={<Star size={16} />}
                            label="مكافأة يومية"
                            description="إشعار عند استلام مكافأة النقاط اليومية"
                            color="#8b5cf6"
                            enabled={dailyBonus}
                            onToggle={() => setDailyBonus(!dailyBonus)}
                        />
                        <Divider />
                        <ToggleRow
                            icon={<Star size={16} />}
                            label="مكافأة أسبوعية"
                            description="إشعار عند استلام مكافأة النقاط الأسبوعية"
                            color="#3b82f6"
                            enabled={weeklyBonus}
                            onToggle={() => setWeeklyBonus(!weeklyBonus)}
                        />
                        <Divider />
                        <ToggleRow
                            icon={<Star size={16} />}
                            label="مكافأة شهرية"
                            description="إشعار عند استلام مكافأة النقاط الشهرية"
                            color="#10b981"
                            enabled={monthlyBonus}
                            onToggle={() => setMonthlyBonus(!monthlyBonus)}
                        />
                    </div>

                    {/* Leave Notifications */}
                    <h3 className="section-title" style={{ fontSize: 13 }}>
                        <Calendar size={15} />
                        إشعارات الإجازات
                    </h3>
                    <div className="glass-card" style={{ marginBottom: 16 }}>
                        <ToggleRow
                            icon={<CheckCircle size={16} />}
                            label="الموافقة على الإجازة"
                            description="إشعار عند الموافقة على طلب إجازتك"
                            color="#22c55e"
                            enabled={leaveApproved}
                            onToggle={() => setLeaveApproved(!leaveApproved)}
                        />
                        <Divider />
                        <ToggleRow
                            icon={<XCircle size={16} />}
                            label="رفض الإجازة"
                            description="إشعار عند رفض طلب إجازتك"
                            color="#ef4444"
                            enabled={leaveRejected}
                            onToggle={() => setLeaveRejected(!leaveRejected)}
                        />
                    </div>

                    {/* General Settings */}
                    <h3 className="section-title" style={{ fontSize: 13 }}>
                        <Volume2 size={15} />
                        الإعدادات العامة
                    </h3>
                    <div className="glass-card" style={{ marginBottom: 16 }}>
                        <ToggleRow
                            icon={<Volume2 size={16} />}
                            label="صوت الإشعارات"
                            description="تشغيل صوت عند وصول إشعار"
                            color="var(--accent-blue)"
                            enabled={soundEnabled}
                            onToggle={() => setSoundEnabled(!soundEnabled)}
                        />
                        <Divider />
                        <ToggleRow
                            icon={<Vibrate size={16} />}
                            label="الاهتزاز"
                            description="اهتزاز الجهاز عند وصول إشعار"
                            color="var(--accent-purple)"
                            enabled={vibrationEnabled}
                            onToggle={() => setVibrationEnabled(!vibrationEnabled)}
                        />
                    </div>
                </>
            )}

            {/* ═══ Admin Tab ═══ */}
            {activeTab === 'admin' && isAdmin && (
                <>
                    <h3 className="section-title" style={{ fontSize: 13 }}>
                        <Shield size={15} />
                        إشعارات الإدارة
                    </h3>
                    <div className="glass-card" style={{ marginBottom: 16 }}>
                        <ToggleRow
                            icon={<Calendar size={16} />}
                            label="طلب إجازة جديد"
                            description="إشعار عند تقديم موظف لطلب إجازة"
                            color="#3b82f6"
                            enabled={leaveRequest}
                            onToggle={() => setLeaveRequest(!leaveRequest)}
                        />
                        <Divider />
                        <ToggleRow
                            icon={<BellOff size={16} />}
                            label="غياب موظف"
                            description="إشعار عند غياب موظف بدون إجازة"
                            color="#ef4444"
                            enabled={employeeAbsent}
                            onToggle={() => setEmployeeAbsent(!employeeAbsent)}
                        />
                        <Divider />
                        <ToggleRow
                            icon={<Clock size={16} />}
                            label="تأخر موظف"
                            description="إشعار عند تأخر موظف عن الدوام"
                            color="#f59e0b"
                            enabled={employeeLate}
                            onToggle={() => setEmployeeLate(!employeeLate)}
                        />
                        <Divider />
                        <ToggleRow
                            icon={<Shield size={16} />}
                            label="موظف جديد"
                            description="إشعار عند تسجيل موظف جديد في النظام"
                            color="#10b981"
                            enabled={newEmployee}
                            onToggle={() => setNewEmployee(!newEmployee)}
                        />
                    </div>

                    {/* Admin general settings */}
                    <h3 className="section-title" style={{ fontSize: 13 }}>
                        <Volume2 size={15} />
                        الإعدادات العامة
                    </h3>
                    <div className="glass-card" style={{ marginBottom: 16 }}>
                        <ToggleRow
                            icon={<Volume2 size={16} />}
                            label="صوت الإشعارات"
                            description="تشغيل صوت عند وصول إشعار"
                            color="var(--accent-blue)"
                            enabled={soundEnabled}
                            onToggle={() => setSoundEnabled(!soundEnabled)}
                        />
                        <Divider />
                        <ToggleRow
                            icon={<Vibrate size={16} />}
                            label="الاهتزاز"
                            description="اهتزاز الجهاز عند وصول إشعار"
                            color="var(--accent-purple)"
                            enabled={vibrationEnabled}
                            onToggle={() => setVibrationEnabled(!vibrationEnabled)}
                        />
                    </div>
                </>
            )}

            {/* Bottom save */}
            <button onClick={handleSave} style={{
                width: '100%', padding: '14px', borderRadius: 'var(--radius-lg)',
                background: saved ? 'linear-gradient(135deg, #22c55e, #16a34a)' : 'linear-gradient(135deg, #3b82f6, #2563eb)',
                color: 'white', fontSize: 14, fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'all 0.3s ease', marginBottom: 30,
            }}>
                {saved ? <Check size={18} /> : <Save size={18} />}
                {saved ? 'تم الحفظ بنجاح ✓' : 'حفظ إعدادات الإشعارات'}
            </button>
        </div>
    );
}

// ═══ Reusable Components ═══

function Divider() {
    return <div style={{ height: 1, background: 'var(--border-glass)', margin: '14px 0' }} />;
}

function ToggleRow({ icon, label, description, color, enabled, onToggle }: {
    icon: React.ReactNode; label: string; description: string;
    color: string; enabled: boolean; onToggle: () => void;
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
            <button
                onClick={onToggle}
                style={{
                    width: 48, height: 28, borderRadius: 14, padding: 3,
                    background: enabled ? color : 'var(--bg-glass-strong)',
                    border: `1px solid ${enabled ? color : 'var(--border-glass)'}`,
                    transition: 'all 250ms ease',
                    position: 'relative', cursor: 'pointer', flexShrink: 0,
                }}
            >
                <div style={{
                    width: 20, height: 20, borderRadius: '50%', background: 'white',
                    transition: 'all 250ms cubic-bezier(0.34, 1.56, 0.64, 1)',
                    transform: enabled ? 'translateX(0px)' : 'translateX(20px)',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                }} />
            </button>
        </div>
    );
}
