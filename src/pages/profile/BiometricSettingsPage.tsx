import React, { useState, useEffect, useRef } from 'react';
import {
    ArrowRight, Lock, ShieldCheck, ShieldAlert,
    CheckCircle, XCircle, Smartphone, AlertTriangle, Loader2,
    Camera, Trash2, User, Eye
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
    isBiometricAvailable,
    getBiometricSettings,
    saveBiometricSettings,
    BiometricSettings,
} from '../../utils/biometricAuth';
import {
    isFaceRegistered,
    getFacePhoto,
    registerFace,
    removeFaceData,
    loadFaceModels,
    startCamera,
    stopCamera,
    isIrisRegistered,
    getIrisPhoto,
    registerIris,
    removeIrisData,
    isBiometricRegisteredInFirestore,
    loadBiometricFromFirestore,
} from '../../utils/faceAuth';

interface Props {
    onBack: () => void;
}

export default function BiometricSettingsPage({ onBack }: Props) {
    const { user } = useAuth();
    const [deviceSupported, setDeviceSupported] = useState<boolean | null>(null);
    const [settings, setSettings] = useState<BiometricSettings>({ enabled: false, required: false });
    const [loading, setLoading] = useState(true);

    // Face registration
    const [hasFace, setHasFace] = useState(false);
    const [facePhoto, setFacePhoto] = useState<string | null>(null);
    const [showCamera, setShowCamera] = useState(false);
    const [cameraReady, setCameraReady] = useState(false);
    const [faceLoading, setFaceLoading] = useState(false);
    const [faceMessage, setFaceMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const isAdmin = user?.role === 'admin';
    const userId = user?.id || '';

    // Iris recognition
    const [hasIris, setHasIris] = useState(false);
    const [irisPhoto, setIrisPhoto] = useState<string | null>(null);
    const [showIrisCamera, setShowIrisCamera] = useState(false);
    const [irisCameraReady, setIrisCameraReady] = useState(false);
    const [irisLoading, setIrisLoading] = useState(false);
    const [irisMessage, setIrisMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const irisVideoRef = useRef<HTMLVideoElement>(null);
    const irisStreamRef = useRef<MediaStream | null>(null);

    // Locked state (from Firestore)
    const [faceLocked, setFaceLocked] = useState(false);
    const [irisLocked, setIrisLocked] = useState(false);
    const [faceInfo, setFaceInfo] = useState<{ registeredAt?: string; frameCount?: number } | null>(null);
    const [irisInfo, setIrisInfo] = useState<{ registeredAt?: string; frameCount?: number } | null>(null);

    useEffect(() => { init(); }, []);

    // Cleanup cameras
    useEffect(() => {
        return () => {
            stopCamera(streamRef.current);
            stopCamera(irisStreamRef.current);
        };
    }, []);

    const init = async () => {
        setLoading(true);
        try {
            const [supported, savedSettings] = await Promise.all([
                isBiometricAvailable(),
                getBiometricSettings(),
            ]);
            setDeviceSupported(supported);
            setSettings(savedSettings);
            if (userId) {
                // Always query Firestore for biometric data
                const [faceData, irisData] = await Promise.all([
                    loadBiometricFromFirestore(userId, 'face'),
                    loadBiometricFromFirestore(userId, 'iris'),
                ]);

                // Face data from Firestore
                if (faceData) {
                    setHasFace(true);
                    setFaceLocked(faceData.locked === true);
                    setFacePhoto(faceData.photoURL || faceData.photo || null);
                    setFaceInfo({
                        registeredAt: faceData.registeredAt,
                        frameCount: faceData.frameCount,
                    });
                } else {
                    // Fallback to localStorage
                    setHasFace(isFaceRegistered(userId));
                    setFacePhoto(getFacePhoto(userId));
                    setFaceLocked(false);
                }

                // Iris data from Firestore
                if (irisData) {
                    setHasIris(true);
                    setIrisLocked(irisData.locked === true);
                    setIrisPhoto(irisData.photoURL || irisData.photo || null);
                    setIrisInfo({
                        registeredAt: irisData.registeredAt,
                        frameCount: irisData.frameCount,
                    });
                } else {
                    // Fallback to localStorage
                    setHasIris(isIrisRegistered(userId));
                    setIrisPhoto(getIrisPhoto(userId));
                    setIrisLocked(false);
                }
            }
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

    const handleOpenCamera = async () => {
        setShowCamera(true);
        setCameraReady(false);
        setFaceMessage(null);
        setFaceLoading(true);

        // Load models first
        const loaded = await loadFaceModels();
        if (!loaded) {
            setFaceMessage({ type: 'error', text: 'فشل تحميل نماذج التعرف على الوجه' });
            setFaceLoading(false);
            return;
        }

        // Wait for video element to be ready
        await new Promise(r => setTimeout(r, 300));
        if (!videoRef.current) return;

        const stream = await startCamera(videoRef.current);
        if (!stream) {
            setFaceMessage({ type: 'error', text: 'فشل فتح الكاميرا. اسمح بالوصول للكاميرا.' });
            setFaceLoading(false);
            return;
        }
        streamRef.current = stream;
        setCameraReady(true);
        setFaceLoading(false);
    };

    const handleCaptureFace = async () => {
        if (!videoRef.current || !userId) return;
        setFaceLoading(true);
        setFaceMessage(null);

        const result = await registerFace(userId, videoRef.current);
        setFaceLoading(false);

        if (result.success) {
            setFaceMessage({ type: 'success', text: 'تم تسجيل الوجه بنجاح! ✅' });
            setHasFace(true);
            if (result.photo) setFacePhoto(result.photo);
            // Close camera after success
            setTimeout(() => {
                handleCloseCamera();
            }, 1500);
        } else {
            setFaceMessage({ type: 'error', text: result.error || 'فشل تسجيل الوجه' });
        }
    };

    const handleCloseCamera = () => {
        stopCamera(streamRef.current);
        streamRef.current = null;
        setShowCamera(false);
        setCameraReady(false);
    };

    const handleRemoveFace = () => {
        if (!userId) return;
        removeFaceData(userId);
        setHasFace(false);
        setFacePhoto(null);
        setFaceMessage({ type: 'success', text: 'تم حذف بيانات الوجه' });
    };

    // ========== Iris Handlers ==========
    const handleOpenIrisCamera = async () => {
        setShowIrisCamera(true);
        setIrisCameraReady(false);
        setIrisMessage(null);
        setIrisLoading(true);

        const loaded = await loadFaceModels();
        if (!loaded) {
            setIrisMessage({ type: 'error', text: 'فشل تحميل النماذج' });
            setIrisLoading(false);
            return;
        }

        await new Promise(r => setTimeout(r, 300));
        if (!irisVideoRef.current) return;

        const stream = await startCamera(irisVideoRef.current);
        if (!stream) {
            setIrisMessage({ type: 'error', text: 'فشل فتح الكاميرا' });
            setIrisLoading(false);
            return;
        }
        irisStreamRef.current = stream;
        setIrisCameraReady(true);
        setIrisLoading(false);
    };

    const handleCaptureIris = async () => {
        if (!irisVideoRef.current || !userId) return;
        setIrisLoading(true);
        setIrisMessage(null);

        const result = await registerIris(userId, irisVideoRef.current);
        setIrisLoading(false);

        if (result.success) {
            setIrisMessage({ type: 'success', text: 'تم تسجيل قزحية العين بنجاح! ✅' });
            setHasIris(true);
            if (result.photo) setIrisPhoto(result.photo);
            setTimeout(() => handleCloseIrisCamera(), 1500);
        } else {
            setIrisMessage({ type: 'error', text: result.error || 'فشل تسجيل القزحية' });
        }
    };

    const handleCloseIrisCamera = () => {
        stopCamera(irisStreamRef.current);
        irisStreamRef.current = null;
        setShowIrisCamera(false);
        setIrisCameraReady(false);
    };

    const handleRemoveIris = () => {
        if (!userId) return;
        removeIrisData(userId);
        setHasIris(false);
        setIrisPhoto(null);
        setIrisMessage({ type: 'success', text: 'تم حذف بيانات القزحية' });
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
                </div>

                <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4, position: 'relative' }}>
                    {settings.enabled ? 'المصادقة البيومترية مفعلة' : 'المصادقة البيومترية معطلة'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', position: 'relative' }}>
                    {settings.enabled
                        ? 'يُطلب التحقق قبل عرض صفحة الحضور'
                        : 'لا يتطلب تحقق إضافي'
                    }
                </div>
            </div>

            {/* Settings Toggles */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {isAdmin && (
                    <SettingToggle
                        icon={<ShieldCheck size={18} />}
                        label="تفعيل المصادقة البيومترية"
                        description="يتطلب التحقق من الهوية قبل الحضور"
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

            {/* ========== Face Registration Section ========== */}
            <div className="glass-card" style={{ padding: '16px', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                    <Camera size={20} style={{ color: 'var(--accent-blue)' }} />
                    <div style={{ fontSize: 14, fontWeight: 800 }}>تسجيل الوجه</div>
                </div>

                {/* Camera View */}
                {showCamera && (
                    <div style={{ marginBottom: 14 }}>
                        <div style={{
                            position: 'relative', width: '100%', aspectRatio: '4/3',
                            borderRadius: 'var(--radius-md)', overflow: 'hidden',
                            background: '#000', border: '2px solid var(--accent-blue)',
                            marginBottom: 10,
                        }}>
                            <video
                                ref={videoRef}
                                autoPlay playsInline muted
                                style={{
                                    width: '100%', height: '100%', objectFit: 'cover',
                                    transform: 'scaleX(-1)',
                                }}
                            />
                            {!cameraReady && (
                                <div style={{
                                    position: 'absolute', inset: 0,
                                    background: 'rgba(0,0,0,0.7)',
                                    display: 'flex', flexDirection: 'column',
                                    alignItems: 'center', justifyContent: 'center', gap: 8,
                                    color: 'white',
                                }}>
                                    <Loader2 size={28} style={{ animation: 'spin 1s linear infinite' }} />
                                    <div style={{ fontSize: 12 }}>جاري تحميل الكاميرا والنماذج...</div>
                                </div>
                            )}
                            {/* Face guide oval */}
                            {cameraReady && (
                                <div style={{
                                    position: 'absolute', inset: 0,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    pointerEvents: 'none',
                                }}>
                                    <div style={{
                                        width: 180, height: 240, borderRadius: '50%',
                                        border: '3px dashed rgba(59,130,246,0.5)',
                                    }} />
                                </div>
                            )}
                        </div>

                        <div style={{ display: 'flex', gap: 8 }}>
                            <button
                                onClick={handleCaptureFace}
                                disabled={!cameraReady || faceLoading}
                                style={{
                                    flex: 1, padding: '12px', borderRadius: 'var(--radius-md)',
                                    background: cameraReady ? 'linear-gradient(135deg, #10b981, #06b6d4)' : 'var(--bg-glass-strong)',
                                    border: 'none', color: cameraReady ? 'white' : 'var(--text-muted)',
                                    fontSize: 13, fontWeight: 700, cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                    opacity: faceLoading ? 0.6 : 1,
                                }}
                            >
                                <Camera size={16} />
                                {faceLoading ? 'جاري التقاط...' : 'التقاط الوجه'}
                            </button>
                            <button
                                onClick={handleCloseCamera}
                                style={{
                                    padding: '12px 16px', borderRadius: 'var(--radius-md)',
                                    background: 'var(--bg-glass)', border: '1px solid var(--border-glass)',
                                    color: 'var(--text-secondary)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                                }}
                            >
                                إلغاء
                            </button>
                        </div>
                    </div>
                )}

                {/* Face Status Messages */}
                {faceMessage && (
                    <div style={{
                        fontSize: 12, fontWeight: 600, marginBottom: 10,
                        padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                        color: faceMessage.type === 'success' ? 'var(--accent-emerald)' : 'var(--accent-rose)',
                        background: faceMessage.type === 'success' ? 'rgba(16,185,129,0.08)' : 'rgba(244,63,94,0.08)',
                    }}>
                        {faceMessage.text}
                    </div>
                )}

                {/* Registered Face Preview */}
                {hasFace && facePhoto && !showCamera ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                            width: 64, height: 64, borderRadius: 'var(--radius-md)', overflow: 'hidden',
                            border: '2px solid var(--accent-emerald)', flexShrink: 0,
                        }}>
                            <img src={facePhoto} alt="وجه مسجّل" style={{
                                width: '100%', height: '100%', objectFit: 'cover',
                                transform: 'scaleX(-1)',
                            }} />
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-emerald)' }}>
                                ✅ تم تسجيل الوجه
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                                {faceInfo?.registeredAt
                                    ? `تاريخ التسجيل: ${new Date(faceInfo.registeredAt).toLocaleDateString('ar-IQ')} — ${faceInfo.frameCount || 0} إطار`
                                    : 'يمكنك التحقق بالوجه عند دخول صفحة الحضور'
                                }
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                            {faceLocked ? (
                                <div style={{
                                    padding: '6px 10px', borderRadius: 'var(--radius-sm)',
                                    background: 'rgba(244,63,94,0.08)',
                                    color: 'var(--accent-rose)',
                                    fontSize: 10, fontWeight: 700,
                                    display: 'flex', alignItems: 'center', gap: 4,
                                }}>
                                    <Lock size={12} />
                                    مقفل
                                </div>
                            ) : (
                                <>
                                    <button
                                        onClick={handleOpenCamera}
                                        style={{
                                            padding: '8px', borderRadius: 'var(--radius-sm)',
                                            background: 'rgba(59,130,246,0.1)', border: 'none',
                                            color: 'var(--accent-blue)', cursor: 'pointer',
                                        }}
                                        title="\u0625\u0639\u0627\u062f\u0629 \u0627\u0644\u062a\u0633\u062c\u064a\u0644"
                                    >
                                        <Camera size={16} />
                                    </button>
                                    <button
                                        onClick={handleRemoveFace}
                                        style={{
                                            padding: '8px', borderRadius: 'var(--radius-sm)',
                                            background: 'rgba(244,63,94,0.1)', border: 'none',
                                            color: 'var(--accent-rose)', cursor: 'pointer',
                                        }}
                                        title="\u062d\u0630\u0641"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                ) : !showCamera && (
                    <button
                        onClick={handleOpenCamera}
                        style={{
                            width: '100%', padding: '14px', borderRadius: 'var(--radius-md)',
                            background: 'linear-gradient(135deg, rgba(59,130,246,0.1), rgba(139,92,246,0.08))',
                            border: '2px dashed rgba(59,130,246,0.3)',
                            color: 'var(--accent-blue)', fontSize: 13, fontWeight: 700,
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        }}
                    >
                        <User size={18} />
                        تسجيل وجه جديد
                    </button>
                )}
            </div>

            {/* ========== Iris Registration Section ========== */}
            <div className="glass-card" style={{ padding: '16px', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                    <Eye size={20} style={{ color: '#8b5cf6' }} />
                    <div style={{ fontSize: 14, fontWeight: 800 }}>مسح قزحية العين</div>
                </div>

                {/* Iris Camera View */}
                {showIrisCamera && (
                    <div style={{ marginBottom: 14 }}>
                        <div style={{
                            position: 'relative', width: '100%', aspectRatio: '4/3',
                            borderRadius: 'var(--radius-md)', overflow: 'hidden',
                            background: '#000', border: '2px solid #8b5cf6',
                            marginBottom: 10,
                        }}>
                            <video
                                ref={irisVideoRef}
                                autoPlay playsInline muted
                                style={{
                                    width: '100%', height: '100%', objectFit: 'cover',
                                    transform: 'scaleX(-1)',
                                }}
                            />
                            {!irisCameraReady && (
                                <div style={{
                                    position: 'absolute', inset: 0,
                                    background: 'rgba(0,0,0,0.7)',
                                    display: 'flex', flexDirection: 'column',
                                    alignItems: 'center', justifyContent: 'center', gap: 8,
                                    color: 'white',
                                }}>
                                    <Loader2 size={28} style={{ animation: 'spin 1s linear infinite' }} />
                                    <div style={{ fontSize: 12 }}>جاري تحميل الكاميرا...</div>
                                </div>
                            )}
                            {/* Eye guide circles */}
                            {irisCameraReady && (
                                <div style={{
                                    position: 'absolute', inset: 0,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    gap: 60, pointerEvents: 'none',
                                }}>
                                    <div style={{
                                        width: 60, height: 40, borderRadius: '50%',
                                        border: '2px dashed rgba(139,92,246,0.6)',
                                    }} />
                                    <div style={{
                                        width: 60, height: 40, borderRadius: '50%',
                                        border: '2px dashed rgba(139,92,246,0.6)',
                                    }} />
                                </div>
                            )}
                        </div>

                        <div style={{ display: 'flex', gap: 8 }}>
                            <button
                                onClick={handleCaptureIris}
                                disabled={!irisCameraReady || irisLoading}
                                style={{
                                    flex: 1, padding: '12px', borderRadius: 'var(--radius-md)',
                                    background: irisCameraReady ? 'linear-gradient(135deg, #8b5cf6, #a855f7)' : 'var(--bg-glass-strong)',
                                    border: 'none', color: irisCameraReady ? 'white' : 'var(--text-muted)',
                                    fontSize: 13, fontWeight: 700, cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                    opacity: irisLoading ? 0.6 : 1,
                                }}
                            >
                                <Eye size={16} />
                                {irisLoading ? 'جاري المسح...' : 'مسح القزحية'}
                            </button>
                            <button
                                onClick={handleCloseIrisCamera}
                                style={{
                                    padding: '12px 16px', borderRadius: 'var(--radius-md)',
                                    background: 'var(--bg-glass)', border: '1px solid var(--border-glass)',
                                    color: 'var(--text-secondary)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                                }}
                            >
                                إلغاء
                            </button>
                        </div>
                    </div>
                )}

                {/* Iris Messages */}
                {irisMessage && (
                    <div style={{
                        fontSize: 12, fontWeight: 600, marginBottom: 10,
                        padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                        color: irisMessage.type === 'success' ? 'var(--accent-emerald)' : 'var(--accent-rose)',
                        background: irisMessage.type === 'success' ? 'rgba(16,185,129,0.08)' : 'rgba(244,63,94,0.08)',
                    }}>
                        {irisMessage.text}
                    </div>
                )}

                {/* Registered Iris Preview */}
                {hasIris && irisPhoto && !showIrisCamera ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                            width: 64, height: 64, borderRadius: 'var(--radius-md)', overflow: 'hidden',
                            border: '2px solid #8b5cf6', flexShrink: 0,
                        }}>
                            <img src={irisPhoto} alt="قزحية مسجّلة" style={{
                                width: '100%', height: '100%', objectFit: 'cover',
                                transform: 'scaleX(-1)',
                            }} />
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#8b5cf6' }}>
                                ✅ تم تسجيل القزحية
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                                {irisInfo?.registeredAt
                                    ? `تاريخ التسجيل: ${new Date(irisInfo.registeredAt).toLocaleDateString('ar-IQ')} — ${irisInfo.frameCount || 0} إطار`
                                    : 'يمكنك التحقق بقزحية العين عند دخول صفحة الحضور'
                                }
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                            {irisLocked ? (
                                <div style={{
                                    padding: '6px 10px', borderRadius: 'var(--radius-sm)',
                                    background: 'rgba(244,63,94,0.08)',
                                    color: 'var(--accent-rose)',
                                    fontSize: 10, fontWeight: 700,
                                    display: 'flex', alignItems: 'center', gap: 4,
                                }}>
                                    <Lock size={12} />
                                    مقفل
                                </div>
                            ) : (
                                <>
                                    <button
                                        onClick={handleOpenIrisCamera}
                                        style={{
                                            padding: '8px', borderRadius: 'var(--radius-sm)',
                                            background: 'rgba(139,92,246,0.1)', border: 'none',
                                            color: '#8b5cf6', cursor: 'pointer',
                                        }}
                                        title="\u0625\u0639\u0627\u062f\u0629 \u0627\u0644\u062a\u0633\u062c\u064a\u0644"
                                    >
                                        <Eye size={16} />
                                    </button>
                                    <button
                                        onClick={handleRemoveIris}
                                        style={{
                                            padding: '8px', borderRadius: 'var(--radius-sm)',
                                            background: 'rgba(244,63,94,0.1)', border: 'none',
                                            color: 'var(--accent-rose)', cursor: 'pointer',
                                        }}
                                        title="\u062d\u0630\u0641"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                ) : !showIrisCamera && (
                    <button
                        onClick={handleOpenIrisCamera}
                        style={{
                            width: '100%', padding: '14px', borderRadius: 'var(--radius-md)',
                            background: 'linear-gradient(135deg, rgba(139,92,246,0.1), rgba(168,85,247,0.08))',
                            border: '2px dashed rgba(139,92,246,0.3)',
                            color: '#8b5cf6', fontSize: 13, fontWeight: 700,
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        }}
                    >
                        <Eye size={18} />
                        تسجيل قزحية جديدة
                    </button>
                )}
            </div>

            {/* How it works */}
            {settings.enabled && (
                <div className="glass-card" style={{ padding: '16px', marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>كيف يعمل؟</div>
                    {[
                        'عند فتح صفحة الحضور تظهر شاشة التحقق',
                        'اختر: التحقق بالوجه أو بصمة/Face ID/رمز الجهاز',
                        'بعد التحقق بنجاح، تظهر صفحة الحضور لتسجيل الدخول',
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
