import React, { useState, useEffect, useRef } from 'react';
import { CheckCircle, Shield, ScanFace, ArrowRight, RotateCcw, Camera, ChevronRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
    loadFaceModels,
    startCamera,
    stopCamera,
    registerFaceAngle,
    isFaceAngleRegistered,
    FaceAngle,
} from '../utils/faceAuth';

interface Props {
    onComplete: () => void;
}

interface DirectionStep {
    angle: FaceAngle;
    label: string;
    instruction: string;
    icon: string;
    color: string;
    gradient: string;
    glow: string;
}

const DIRECTION_STEPS: DirectionStep[] = [
    {
        angle: 'front',
        label: 'أمام',
        instruction: 'انظر مباشرة إلى الكاميرا',
        icon: '😐',
        color: '#6366f1',
        gradient: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
        glow: 'rgba(99,102,241,0.4)',
    },
    {
        angle: 'right',
        label: 'يمين',
        instruction: 'لف رأسك لليمين',
        icon: '👉',
        color: '#f59e0b',
        gradient: 'linear-gradient(135deg, #f59e0b, #f97316)',
        glow: 'rgba(245,158,11,0.4)',
    },
    {
        angle: 'left',
        label: 'يسار',
        instruction: 'لف رأسك لليسار',
        icon: '👈',
        color: '#3b82f6',
        gradient: 'linear-gradient(135deg, #3b82f6, #2563eb)',
        glow: 'rgba(59,130,246,0.4)',
    },
    {
        angle: 'up',
        label: 'أعلى',
        instruction: 'ارفع رأسك لفوق',
        icon: '☝️',
        color: '#10b981',
        gradient: 'linear-gradient(135deg, #10b981, #059669)',
        glow: 'rgba(16,185,129,0.4)',
    },
    {
        angle: 'down',
        label: 'أسفل',
        instruction: 'نزّل رأسك لجوه',
        icon: '👇',
        color: '#ec4899',
        gradient: 'linear-gradient(135deg, #ec4899, #db2777)',
        glow: 'rgba(236,72,153,0.4)',
    },
];

export default function BiometricRegistrationPage({ onComplete }: Props) {
    const { user } = useAuth();
    const userId = user?.id || '';

    const [mainStep, setMainStep] = useState<'intro' | 'face_capture' | 'done'>('intro');
    const [currentIdx, setCurrentIdx] = useState(0);
    const [completedAngles, setCompletedAngles] = useState<Set<FaceAngle>>(new Set());

    const [loading, setLoading] = useState(false);
    const [cameraReady, setCameraReady] = useState(false);
    const [progressText, setProgressText] = useState('');
    const [progress, setProgress] = useState(0);
    const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
    const [countdown, setCountdown] = useState(0);
    const [recording, setRecording] = useState(false);

    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const countdownRef = useRef<any>(null);

    // Check completed angles on mount
    useEffect(() => {
        const check = async () => {
            if (!userId) return;
            const checks = await Promise.all(
                DIRECTION_STEPS.map(s => isFaceAngleRegistered(userId, s.angle))
            );
            const done = new Set<FaceAngle>();
            checks.forEach((ok, i) => { if (ok) done.add(DIRECTION_STEPS[i].angle); });
            setCompletedAngles(done);

            if (done.size >= DIRECTION_STEPS.length) {
                setMainStep('done');
            } else {
                const firstIncomplete = DIRECTION_STEPS.findIndex(s => !done.has(s.angle));
                if (firstIncomplete >= 0) setCurrentIdx(firstIncomplete);
            }
        };
        check();
    }, [userId]);

    useEffect(() => {
        return () => {
            stopCamera(streamRef.current);
            if (countdownRef.current) clearInterval(countdownRef.current);
        };
    }, []);

    const openCamera = async () => {
        setCameraReady(false);
        setMessage(null);
        const loaded = await loadFaceModels();
        if (!loaded) {
            setMessage({ type: 'error', text: 'فشل تحميل نماذج التعرف. تحقق من الاتصال.' });
            return;
        }
        const stream = await startCamera(videoRef.current!);
        if (stream) {
            streamRef.current = stream;
            setCameraReady(true);
        } else {
            setMessage({ type: 'error', text: 'فشل الوصول للكاميرا. تأكد من الصلاحيات.' });
        }
    };

    const startCaptureCountdown = () => {
        setCountdown(3);
        countdownRef.current = setInterval(() => {
            setCountdown(prev => {
                if (prev <= 1) {
                    clearInterval(countdownRef.current);
                    captureCurrentAngle();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    };

    const captureCurrentAngle = async () => {
        if (!videoRef.current || !userId) return;
        const step = DIRECTION_STEPS[currentIdx];
        setLoading(true);
        setRecording(true);
        setMessage(null);
        setProgress(0);

        const result = await registerFaceAngle({
            userId,
            video: videoRef.current,
            angle: step.angle,
            onProgress: (text, p) => {
                setProgressText(text);
                setProgress(p);
            },
        });

        setLoading(false);
        setRecording(false);
        if (result.success) {
            const newCompleted = new Set(completedAngles);
            newCompleted.add(step.angle);
            setCompletedAngles(newCompleted);
            setMessage({ type: 'success', text: `✅ تم تسجيل "${step.label}" بنجاح!` });

            if (newCompleted.size >= DIRECTION_STEPS.length) {
                stopCamera(streamRef.current);
                streamRef.current = null;
                setCameraReady(false);
                setTimeout(() => { setMessage(null); setMainStep('done'); }, 1200);
            } else {
                setTimeout(() => {
                    setMessage(null);
                    const nextIdx = DIRECTION_STEPS.findIndex(s => !newCompleted.has(s.angle));
                    if (nextIdx >= 0) setCurrentIdx(nextIdx);
                }, 1200);
            }
        } else {
            setMessage({ type: 'error', text: result.error || 'فشل التسجيل، حاول مرة أخرى' });
        }
    };

    const handleDone = async () => {
        const faceOk = await isFaceAngleRegistered(userId, 'front');
        if (!faceOk) {
            setMessage({ type: 'error', text: 'تعذر التحقق من البيانات، حاول مرة أخرى' });
            setMainStep('face_capture');
            return;
        }
        onComplete();
    };

    const msgBg = message?.type === 'success' ? 'rgba(16,185,129,0.08)' : message?.type === 'error' ? 'rgba(239,68,68,0.08)' : 'rgba(59,130,246,0.08)';
    const msgBorder = message?.type === 'success' ? 'rgba(16,185,129,0.2)' : message?.type === 'error' ? 'rgba(239,68,68,0.2)' : 'rgba(59,130,246,0.2)';
    const msgColor = message?.type === 'success' ? '#34d399' : message?.type === 'error' ? '#f87171' : '#60a5fa';

    // ====== INTRO ======
    if (mainStep === 'intro') {
        return (
            <div style={pageStyle}>
                <div style={{ position: 'absolute', width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.08), transparent 70%)', top: '-5%', left: '-10%' }} />
                <div style={{ position: 'absolute', width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle, rgba(236,72,153,0.06), transparent 70%)', bottom: '5%', right: '-5%' }} />

                <div style={{ ...cardStyle, padding: '28px 20px' }}>
                    {/* Logo area */}
                    <div style={{ textAlign: 'center', marginBottom: 20 }}>
                        <div style={{
                            width: 72, height: 72, borderRadius: 20, margin: '0 auto 14px',
                            background: 'linear-gradient(135deg, #6366f1, #8b5cf6, #ec4899)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: '0 12px 40px rgba(99,102,241,0.4)',
                            animation: 'introFloat 3s ease-in-out infinite',
                        }}>
                            <ScanFace size={34} color="white" strokeWidth={1.8} />
                        </div>
                        <h1 style={{ fontSize: 20, fontWeight: 900, color: '#f8fafc', marginBottom: 6, fontFamily: 'var(--font-arabic)' }}>
                            تسجيل الوجه البيومتري
                        </h1>
                        <p style={{ fontSize: 12.5, color: 'rgba(248,250,252,0.45)', lineHeight: 1.7, maxWidth: 280, margin: '0 auto' }}>
                            سنلتقط وجهك من 5 اتجاهات مختلفة لبناء نموذج آمن ودقيق
                        </p>
                    </div>

                    {/* Security badge */}
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 12,
                        background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.12)', marginBottom: 18,
                    }}>
                        <Shield size={16} color="#34d399" />
                        <div>
                            <span style={{ fontSize: 11.5, fontWeight: 700, color: '#34d399' }}>تخزين آمن — بصمات رقمية فقط</span>
                            <br />
                            <span style={{ fontSize: 10, color: 'rgba(248,250,252,0.25)' }}>لا يتم تخزين أي صور — فقط embeddings مشفّرة</span>
                        </div>
                    </div>

                    {/* Direction cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, marginBottom: 22 }}>
                        {DIRECTION_STEPS.map((s, i) => (
                            <div key={s.angle} style={{
                                padding: '10px 4px', textAlign: 'center', borderRadius: 12,
                                background: completedAngles.has(s.angle) ? 'rgba(16,185,129,0.06)' : 'rgba(255,255,255,0.02)',
                                border: `1px solid ${completedAngles.has(s.angle) ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.04)'}`,
                                transition: 'all 0.3s ease',
                            }}>
                                <div style={{ fontSize: 18, marginBottom: 4 }}>
                                    {completedAngles.has(s.angle) ? '✅' : s.icon}
                                </div>
                                <div style={{ fontSize: 9, fontWeight: 800, color: completedAngles.has(s.angle) ? '#34d399' : 'rgba(255,255,255,0.4)' }}>
                                    {s.label}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Start button */}
                    <button
                        onClick={() => setMainStep('face_capture')}
                        style={{
                            width: '100%', padding: '16px', borderRadius: 16,
                            background: 'linear-gradient(135deg, #6366f1, #8b5cf6, #a78bfa)',
                            border: 'none', color: 'white', fontSize: 15, fontWeight: 900,
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                            fontFamily: 'var(--font-arabic)', boxShadow: '0 10px 35px rgba(99,102,241,0.4)',
                            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 14px 40px rgba(99,102,241,0.5)'; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 10px 35px rgba(99,102,241,0.4)'; }}
                    >
                        <ScanFace size={20} strokeWidth={2} />
                        {completedAngles.size > 0 ? 'متابعة التسجيل' : 'بدء التسجيل'}
                        <ChevronRight size={18} />
                    </button>
                </div>

                <style>{`
                    @keyframes introFloat {
                        0%, 100% { transform: translateY(0) rotate(0deg); }
                        50% { transform: translateY(-8px) rotate(2deg); }
                    }
                `}</style>
            </div>
        );
    }

    // ====== DONE ======
    if (mainStep === 'done') {
        return (
            <div style={pageStyle}>
                <div style={{ ...cardStyle, padding: '30px 22px', textAlign: 'center' }}>
                    <div style={{
                        width: 80, height: 80, borderRadius: '50%', margin: '0 auto 18px',
                        background: 'linear-gradient(135deg, #10b981, #059669)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 12px 40px rgba(16,185,129,0.4)',
                        animation: 'donePulse 2s ease-in-out infinite',
                    }}>
                        <CheckCircle size={38} color="white" strokeWidth={2} />
                    </div>
                    <h2 style={{ fontSize: 20, fontWeight: 900, color: '#f8fafc', marginBottom: 8 }}>
                        تم التسجيل بنجاح! 🎉
                    </h2>
                    <p style={{ fontSize: 13, color: 'rgba(248,250,252,0.4)', marginBottom: 20, lineHeight: 1.8 }}>
                        تم تسجيل جميع الاتجاهات الخمسة بنجاح
                        <br />
                        يمكنك الآن استخدام وجهك لتسجيل الحضور
                    </p>

                    {/* Completed directions summary */}
                    <div style={{ display: 'flex', gap: 6, marginBottom: 22, justifyContent: 'center', flexWrap: 'wrap' }}>
                        {DIRECTION_STEPS.map(s => (
                            <div key={s.angle} style={{
                                padding: '6px 12px', borderRadius: 20,
                                background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.15)',
                                fontSize: 10, fontWeight: 700, color: '#34d399',
                                display: 'flex', alignItems: 'center', gap: 4,
                            }}>
                                ✓ {s.label}
                            </div>
                        ))}
                    </div>

                    <button
                        onClick={handleDone}
                        style={{
                            width: '100%', padding: '16px', borderRadius: 16,
                            background: 'linear-gradient(135deg, #10b981, #059669)',
                            border: 'none', color: 'white', fontSize: 15, fontWeight: 900,
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                            fontFamily: 'var(--font-arabic)', boxShadow: '0 10px 35px rgba(16,185,129,0.4)',
                        }}
                    >
                        <ArrowRight size={20} />
                        متابعة
                    </button>
                </div>
                <style>{`
                    @keyframes donePulse {
                        0%, 100% { box-shadow: 0 12px 40px rgba(16,185,129,0.4); }
                        50% { box-shadow: 0 16px 50px rgba(16,185,129,0.6); }
                    }
                `}</style>
            </div>
        );
    }

    // ====== FACE CAPTURE ======
    const step = DIRECTION_STEPS[currentIdx];
    const completedCount = completedAngles.size;
    const totalSteps = DIRECTION_STEPS.length;

    return (
        <div style={pageStyle}>
            {/* Ambient glow */}
            <div style={{
                position: 'absolute', width: 280, height: 280, borderRadius: '50%',
                background: `radial-gradient(circle, ${step.glow.replace('0.4', '0.08')}, transparent 70%)`,
                top: '3%', right: '-8%', transition: 'background 0.5s ease',
            }} />

            <div style={{ ...cardStyle, padding: '20px 16px' }}>
                {/* Progress bar at top */}
                <div style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)' }}>
                            {completedCount}/{totalSteps} مكتمل
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 800, color: step.color }}>
                            {step.label}
                        </span>
                    </div>
                    <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                        <div style={{
                            height: '100%', borderRadius: 2, background: step.gradient,
                            width: `${(completedCount / totalSteps) * 100}%`,
                            transition: 'width 0.5s ease',
                        }} />
                    </div>
                </div>

                {/* Step pills */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 14 }}>
                    {DIRECTION_STEPS.map((s, i) => (
                        <div key={s.angle} style={{
                            width: completedAngles.has(s.angle) ? 22 : i === currentIdx ? 28 : 18,
                            height: 22,
                            borderRadius: 11,
                            background: completedAngles.has(s.angle) ? '#10b981' : i === currentIdx ? step.gradient : 'rgba(255,255,255,0.06)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 9, color: 'white', fontWeight: 900,
                            transition: 'all 0.3s ease',
                            boxShadow: i === currentIdx ? `0 4px 16px ${step.glow}` : 'none',
                        }}>
                            {completedAngles.has(s.angle) ? '✓' : i === currentIdx ? s.icon : ''}
                        </div>
                    ))}
                </div>

                {/* Direction instruction */}
                <div style={{ textAlign: 'center', marginBottom: 12 }}>
                    <div style={{
                        width: 42, height: 42, borderRadius: 14, margin: '0 auto 8px',
                        background: step.gradient, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: `0 8px 24px ${step.glow}`, fontSize: 20,
                        animation: recording ? 'dirPulse 1s ease-in-out infinite' : 'none',
                    }}>
                        {step.icon}
                    </div>
                    <h2 style={{ fontSize: 16, fontWeight: 900, color: '#f8fafc', marginBottom: 3 }}>
                        {step.instruction}
                    </h2>
                    <p style={{ fontSize: 10.5, color: 'rgba(248,250,252,0.35)' }}>
                        فيديو 3 ثوانٍ — حرّك رأسك ببطء في هذا الاتجاه
                    </p>
                </div>

                {/* Camera viewfinder — circular */}
                <div style={{
                    position: 'relative', width: '100%', maxWidth: 280, aspectRatio: '1/1',
                    borderRadius: '50%', overflow: 'hidden', margin: '0 auto 14px',
                    background: '#000',
                    border: `3px solid ${cameraReady ? step.color : 'rgba(255,255,255,0.06)'}`,
                    boxShadow: cameraReady ? `0 0 40px ${step.glow}, inset 0 0 40px rgba(0,0,0,0.3)` : 'none',
                    transition: 'all 0.5s ease',
                }}>
                    <video ref={videoRef} autoPlay playsInline muted style={{
                        width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)',
                    }} />

                    {/* Scanning rings */}
                    {cameraReady && !loading && (
                        <>
                            <div style={{
                                position: 'absolute', inset: 6, borderRadius: '50%',
                                border: `1.5px dashed ${step.color}44`,
                                animation: 'scanRotate 8s linear infinite',
                            }} />
                            <div style={{
                                position: 'absolute', inset: 16, borderRadius: '50%',
                                border: `1px dashed ${step.color}22`,
                                animation: 'scanRotate 12s linear infinite reverse',
                            }} />
                        </>
                    )}

                    {/* Direction arrow overlay */}
                    {cameraReady && !loading && !recording && countdown === 0 && (
                        <div style={{
                            position: 'absolute', inset: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            pointerEvents: 'none',
                        }}>
                            <div style={{
                                fontSize: 42, opacity: 0.25,
                                animation: `dirBounce_${step.angle} 1.5s ease-in-out infinite`,
                            }}>
                                {step.angle === 'right' ? '→' : step.angle === 'left' ? '←' : step.angle === 'up' ? '↑' : step.angle === 'down' ? '↓' : '⊙'}
                            </div>
                        </div>
                    )}

                    {/* Countdown overlay */}
                    {countdown > 0 && (
                        <div style={{
                            position: 'absolute', inset: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)',
                        }}>
                            <div style={{
                                width: 70, height: 70, borderRadius: '50%',
                                background: step.gradient,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 32, fontWeight: 900, color: 'white',
                                boxShadow: `0 8px 30px ${step.glow}`,
                                animation: 'countPop 1s ease-in-out',
                            }}>
                                {countdown}
                            </div>
                        </div>
                    )}

                    {/* Recording overlay */}
                    {recording && (
                        <div style={{
                            position: 'absolute', inset: 0,
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                            background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)',
                        }}>
                            {/* REC indicator */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                                <div style={{
                                    width: 10, height: 10, borderRadius: '50%', background: '#f43f5e',
                                    animation: 'recBlink 1s infinite', boxShadow: '0 0 10px rgba(244,63,94,0.6)',
                                }} />
                                <span style={{ fontSize: 12, fontWeight: 900, color: '#f43f5e', letterSpacing: 2 }}>REC</span>
                            </div>
                            <div style={{ color: 'white', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>{progressText}</div>
                            {/* Circular progress */}
                            <div style={{ width: '70%', height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                                <div style={{
                                    width: `${progress}%`, height: '100%', borderRadius: 2,
                                    background: step.gradient, transition: 'width 0.2s ease',
                                }} />
                            </div>
                        </div>
                    )}

                    {/* Camera not started */}
                    {!cameraReady && !loading && (
                        <div style={{
                            position: 'absolute', inset: 0,
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                            background: 'rgba(0,0,0,0.9)', gap: 12,
                        }}>
                            <div style={{
                                width: 50, height: 50, borderRadius: '50%',
                                background: 'rgba(255,255,255,0.04)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <Camera size={22} color="rgba(255,255,255,0.3)" />
                            </div>
                            <button onClick={openCamera} style={{
                                padding: '10px 24px', borderRadius: 12, background: step.gradient,
                                border: 'none', color: 'white', fontSize: 12, fontWeight: 700,
                                cursor: 'pointer', fontFamily: 'var(--font-arabic)',
                                boxShadow: `0 6px 20px ${step.glow}`,
                            }}>
                                <Camera size={14} style={{ marginLeft: 6, verticalAlign: 'middle' }} />
                                تشغيل الكاميرا
                            </button>
                        </div>
                    )}
                </div>

                {/* Message */}
                {message && (
                    <div style={{
                        padding: '10px 14px', borderRadius: 12, background: msgBg,
                        border: `1px solid ${msgBorder}`, color: msgColor,
                        fontSize: 12, fontWeight: 700, textAlign: 'center', marginBottom: 12,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}>
                        {message.type === 'success' && <CheckCircle size={14} />}
                        {message.text}
                    </div>
                )}

                {/* Capture button */}
                {cameraReady && !loading && countdown === 0 && (
                    <button
                        onClick={startCaptureCountdown}
                        style={{
                            width: '100%', padding: '14px', borderRadius: 14,
                            background: step.gradient, border: 'none', color: 'white',
                            fontSize: 14, fontWeight: 900, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                            fontFamily: 'var(--font-arabic)', boxShadow: `0 8px 28px ${step.glow}`,
                            transition: 'transform 0.2s ease',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.02)'; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
                    >
                        🔴 تسجيل — {step.instruction} (3 ثوانٍ)
                    </button>
                )}

                {/* Completed direction chips */}
                {completedAngles.size > 0 && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
                        {DIRECTION_STEPS.map(s => completedAngles.has(s.angle) ? (
                            <div key={s.angle} style={{
                                padding: '4px 10px', borderRadius: 16,
                                background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)',
                                fontSize: 9, color: '#34d399', fontWeight: 700,
                            }}>
                                ✓ {s.label}
                            </div>
                        ) : null)}
                    </div>
                )}

                {/* Reset */}
                {completedAngles.size > 0 && !loading && (
                    <button
                        onClick={() => {
                            setCompletedAngles(new Set());
                            setCurrentIdx(0);
                            setMessage(null);
                        }}
                        style={{
                            marginTop: 10, padding: '7px 14px', borderRadius: 10,
                            background: 'transparent', border: '1px solid rgba(255,255,255,0.05)',
                            color: 'rgba(255,255,255,0.3)', fontSize: 10, fontWeight: 600,
                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                            fontFamily: 'var(--font-arabic)', width: 'auto', margin: '10px auto 0',
                        }}
                    >
                        <RotateCcw size={11} /> إعادة التسجيل
                    </button>
                )}
            </div>

            <style>{`
                @keyframes scanRotate { to { transform: rotate(360deg); } }
                @keyframes recBlink {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.3; transform: scale(1.3); }
                }
                @keyframes dirPulse {
                    0%, 100% { transform: scale(1); box-shadow: 0 8px 24px ${step.glow}; }
                    50% { transform: scale(1.1); box-shadow: 0 12px 32px ${step.glow.replace('0.4', '0.6')}; }
                }
                @keyframes countPop {
                    0% { transform: scale(0.5); opacity: 0; }
                    50% { transform: scale(1.15); }
                    100% { transform: scale(1); opacity: 1; }
                }
                @keyframes dirBounce_right {
                    0%, 100% { transform: translateX(0); }
                    50% { transform: translateX(12px); }
                }
                @keyframes dirBounce_left {
                    0%, 100% { transform: translateX(0); }
                    50% { transform: translateX(-12px); }
                }
                @keyframes dirBounce_up {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-12px); }
                }
                @keyframes dirBounce_down {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(12px); }
                }
                @keyframes dirBounce_front {
                    0%, 100% { transform: scale(1); opacity: 0.2; }
                    50% { transform: scale(1.2); opacity: 0.35; }
                }
            `}</style>
        </div>
    );
}

// Shared styles
const pageStyle: React.CSSProperties = {
    minHeight: '100dvh',
    background: 'linear-gradient(135deg, #0a0a1a 0%, #111827 50%, #0f172a 100%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px 16px',
    position: 'relative',
    overflow: 'hidden',
    fontFamily: 'var(--font-arabic)',
    direction: 'rtl',
};

const cardStyle: React.CSSProperties = {
    width: '100%',
    maxWidth: 380,
    borderRadius: 24,
    background: 'rgba(255,255,255,0.03)',
    backdropFilter: 'blur(20px)',
    border: '1px solid rgba(255,255,255,0.06)',
    boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
    position: 'relative',
    zIndex: 2,
};
