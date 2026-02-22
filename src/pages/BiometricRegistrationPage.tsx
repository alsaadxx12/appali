import React, { useState, useEffect, useRef } from 'react';
import { Camera, CheckCircle, Loader2, Eye, User, Shield } from 'lucide-react';
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

    // Steps: 'intro' -> 'face' -> 'iris' -> 'done'
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

    // Check if already registered on mount
    useEffect(() => {
        const check = async () => {
            if (!userId) return;
            const [face, iris] = await Promise.all([
                isBiometricRegisteredInFirestore(userId, 'face'),
                isBiometricRegisteredInFirestore(userId, 'iris'),
            ]);
            setFaceRegistered(face);
            setIrisRegistered(iris);
            if (face && iris) {
                setStep('done');
            } else if (face) {
                setStep('iris');
            }
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
            setMessage({ type: 'success', text: 'تم تسجيل الوجه بنجاح! ✅' });
            // Auto-advance to iris after 1.5s
            setTimeout(() => {
                setMessage(null);
                setStep('iris');
            }, 1500);
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
            setMessage({ type: 'success', text: 'تم تسجيل قزحية العين بنجاح! ✅' });
            setTimeout(() => {
                setStep('done');
            }, 1500);
        } else {
            setMessage({ type: 'error', text: result.error || 'فشل تسجيل القزحية' });
        }
    };

    // === INTRO ===
    if (step === 'intro') {
        return (
            <div className="login-page">
                <div className="bg-pattern" />
                <div className="login-card page-enter" style={{ maxWidth: 400, textAlign: 'center' }}>
                    <div style={{
                        width: 80, height: 80, borderRadius: '50%',
                        background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-purple))',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto 20px',
                    }}>
                        <Shield size={36} color="white" />
                    </div>

                    <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>
                        التسجيل البيومتري إلزامي 🔐
                    </h1>
                    <p style={{
                        fontSize: 13, color: 'var(--text-secondary)',
                        lineHeight: 1.8, marginBottom: 24,
                    }}>
                        لحماية حسابك وضمان أمان البيانات، يجب تسجيل
                        <strong style={{ color: 'var(--accent-blue)' }}> بصمة الوجه </strong>
                        و
                        <strong style={{ color: 'var(--accent-purple)' }}> قزحية العين </strong>
                        قبل استخدام النظام.
                        <br />
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            ⚠️ لا يمكن تغيير البيانات البيومترية بعد التسجيل
                        </span>
                    </p>

                    <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
                        <div style={{
                            flex: 1, padding: '14px 10px',
                            borderRadius: 'var(--radius-lg)',
                            background: faceRegistered ? 'var(--accent-emerald-soft)' : 'var(--bg-glass)',
                            border: `1px solid ${faceRegistered ? 'var(--accent-emerald)' : 'var(--border-glass)'}`,
                            textAlign: 'center',
                        }}>
                            <User size={24} color={faceRegistered ? 'var(--accent-emerald)' : 'var(--text-muted)'} style={{ margin: '0 auto 6px' }} />
                            <div style={{ fontSize: 12, fontWeight: 700 }}>بصمة الوجه</div>
                            <div style={{ fontSize: 10, color: faceRegistered ? 'var(--accent-emerald)' : 'var(--text-muted)', marginTop: 4 }}>
                                {faceRegistered ? '✅ مسجّل' : '⏳ مطلوب'}
                            </div>
                        </div>
                        <div style={{
                            flex: 1, padding: '14px 10px',
                            borderRadius: 'var(--radius-lg)',
                            background: irisRegistered ? 'var(--accent-emerald-soft)' : 'var(--bg-glass)',
                            border: `1px solid ${irisRegistered ? 'var(--accent-emerald)' : 'var(--border-glass)'}`,
                            textAlign: 'center',
                        }}>
                            <Eye size={24} color={irisRegistered ? 'var(--accent-emerald)' : 'var(--text-muted)'} style={{ margin: '0 auto 6px' }} />
                            <div style={{ fontSize: 12, fontWeight: 700 }}>قزحية العين</div>
                            <div style={{ fontSize: 10, color: irisRegistered ? 'var(--accent-emerald)' : 'var(--text-muted)', marginTop: 4 }}>
                                {irisRegistered ? '✅ مسجّل' : '⏳ مطلوب'}
                            </div>
                        </div>
                    </div>

                    <button
                        className="login-btn"
                        onClick={() => setStep(faceRegistered ? 'iris' : 'face')}
                    >
                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                            <Camera size={18} />
                            {faceRegistered ? 'تسجيل قزحية العين' : 'بدء التسجيل'}
                        </span>
                    </button>
                </div>
            </div>
        );
    }

    // === DONE ===
    if (step === 'done') {
        return (
            <div className="login-page">
                <div className="bg-pattern" />
                <div className="login-card page-enter" style={{ maxWidth: 400, textAlign: 'center' }}>
                    <div style={{
                        width: 80, height: 80, borderRadius: '50%',
                        background: 'var(--accent-emerald-soft)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto 20px',
                    }}>
                        <CheckCircle size={40} color="var(--accent-emerald)" />
                    </div>
                    <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>
                        تم التسجيل البيومتري بنجاح! 🎉
                    </h1>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
                        تم حفظ بصمة الوجه وقزحية العين بشكل آمن ودائم.
                    </p>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 24 }}>
                        🔒 البيانات البيومترية مقفلة ولا يمكن تغييرها
                    </p>

                    <button className="login-btn" onClick={onComplete}>
                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                            <CheckCircle size={18} />
                            متابعة إلى التطبيق
                        </span>
                    </button>
                </div>
            </div>
        );
    }

    // === FACE or IRIS capture ===
    const isFaceStep = step === 'face';
    const accentColor = isFaceStep ? 'var(--accent-blue)' : 'var(--accent-purple)';
    const stepTitle = isFaceStep ? 'تسجيل بصمة الوجه' : 'تسجيل قزحية العين';
    const stepIcon = isFaceStep ? <User size={24} color="white" /> : <Eye size={24} color="white" />;
    const stepInstructions = isFaceStep
        ? 'وجّه وجهك للكاميرا مباشرة مع إضاءة جيدة'
        : 'وجّه عينيك للكاميرا مباشرة واحرص على فتحهما';

    return (
        <div className="login-page">
            <div className="bg-pattern" />
            <div className="login-card page-enter" style={{ maxWidth: 420 }}>
                {/* Step indicator */}
                <div style={{
                    display: 'flex', gap: 8, marginBottom: 20, justifyContent: 'center',
                }}>
                    <div style={{
                        width: 32, height: 4, borderRadius: 2,
                        background: 'var(--accent-blue)',
                        opacity: isFaceStep ? 1 : 0.3,
                    }} />
                    <div style={{
                        width: 32, height: 4, borderRadius: 2,
                        background: 'var(--accent-purple)',
                        opacity: !isFaceStep ? 1 : 0.3,
                    }} />
                </div>

                <div style={{ textAlign: 'center', marginBottom: 16 }}>
                    <div style={{
                        width: 52, height: 52, borderRadius: '50%',
                        background: accentColor,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto 12px',
                    }}>
                        {stepIcon}
                    </div>
                    <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>{stepTitle}</h2>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        الخطوة {isFaceStep ? '1' : '2'} من 2 — {stepInstructions}
                    </p>
                </div>

                {/* Camera view */}
                <div style={{
                    position: 'relative',
                    width: '100%',
                    aspectRatio: '4/3',
                    borderRadius: 'var(--radius-lg)',
                    overflow: 'hidden',
                    background: '#000',
                    marginBottom: 16,
                }}>
                    <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        style={{
                            width: '100%', height: '100%',
                            objectFit: 'cover',
                            transform: 'scaleX(-1)',
                        }}
                    />

                    {!cameraReady && (
                        <div style={{
                            position: 'absolute', inset: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: 'rgba(0,0,0,0.7)',
                        }}>
                            <button
                                onClick={openCamera}
                                style={{
                                    padding: '14px 28px',
                                    borderRadius: 'var(--radius-lg)',
                                    background: accentColor,
                                    border: 'none',
                                    color: 'white',
                                    fontSize: 14, fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    fontFamily: 'var(--font-arabic)',
                                }}
                            >
                                <Camera size={18} />
                                فتح الكاميرا
                            </button>
                        </div>
                    )}

                    {/* Progress overlay */}
                    {loading && (
                        <div style={{
                            position: 'absolute', inset: 0,
                            display: 'flex', flexDirection: 'column',
                            alignItems: 'center', justifyContent: 'center',
                            background: 'rgba(0,0,0,0.6)',
                        }}>
                            <Loader2 size={32} color={accentColor} style={{ animation: 'spin 1s linear infinite' }} />
                            <div style={{ color: 'white', fontSize: 13, fontWeight: 700, marginTop: 10 }}>
                                {progressText}
                            </div>
                            <div style={{
                                width: '60%', height: 4, borderRadius: 2,
                                background: 'rgba(255,255,255,0.2)',
                                marginTop: 8,
                            }}>
                                <div style={{
                                    width: `${progress}%`, height: '100%',
                                    borderRadius: 2, background: accentColor,
                                    transition: 'width 0.3s ease',
                                }} />
                            </div>
                        </div>
                    )}
                </div>

                {/* Message */}
                {message && (
                    <div style={{
                        padding: '10px 14px',
                        borderRadius: 'var(--radius-md)',
                        background: message.type === 'success' ? 'var(--accent-emerald-soft)' : 'var(--accent-rose-soft)',
                        color: message.type === 'success' ? 'var(--accent-emerald)' : 'var(--accent-rose)',
                        fontSize: 12, fontWeight: 700,
                        textAlign: 'center', marginBottom: 12,
                    }}>
                        {message.text}
                    </div>
                )}

                {/* Capture button */}
                {cameraReady && !loading && (
                    <button
                        className="login-btn"
                        onClick={isFaceStep ? handleCaptureFace : handleCaptureIris}
                        style={{ background: accentColor }}
                    >
                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                            <Camera size={18} />
                            {isFaceStep ? 'التقاط بصمة الوجه' : 'التقاط قزحية العين'}
                        </span>
                    </button>
                )}
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
