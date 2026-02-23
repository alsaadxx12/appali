import React, { useState, useEffect, useRef } from 'react';
import { Camera, CheckCircle, Shield, ScanFace, Sparkles, ArrowRight, RotateCcw } from 'lucide-react';
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

interface AngleStep {
    angle: FaceAngle;
    label: string;
    instruction: string;
    hint: string;
    icon: string;
    gradient: string;
    glow: string;
}

const ANGLE_STEPS: AngleStep[] = [
    {
        angle: 'front',
        label: 'أمام',
        instruction: 'انظر مباشرة إلى الكاميرا',
        hint: 'سيتم تسجيل فيديو 3 ثوانٍ — ارمش بشكل طبيعي وابتسم قليلاً',
        icon: '😐',
        gradient: 'linear-gradient(135deg, #3b82f6, #6366f1)',
        glow: 'rgba(59,130,246,0.35)',
    },
    {
        angle: 'right',
        label: 'يمين',
        instruction: 'أدِر وجهك قليلاً نحو اليمين',
        hint: 'سيتم تسجيل فيديو 3 ثوانٍ — أمِل رأسك نحو اليمين وارمش',
        icon: '👉',
        gradient: 'linear-gradient(135deg, #f59e0b, #f97316)',
        glow: 'rgba(245,158,11,0.35)',
    },
    {
        angle: 'left',
        label: 'يسار',
        instruction: 'أدِر وجهك قليلاً نحو اليسار',
        hint: 'سيتم تسجيل فيديو 3 ثوانٍ — أمِل رأسك نحو اليسار وابتسم',
        icon: '👈',
        gradient: 'linear-gradient(135deg, #10b981, #059669)',
        glow: 'rgba(16,185,129,0.35)',
    },
];

export default function BiometricRegistrationPage({ onComplete }: Props) {
    const { user } = useAuth();
    const userId = user?.id || '';

    // Main step state: intro / face_capture / done
    const [mainStep, setMainStep] = useState<'intro' | 'face_capture' | 'done'>('intro');

    // Per-angle registration state
    const [currentAngleIdx, setCurrentAngleIdx] = useState(0);
    const [completedAngles, setCompletedAngles] = useState<Set<FaceAngle>>(new Set());

    // Camera/loading state
    const [loading, setLoading] = useState(false);
    const [cameraReady, setCameraReady] = useState(false);
    const [progressText, setProgressText] = useState('');
    const [progress, setProgress] = useState(0);
    const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
    const [countdown, setCountdown] = useState(0);

    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const countdownRef = useRef<any>(null);

    // On mount — check which angles are already done
    useEffect(() => {
        const check = async () => {
            if (!userId) return;
            const [front, right, left] = await Promise.all([
                isFaceAngleRegistered(userId, 'front'),
                isFaceAngleRegistered(userId, 'right'),
                isFaceAngleRegistered(userId, 'left'),
            ]);
            const done = new Set<FaceAngle>();
            if (front) done.add('front');
            if (right) done.add('right');
            if (left) done.add('left');
            setCompletedAngles(done);

            // Determine starting state
            if (done.size >= 3) {
                setMainStep('done');
            } else {
                // Find first incomplete angle
                const firstIncomplete = ANGLE_STEPS.findIndex(s => !done.has(s.angle));
                if (firstIncomplete >= 0) setCurrentAngleIdx(firstIncomplete);
            }
        };
        check();
    }, [userId]);

    // Cleanup camera on unmount
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
            setMessage({ type: 'info', text: ANGLE_STEPS[currentAngleIdx].hint });
        } else {
            setMessage({ type: 'error', text: 'فشل الوصول للكاميرا. تأكد من الصلاحيات.' });
        }
    };

    // Countdown before capturing (3 seconds)
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
        const angleStep = ANGLE_STEPS[currentAngleIdx];
        setLoading(true);
        setMessage(null);
        setProgress(0);

        const result = await registerFaceAngle({
            userId,
            video: videoRef.current,
            angle: angleStep.angle,
            onProgress: (text, p) => {
                setProgressText(text);
                setProgress(p);
            },
        });

        setLoading(false);
        if (result.success) {
            const newCompleted = new Set(completedAngles);
            newCompleted.add(angleStep.angle);
            setCompletedAngles(newCompleted);
            setMessage({ type: 'success', text: `✅ تم تسجيل فيديو ${angleStep.label} بنجاح!` });

            // Check if all 3 angles done
            if (newCompleted.size >= 3) {
                stopCamera(streamRef.current);
                streamRef.current = null;
                setCameraReady(false);
                setTimeout(() => {
                    setMessage(null);
                    setMainStep('done');
                }, 1500);
            } else {
                // Move to next angle
                setTimeout(() => {
                    setMessage(null);
                    const nextIdx = ANGLE_STEPS.findIndex(s => !newCompleted.has(s.angle));
                    if (nextIdx >= 0) setCurrentAngleIdx(nextIdx);
                }, 1500);
            }
        } else {
            setMessage({ type: 'error', text: result.error || 'فشل تسجيل الفيديو' });
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

    // ============================================================
    // STYLES
    // ============================================================

    const pageStyle: React.CSSProperties = {
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #0a0e1a 0%, #0f1629 60%, #111827 100%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '24px 16px', fontFamily: 'var(--font-arabic)', direction: 'rtl',
        position: 'relative', overflow: 'hidden',
    };

    const cardStyle: React.CSSProperties = {
        width: '100%', maxWidth: 400, background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(28px)',
        borderRadius: 24, padding: '26px 20px', border: '1px solid rgba(255,255,255,0.06)',
        boxShadow: '0 24px 64px rgba(0,0,0,0.5)', position: 'relative', zIndex: 1,
    };

    const msgBg = message?.type === 'success' ? 'rgba(16,185,129,0.08)' : message?.type === 'error' ? 'rgba(244,63,94,0.08)' : 'rgba(59,130,246,0.08)';
    const msgBorder = message?.type === 'success' ? 'rgba(16,185,129,0.2)' : message?.type === 'error' ? 'rgba(244,63,94,0.2)' : 'rgba(59,130,246,0.2)';
    const msgColor = message?.type === 'success' ? '#34d399' : message?.type === 'error' ? '#fb7185' : '#93c5fd';

    // ============================================================
    // DONE step
    // ============================================================
    if (mainStep === 'done') {
        return (
            <div style={pageStyle}>
                <div style={{ position: 'absolute', width: 250, height: 250, borderRadius: '50%', background: 'radial-gradient(circle, rgba(16,185,129,0.12), transparent 70%)', top: '10%', left: '-5%' }} />
                <div style={{ ...cardStyle, padding: '36px 24px', textAlign: 'center' }}>
                    <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'linear-gradient(135deg, #10b981, #059669)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px', boxShadow: '0 12px 40px rgba(16,185,129,0.4)' }}>
                        <CheckCircle size={34} color="white" strokeWidth={2} />
                    </div>
                    <h2 style={{ fontSize: 20, fontWeight: 900, color: '#f8fafc', marginBottom: 8 }}>تم التسجيل بنجاح! 🎉</h2>
                    <p style={{ fontSize: 13, color: 'rgba(248,250,252,0.5)', lineHeight: 1.9, marginBottom: 24 }}>
                        تم تسجيل بصمة وجهك من <strong style={{ color: '#34d399' }}>3 زوايا</strong> مختلفة<br />
                        يتم حفظ بيانات التعرف كـ <strong style={{ color: '#60a5fa' }}>embeddings مشفّرة فقط</strong> — بدون صور<br />
                        <span style={{ fontSize: 11, color: 'rgba(248,250,252,0.3)' }}>لا يمكن استرجاع وجهك من البيانات المخزنة</span>
                    </p>

                    {/* Steps summary */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
                        {ANGLE_STEPS.map(s => (
                            <div key={s.angle} style={{
                                flex: 1, padding: '12px 8px', textAlign: 'center', borderRadius: 14,
                                background: 'rgba(16,185,129,0.08)',
                                border: '1px solid rgba(16,185,129,0.25)',
                            }}>
                                <div style={{ fontSize: 20, marginBottom: 4 }}>✅</div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: '#34d399' }}>{s.label}</div>
                            </div>
                        ))}
                    </div>

                    <button onClick={handleDone} style={{
                        width: '100%', padding: '16px', borderRadius: 14,
                        background: 'linear-gradient(135deg, #10b981, #059669)',
                        border: 'none', color: 'white', fontSize: 15, fontWeight: 800,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                        fontFamily: 'var(--font-arabic)', boxShadow: '0 8px 30px rgba(16,185,129,0.35)',
                    }}>
                        <ArrowRight size={20} strokeWidth={2} />
                        متابعة إلى التطبيق
                    </button>
                </div>
            </div>
        );
    }

    // ============================================================
    // INTRO step
    // ============================================================
    if (mainStep === 'intro') {
        return (
            <div style={pageStyle}>
                <div style={{ position: 'absolute', width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.1), transparent 70%)', top: '5%', left: '-10%' }} />
                <div style={{ position: 'absolute', width: 220, height: 220, borderRadius: '50%', background: 'radial-gradient(circle, rgba(16,185,129,0.06), transparent 70%)', bottom: '10%', right: '-5%' }} />

                <div style={{ ...cardStyle, padding: '30px 22px', textAlign: 'center' }}>
                    {/* Header */}
                    <div style={{ marginBottom: 18 }}>
                        <div style={{ width: 70, height: 70, borderRadius: '50%', background: 'linear-gradient(135deg, #3b82f6, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', position: 'relative', boxShadow: '0 12px 40px rgba(99,102,241,0.35)' }}>
                            <ScanFace size={32} color="white" strokeWidth={1.6} />
                        </div>
                        <h1 style={{ fontSize: 22, fontWeight: 900, color: '#f8fafc', marginBottom: 6, letterSpacing: -0.5 }}>
                            تسجيل بصمة الوجه
                        </h1>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, marginBottom: 4 }}>
                            <Shield size={13} color="rgba(248,250,252,0.3)" />
                            <span style={{ fontSize: 11, color: 'rgba(248,250,252,0.3)', fontWeight: 600 }}>نظام تحقق بيومتري آمن</span>
                        </div>
                    </div>

                    <p style={{ fontSize: 12.5, color: 'rgba(248,250,252,0.45)', lineHeight: 2, marginBottom: 22 }}>
                        سيتم تصوير وجهك من <strong style={{ color: '#60a5fa' }}>3 زوايا مختلفة</strong> لتسجيل بصمة دقيقة<br />
                        يتم حفظ <strong style={{ color: '#a78bfa' }}>embeddings رقمية فقط</strong> — بدون صور وجه<br />
                        <span style={{ fontSize: 11, color: 'rgba(248,250,252,0.3)' }}>البيانات مشفّرة ولا يمكن استرجاع الوجه منها</span>
                    </p>

                    {/* Steps preview */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 26 }}>
                        {ANGLE_STEPS.map((s, i) => (
                            <div key={s.angle} style={{
                                flex: 1, padding: '14px 8px', textAlign: 'center', borderRadius: 14,
                                background: completedAngles.has(s.angle) ? 'rgba(16,185,129,0.08)' : 'rgba(255,255,255,0.03)',
                                border: `1px solid ${completedAngles.has(s.angle) ? 'rgba(16,185,129,0.25)' : 'rgba(255,255,255,0.06)'}`,
                            }}>
                                <div style={{ fontSize: 22, marginBottom: 6 }}>
                                    {completedAngles.has(s.angle) ? '✅' : s.icon}
                                </div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: completedAngles.has(s.angle) ? '#34d399' : '#94a3b8' }}>
                                    {s.label}
                                </div>
                                <div style={{ fontSize: 9, marginTop: 4, color: completedAngles.has(s.angle) ? '#34d399' : 'rgba(255,255,255,0.25)', fontWeight: 600 }}>
                                    {completedAngles.has(s.angle) ? '✓ مكتمل' : `خطوة ${i + 1}`}
                                </div>
                            </div>
                        ))}
                    </div>

                    <button
                        onClick={() => setMainStep('face_capture')}
                        style={{
                            width: '100%', padding: '16px', borderRadius: 14,
                            background: 'linear-gradient(135deg, #3b82f6, #6366f1, #8b5cf6)',
                            border: 'none', color: 'white', fontSize: 15, fontWeight: 800,
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                            fontFamily: 'var(--font-arabic)', boxShadow: '0 8px 30px rgba(99,102,241,0.35)',
                        }}
                    >
                        <ScanFace size={20} strokeWidth={2} />
                        {completedAngles.size > 0 ? 'متابعة التسجيل' : 'بدء التسجيل البيومتري'}
                    </button>
                </div>
            </div>
        );
    }

    // ============================================================
    // FACE CAPTURE step (3 angles)
    // ============================================================
    const angleStep = ANGLE_STEPS[currentAngleIdx];

    return (
        <div style={pageStyle}>
            <div style={{ position: 'absolute', width: 260, height: 260, borderRadius: '50%', background: `radial-gradient(circle, ${angleStep.glow.replace('0.35', '0.1')}, transparent 70%)`, top: '5%', right: '-5%' }} />

            <div style={{ ...cardStyle, padding: '22px 18px' }}>
                {/* Step indicator */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 18 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 14px', borderRadius: 20, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        {ANGLE_STEPS.map((s, i) => (
                            <React.Fragment key={s.angle}>
                                <div style={{
                                    width: 18, height: 18, borderRadius: '50%',
                                    background: completedAngles.has(s.angle) ? '#10b981' : i === currentAngleIdx ? angleStep.gradient : 'rgba(255,255,255,0.08)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 9, color: 'white', fontWeight: 800,
                                }}>
                                    {completedAngles.has(s.angle) ? '✓' : i + 1}
                                </div>
                                {i < ANGLE_STEPS.length - 1 && (
                                    <div style={{ width: 14, height: 2, borderRadius: 1, background: completedAngles.has(ANGLE_STEPS[i + 1]?.angle) || completedAngles.has(s.angle) ? '#10b981' : 'rgba(255,255,255,0.08)' }} />
                                )}
                            </React.Fragment>
                        ))}
                    </div>
                </div>

                {/* Title */}
                <div style={{ textAlign: 'center', marginBottom: 14 }}>
                    <div style={{ width: 48, height: 48, borderRadius: '50%', background: angleStep.gradient, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px', boxShadow: `0 8px 28px ${angleStep.glow}`, fontSize: 22 }}>
                        {angleStep.icon}
                    </div>
                    <h2 style={{ fontSize: 17, fontWeight: 900, color: '#f8fafc', marginBottom: 4 }}>{angleStep.instruction}</h2>
                    <p style={{ fontSize: 11.5, color: 'rgba(248,250,252,0.4)' }}>{angleStep.hint}</p>
                </div>

                {/* Camera viewfinder */}
                <div style={{ position: 'relative', width: '100%', aspectRatio: '4/3', borderRadius: 16, overflow: 'hidden', background: '#000', marginBottom: 14, border: `2px solid ${cameraReady ? angleStep.glow.replace('0.35', '0.5') : 'rgba(255,255,255,0.06)'}`, boxShadow: cameraReady ? `0 0 40px ${angleStep.glow}` : 'none', transition: 'all 0.5s ease' }}>
                    <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />

                    {cameraReady && !loading && (
                        <>
                            {['top-right', 'top-left', 'bottom-right', 'bottom-left'].map(pos => (
                                <div key={pos} style={{ position: 'absolute', [pos.includes('top') ? 'top' : 'bottom']: 12, [pos.includes('right') ? 'right' : 'left']: 12, width: 22, height: 22, borderTop: pos.includes('top') ? `2px solid ${angleStep.glow.replace('0.35', '0.7')}` : 'none', borderBottom: pos.includes('bottom') ? `2px solid ${angleStep.glow.replace('0.35', '0.7')}` : 'none', borderRight: pos.includes('right') ? `2px solid ${angleStep.glow.replace('0.35', '0.7')}` : 'none', borderLeft: pos.includes('left') ? `2px solid ${angleStep.glow.replace('0.35', '0.7')}` : 'none', opacity: 0.7, borderRadius: 3 }} />
                            ))}
                        </>
                    )}

                    {/* Countdown overlay */}
                    {countdown > 0 && (
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}>
                            <div style={{ width: 80, height: 80, borderRadius: '50%', background: angleStep.gradient, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, fontWeight: 900, color: 'white', boxShadow: `0 8px 30px ${angleStep.glow}` }}>
                                {countdown}
                            </div>
                        </div>
                    )}

                    {loading && (
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)' }}>
                            {/* Recording indicator */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                                <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#f43f5e', animation: 'fvPulse 1s infinite', boxShadow: '0 0 12px rgba(244,63,94,0.6)' }} />
                                <span style={{ fontSize: 14, fontWeight: 800, color: '#f43f5e' }}>REC</span>
                            </div>
                            <div style={{ color: 'white', fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{progressText}</div>
                            <div style={{ width: '70%', height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                                <div style={{ width: `${progress}%`, height: '100%', borderRadius: 3, background: angleStep.gradient, transition: 'width 0.25s ease' }} />
                            </div>
                            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 8, fontWeight: 600 }}>ارمش وتحرّك بشكل طبيعي</div>
                        </div>
                    )}

                    {/* Camera not started */}
                    {!cameraReady && !loading && (
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.85)', gap: 14 }}>
                            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Camera size={24} color="rgba(255,255,255,0.4)" />
                            </div>
                            <button onClick={openCamera} style={{ padding: '12px 28px', borderRadius: 12, background: angleStep.gradient, border: 'none', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-arabic)', boxShadow: `0 6px 25px ${angleStep.glow}` }}>
                                <Camera size={16} /> تشغيل الكاميرا
                            </button>
                        </div>
                    )}
                </div>

                {/* Message */}
                {message && (
                    <div style={{ padding: '10px 14px', borderRadius: 12, background: msgBg, border: `1px solid ${msgBorder}`, color: msgColor, fontSize: 12.5, fontWeight: 700, textAlign: 'center', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                        {message.type === 'success' && <CheckCircle size={15} />}
                        {message.text}
                    </div>
                )}

                {/* Capture button */}
                {cameraReady && !loading && countdown === 0 && (
                    <button
                        onClick={startCaptureCountdown}
                        style={{
                            width: '100%', padding: '15px', borderRadius: 14,
                            background: angleStep.gradient, border: 'none', color: 'white',
                            fontSize: 15, fontWeight: 800, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                            fontFamily: 'var(--font-arabic)', boxShadow: `0 8px 28px ${angleStep.glow}`,
                        }}
                    >
                        <ScanFace size={18} strokeWidth={2} />
                        🔴 تسجيل فيديو — {angleStep.label} (3 ثوانٍ)
                    </button>
                )}

                {/* Completed angles summary at bottom */}
                {completedAngles.size > 0 && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                        {ANGLE_STEPS.map(s => completedAngles.has(s.angle) ? (
                            <div key={s.angle} style={{ flex: 1, padding: '6px', textAlign: 'center', borderRadius: 8, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
                                <span style={{ fontSize: 10, color: '#34d399', fontWeight: 700 }}>✓ {s.label}</span>
                            </div>
                        ) : null)}
                    </div>
                )}

                {/* Reset option */}
                {completedAngles.size > 0 && !loading && (
                    <button
                        onClick={() => {
                            setCompletedAngles(new Set());
                            setCurrentAngleIdx(0);
                            setMessage(null);
                        }}
                        style={{
                            marginTop: 10, padding: '8px 16px', borderRadius: 10,
                            background: 'transparent', border: '1px solid rgba(255,255,255,0.06)',
                            color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: 600,
                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                            fontFamily: 'var(--font-arabic)', width: 'auto', margin: '10px auto 0',
                        }}
                    >
                        <RotateCcw size={12} /> إعادة التسجيل
                    </button>
                )}
            </div>
            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes fvPulse {
                    0%, 100% { transform: scale(1); opacity: 1; }
                    50% { transform: scale(1.4); opacity: 0.5; }
                }
            `}</style>
        </div>
    );
}
