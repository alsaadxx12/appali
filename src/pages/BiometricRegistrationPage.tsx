import React, { useState, useEffect, useRef } from 'react';
import { Camera, CheckCircle, Loader2, Eye, User, Shield, Fingerprint, ScanFace, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
    loadFaceModels,
    startCamera,
    stopCamera,
    registerFace,
    registerIris,
    isBiometricRegisteredInFirestore,
} from '../utils/faceAuth';

interface Props {
    onComplete: () => void;
}

export default function BiometricRegistrationPage({ onComplete }: Props) {
    const { user } = useAuth();
    const userId = user?.id || '';

    const [step, setStep] = useState<'intro' | 'face' | 'iris' | 'done'>('intro');
    const [faceRegistered, setFaceRegistered] = useState(false);
    const [irisRegistered, setIrisRegistered] = useState(false);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [progress, setProgress] = useState(0);
    const [progressText, setProgressText] = useState('');
    const [cameraReady, setCameraReady] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    useEffect(() => {
        const check = async () => {
            if (!userId) return;
            const [face, iris] = await Promise.all([
                isBiometricRegisteredInFirestore(userId, 'face'),
                isBiometricRegisteredInFirestore(userId, 'iris'),
            ]);
            setFaceRegistered(face);
            setIrisRegistered(iris);
            if (face && iris) setStep('done');
            else if (face) setStep('iris');
        };
        check();
    }, [userId]);

    useEffect(() => {
        return () => { stopCamera(streamRef.current); };
    }, []);

    const openCamera = async () => {
        setCameraReady(false);
        setMessage(null);
        const loaded = await loadFaceModels();
        if (!loaded) {
            setMessage({ type: 'error', text: 'فشل تحميل نماذج التعرف. تأكد من الاتصال بالإنترنت.' });
            return;
        }
        const stream = await startCamera(videoRef.current!);
        if (stream) {
            streamRef.current = stream;
            setCameraReady(true);
        } else {
            setMessage({ type: 'error', text: 'فشل الوصول للكاميرا. تأكد من صلاحيات الكاميرا.' });
        }
    };

    const handleCaptureFace = async () => {
        if (!videoRef.current || !userId) return;
        setLoading(true);
        setMessage(null);
        setProgress(0);
        const result = await registerFace(userId, videoRef.current, (text, p) => {
            setProgressText(text);
            setProgress(p);
        });
        setLoading(false);
        if (result.success) {
            setFaceRegistered(true);
            stopCamera(streamRef.current);
            streamRef.current = null;
            setCameraReady(false);
            setMessage({ type: 'success', text: 'تم تسجيل الوجه بنجاح!' });
            setTimeout(() => { setMessage(null); setStep('iris'); }, 1500);
        } else {
            setMessage({ type: 'error', text: result.error || 'فشل تسجيل الوجه' });
        }
    };

    const handleCaptureIris = async () => {
        if (!videoRef.current || !userId) return;
        setLoading(true);
        setMessage(null);
        setProgress(0);
        const result = await registerIris(userId, videoRef.current, (text, p) => {
            setProgressText(text);
            setProgress(p);
        });
        setLoading(false);
        if (result.success) {
            setIrisRegistered(true);
            stopCamera(streamRef.current);
            streamRef.current = null;
            setCameraReady(false);
            setMessage({ type: 'success', text: 'تم تسجيل قزحية العين بنجاح!' });
            setTimeout(() => { setStep('done'); }, 1500);
        } else {
            setMessage({ type: 'error', text: result.error || 'فشل تسجيل القزحية' });
        }
    };

    const pageStyle: React.CSSProperties = {
        minHeight: '100vh',
        minWidth: '100vw',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        background: 'linear-gradient(160deg, #0a0e1a 0%, #111827 40%, #0f172a 100%)',
        fontFamily: 'var(--font-arabic)',
        position: 'relative',
        overflow: 'hidden',
    };

    const cardStyle: React.CSSProperties = {
        maxWidth: 420,
        width: '100%',
        background: 'rgba(15, 23, 42, 0.85)',
        backdropFilter: 'blur(40px)',
        WebkitBackdropFilter: 'blur(40px)',
        borderRadius: 24,
        border: '1px solid rgba(255,255,255,0.08)',
        padding: '32px 24px',
        position: 'relative',
        zIndex: 2,
        boxShadow: '0 25px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)',
    };

    // === INTRO ===
    if (step === 'intro') {
        return (
            <div style={pageStyle}>
                {/* Animated background orbs */}
                <div style={{
                    position: 'absolute', width: 300, height: 300, borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(59,130,246,0.15), transparent 70%)',
                    top: '-10%', right: '-10%', animation: 'float 8s ease-in-out infinite',
                }} />
                <div style={{
                    position: 'absolute', width: 250, height: 250, borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(139,92,246,0.12), transparent 70%)',
                    bottom: '-5%', left: '-8%', animation: 'float 10s ease-in-out infinite reverse',
                }} />

                <div style={cardStyle}>
                    {/* Icon */}
                    <div style={{
                        width: 88, height: 88, borderRadius: '50%',
                        background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 50%, #a855f7 100%)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto 24px',
                        boxShadow: '0 12px 40px rgba(99,102,241,0.4)',
                        animation: 'pulse-glow 3s ease-in-out infinite',
                    }}>
                        <Shield size={40} color="white" strokeWidth={1.8} />
                    </div>

                    <h1 style={{
                        fontSize: 22, fontWeight: 900, textAlign: 'center',
                        marginBottom: 8, color: '#f8fafc',
                        letterSpacing: '-0.3px',
                    }}>
                        المصادقة البيومترية
                    </h1>
                    <p style={{
                        fontSize: 13, color: 'rgba(248,250,252,0.55)',
                        textAlign: 'center', lineHeight: 2, marginBottom: 28,
                    }}>
                        لتأمين حسابك، يجب تسجيل
                        <strong style={{ color: '#60a5fa' }}> بصمة الوجه </strong>
                        و
                        <strong style={{ color: '#a78bfa' }}> قزحية العين </strong>
                        <br />
                        <span style={{ fontSize: 11, color: 'rgba(248,250,252,0.35)' }}>
                            البيانات البيومترية مشفّرة ولا يمكن تغييرها لاحقاً
                        </span>
                    </p>

                    {/* Status cards */}
                    <div style={{ display: 'flex', gap: 10, marginBottom: 28 }}>
                        <div style={{
                            flex: 1, padding: '18px 12px', textAlign: 'center',
                            borderRadius: 16,
                            background: faceRegistered
                                ? 'linear-gradient(135deg, rgba(16,185,129,0.12), rgba(16,185,129,0.05))'
                                : 'rgba(255,255,255,0.03)',
                            border: `1px solid ${faceRegistered ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.06)'}`,
                            transition: 'all 0.3s ease',
                        }}>
                            <div style={{
                                width: 44, height: 44, borderRadius: '50%',
                                background: faceRegistered
                                    ? 'linear-gradient(135deg, #10b981, #059669)'
                                    : 'linear-gradient(135deg, #3b82f6, #6366f1)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                margin: '0 auto 10px',
                                boxShadow: faceRegistered ? '0 4px 20px rgba(16,185,129,0.3)' : '0 4px 20px rgba(59,130,246,0.2)',
                            }}>
                                <ScanFace size={20} color="white" strokeWidth={1.8} />
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>بصمة الوجه</div>
                            <div style={{
                                fontSize: 10, marginTop: 6, fontWeight: 600,
                                color: faceRegistered ? '#34d399' : 'rgba(248,250,252,0.35)',
                            }}>
                                {faceRegistered ? '✓ مكتمل' : 'مطلوب'}
                            </div>
                        </div>

                        <div style={{
                            flex: 1, padding: '18px 12px', textAlign: 'center',
                            borderRadius: 16,
                            background: irisRegistered
                                ? 'linear-gradient(135deg, rgba(16,185,129,0.12), rgba(16,185,129,0.05))'
                                : 'rgba(255,255,255,0.03)',
                            border: `1px solid ${irisRegistered ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.06)'}`,
                            transition: 'all 0.3s ease',
                        }}>
                            <div style={{
                                width: 44, height: 44, borderRadius: '50%',
                                background: irisRegistered
                                    ? 'linear-gradient(135deg, #10b981, #059669)'
                                    : 'linear-gradient(135deg, #8b5cf6, #a855f7)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                margin: '0 auto 10px',
                                boxShadow: irisRegistered ? '0 4px 20px rgba(16,185,129,0.3)' : '0 4px 20px rgba(139,92,246,0.2)',
                            }}>
                                <Eye size={20} color="white" strokeWidth={1.8} />
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>قزحية العين</div>
                            <div style={{
                                fontSize: 10, marginTop: 6, fontWeight: 600,
                                color: irisRegistered ? '#34d399' : 'rgba(248,250,252,0.35)',
                            }}>
                                {irisRegistered ? '✓ مكتمل' : 'مطلوب'}
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={() => setStep(faceRegistered ? 'iris' : 'face')}
                        style={{
                            width: '100%', padding: '16px',
                            borderRadius: 14,
                            background: 'linear-gradient(135deg, #3b82f6, #6366f1, #8b5cf6)',
                            border: 'none', color: 'white',
                            fontSize: 15, fontWeight: 800,
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                            fontFamily: 'var(--font-arabic)',
                            boxShadow: '0 8px 30px rgba(99,102,241,0.35)',
                            transition: 'all 0.3s ease',
                        }}
                    >
                        <Fingerprint size={20} strokeWidth={2} />
                        {faceRegistered ? 'تسجيل قزحية العين' : 'بدء المصادقة'}
                    </button>
                </div>

                <style>{`
                    @keyframes float {
                        0%, 100% { transform: translateY(0) scale(1); }
                        50% { transform: translateY(-20px) scale(1.05); }
                    }
                    @keyframes pulse-glow {
                        0%, 100% { box-shadow: 0 12px 40px rgba(99,102,241,0.3); }
                        50% { box-shadow: 0 12px 60px rgba(99,102,241,0.5); }
                    }
                `}</style>
            </div>
        );
    }

    // === DONE ===
    if (step === 'done') {
        return (
            <div style={pageStyle}>
                <div style={{
                    position: 'absolute', width: 350, height: 350, borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(16,185,129,0.12), transparent 70%)',
                    top: '20%', left: '50%', transform: 'translateX(-50%)',
                    animation: 'float 6s ease-in-out infinite',
                }} />

                <div style={cardStyle}>
                    <div style={{
                        width: 96, height: 96, borderRadius: '50%',
                        background: 'linear-gradient(135deg, #10b981, #059669)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto 24px',
                        boxShadow: '0 12px 50px rgba(16,185,129,0.4)',
                        animation: 'pulse-glow-green 3s ease-in-out infinite',
                    }}>
                        <CheckCircle size={44} color="white" strokeWidth={1.8} />
                    </div>

                    <h1 style={{
                        fontSize: 22, fontWeight: 900, textAlign: 'center',
                        marginBottom: 8, color: '#f8fafc',
                    }}>
                        اكتملت المصادقة
                    </h1>
                    <p style={{
                        fontSize: 13, color: 'rgba(248,250,252,0.55)',
                        textAlign: 'center', lineHeight: 2, marginBottom: 8,
                    }}>
                        تم تسجيل بصمة الوجه وقزحية العين بنجاح
                    </p>
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        fontSize: 11, color: 'rgba(248,250,252,0.3)',
                        marginBottom: 28,
                    }}>
                        <Sparkles size={12} />
                        البيانات مؤمّنة ومقفلة بشكل دائم
                    </div>

                    {/* Summary chips */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 28, justifyContent: 'center' }}>
                        <div style={{
                            padding: '8px 16px', borderRadius: 20,
                            background: 'rgba(16,185,129,0.1)',
                            border: '1px solid rgba(16,185,129,0.2)',
                            fontSize: 11, fontWeight: 700, color: '#34d399',
                            display: 'flex', alignItems: 'center', gap: 6,
                        }}>
                            <ScanFace size={14} /> الوجه ✓
                        </div>
                        <div style={{
                            padding: '8px 16px', borderRadius: 20,
                            background: 'rgba(16,185,129,0.1)',
                            border: '1px solid rgba(16,185,129,0.2)',
                            fontSize: 11, fontWeight: 700, color: '#34d399',
                            display: 'flex', alignItems: 'center', gap: 6,
                        }}>
                            <Eye size={14} /> القزحية ✓
                        </div>
                    </div>

                    <button
                        onClick={onComplete}
                        style={{
                            width: '100%', padding: '16px',
                            borderRadius: 14,
                            background: 'linear-gradient(135deg, #10b981, #059669)',
                            border: 'none', color: 'white',
                            fontSize: 15, fontWeight: 800,
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                            fontFamily: 'var(--font-arabic)',
                            boxShadow: '0 8px 30px rgba(16,185,129,0.35)',
                        }}
                    >
                        <Sparkles size={18} />
                        الدخول إلى النظام
                    </button>
                </div>

                <style>{`
                    @keyframes float {
                        0%, 100% { transform: translateX(-50%) translateY(0) scale(1); }
                        50% { transform: translateX(-50%) translateY(-20px) scale(1.05); }
                    }
                    @keyframes pulse-glow-green {
                        0%, 100% { box-shadow: 0 12px 40px rgba(16,185,129,0.3); }
                        50% { box-shadow: 0 12px 60px rgba(16,185,129,0.5); }
                    }
                `}</style>
            </div>
        );
    }

    // === FACE / IRIS CAPTURE ===
    const isFaceStep = step === 'face';
    const gradientColors = isFaceStep
        ? 'linear-gradient(135deg, #3b82f6, #6366f1)'
        : 'linear-gradient(135deg, #8b5cf6, #a855f7)';
    const accentHex = isFaceStep ? '#3b82f6' : '#8b5cf6';
    const glowColor = isFaceStep ? 'rgba(59,130,246,0.35)' : 'rgba(139,92,246,0.35)';

    return (
        <div style={pageStyle}>
            <div style={{
                position: 'absolute', width: 280, height: 280, borderRadius: '50%',
                background: `radial-gradient(circle, ${isFaceStep ? 'rgba(59,130,246,0.1)' : 'rgba(139,92,246,0.1)'}, transparent 70%)`,
                top: '5%', right: '-5%', animation: 'float2 7s ease-in-out infinite',
            }} />

            <div style={{ ...cardStyle, padding: '24px 20px' }}>
                {/* Step progress bar */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    marginBottom: 24, justifyContent: 'center',
                }}>
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '6px 14px', borderRadius: 20,
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.06)',
                    }}>
                        <div style={{
                            width: 20, height: 20, borderRadius: '50%',
                            background: isFaceStep ? gradientColors : '#10b981',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 10, color: 'white', fontWeight: 800,
                        }}>
                            {faceRegistered ? '✓' : '1'}
                        </div>
                        <div style={{
                            width: 28, height: 2, borderRadius: 1,
                            background: faceRegistered ? '#10b981' : 'rgba(255,255,255,0.1)',
                        }} />
                        <div style={{
                            width: 20, height: 20, borderRadius: '50%',
                            background: !isFaceStep ? gradientColors : 'rgba(255,255,255,0.08)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 10, color: 'white', fontWeight: 800,
                        }}>
                            {irisRegistered ? '✓' : '2'}
                        </div>
                    </div>
                </div>

                {/* Title */}
                <div style={{ textAlign: 'center', marginBottom: 18 }}>
                    <div style={{
                        width: 56, height: 56, borderRadius: '50%',
                        background: gradientColors,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto 14px',
                        boxShadow: `0 8px 30px ${glowColor}`,
                    }}>
                        {isFaceStep
                            ? <ScanFace size={26} color="white" strokeWidth={1.8} />
                            : <Eye size={26} color="white" strokeWidth={1.8} />
                        }
                    </div>
                    <h2 style={{ fontSize: 19, fontWeight: 900, marginBottom: 6, color: '#f8fafc' }}>
                        {isFaceStep ? 'تسجيل بصمة الوجه' : 'تسجيل قزحية العين'}
                    </h2>
                    <p style={{ fontSize: 12, color: 'rgba(248,250,252,0.4)', lineHeight: 1.8 }}>
                        {isFaceStep
                            ? 'وجّه وجهك للكاميرا مباشرة مع إضاءة جيدة'
                            : 'وجّه عينيك للكاميرا مع فتحهما جيداً'
                        }
                    </p>
                </div>

                {/* Camera viewfinder */}
                <div style={{
                    position: 'relative', width: '100%',
                    aspectRatio: '4/3', borderRadius: 18,
                    overflow: 'hidden', background: '#000',
                    marginBottom: 16,
                    border: `2px solid ${cameraReady ? accentHex : 'rgba(255,255,255,0.06)'}`,
                    boxShadow: cameraReady ? `0 0 40px ${glowColor}` : 'none',
                    transition: 'all 0.5s ease',
                }}>
                    <video
                        ref={videoRef}
                        autoPlay playsInline muted
                        style={{
                            width: '100%', height: '100%',
                            objectFit: 'cover', transform: 'scaleX(-1)',
                        }}
                    />

                    {/* Corner markers on camera */}
                    {cameraReady && !loading && (
                        <>
                            {['top-right', 'top-left', 'bottom-right', 'bottom-left'].map(pos => (
                                <div key={pos} style={{
                                    position: 'absolute',
                                    [pos.includes('top') ? 'top' : 'bottom']: 12,
                                    [pos.includes('right') ? 'right' : 'left']: 12,
                                    width: 24, height: 24,
                                    borderTop: pos.includes('top') ? `2px solid ${accentHex}` : 'none',
                                    borderBottom: pos.includes('bottom') ? `2px solid ${accentHex}` : 'none',
                                    borderRight: pos.includes('right') ? `2px solid ${accentHex}` : 'none',
                                    borderLeft: pos.includes('left') ? `2px solid ${accentHex}` : 'none',
                                    borderRadius: 4,
                                    opacity: 0.7,
                                }} />
                            ))}
                        </>
                    )}

                    {!cameraReady && (
                        <div style={{
                            position: 'absolute', inset: 0,
                            display: 'flex', flexDirection: 'column',
                            alignItems: 'center', justifyContent: 'center',
                            background: 'rgba(0,0,0,0.8)',
                            gap: 12,
                        }}>
                            <div style={{
                                width: 60, height: 60, borderRadius: '50%',
                                background: 'rgba(255,255,255,0.06)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <Camera size={26} color="rgba(255,255,255,0.4)" />
                            </div>
                            <button
                                onClick={openCamera}
                                style={{
                                    padding: '12px 28px', borderRadius: 12,
                                    background: gradientColors,
                                    border: 'none', color: 'white',
                                    fontSize: 13, fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    fontFamily: 'var(--font-arabic)',
                                    boxShadow: `0 6px 25px ${glowColor}`,
                                }}
                            >
                                <Camera size={16} />
                                تشغيل الكاميرا
                            </button>
                        </div>
                    )}

                    {/* Progress overlay */}
                    {loading && (
                        <div style={{
                            position: 'absolute', inset: 0,
                            display: 'flex', flexDirection: 'column',
                            alignItems: 'center', justifyContent: 'center',
                            background: 'rgba(0,0,0,0.65)',
                            backdropFilter: 'blur(4px)',
                        }}>
                            <div style={{
                                width: 56, height: 56, borderRadius: '50%',
                                border: `3px solid rgba(255,255,255,0.1)`,
                                borderTopColor: accentHex,
                                animation: 'spin 0.8s linear infinite',
                                marginBottom: 14,
                            }} />
                            <div style={{
                                color: 'white', fontSize: 13, fontWeight: 700,
                                marginBottom: 10,
                            }}>
                                {progressText}
                            </div>
                            <div style={{
                                width: '65%', height: 5, borderRadius: 3,
                                background: 'rgba(255,255,255,0.1)',
                                overflow: 'hidden',
                            }}>
                                <div style={{
                                    width: `${progress}%`, height: '100%',
                                    borderRadius: 3, background: gradientColors,
                                    transition: 'width 0.3s ease',
                                    boxShadow: `0 0 12px ${glowColor}`,
                                }} />
                            </div>
                            <div style={{
                                color: 'rgba(255,255,255,0.4)', fontSize: 10,
                                marginTop: 8, fontWeight: 600,
                            }}>
                                {progress}%
                            </div>
                        </div>
                    )}
                </div>

                {/* Message */}
                {message && (
                    <div style={{
                        padding: '12px 16px', borderRadius: 12,
                        background: message.type === 'success'
                            ? 'rgba(16,185,129,0.1)'
                            : 'rgba(244,63,94,0.1)',
                        border: `1px solid ${message.type === 'success'
                            ? 'rgba(16,185,129,0.2)'
                            : 'rgba(244,63,94,0.2)'}`,
                        color: message.type === 'success' ? '#34d399' : '#fb7185',
                        fontSize: 13, fontWeight: 700,
                        textAlign: 'center', marginBottom: 14,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}>
                        {message.type === 'success' ? <CheckCircle size={16} /> : null}
                        {message.text}
                    </div>
                )}

                {/* Capture button */}
                {cameraReady && !loading && (
                    <button
                        onClick={isFaceStep ? handleCaptureFace : handleCaptureIris}
                        style={{
                            width: '100%', padding: '16px',
                            borderRadius: 14,
                            background: gradientColors,
                            border: 'none', color: 'white',
                            fontSize: 15, fontWeight: 800,
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                            fontFamily: 'var(--font-arabic)',
                            boxShadow: `0 8px 30px ${glowColor}`,
                            transition: 'all 0.2s ease',
                        }}
                    >
                        <Camera size={18} strokeWidth={2} />
                        {isFaceStep ? 'التقاط بصمة الوجه' : 'التقاط قزحية العين'}
                    </button>
                )}
            </div>

            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes float2 {
                    0%, 100% { transform: translateY(0) scale(1); }
                    50% { transform: translateY(-15px) scale(1.03); }
                }
            `}</style>
        </div>
    );
}
