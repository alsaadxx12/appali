import React, { useState, useEffect } from 'react';
import {
    ArrowRight, Lock, ShieldCheck, ShieldAlert,
    CheckCircle, XCircle, Smartphone, AlertTriangle, Loader2
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
    isBiometricAvailable,
    getBiometricSettings,
    saveBiometricSettings,
    BiometricSettings,
} from '../../utils/biometricAuth';

interface Props {
    onBack: () => void;
}

export default function BiometricSettingsPage({ onBack }: Props) {
    const { user } = useAuth();
    const [deviceSupported, setDeviceSupported] = useState<boolean | null>(null);
    const [settings, setSettings] = useState<BiometricSettings>({ enabled: false, required: false });
    const [loading, setLoading] = useState(true);

    const isAdmin = user?.role === 'admin';

    useEffect(() => { init(); }, []);

    const init = async () => {
        setLoading(true);
        try {
            const [supported, savedSettings] = await Promise.all([
                isBiometricAvailable(),
                getBiometricSettings(),
            ]);
            setDeviceSupported(supported);
            setSettings(savedSettings);
        } catch (e) {
            console.error('Error initializing:', e);
        } finally {
            setLoading(false);
        }
    };

    const handleToggleEnabled = async () => {
        const updated = { ...settings, enabled: !settings.enabled };
        setSettings(updated);
        try { await saveBiometricSettings(updated); } catch { setSettings(settings); }
    };

    const handleToggleRequired = async () => {
        const updated = { ...settings, required: !settings.required };
        setSettings(updated);
        try { await saveBiometricSettings(updated); } catch { setSettings(settings); }
    };

    if (loading) {
        return (
            <div className="page-content page-enter" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}>
                <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    <Loader2 size={32} style={{ margin: '0 auto 10px', display: 'block', animation: 'spin 1s linear infinite' }} />
                    <div style={{ fontSize: 13 }}>جاري التحميل...</div>
                </div>
            </div>
        );
    }

    return (
        <div className="page-content page-enter">
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <button onClick={onBack} style={{
                    width: 36, height: 36, borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-glass)', border: '1px solid var(--border-glass)',
                    color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <ArrowRight size={18} />
                </button>
                <div style={{ flex: 1 }}>
                    <h2 style={{ fontSize: 18, fontWeight: 800 }}>المصادقة البيومترية</h2>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>التحقق من الهوية عند تسجيل الحضور</p>
                </div>
            </div>

            {/* Hero Card */}
            <div className="glass-card" style={{
                padding: '24px 20px', textAlign: 'center', marginBottom: 16,
                position: 'relative', overflow: 'hidden',
            }}>
                <div style={{
                    position: 'absolute', top: -30, left: '50%', transform: 'translateX(-50%)',
                    width: 160, height: 160, borderRadius: '50%',
                    background: settings.enabled ? 'rgba(16,185,129,0.08)' : 'rgba(148,163,184,0.06)',
                    filter: 'blur(40px)',
                }} />

                <div style={{
                    width: 80, height: 80, borderRadius: '50%', margin: '0 auto 14px',
                    background: settings.enabled
                        ? 'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(20,184,166,0.1))'
                        : 'var(--bg-glass-strong)',
                    border: `2px solid ${settings.enabled ? 'rgba(16,185,129,0.3)' : 'var(--border-glass)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: settings.enabled ? 'var(--accent-emerald)' : 'var(--text-muted)',
                    position: 'relative', transition: 'all 300ms ease',
                }}>
                    <Lock size={36} />
                    {settings.enabled && (
                        <div style={{
                            position: 'absolute', inset: -4, borderRadius: '50%',
                            border: '2px solid rgba(16,185,129,0.2)',
                            animation: 'leavePendingPulse 2s ease-in-out infinite',
                        }} />
                    )}
                </div>

                <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4, position: 'relative' }}>
                    {settings.enabled ? 'المصادقة البيومترية مفعلة' : 'المصادقة البيومترية معطلة'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', position: 'relative' }}>
                    {settings.enabled
                        ? 'يُطلب Face ID / بصمة / رمز الجهاز عند الحضور'
                        : 'لا يتطلب تحقق إضافي'
                    }
                </div>
            </div>

            {/* Device Support */}
            <div className="glass-card" style={{
                padding: '12px 14px', marginBottom: 12,
                display: 'flex', alignItems: 'center', gap: 10,
                borderRight: `3px solid ${deviceSupported ? 'var(--accent-emerald)' : 'var(--accent-amber)'}`,
            }}>
                <div style={{
                    width: 36, height: 36, borderRadius: 'var(--radius-md)',
                    background: deviceSupported ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
                    color: deviceSupported ? 'var(--accent-emerald)' : 'var(--accent-amber)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                    <Smartphone size={18} />
                </div>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>
                        {deviceSupported ? 'الجهاز يدعم المصادقة' : 'يتطلب اتصال آمن (HTTPS)'}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                        {deviceSupported
                            ? 'Face ID / بصمة / رمز الجهاز'
                            : 'تأكد من فتح الموقع عبر HTTPS'
                        }
                    </div>
                </div>
                {deviceSupported
                    ? <CheckCircle size={18} style={{ color: 'var(--accent-emerald)' }} />
                    : <XCircle size={18} style={{ color: 'var(--accent-amber)' }} />
                }
            </div>

            {/* Settings Toggles */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {isAdmin && (
                    <SettingToggle
                        icon={<ShieldCheck size={18} />}
                        label="تفعيل المصادقة البيومترية"
                        description="يطلب رمز قفل الهاتف قبل الحضور"
                        enabled={settings.enabled}
                        onToggle={handleToggleEnabled}
                        color="var(--accent-emerald)"
                    />
                )}

                {isAdmin && settings.enabled && (
                    <SettingToggle
                        icon={<ShieldAlert size={18} />}
                        label="إلزامي لجميع الموظفين"
                        description="يجب المصادقة قبل تسجيل الحضور"
                        enabled={settings.required}
                        onToggle={handleToggleRequired}
                        color="var(--accent-amber)"
                    />
                )}
            </div>

            {/* How it works */}
            {settings.enabled && (
                <div className="glass-card" style={{ padding: '16px', marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>كيف يعمل؟</div>
                    {[
                        'عند الضغط على زر الحضور/الانصراف',
                        'يظهر لك رمز قفل الهاتف (Face ID / بصمة / كلمة مرور)',
                        'بعد التحقق بنجاح، يتم تسجيل الحضور تلقائياً',
                    ].map((step, i) => (
                        <div key={i} style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '8px 0', borderBottom: i < 2 ? '1px solid var(--border-glass)' : 'none',
                        }}>
                            <div style={{
                                width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                                background: 'rgba(59,130,246,0.1)', color: 'var(--accent-blue)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 11, fontWeight: 800,
                            }}>
                                {i + 1}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{step}</div>
                        </div>
                    ))}
                </div>
            )}

            {/* Warning if not supported */}
            {!deviceSupported && settings.enabled && (
                <div className="glass-card" style={{
                    padding: '14px', marginBottom: 16,
                    background: 'rgba(245,158,11,0.06)',
                    border: '1px solid rgba(245,158,11,0.15)',
                }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <AlertTriangle size={18} style={{ color: 'var(--accent-amber)', flexShrink: 0, marginTop: 2 }} />
                        <div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-amber)', marginBottom: 4 }}>
                                ملاحظة
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                                المصادقة البيومترية تحتاج اتصال HTTPS آمن.
                                تأكد من فتح الموقع عبر https:// وليس http://
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div style={{ height: 60 }} />
        </div>
    );
}

// === Toggle Component ===
function SettingToggle({ icon, label, description, enabled, onToggle, color }: {
    icon: React.ReactNode;
    label: string;
    description: string;
    enabled: boolean;
    onToggle: () => void;
    color: string;
}) {
    return (
        <div className="glass-card" style={{
            padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10,
            transition: 'all 200ms ease',
            borderRight: enabled ? `3px solid ${color}` : '3px solid transparent',
        }}>
            <div style={{
                width: 36, height: 36, borderRadius: 'var(--radius-md)',
                background: enabled ? `${color}15` : 'var(--bg-glass-strong)',
                color: enabled ? color : 'var(--text-muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                transition: 'all 200ms ease',
            }}>
                {icon}
            </div>
            <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: enabled ? color : 'var(--text-secondary)' }}>
                    {label}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{description}</div>
            </div>
            <button onClick={onToggle} style={{
                width: 46, height: 26, borderRadius: 13, padding: 2,
                background: enabled ? color : 'var(--bg-glass-strong)',
                border: `1px solid ${enabled ? 'transparent' : 'var(--border-glass)'}`,
                cursor: 'pointer', position: 'relative', transition: 'all 250ms ease',
            }}>
                <div style={{
                    width: 20, height: 20, borderRadius: '50%',
                    background: 'white', transition: 'all 250ms ease',
                    transform: enabled ? 'translateX(0px)' : 'translateX(20px)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                }} />
            </button>
        </div>
    );
}
