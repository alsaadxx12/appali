import React, { useState } from 'react';
import { Save, Phone, Lock, Eye, EyeOff, UserCircle, Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface Props {
    onComplete: () => void;
}

export default function ProfileCompletionPage({ onComplete }: Props) {
    const { user, updateProfile } = useAuth();
    const [displayName, setDisplayName] = useState(user?.name || '');
    const [phone, setPhone] = useState(user?.phone || '');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const handleSave = async () => {
        if (!displayName.trim()) {
            setError('الرجاء إدخال الاسم');
            return;
        }
        setSaving(true);
        setError('');

        try {
            await updateProfile({
                name: displayName.trim(),
                phone: phone.trim(),
                password: password || undefined,
            });
            onComplete();
        } catch {
            setError('حدث خطأ أثناء الحفظ');
        }
        setSaving(false);
    };

    return (
        <div className="login-page">
            <div className="bg-pattern" />
            <div className="login-card page-enter" style={{ maxWidth: 400 }}>
                {/* User avatar from Google */}
                <div style={{
                    display: 'flex', justifyContent: 'center', marginBottom: 16,
                }}>
                    {user?.avatar ? (
                        <img
                            src={user.avatar}
                            alt=""
                            style={{
                                width: 72, height: 72, borderRadius: '50%',
                                border: '3px solid var(--accent-blue)',
                                boxShadow: '0 4px 20px rgba(59,130,246,0.3)',
                            }}
                        />
                    ) : (
                        <div style={{
                            width: 72, height: 72, borderRadius: '50%',
                            background: 'var(--accent-blue)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <UserCircle size={40} color="white" />
                        </div>
                    )}
                </div>

                <h1 className="login-title" style={{ fontSize: 18 }}>
                    مرحباً بك! 🎉
                </h1>
                <p className="login-subtitle" style={{ marginBottom: 20 }}>
                    أكمل بياناتك للبدء في استخدام النظام
                </p>

                {/* Name */}
                <div className="form-group">
                    <label className="form-label" style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                        <UserCircle size={14} color="var(--accent-blue)" />
                        الاسم الكامل
                    </label>
                    <input
                        type="text"
                        className="form-input"
                        placeholder="أدخل اسمك"
                        value={displayName}
                        onChange={e => setDisplayName(e.target.value)}
                        dir="rtl"
                    />
                </div>

                {/* Phone */}
                <div className="form-group">
                    <label className="form-label" style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                        <Phone size={14} color="var(--accent-emerald)" />
                        رقم الهاتف
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>(اختياري)</span>
                    </label>
                    <div style={{ position: 'relative' }}>
                        <input
                            type="tel"
                            className="form-input"
                            placeholder="07XXXXXXXX"
                            value={phone}
                            onChange={e => setPhone(e.target.value.replace(/[^\d+]/g, ''))}
                            dir="ltr"
                            style={{
                                paddingLeft: '50px', fontSize: 16,
                                letterSpacing: '1px', fontFamily: 'var(--font-numeric)',
                            }}
                        />
                        <div style={{
                            position: 'absolute', left: 12, top: '50%',
                            transform: 'translateY(-50%)',
                            fontSize: 12,
                        }}>🇮🇶</div>
                    </div>
                </div>

                {/* Password */}
                <div className="form-group">
                    <label className="form-label" style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                        <Lock size={14} color="var(--accent-purple)" />
                        كلمة المرور
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>(اختياري)</span>
                    </label>
                    <div style={{ position: 'relative' }}>
                        <input
                            type={showPassword ? 'text' : 'password'}
                            className="form-input"
                            placeholder="أنشئ كلمة مرور للدخول بالهاتف لاحقاً"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            dir="ltr"
                            style={{ paddingLeft: '44px' }}
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            style={{
                                position: 'absolute', left: '12px', top: '50%',
                                transform: 'translateY(-50%)',
                                background: 'none', border: 'none',
                                color: 'var(--text-muted)', cursor: 'pointer', padding: '4px',
                            }}
                        >
                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                    </div>
                </div>

                {error && (
                    <div style={{
                        padding: '10px 14px',
                        background: 'var(--accent-rose-soft)',
                        borderRadius: 'var(--radius-md)',
                        color: 'var(--accent-rose)',
                        fontSize: '12px', fontWeight: 600,
                        marginBottom: '12px', textAlign: 'center',
                    }}>{error}</div>
                )}

                <button
                    onClick={handleSave}
                    className="login-btn"
                    disabled={saving}
                    style={{ marginTop: 4 }}
                >
                    {saving ? (
                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                            <span style={{
                                width: 18, height: 18,
                                border: '2px solid rgba(255,255,255,0.3)',
                                borderTopColor: 'white', borderRadius: '50%',
                                animation: 'spin 0.6s linear infinite',
                                display: 'inline-block',
                            }} />
                            جاري الحفظ...
                        </span>
                    ) : (
                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                            <Check size={18} />
                            حفظ ومتابعة
                        </span>
                    )}
                </button>

                <button
                    onClick={onComplete}
                    style={{
                        width: '100%', padding: '10px',
                        background: 'none', border: 'none',
                        color: 'var(--text-muted)',
                        fontSize: 12, fontWeight: 600,
                        cursor: 'pointer', marginTop: 8,
                        textDecoration: 'underline',
                    }}
                >
                    تخطي الآن وإكمالها لاحقاً
                </button>
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
