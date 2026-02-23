import React, { useState, useEffect } from 'react';
import {
    ArrowRight, Lock, ShieldCheck, ShieldAlert,
    CheckCircle, XCircle, Loader2, Camera, User
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
    isBiometricAvailable,
    getBiometricSettings,
    saveBiometricSettings,
    BiometricSettings,
} from '../../utils/biometricAuth';
import {
    isFaceAngleRegistered,
} from '../../utils/faceAuth';

interface Props {
    onBack: () => void;
}

export default function BiometricSettingsPage({ onBack }: Props) {
    const { user } = useAuth();
    const [settings, setSettings] = useState<BiometricSettings>({ enabled: false, required: false });
    const [loading, setLoading] = useState(true);

    // Face status (read-only)
    const [hasFace, setHasFace] = useState(false);
    const [faceAngles, setFaceAngles] = useState<{ front: boolean; right: boolean; left: boolean; up: boolean; down: boolean }>({ front: false, right: false, left: false, up: false, down: false });

    const isAdmin = user?.role === 'admin';
    const userId = user?.id || '';

    useEffect(() => { init(); }, []);

    const init = async () => {
        setLoading(true);
        try {
            const savedSettings = await getBiometricSettings();
            setSettings(savedSettings);

            if (userId) {
                const [front, right, left, up, down] = await Promise.all([
                    isFaceAngleRegistered(userId, 'front'),
                    isFaceAngleRegistered(userId, 'right'),
                    isFaceAngleRegistered(userId, 'left'),
                    isFaceAngleRegistered(userId, 'up'),
                    isFaceAngleRegistered(userId, 'down'),
                ]);
                setFaceAngles({ front, right, left, up, down });
                setHasFace(front || right || left || up || down);
            }
        } catch (e) {
            console.error('Error loading biometric settings:', e);
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
                    <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>إعدادات التحقق من الهوية (للمدير فقط)</p>
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
                </div>

                <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4, position: 'relative' }}>
                    {settings.enabled ? 'المصادقة البيومترية مفعلة' : 'المصادقة البيومترية معطلة'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', position: 'relative' }}>
                    {settings.enabled
                        ? 'يُطلب التحقق بالوجه قبل عرض صفحة الحضور'
                        : 'لا يتطلب تحقق إضافي'
                    }
                </div>
            </div>

            {/* Settings Toggles — Admin Only */}
            {isAdmin && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                    <SettingToggle
                        icon={<ShieldCheck size={18} />}
                        label="تفعيل المصادقة البيومترية"
                        description="يتطلب التحقق بالوجه قبل تسجيل الحضور"
                        enabled={settings.enabled}
                        onToggle={handleToggleEnabled}
                        color="var(--accent-emerald)"
                    />
                    {settings.enabled && (
                        <SettingToggle
                            icon={<ShieldAlert size={18} />}
                            label="إلزامي لجميع الموظفين"
                            description="يجب التحقق بالوجه قبل تسجيل الحضور"
                            enabled={settings.required}
                            onToggle={handleToggleRequired}
                            color="var(--accent-amber)"
                        />
                    )}
                </div>
            )}

            {/* Biometric Status (Read-Only) */}
            <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 10 }}>حالة البيانات البيومترية</div>

            {/* Face Status — 3 angles */}
            <div className="glass-card" style={{ padding: '16px', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                    <div style={{
                        width: 52, height: 52, borderRadius: '50%',
                        background: hasFace ? 'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(20,184,166,0.1))' : 'var(--bg-glass-strong)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: hasFace ? 'var(--accent-emerald)' : 'var(--text-muted)',
                        border: `2px solid ${hasFace ? 'rgba(16,185,129,0.3)' : 'var(--border-glass)'}`,
                    }}>
                        <Camera size={22} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <div style={{ fontSize: 14, fontWeight: 700 }}>بصمة الوجه</div>
                            {hasFace ? (
                                <CheckCircle size={16} color="#10b981" />
                            ) : (
                                <XCircle size={16} color="#f43f5e" />
                            )}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {hasFace ? 'مسجلة ✅ — يتم تخزين embeddings فقط (بدون صور)' : 'غير مسجلة — سيُطلب التسجيل عند إنشاء الحساب'}
                        </div>
                    </div>
                </div>
                {/* Angle breakdown */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {([{ k: 'front', l: 'أمام', i: '😐' }, { k: 'right', l: 'يمين', i: '👉' }, { k: 'left', l: 'يسار', i: '👈' }, { k: 'up', l: 'أعلى', i: '☝️' }, { k: 'down', l: 'أسفل', i: '👇' }] as const).map(({ k, l, i }) => (
                        <div key={k} style={{
                            flex: '1 1 auto', minWidth: 52, padding: '6px 4px', textAlign: 'center', borderRadius: 10,
                            background: faceAngles[k] ? 'rgba(16,185,129,0.06)' : 'var(--bg-glass)',
                            border: `1px solid ${faceAngles[k] ? 'rgba(16,185,129,0.2)' : 'var(--border-glass)'}`,
                        }}>
                            <div style={{ fontSize: 14, marginBottom: 2 }}>
                                {faceAngles[k] ? '✅' : i}
                            </div>
                            <div style={{ fontSize: 9, fontWeight: 700, color: faceAngles[k] ? '#10b981' : 'var(--text-muted)' }}>
                                {l}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Info Note */}
            <div className="glass-card" style={{
                padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 10,
                background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)',
            }}>
                <User size={18} style={{ color: 'var(--accent-blue)', flexShrink: 0, marginTop: 2 }} />
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                    يتم تسجيل بصمة الوجه (5 اتجاهات) عند إنشاء حساب الموظف.
                    لا يتم تخزين أي صور — فقط embeddings رقمية مشفّرة.
                </div>
            </div>
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
            padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
        }}>
            <div style={{
                width: 40, height: 40, borderRadius: 'var(--radius-md)',
                background: enabled ? `${color}18` : 'var(--bg-glass)',
                border: `1px solid ${enabled ? `${color}30` : 'var(--border-glass)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: enabled ? color : 'var(--text-muted)',
                transition: 'all 200ms ease',
            }}>
                {icon}
            </div>
            <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{label}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{description}</div>
            </div>
            <button onClick={onToggle} style={{
                position: 'relative', width: 48, height: 28, borderRadius: 14,
                background: enabled
                    ? `linear-gradient(135deg, ${color}, ${color}cc)`
                    : 'var(--bg-glass-strong)',
                border: `1px solid ${enabled ? `${color}40` : 'var(--border-glass)'}`,
                cursor: 'pointer', transition: 'all 200ms ease', padding: 0,
            }}>
                <div style={{
                    position: 'absolute', top: 3,
                    left: enabled ? 'calc(100% - 25px)' : '3px',
                    width: 22, height: 22, borderRadius: '50%',
                    background: 'white',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    transition: 'left 200ms ease',
                }} />
            </button>
        </div>
    );
}
