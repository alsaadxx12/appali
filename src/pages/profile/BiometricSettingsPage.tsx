import React, { useState, useEffect } from 'react';
import {
    ArrowRight, Lock, ShieldCheck, ShieldAlert, KeyRound,
    CheckCircle, XCircle, Smartphone, AlertTriangle, Loader2, Eye, EyeOff
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
    isBiometricAvailable,
    getAuthMethod,
    getBiometricSettings,
    saveBiometricSettings,
    BiometricSettings,
    isPINRegistered,
    registerPIN,
    removePIN,
} from '../../utils/biometricAuth';

interface Props {
    onBack: () => void;
}

export default function BiometricSettingsPage({ onBack }: Props) {
    const { user } = useAuth();
    const [deviceSupported, setDeviceSupported] = useState<boolean | null>(null);
    const [authMethod, setAuthMethod] = useState<'webauthn' | 'pin'>('pin');
    const [settings, setSettings] = useState<BiometricSettings>({ enabled: false, required: false });
    const [loading, setLoading] = useState(true);
    const [hasPIN, setHasPIN] = useState(false);
    const [pinInput, setPinInput] = useState('');
    const [pinConfirm, setPinConfirm] = useState('');
    const [showPin, setShowPin] = useState(false);
    const [pinStep, setPinStep] = useState<'idle' | 'enter' | 'confirm'>('idle');
    const [pinMessage, setPinMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const isAdmin = user?.role === 'admin';
    const userId = user?.id || '';

    useEffect(() => { init(); }, []);

    const init = async () => {
        setLoading(true);
        try {
            const [supported, method, savedSettings] = await Promise.all([
                isBiometricAvailable(),
                getAuthMethod(),
                getBiometricSettings(),
            ]);
            setDeviceSupported(supported);
            setAuthMethod(method);
            setSettings(savedSettings);
            if (userId) setHasPIN(isPINRegistered(userId));
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

    const handlePINRegister = async () => {
        if (pinStep === 'idle') {
            setPinStep('enter');
            setPinInput('');
            setPinConfirm('');
            setPinMessage(null);
            return;
        }
        if (pinStep === 'enter') {
            if (pinInput.length < 4) {
                setPinMessage({ type: 'error', text: 'الرمز يجب أن يكون 4 أرقام على الأقل' });
                return;
            }
            setPinStep('confirm');
            setPinConfirm('');
            setPinMessage(null);
            return;
        }
        if (pinStep === 'confirm') {
            if (pinConfirm !== pinInput) {
                setPinMessage({ type: 'error', text: 'الرمز غير متطابق، أعد المحاولة' });
                setPinConfirm('');
                return;
            }
            const result = await registerPIN(userId, pinInput);
            if (result.success) {
                setHasPIN(true);
                setPinStep('idle');
                setPinInput('');
                setPinConfirm('');
                setPinMessage({ type: 'success', text: 'تم تسجيل رمز المصادقة بنجاح ✓' });
            } else {
                setPinMessage({ type: 'error', text: result.error || 'فشل تسجيل الرمز' });
            }
        }
    };

    const handlePINRemove = () => {
        removePIN(userId);
        setHasPIN(false);
        setPinMessage({ type: 'success', text: 'تم حذف رمز المصادقة' });
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
                    <h2 style={{ fontSize: 18, fontWeight: 800 }}>المصادقة الأمنية</h2>
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
                    {settings.enabled ? 'المصادقة مفعلة' : 'المصادقة معطلة'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', position: 'relative' }}>
                    {settings.enabled
                        ? (authMethod === 'webauthn' ? 'Face ID / بصمة / رمز الجهاز' : 'رمز PIN للتحقق من الهوية')
                        : 'لا يتطلب تحقق إضافي'
                    }
                </div>
            </div>

            {/* Auth Method Info */}
            <div className="glass-card" style={{
                padding: '12px 14px', marginBottom: 12,
                display: 'flex', alignItems: 'center', gap: 10,
                borderRight: `3px solid ${authMethod === 'webauthn' ? 'var(--accent-emerald)' : 'var(--accent-blue)'}`,
            }}>
                <div style={{
                    width: 36, height: 36, borderRadius: 'var(--radius-md)',
                    background: authMethod === 'webauthn' ? 'rgba(16,185,129,0.1)' : 'rgba(59,130,246,0.1)',
                    color: authMethod === 'webauthn' ? 'var(--accent-emerald)' : 'var(--accent-blue)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                    {authMethod === 'webauthn' ? <Smartphone size={18} /> : <KeyRound size={18} />}
                </div>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>
                        {authMethod === 'webauthn' ? 'المصادقة البيومترية' : 'المصادقة برمز PIN'}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                        {authMethod === 'webauthn'
                            ? 'Face ID / بصمة / رمز الجهاز'
                            : 'رمز سري من 4-6 أرقام'
                        }
                    </div>
                </div>
                {authMethod === 'webauthn'
                    ? <CheckCircle size={18} style={{ color: 'var(--accent-emerald)' }} />
                    : <KeyRound size={18} style={{ color: 'var(--accent-blue)' }} />
                }
            </div>

            {/* Settings Toggles */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {isAdmin && (
                    <SettingToggle
                        icon={<ShieldCheck size={18} />}
                        label="تفعيل المصادقة"
                        description={authMethod === 'webauthn' ? 'يطلب بصمة/Face ID قبل الحضور' : 'يطلب رمز PIN قبل الحضور'}
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

            {/* PIN Registration (only when auth method is PIN) */}
            {settings.enabled && authMethod === 'pin' && (
                <div className="glass-card" style={{ padding: '16px', marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <KeyRound size={16} style={{ color: 'var(--accent-blue)' }} />
                        <div style={{ fontSize: 13, fontWeight: 700 }}>رمز المصادقة (PIN)</div>
                    </div>

                    {hasPIN && pinStep === 'idle' && (
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '10px 12px', borderRadius: 'var(--radius-md)',
                            background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)',
                            marginBottom: 10,
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <CheckCircle size={16} style={{ color: 'var(--accent-emerald)' }} />
                                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-emerald)' }}>
                                    تم تسجيل رمز المصادقة
                                </span>
                            </div>
                        </div>
                    )}

                    {/* PIN Input */}
                    {pinStep !== 'idle' && (
                        <div style={{ marginBottom: 12 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)' }}>
                                {pinStep === 'enter' ? 'أدخل رمز PIN جديد (4-6 أرقام):' : 'أعد إدخال الرمز للتأكيد:'}
                            </div>
                            <div style={{ position: 'relative' }}>
                                <input
                                    type={showPin ? 'text' : 'password'}
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    maxLength={6}
                                    value={pinStep === 'enter' ? pinInput : pinConfirm}
                                    onChange={(e) => {
                                        const val = e.target.value.replace(/\D/g, '');
                                        pinStep === 'enter' ? setPinInput(val) : setPinConfirm(val);
                                    }}
                                    placeholder="• • • •"
                                    autoFocus
                                    style={{
                                        width: '100%', padding: '12px 44px 12px 12px',
                                        fontSize: 22, fontWeight: 800, letterSpacing: 8,
                                        textAlign: 'center', direction: 'ltr',
                                        borderRadius: 'var(--radius-md)',
                                        background: 'var(--bg-glass-strong)',
                                        border: '2px solid var(--border-glass)',
                                        color: 'var(--text-primary)',
                                        outline: 'none',
                                    }}
                                    onFocus={(e) => (e.target.style.borderColor = 'var(--accent-blue)')}
                                    onBlur={(e) => (e.target.style.borderColor = 'var(--border-glass)')}
                                    onKeyDown={(e) => { if (e.key === 'Enter') handlePINRegister(); }}
                                />
                                <button onClick={() => setShowPin(!showPin)} style={{
                                    position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                                    background: 'none', border: 'none', color: 'var(--text-muted)',
                                    cursor: 'pointer', padding: 4,
                                }}>
                                    {showPin ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Message */}
                    {pinMessage && (
                        <div style={{
                            fontSize: 12, fontWeight: 600, marginBottom: 10, padding: '8px 10px',
                            borderRadius: 'var(--radius-sm)',
                            color: pinMessage.type === 'success' ? 'var(--accent-emerald)' : 'var(--accent-rose)',
                            background: pinMessage.type === 'success' ? 'rgba(16,185,129,0.08)' : 'rgba(244,63,94,0.08)',
                        }}>
                            {pinMessage.text}
                        </div>
                    )}

                    {/* Buttons */}
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button
                            onClick={handlePINRegister}
                            style={{
                                flex: 1, padding: '10px', borderRadius: 'var(--radius-md)',
                                background: 'var(--accent-blue)', border: 'none',
                                color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                            }}
                        >
                            {pinStep === 'idle'
                                ? (hasPIN ? 'تغيير الرمز' : 'تسجيل رمز PIN')
                                : pinStep === 'enter' ? 'التالي' : 'تأكيد'}
                        </button>

                        {pinStep !== 'idle' && (
                            <button
                                onClick={() => { setPinStep('idle'); setPinInput(''); setPinConfirm(''); setPinMessage(null); }}
                                style={{
                                    padding: '10px 16px', borderRadius: 'var(--radius-md)',
                                    background: 'var(--bg-glass-strong)', border: '1px solid var(--border-glass)',
                                    color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                                }}
                            >
                                إلغاء
                            </button>
                        )}

                        {hasPIN && pinStep === 'idle' && (
                            <button
                                onClick={handlePINRemove}
                                style={{
                                    padding: '10px 16px', borderRadius: 'var(--radius-md)',
                                    background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.15)',
                                    color: 'var(--accent-rose)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                                }}
                            >
                                حذف
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* How it works */}
            {settings.enabled && (
                <div className="glass-card" style={{ padding: '16px', marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>كيف يعمل؟</div>
                    {(authMethod === 'webauthn' ? [
                        'عند الضغط على زر الحضور/الانصراف',
                        'يظهر لك رمز قفل الهاتف (Face ID / بصمة / كلمة مرور)',
                        'بعد التحقق بنجاح، يتم تسجيل الحضور تلقائياً',
                    ] : [
                        'سجّل رمز PIN من الأعلى',
                        'عند الضغط على زر الحضور/الانصراف يُطلب منك الرمز',
                        'بعد إدخال الرمز الصحيح، يتم تسجيل الحضور',
                    ]).map((step, i) => (
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
