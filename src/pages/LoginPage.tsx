import React, { useState } from 'react';
import {
    Eye, EyeOff, Phone, Lock, ShieldCheck, ArrowRight,
    UserPlus, LogIn, Fingerprint
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface LoginPageProps {
    onLoginSuccess: () => void;
}

type AuthMode = 'login' | 'register';
type LoginStep = 'form' | 'otp';

export default function LoginPage({ onLoginSuccess }: LoginPageProps) {
    const { login, loginWithGoogle, registerWithGoogle } = useAuth();
    const [mode, setMode] = useState<AuthMode>('login');
    const [step, setStep] = useState<LoginStep>('form');
    const [phone, setPhone] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [otp, setOtp] = useState(['', '', '', '']);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);
    const otpRefs = React.useRef<(HTMLInputElement | null)[]>([]);

    // ===== GOOGLE AUTH =====
    const handleGoogleAuth = async () => {
        setGoogleLoading(true);
        setError('');
        try {
            const result = mode === 'login'
                ? await loginWithGoogle()
                : await registerWithGoogle();

            if (result.success) {
                onLoginSuccess();
            } else {
                setError(result.error || 'فشل الاتصال بحساب Google');
            }
        } catch {
            setError('حدث خطأ أثناء الاتصال بـ Google');
        }
        setGoogleLoading(false);
    };

    // ===== LOGIN FORM =====
    const handleLoginSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!phone.trim()) {
            setError('الرجاء إدخال رقم الهاتف');
            return;
        }
        if (!password.trim()) {
            setError('الرجاء إدخال كلمة المرور');
            return;
        }

        setLoading(true);
        const result = login(phone.trim(), password);
        if (!result) {
            setError('رقم الهاتف أو كلمة المرور غير صحيحة');
            setLoading(false);
            return;
        }
        await new Promise(r => setTimeout(r, 800));
        setLoading(false);
        setStep('otp');
    };

    // ===== OTP =====
    const handleOtpChange = (index: number, value: string) => {
        if (value.length > 1) value = value.slice(-1);
        if (value && !/^\d$/.test(value)) return;
        const newOtp = [...otp];
        newOtp[index] = value;
        setOtp(newOtp);
        setError('');
        if (value && index < 3) otpRefs.current[index + 1]?.focus();
        if (value && index === 3 && newOtp.join('').length === 4) handleOtpSubmit(newOtp.join(''));
    };

    const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
        if (e.key === 'Backspace' && !otp[index] && index > 0) otpRefs.current[index - 1]?.focus();
    };

    const handleOtpPaste = (e: React.ClipboardEvent) => {
        e.preventDefault();
        const p = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
        if (p.length > 0) {
            const newOtp = [...otp];
            for (let i = 0; i < 4; i++) newOtp[i] = p[i] || '';
            setOtp(newOtp);
            if (p.length === 4) handleOtpSubmit(p);
            else otpRefs.current[p.length]?.focus();
        }
    };

    const handleOtpSubmit = async (code?: string) => {
        const otpCode = code || otp.join('');
        if (otpCode.length !== 4) { setError('الرجاء إدخال رمز التحقق كاملاً'); return; }
        setLoading(true);
        await new Promise(r => setTimeout(r, 800));
        onLoginSuccess();
        setLoading(false);
    };

    const switchMode = (m: AuthMode) => {
        setMode(m);
        setStep('form');
        setOtp(['', '', '', '']);
        setError('');
        setPassword('');
    };

    const maskedPhone = phone ? phone.replace(/(\d{3})\d{4}(\d{3})/, '$1****$2') : '';

    return (
        <div className="login-page">
            <div className="bg-pattern" />
            <div className="login-card page-enter" key={`${mode}-${step}`}>

                {/* ===== REGISTER MODE (Google only) ===== */}
                {mode === 'register' && step === 'form' && (
                    <>
                        <div className="login-logo" style={{
                            background: 'linear-gradient(135deg, rgba(59,130,246,0.2), rgba(168,85,247,0.2))',
                        }}>
                            <UserPlus size={36} />
                        </div>
                        <h1 className="login-title">إنشاء حساب جديد</h1>
                        <p className="login-subtitle" style={{ marginBottom: 24 }}>
                            أنشئ حسابك باستخدام حساب Google الخاص بك
                        </p>

                        {/* Google Sign Up */}
                        <button
                            onClick={handleGoogleAuth}
                            disabled={googleLoading}
                            style={{
                                width: '100%', padding: '14px 16px',
                                borderRadius: 'var(--radius-lg)',
                                background: 'linear-gradient(135deg, rgba(66,133,244,0.15), rgba(52,168,83,0.15))',
                                border: '1.5px solid rgba(66,133,244,0.3)',
                                color: 'var(--text-primary)',
                                fontSize: 15, fontWeight: 700,
                                cursor: googleLoading ? 'wait' : 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                gap: 12, marginBottom: 16,
                                transition: 'all 200ms ease',
                                opacity: googleLoading ? 0.7 : 1,
                            }}
                        >
                            {googleLoading ? (
                                <span style={{
                                    width: 22, height: 22,
                                    border: '2px solid rgba(255,255,255,0.3)',
                                    borderTopColor: '#4285F4', borderRadius: '50%',
                                    animation: 'spin 0.6s linear infinite',
                                    display: 'inline-block',
                                }} />
                            ) : (
                                <svg width="22" height="22" viewBox="0 0 24 24">
                                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                                </svg>
                            )}
                            {googleLoading ? 'جاري إنشاء الحساب...' : 'إنشاء حساب بـ Google'}
                        </button>

                        {error && (
                            <div style={{
                                padding: '10px 14px',
                                background: 'var(--accent-rose-soft)',
                                borderRadius: 'var(--radius-md)',
                                color: 'var(--accent-rose)',
                                fontSize: '12px', fontWeight: 600,
                                marginBottom: '12px', textAlign: 'center',
                            }}>
                                {error}
                            </div>
                        )}

                        <div style={{
                            padding: '14px', marginTop: 8,
                            background: 'rgba(59,130,246,0.06)',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid rgba(59,130,246,0.12)',
                        }}>
                            <p style={{
                                fontSize: 11, color: 'var(--text-muted)',
                                textAlign: 'center', lineHeight: 1.7,
                                margin: 0,
                            }}>
                                📋 بعد إنشاء الحساب ستتمكن من تعديل اسمك وإضافة رقم هاتف وكلمة مرور
                            </p>
                        </div>

                        {/* Switch to login */}
                        <div style={{
                            textAlign: 'center', marginTop: 20,
                            fontSize: 13, color: 'var(--text-muted)',
                        }}>
                            لديك حساب بالفعل؟{' '}
                            <button
                                onClick={() => switchMode('login')}
                                style={{
                                    background: 'none', border: 'none',
                                    color: 'var(--accent-emerald)',
                                    fontSize: 13, fontWeight: 700,
                                    cursor: 'pointer', textDecoration: 'underline',
                                }}
                            >
                                تسجيل الدخول
                            </button>
                        </div>
                    </>
                )}

                {/* ===== LOGIN MODE ===== */}
                {mode === 'login' && step === 'form' && (
                    <>
                        <div className="login-logo">
                            <Fingerprint size={36} />
                        </div>
                        <h1 className="login-title">تسجيل الدخول</h1>
                        <p className="login-subtitle">أدخل بيانات حسابك للمتابعة</p>

                        {/* Google login */}
                        <button
                            onClick={handleGoogleAuth}
                            disabled={googleLoading}
                            style={{
                                width: '100%', padding: '13px 16px',
                                borderRadius: 'var(--radius-lg)',
                                background: 'rgba(255,255,255,0.06)',
                                border: '1.5px solid rgba(255,255,255,0.12)',
                                color: 'var(--text-primary)',
                                fontSize: 14, fontWeight: 700,
                                cursor: googleLoading ? 'wait' : 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                gap: 12, marginBottom: 20,
                                transition: 'all 200ms ease',
                                opacity: googleLoading ? 0.7 : 1,
                            }}
                        >
                            {googleLoading ? (
                                <span style={{
                                    width: 20, height: 20,
                                    border: '2px solid rgba(255,255,255,0.3)',
                                    borderTopColor: 'white', borderRadius: '50%',
                                    animation: 'spin 0.6s linear infinite',
                                    display: 'inline-block',
                                }} />
                            ) : (
                                <svg width="20" height="20" viewBox="0 0 24 24">
                                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                                </svg>
                            )}
                            {googleLoading ? 'جاري تسجيل الدخول...' : 'تسجيل الدخول بحساب Google'}
                        </button>

                        {/* Divider */}
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18,
                        }}>
                            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.1)' }} />
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
                                أو بالهاتف
                            </span>
                            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.1)' }} />
                        </div>

                        {/* Phone + Password form */}
                        <form onSubmit={handleLoginSubmit}>
                            <div className="form-group">
                                <label className="form-label" style={{
                                    display: 'flex', alignItems: 'center', gap: 6,
                                }}>
                                    <Phone size={14} color="var(--accent-blue)" />
                                    رقم الهاتف
                                </label>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        type="tel" className="form-input"
                                        placeholder="07XXXXXXXX"
                                        value={phone}
                                        onChange={e => setPhone(e.target.value.replace(/[^\d+]/g, ''))}
                                        autoComplete="tel" dir="ltr"
                                        style={{
                                            paddingLeft: '50px', fontSize: 16,
                                            letterSpacing: '1px', fontFamily: 'var(--font-numeric)',
                                        }}
                                    />
                                    <div style={{
                                        position: 'absolute', left: 12, top: '50%',
                                        transform: 'translateY(-50%)',
                                        fontSize: 12, color: 'var(--text-muted)', fontWeight: 700,
                                    }}>🇮🇶</div>
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label" style={{
                                    display: 'flex', alignItems: 'center', gap: 6,
                                }}>
                                    <Lock size={14} color="var(--accent-purple)" />
                                    كلمة المرور
                                </label>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        className="form-input"
                                        placeholder="أدخل كلمة المرور"
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                        autoComplete="current-password" dir="ltr"
                                        style={{ paddingLeft: '44px' }}
                                    />
                                    <button type="button"
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

                            <button type="submit" className="login-btn" disabled={loading}>
                                {loading ? (
                                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                                        <span style={{
                                            width: 18, height: 18,
                                            border: '2px solid rgba(255,255,255,0.3)',
                                            borderTopColor: 'white', borderRadius: '50%',
                                            animation: 'spin 0.6s linear infinite',
                                            display: 'inline-block',
                                        }} />
                                        جاري التحقق...
                                    </span>
                                ) : (
                                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                                        <LogIn size={18} />
                                        تسجيل الدخول
                                    </span>
                                )}
                            </button>
                        </form>

                        {/* Switch to register */}
                        <div style={{
                            textAlign: 'center', marginTop: 16,
                            fontSize: 13, color: 'var(--text-muted)',
                        }}>
                            ليس لديك حساب؟{' '}
                            <button
                                onClick={() => switchMode('register')}
                                style={{
                                    background: 'none', border: 'none',
                                    color: 'var(--accent-blue)',
                                    fontSize: 13, fontWeight: 700,
                                    cursor: 'pointer', textDecoration: 'underline',
                                }}
                            >
                                إنشاء حساب جديد
                            </button>
                        </div>
                    </>
                )}

                {/* ===== OTP STEP (login only) ===== */}
                {step === 'otp' && (
                    <>
                        <button
                            onClick={() => { setStep('form'); setOtp(['', '', '', '']); setError(''); }}
                            style={{
                                position: 'absolute', top: 16, right: 16,
                                width: 36, height: 36,
                                borderRadius: 'var(--radius-md)',
                                background: 'var(--bg-glass)',
                                border: '1px solid var(--border-glass)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: 'var(--text-secondary)', cursor: 'pointer',
                            }}
                        >
                            <ArrowRight size={18} />
                        </button>

                        <div style={{
                            width: 72, height: 72, borderRadius: '50%',
                            background: 'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(59,130,246,0.15))',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            margin: '0 auto 16px',
                            border: '2px solid rgba(16,185,129,0.25)',
                        }}>
                            <ShieldCheck size={32} color="var(--accent-emerald)" />
                        </div>

                        <h1 className="login-title" style={{ fontSize: 18 }}>رمز التحقق</h1>
                        <p className="login-subtitle" style={{ marginBottom: 6 }}>
                            تم إرسال رمز مكون من 4 أرقام إلى
                        </p>
                        <div style={{
                            fontSize: 16, fontWeight: 800,
                            fontFamily: 'var(--font-numeric)',
                            color: 'var(--accent-blue)',
                            textAlign: 'center', marginBottom: 24,
                            direction: 'ltr', letterSpacing: '2px',
                        }}>{maskedPhone}</div>

                        <div style={{
                            display: 'flex', gap: 10, justifyContent: 'center',
                            marginBottom: 20, direction: 'ltr',
                        }}>
                            {otp.map((digit, i) => (
                                <input
                                    key={i}
                                    ref={el => { otpRefs.current[i] = el; }}
                                    type="text" inputMode="numeric" maxLength={1}
                                    value={digit}
                                    onChange={e => handleOtpChange(i, e.target.value)}
                                    onKeyDown={e => handleOtpKeyDown(i, e)}
                                    onPaste={i === 0 ? handleOtpPaste : undefined}
                                    autoFocus={i === 0}
                                    style={{
                                        width: 52, height: 58,
                                        borderRadius: 'var(--radius-lg)',
                                        border: digit ? '2px solid var(--accent-emerald)' : '2px solid var(--border-glass)',
                                        background: digit ? 'rgba(16,185,129,0.08)' : 'var(--bg-glass-strong)',
                                        color: 'var(--text-primary)',
                                        fontSize: 24, fontWeight: 800,
                                        fontFamily: 'var(--font-numeric)',
                                        textAlign: 'center', outline: 'none',
                                        transition: 'all 200ms ease',
                                    }}
                                    onFocus={e => {
                                        e.target.style.borderColor = 'var(--accent-emerald)';
                                        e.target.style.boxShadow = '0 0 0 3px rgba(16,185,129,0.15)';
                                    }}
                                    onBlur={e => {
                                        e.target.style.borderColor = digit ? 'var(--accent-emerald)' : 'var(--border-glass)';
                                        e.target.style.boxShadow = 'none';
                                    }}
                                />
                            ))}
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
                            onClick={() => handleOtpSubmit()}
                            className="login-btn"
                            disabled={loading || otp.join('').length !== 4}
                            style={{ opacity: otp.join('').length !== 4 ? 0.5 : 1 }}
                        >
                            {loading ? (
                                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                                    <span style={{
                                        width: 18, height: 18,
                                        border: '2px solid rgba(255,255,255,0.3)',
                                        borderTopColor: 'white', borderRadius: '50%',
                                        animation: 'spin 0.6s linear infinite',
                                        display: 'inline-block',
                                    }} />
                                    جاري التحقق...
                                </span>
                            ) : (
                                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                                    <ShieldCheck size={18} />
                                    تأكيد الدخول
                                </span>
                            )}
                        </button>
                    </>
                )}
            </div>

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
