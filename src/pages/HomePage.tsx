import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Clock, MapPin, Timer, AlertTriangle, CheckCircle, Coffee, RefreshCw, Lock, ShieldAlert, Camera, Scan, Shield, ShieldCheck, Eye, ArrowRight } from 'lucide-react';
import AttendanceButton from '../components/AttendanceButton';
import StatusCard from '../components/StatusCard';
import { useAttendance } from '../context/AttendanceContext';
import { useAuth } from '../context/AuthContext';
import { formatTime, formatDateArabic, formatTimeString, formatHours } from '../utils/timeUtils';
import { getCurrentPosition, isWithinRadius, formatDistance, calculateDistance } from '../utils/geolocation';
import { GeoLocation, Branch } from '../types';
import { db } from '../firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import {
    getBiometricSettings,
    BiometricSettings,
} from '../utils/biometricAuth';
import {
    isFaceRegistered,
    verifyFaceAdvanced,
    loadFaceModels,
    startCamera,
    stopCamera,
    detectFace,
    drawFaceOverlay,
    FaceScanFrame,
    ensureBiometricDataLoaded,
} from '../utils/faceAuth';

export default function HomePage() {
    const { user } = useAuth();
    const { isCheckedIn, todayRecord, checkIn, checkOut, todayTotalHours, monthStats } = useAttendance();
    const [currentTime, setCurrentTime] = useState(new Date());
    const [location, setLocation] = useState<GeoLocation | null>(null);
    const [locationStatus, setLocationStatus] = useState<'loading' | 'active' | 'inactive' | 'error'>('loading');
    const [locationError, setLocationError] = useState('');
    const [distanceToOffice, setDistanceToOffice] = useState<number | null>(null);
    const [userBranch, setUserBranch] = useState<Branch | null>(null);
    const [branchLoading, setBranchLoading] = useState(true);
    const [biometricSettings, setBiometricSettings] = useState<BiometricSettings | null>(null);
    const [biometricLoading, setBiometricLoading] = useState(true);
    const [biometricError, setBiometricError] = useState('');
    const [biometricVerified, setBiometricVerified] = useState(false);
    const [verifiedAt, setVerifiedAt] = useState<number | null>(null);
    // Face verification
    const [faceMode, setFaceMode] = useState(false);
    const [faceStatus, setFaceStatus] = useState<'idle' | 'loading' | 'scanning' | 'success' | 'fail'>('idle');
    const [faceConfidence, setFaceConfidence] = useState(0);
    const [livenessProgress, setLivenessProgress] = useState(0);
    const [scanMessage, setScanMessage] = useState('');
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const scanIntervalRef = useRef<any>(null);
    const framesRef = useRef<FaceScanFrame[]>([]);
    const [hasFace, setHasFace] = useState(false);

    const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

    // Update clock every second
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Load user's branch from Firestore
    useEffect(() => {
        const loadBranch = async () => {
            if (!user?.branch) {
                setBranchLoading(false);
                return;
            }
            try {
                const snap = await getDocs(collection(db, 'branches'));
                const branches = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                const found = branches.find((b: any) => b.name === user.branch);
                if (found) {
                    setUserBranch({
                        id: found.id,
                        name: (found as any).name,
                        latitude: (found as any).latitude,
                        longitude: (found as any).longitude,
                        radiusMeters: (found as any).radiusMeters || 500,
                    });
                }
            } catch (err) {
                console.error('Error loading branch:', err);
            } finally {
                setBranchLoading(false);
            }
        };
        loadBranch();
    }, [user?.branch]);

    // Load biometric settings & sync Firestore data
    useEffect(() => {
        const loadAndCheck = async () => {
            setBiometricLoading(true);
            try {
                const settings = await getBiometricSettings();
                setBiometricSettings(settings);
                // Preload biometric data from Firestore into localStorage
                if (user?.id) {
                    await ensureBiometricDataLoaded(user.id);
                    setHasFace(isFaceRegistered(user.id));
                }
            } finally {
                setBiometricLoading(false);
            }
        };
        loadAndCheck();
    }, [user?.id]);

    // Cleanup camera on unmount
    useEffect(() => {
        return () => {
            if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
            stopCamera(streamRef.current);
        };
    }, []);

    // Session timeout — re-lock after 30 minutes
    useEffect(() => {
        if (!biometricVerified || !verifiedAt) return;
        const timer = setTimeout(() => {
            setBiometricVerified(false);
            setVerifiedAt(null);
        }, SESSION_TIMEOUT);
        return () => clearTimeout(timer);
    }, [biometricVerified, verifiedAt]);

    // Re-lock when page is hidden (app switch/tab switch)
    useEffect(() => {
        const handleVisibility = () => {
            if (document.hidden && biometricVerified && biometricSettings?.enabled) {
                setBiometricVerified(false);
                setVerifiedAt(null);
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);
        return () => document.removeEventListener('visibilitychange', handleVisibility);
    }, [biometricVerified, biometricSettings]);

    // Get location once branch is loaded
    useEffect(() => {
        if (userBranch) {
            checkLocation();
        } else if (!branchLoading) {
            setLocationStatus('error');
            setLocationError('لم يتم تعيين فرع للموظف');
        }
    }, [userBranch, branchLoading]);

    const checkLocation = async () => {
        if (!userBranch) return;
        setLocationStatus('loading');
        try {
            const pos = await getCurrentPosition();
            setLocation(pos);
            const dist = calculateDistance(
                pos.latitude, pos.longitude,
                userBranch.latitude, userBranch.longitude
            );
            setDistanceToOffice(dist);
            const inRange = isWithinRadius(pos, userBranch);
            setLocationStatus(inRange ? 'active' : 'inactive');
        } catch (err: any) {
            setLocationError(err.message || 'خطأ في تحديد الموقع');
            setLocationStatus('error');
        }
    };



    const cleanupCamera = useCallback(() => {
        if (scanIntervalRef.current) { clearInterval(scanIntervalRef.current); scanIntervalRef.current = null; }
        stopCamera(streamRef.current);
        streamRef.current = null;
    }, []);

    const handleFaceVerify = async () => {
        if (!user?.id) return;
        setFaceMode(true);
        setFaceStatus('loading');
        setBiometricError('');
        setFaceConfidence(0);
        setLivenessProgress(0);
        setScanMessage('جاري تحميل نظام التعرف...');
        framesRef.current = [];

        const loaded = await loadFaceModels();
        if (!loaded) {
            setBiometricError('فشل تحميل نماذج التعرف على الوجه');
            setFaceStatus('fail');
            return;
        }

        await new Promise(r => setTimeout(r, 200));
        if (!videoRef.current) return;
        const stream = await startCamera(videoRef.current);
        if (!stream) {
            setBiometricError('فشل فتح الكاميرا. اسمح بالوصول للكاميرا.');
            setFaceStatus('fail');
            return;
        }
        streamRef.current = stream;
        setFaceStatus('scanning');
        setScanMessage('ضع وجهك أمام الكاميرا...');

        // Advanced scan with face overlay + liveness
        let attempts = 0;
        scanIntervalRef.current = setInterval(async () => {
            if (!videoRef.current || !canvasRef.current || !user?.id) return;
            attempts++;

            // Detect face and draw overlay
            const frame = await detectFace(videoRef.current);
            if (frame) {
                // Verify with liveness
                const result = await verifyFaceAdvanced(user.id, videoRef.current, framesRef.current);
                const conf = result.confidence ?? 0;
                const liveness = result.livenessScore ?? 0;
                setFaceConfidence(conf);
                setLivenessProgress(Math.min(liveness, 100));

                drawFaceOverlay(
                    canvasRef.current, videoRef.current, frame,
                    conf, result.success ? 'success' : undefined
                );

                if (result.success) {
                    setFaceStatus('success');
                    setScanMessage('✅ تم التحقق بنجاح!');
                    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
                    setTimeout(() => {
                        setBiometricVerified(true);
                        setVerifiedAt(Date.now());
                        setFaceMode(false);
                        cleanupCamera();
                    }, 1200);
                    return;
                }

                // Update messages based on progress
                if (conf > 40 && liveness < 25) {
                    setScanMessage('🔄 حرّك وجهك قليلاً لكشف الحيوية...');
                } else if (conf > 70) {
                    setScanMessage('جاري التحقق من الحيوية...');
                } else if (conf > 0) {
                    setScanMessage('جاري مطابقة الوجه...');
                }
            } else {
                // No face detected - clear overlay
                if (canvasRef.current) {
                    const ctx = canvasRef.current.getContext('2d');
                    if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
                }
                setScanMessage('لم يتم اكتشاف وجه...');
            }

            if (attempts >= 35) { // ~28 seconds
                setFaceStatus('fail');
                setScanMessage('انتهت المهلة');
                setBiometricError('لم يتم التعرف على الوجه. حاول مرة أخرى.');
                cleanupCamera();
                if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
            }
        }, 800);
    };

    const handleAttendancePress = async () => {
        if (!userBranch) return;
        setBiometricError('');

        let loc = location;
        if (!loc) {
            try {
                loc = await getCurrentPosition();
                setLocation(loc);
            } catch {
                setLocationError('لا يمكن تسجيل الحضور بدون تحديد الموقع');
                setLocationStatus('error');
                return;
            }
        }

        // Verify location is within branch radius
        const dist = calculateDistance(
            loc.latitude, loc.longitude,
            userBranch.latitude, userBranch.longitude
        );
        if (dist > userBranch.radiusMeters) {
            setDistanceToOffice(dist);
            setLocationStatus('inactive');
            return; // Block - out of range
        }
        // Biometric must be verified before attendance
        if (biometricSettings?.enabled && !biometricVerified) {
            setBiometricError('يجب التحقق من هويتك أولاً');
            return;
        }

        if (isCheckedIn) {
            checkOut(loc);
        } else {
            checkIn(loc);
        }
    };

    const isLocationBlocked = locationStatus !== 'active';

    const hours = currentTime.getHours();
    const minutes = currentTime.getMinutes().toString().padStart(2, '0');
    const seconds = currentTime.getSeconds().toString().padStart(2, '0');
    const period = hours >= 12 ? 'م' : 'ص';
    const displayHours = (hours % 12 || 12).toString().padStart(2, '0');

    // Show verification gate if biometric is enabled and not verified
    const needsVerification = biometricSettings?.enabled && !biometricVerified;

    // Block rendering until biometric settings are loaded to prevent security flash
    if (biometricLoading) {
        return (
            <div className="page-enter" style={{
                position: 'fixed', inset: 0, zIndex: 100,
                background: 'linear-gradient(160deg, #050810 0%, #0c1221 40%, #0a0f1e 100%)',
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', gap: 16,
            }}>
                <div style={{
                    width: 48, height: 48, borderRadius: '50%',
                    border: '3px solid rgba(255,255,255,0.06)',
                    borderTopColor: '#818cf8', borderRightColor: '#6366f1',
                    animation: 'spin 0.7s linear infinite',
                }} />
                <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.5)', fontFamily: 'var(--font-arabic)' }}>
                    جاري التحقق من الإعدادات...
                </div>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        );
    }


    if (needsVerification) {
        const confPct = Math.min(faceConfidence, 100);
        const livePct = Math.min(livenessProgress, 100);
        const confColor = confPct > 70 ? '#34d399' : confPct > 40 ? '#fbbf24' : '#818cf8';
        const liveColor = livePct > 50 ? '#34d399' : livePct > 25 ? '#fbbf24' : '#818cf8';
        const overallProgress = Math.round((confPct * 0.5 + livePct * 0.5));
        const scanActive = faceStatus === 'scanning';

        return (
            <div className="page-enter" style={{
                position: 'fixed', inset: 0, zIndex: 100,
                background: 'linear-gradient(160deg, #050810 0%, #0c1221 40%, #0a0f1e 100%)',
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', padding: '16px',
                fontFamily: 'var(--font-arabic)',
                overflow: 'hidden',
            }}>
                {/* Animated background orbs */}
                <div style={{
                    position: 'absolute', width: 320, height: 320, borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(99,102,241,0.08), transparent 70%)',
                    top: '-8%', right: '-12%',
                    animation: 'fvFloat 8s ease-in-out infinite',
                    pointerEvents: 'none',
                }} />
                <div style={{
                    position: 'absolute', width: 260, height: 260, borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(16,185,129,0.06), transparent 70%)',
                    bottom: '-5%', left: '-10%',
                    animation: 'fvFloat 10s ease-in-out infinite reverse',
                    pointerEvents: 'none',
                }} />

                {faceMode ? (
                    <div style={{ width: '100%', maxWidth: 400, textAlign: 'center', position: 'relative', zIndex: 2 }}>
                        {/* Header with back button */}
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            marginBottom: 16, padding: '0 4px',
                        }}>
                            <button
                                onClick={() => { setFaceMode(false); cleanupCamera(); setFaceStatus('idle'); setBiometricError(''); setScanMessage(''); framesRef.current = []; }}
                                style={{
                                    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
                                    borderRadius: 12, padding: '8px 16px', color: '#94a3b8',
                                    fontSize: 12, fontWeight: 700, cursor: 'pointer',
                                    fontFamily: 'var(--font-arabic)',
                                    display: 'flex', alignItems: 'center', gap: 6,
                                    transition: 'all 0.2s ease',
                                }}
                            >
                                <ArrowRight size={14} />
                                رجوع
                            </button>
                            <div style={{
                                fontSize: 11, fontWeight: 700, color: '#475569',
                                display: 'flex', alignItems: 'center', gap: 5,
                            }}>
                                <Lock size={10} />
                                مشفّر
                            </div>
                        </div>

                        {/* Camera Viewfinder — circular design */}
                        <div style={{
                            position: 'relative',
                            width: 280, height: 280,
                            margin: '0 auto 20px',
                        }}>
                            {/* Outer rotating scan ring */}
                            {scanActive && (
                                <>
                                    <svg style={{
                                        position: 'absolute', inset: -12,
                                        width: 'calc(100% + 24px)', height: 'calc(100% + 24px)',
                                        animation: 'fvRotate 4s linear infinite',
                                        pointerEvents: 'none',
                                    }} viewBox="0 0 100 100">
                                        <circle cx="50" cy="50" r="48" fill="none"
                                            stroke="url(#scanGrad)" strokeWidth="1.5"
                                            strokeDasharray="20 80" strokeLinecap="round" />
                                        <defs>
                                            <linearGradient id="scanGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                                                <stop offset="0%" stopColor={confColor} stopOpacity="0.8" />
                                                <stop offset="100%" stopColor={confColor} stopOpacity="0.1" />
                                            </linearGradient>
                                        </defs>
                                    </svg>
                                    {/* Inner progress circle */}
                                    <svg style={{
                                        position: 'absolute', inset: -6,
                                        width: 'calc(100% + 12px)', height: 'calc(100% + 12px)',
                                        transform: 'rotate(-90deg)',
                                        pointerEvents: 'none',
                                        transition: 'all 0.5s ease',
                                    }} viewBox="0 0 100 100">
                                        <circle cx="50" cy="50" r="47" fill="none"
                                            stroke="rgba(255,255,255,0.04)" strokeWidth="2" />
                                        <circle cx="50" cy="50" r="47" fill="none"
                                            stroke={confColor} strokeWidth="2"
                                            strokeDasharray={`${overallProgress * 2.95} 295`}
                                            strokeLinecap="round"
                                            style={{ transition: 'stroke-dasharray 0.5s ease, stroke 0.5s ease' }} />
                                    </svg>
                                </>
                            )}

                            {/* Camera circle */}
                            <div style={{
                                width: '100%', height: '100%', borderRadius: '50%',
                                overflow: 'hidden', position: 'relative',
                                border: `3px solid ${faceStatus === 'success' ? '#10b981'
                                    : faceStatus === 'fail' ? '#f43f5e'
                                        : scanActive ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.08)'
                                    }`,
                                boxShadow: faceStatus === 'success'
                                    ? '0 0 50px rgba(16,185,129,0.35), inset 0 0 30px rgba(16,185,129,0.1)'
                                    : faceStatus === 'fail'
                                        ? '0 0 40px rgba(244,63,94,0.25)'
                                        : scanActive
                                            ? '0 0 40px rgba(99,102,241,0.15), inset 0 0 20px rgba(0,0,0,0.3)'
                                            : 'none',
                                transition: 'all 0.6s ease',
                            }}>
                                <video ref={videoRef} autoPlay playsInline muted style={{
                                    width: '100%', height: '100%', objectFit: 'cover',
                                    transform: 'scaleX(-1) scale(1.15)',
                                }} />
                                <canvas ref={canvasRef} style={{
                                    position: 'absolute', inset: 0, width: '100%', height: '100%',
                                    transform: 'scaleX(-1)', pointerEvents: 'none',
                                }} />

                                {/* Success overlay */}
                                {faceStatus === 'success' && (
                                    <div style={{
                                        position: 'absolute', inset: 0, borderRadius: '50%',
                                        background: 'rgba(16,185,129,0.3)',
                                        backdropFilter: 'blur(6px)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        animation: 'fvFadeIn 0.4s ease',
                                    }}>
                                        <div style={{
                                            width: 80, height: 80, borderRadius: '50%',
                                            background: 'linear-gradient(135deg, #10b981, #059669)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            boxShadow: '0 12px 40px rgba(16,185,129,0.5)',
                                            animation: 'fvPop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
                                        }}>
                                            <CheckCircle size={40} color="white" strokeWidth={2} />
                                        </div>
                                    </div>
                                )}

                                {/* Fail overlay */}
                                {faceStatus === 'fail' && (
                                    <div style={{
                                        position: 'absolute', inset: 0, borderRadius: '50%',
                                        background: 'rgba(244,63,94,0.2)',
                                        backdropFilter: 'blur(4px)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        animation: 'fvFadeIn 0.4s ease',
                                    }}>
                                        <div style={{
                                            width: 64, height: 64, borderRadius: '50%',
                                            background: 'linear-gradient(135deg, #f43f5e, #e11d48)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            boxShadow: '0 8px 30px rgba(244,63,94,0.4)',
                                        }}>
                                            <Scan size={30} color="white" strokeWidth={2} />
                                        </div>
                                    </div>
                                )}

                                {/* Loading overlay */}
                                {faceStatus === 'loading' && (
                                    <div style={{
                                        position: 'absolute', inset: 0, borderRadius: '50%',
                                        background: 'rgba(0,0,0,0.88)',
                                        backdropFilter: 'blur(6px)',
                                        display: 'flex', flexDirection: 'column',
                                        alignItems: 'center', justifyContent: 'center', gap: 12,
                                    }}>
                                        <div style={{
                                            width: 48, height: 48, borderRadius: '50%',
                                            border: '3px solid rgba(255,255,255,0.08)',
                                            borderTopColor: '#818cf8', borderRightColor: '#6366f1',
                                            animation: 'spin 0.7s linear infinite',
                                        }} />
                                        <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>
                                            جاري التحميل...
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Confidence & Liveness mini badges */}
                            {scanActive && (
                                <>
                                    <div style={{
                                        position: 'absolute', top: -4, left: '50%', transform: 'translateX(-50%)',
                                        background: 'rgba(10,15,30,0.85)', backdropFilter: 'blur(12px)',
                                        borderRadius: 20, padding: '4px 14px',
                                        fontSize: 10, fontWeight: 800, color: confColor,
                                        border: `1px solid ${confColor}33`,
                                        display: 'flex', alignItems: 'center', gap: 5,
                                        transition: 'all 0.4s ease',
                                        whiteSpace: 'nowrap',
                                    }}>
                                        <Eye size={10} />
                                        تطابق {confPct}%
                                    </div>
                                    <div style={{
                                        position: 'absolute', bottom: -4, left: '50%', transform: 'translateX(-50%)',
                                        background: 'rgba(10,15,30,0.85)', backdropFilter: 'blur(12px)',
                                        borderRadius: 20, padding: '4px 14px',
                                        fontSize: 10, fontWeight: 800, color: liveColor,
                                        border: `1px solid ${liveColor}33`,
                                        display: 'flex', alignItems: 'center', gap: 5,
                                        transition: 'all 0.4s ease',
                                        whiteSpace: 'nowrap',
                                    }}>
                                        <Shield size={10} />
                                        حيوية {livePct}%
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Status message with icon */}
                        <div style={{
                            fontSize: 15, fontWeight: 800, marginBottom: 4,
                            color: faceStatus === 'success' ? '#34d399'
                                : faceStatus === 'fail' ? '#fb7185'
                                    : '#e2e8f0',
                            transition: 'color 0.3s ease',
                        }}>
                            {faceStatus === 'success' ? '✅ تم التحقق بنجاح!'
                                : faceStatus === 'fail' ? '❌ فشل التحقق'
                                    : scanMessage}
                        </div>

                        {/* Smart guidance text */}
                        {scanActive && (
                            <div style={{
                                fontSize: 11, color: '#64748b', fontWeight: 600,
                                marginBottom: 8, lineHeight: 1.8,
                            }}>
                                {confPct === 0 && livePct === 0 && 'وجّه وجهك نحو الكاميرا في إضاءة جيدة'}
                                {confPct > 0 && confPct <= 40 && 'جاري مطابقة ملامح الوجه...'}
                                {confPct > 40 && livePct < 25 && '🔄 حرّك رأسك ببطء يميناً ويساراً'}
                                {confPct > 40 && livePct >= 25 && livePct < 50 && 'جيد! استمر بالحركة البطيئة...'}
                                {confPct > 60 && livePct >= 50 && 'جاري التأكيد النهائي...'}
                            </div>
                        )}

                        {/* Error message */}
                        {biometricError && (
                            <div style={{
                                fontSize: 12, fontWeight: 700, margin: '8px auto',
                                padding: '10px 18px', borderRadius: 14, maxWidth: 340,
                                color: '#fb7185',
                                background: 'rgba(244,63,94,0.06)',
                                border: '1px solid rgba(244,63,94,0.12)',
                            }}>
                                {biometricError}
                            </div>
                        )}

                        {/* Real-time metrics bar */}
                        {scanActive && (
                            <div style={{
                                display: 'flex', gap: 8, justifyContent: 'center',
                                margin: '14px auto', maxWidth: 320,
                            }}>
                                <div style={{
                                    flex: 1, padding: '10px 8px', borderRadius: 14,
                                    background: 'rgba(255,255,255,0.03)',
                                    border: '1px solid rgba(255,255,255,0.05)',
                                    textAlign: 'center',
                                }}>
                                    <div style={{ fontSize: 9, color: '#475569', fontWeight: 700, marginBottom: 6 }}>مطابقة الوجه</div>
                                    <div style={{
                                        height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)',
                                        overflow: 'hidden',
                                    }}>
                                        <div style={{
                                            width: `${confPct}%`, height: '100%', borderRadius: 2,
                                            background: `linear-gradient(90deg, ${confColor}, ${confColor}cc)`,
                                            transition: 'width 0.4s ease',
                                            boxShadow: `0 0 8px ${confColor}55`,
                                        }} />
                                    </div>
                                    <div style={{ fontSize: 16, fontWeight: 900, color: confColor, marginTop: 4, fontFamily: 'var(--font-numeric)' }}>
                                        {confPct}%
                                    </div>
                                </div>
                                <div style={{
                                    flex: 1, padding: '10px 8px', borderRadius: 14,
                                    background: 'rgba(255,255,255,0.03)',
                                    border: '1px solid rgba(255,255,255,0.05)',
                                    textAlign: 'center',
                                }}>
                                    <div style={{ fontSize: 9, color: '#475569', fontWeight: 700, marginBottom: 6 }}>كشف الحيوية</div>
                                    <div style={{
                                        height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)',
                                        overflow: 'hidden',
                                    }}>
                                        <div style={{
                                            width: `${livePct}%`, height: '100%', borderRadius: 2,
                                            background: `linear-gradient(90deg, ${liveColor}, ${liveColor}cc)`,
                                            transition: 'width 0.4s ease',
                                            boxShadow: `0 0 8px ${liveColor}55`,
                                        }} />
                                    </div>
                                    <div style={{ fontSize: 16, fontWeight: 900, color: liveColor, marginTop: 4, fontFamily: 'var(--font-numeric)' }}>
                                        {livePct}%
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Action buttons */}
                        <div style={{ display: 'flex', gap: 8, marginTop: 16, maxWidth: 320, margin: '16px auto 0' }}>
                            {faceStatus === 'fail' && (
                                <button onClick={handleFaceVerify} style={{
                                    flex: 1, padding: '14px', borderRadius: 14,
                                    background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                                    border: 'none', color: 'white', fontSize: 14, fontWeight: 800,
                                    cursor: 'pointer', fontFamily: 'var(--font-arabic)',
                                    boxShadow: '0 6px 25px rgba(99,102,241,0.3)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                }}>
                                    <Camera size={16} />
                                    إعادة المحاولة
                                </button>
                            )}
                            {(faceStatus === 'fail' || faceStatus === 'idle') && (
                                <button
                                    onClick={() => { setFaceMode(false); cleanupCamera(); setFaceStatus('idle'); setBiometricError(''); setScanMessage(''); framesRef.current = []; }}
                                    style={{
                                        flex: faceStatus === 'fail' ? 0 : 1,
                                        padding: '14px 20px', borderRadius: 14,
                                        background: 'rgba(255,255,255,0.04)',
                                        border: '1px solid rgba(255,255,255,0.08)',
                                        color: '#94a3b8', fontSize: 13, fontWeight: 700,
                                        cursor: 'pointer', fontFamily: 'var(--font-arabic)',
                                    }}
                                >
                                    رجوع
                                </button>
                            )}
                        </div>
                    </div>
                ) : (
                    /* ========== Verification Menu ========== */
                    <div style={{ width: '100%', maxWidth: 380, textAlign: 'center', position: 'relative', zIndex: 2 }}>
                        {/* Animated shield icon */}
                        <div style={{
                            width: 100, height: 100, borderRadius: '50%', margin: '0 auto 24px',
                            background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.1))',
                            border: '2px solid rgba(99,102,241,0.2)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            position: 'relative',
                            boxShadow: '0 8px 40px rgba(99,102,241,0.15)',
                        }}>
                            <Shield size={44} color="#818cf8" strokeWidth={1.6} />
                            {/* Rotating outer ring */}
                            <svg style={{
                                position: 'absolute', inset: -10,
                                width: 'calc(100% + 20px)', height: 'calc(100% + 20px)',
                                animation: 'fvRotate 6s linear infinite',
                                pointerEvents: 'none',
                            }} viewBox="0 0 100 100">
                                <circle cx="50" cy="50" r="48" fill="none"
                                    stroke="rgba(99,102,241,0.12)" strokeWidth="1"
                                    strokeDasharray="15 85" strokeLinecap="round" />
                            </svg>
                            {/* Pulse ring */}
                            <div style={{
                                position: 'absolute', inset: -8, borderRadius: '50%',
                                border: '1px solid rgba(99,102,241,0.1)',
                                animation: 'fvPulse 3s ease-in-out infinite',
                            }} />
                        </div>

                        <h2 style={{
                            fontSize: 24, fontWeight: 900, marginBottom: 8,
                            color: '#f1f5f9',
                            letterSpacing: '-0.3px',
                        }}>
                            التحقق من الهوية
                        </h2>
                        <p style={{
                            fontSize: 13, color: '#64748b',
                            marginBottom: 28, lineHeight: 2,
                        }}>
                            يجب التحقق من هويتك البيومترية
                            <br />
                            <span style={{ fontSize: 11, color: '#475569' }}>قبل الوصول إلى نظام الحضور</span>
                        </p>

                        {biometricError && (
                            <div style={{
                                fontSize: 12, color: '#fb7185', fontWeight: 700,
                                marginBottom: 18, padding: '12px 16px', borderRadius: 14,
                                background: 'rgba(244,63,94,0.06)',
                                border: '1px solid rgba(244,63,94,0.1)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                            }}>
                                <Scan size={14} />
                                {biometricError}
                            </div>
                        )}

                        {hasFace ? (
                            <button onClick={handleFaceVerify} style={{
                                width: '100%', padding: '18px', borderRadius: 16,
                                background: 'linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%)',
                                border: 'none', color: 'white', fontSize: 16, fontWeight: 900,
                                cursor: 'pointer', fontFamily: 'var(--font-arabic)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
                                boxShadow: '0 8px 35px rgba(16,185,129,0.3), 0 2px 4px rgba(0,0,0,0.2)',
                                transition: 'all 0.3s ease',
                                position: 'relative',
                                overflow: 'hidden',
                            }}>
                                <Camera size={20} strokeWidth={2.2} />
                                التحقق بالوجه
                                {/* Shimmer effect */}
                                <div style={{
                                    position: 'absolute', inset: 0,
                                    background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.1) 50%, transparent 60%)',
                                    animation: 'fvShimmer 3s ease-in-out infinite',
                                }} />
                            </button>
                        ) : (
                            <div style={{
                                padding: '20px', borderRadius: 16,
                                background: 'rgba(245,158,11,0.05)',
                                border: '1px solid rgba(245,158,11,0.12)',
                                textAlign: 'center',
                            }}>
                                <div style={{
                                    width: 48, height: 48, borderRadius: '50%',
                                    background: 'rgba(245,158,11,0.1)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    margin: '0 auto 12px',
                                }}>
                                    <Camera size={22} color="#fbbf24" />
                                </div>
                                <div style={{ fontSize: 14, fontWeight: 800, color: '#fbbf24', marginBottom: 6 }}>
                                    لم يتم تسجيل بصمة الوجه
                                </div>
                                <div style={{ fontSize: 11, color: '#64748b', lineHeight: 2 }}>
                                    يجب تسجيل بصمة الوجه عند إنشاء الحساب
                                    <br />
                                    تواصل مع المدير لإعادة التسجيل
                                </div>
                            </div>
                        )}

                        {/* Info cards */}
                        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
                            <div style={{
                                flex: 1, padding: '12px', borderRadius: 14,
                                background: 'rgba(255,255,255,0.02)',
                                border: '1px solid rgba(255,255,255,0.04)',
                                textAlign: 'center',
                            }}>
                                <Lock size={14} color="#475569" style={{ marginBottom: 4 }} />
                                <div style={{ fontSize: 9, color: '#475569', fontWeight: 700 }}>
                                    مشفّر بالكامل
                                </div>
                            </div>
                            <div style={{
                                flex: 1, padding: '12px', borderRadius: 14,
                                background: 'rgba(255,255,255,0.02)',
                                border: '1px solid rgba(255,255,255,0.04)',
                                textAlign: 'center',
                            }}>
                                <ShieldCheck size={14} color="#475569" style={{ marginBottom: 4 }} />
                                <div style={{ fontSize: 9, color: '#475569', fontWeight: 700 }}>
                                    جلسة 30 دقيقة
                                </div>
                            </div>
                            <div style={{
                                flex: 1, padding: '12px', borderRadius: 14,
                                background: 'rgba(255,255,255,0.02)',
                                border: '1px solid rgba(255,255,255,0.04)',
                                textAlign: 'center',
                            }}>
                                <Eye size={14} color="#475569" style={{ marginBottom: 4 }} />
                                <div style={{ fontSize: 9, color: '#475569', fontWeight: 700 }}>
                                    كشف حيوية
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                <style>{`
                    @keyframes fvRotate { to { transform: rotate(360deg); } }
                    @keyframes fvFloat {
                        0%, 100% { transform: translateY(0) scale(1); }
                        50% { transform: translateY(-25px) scale(1.05); }
                    }
                    @keyframes fvPulse {
                        0%, 100% { transform: scale(1); opacity: 0.5; }
                        50% { transform: scale(1.15); opacity: 0; }
                    }
                    @keyframes fvFadeIn {
                        from { opacity: 0; }
                        to { opacity: 1; }
                    }
                    @keyframes fvPop {
                        0% { transform: scale(0); }
                        100% { transform: scale(1); }
                    }
                    @keyframes fvShimmer {
                        0% { transform: translateX(-100%); }
                        50%, 100% { transform: translateX(100%); }
                    }
                    @keyframes pulse-glow-green {
                        0%, 100% { box-shadow: 0 8px 30px rgba(16,185,129,0.4); }
                        50% { box-shadow: 0 8px 50px rgba(16,185,129,0.6); }
                    }
                `}</style>
            </div>
        );
    }

    return (
        <div className="page-content page-enter">
            {/* Digital Clock */}
            <div className="digital-clock">
                <div className="clock-time">
                    {displayHours}:{minutes}
                    <span style={{ fontSize: '28px', opacity: 0.5 }}>:{seconds}</span>
                    <span className="clock-period">{period}</span>
                </div>
                <div className="clock-date">{formatDateArabic(currentTime)}</div>
            </div>

            {/* Status Banner */}
            <div className={`status-banner ${isCheckedIn ? 'checked-in' : 'checked-out'}`}>
                <span className="status-dot" />
                {isCheckedIn ? (
                    <span>
                        أنت مسجل حضور منذ {todayRecord?.checkInTime && formatTimeString(todayRecord.checkInTime)}
                    </span>
                ) : todayRecord?.checkOutTime ? (
                    <span>
                        انتهى دوامك اليوم • {formatHours(todayRecord.totalHours || 0)} ساعة
                    </span>
                ) : (
                    <span>لم يتم تسجيل الحضور بعد</span>
                )}
            </div>

            {/* Attendance Button */}
            <AttendanceButton
                isCheckedIn={isCheckedIn}
                onPress={handleAttendancePress}
                disabled={isLocationBlocked && !isCheckedIn}
            />

            {/* Location Card */}
            <div className="glass-card compact location-card">
                <div className={`location-icon ${locationStatus === 'active' ? 'active' : locationStatus === 'loading' ? 'loading' : 'inactive'}`}>
                    <MapPin size={20} />
                </div>
                <div className="location-info">
                    <div className="loc-title">
                        {branchLoading
                            ? 'جاري تحميل بيانات الفرع...'
                            : locationStatus === 'loading'
                                ? 'جاري تحديد الموقع...'
                                : userBranch
                                    ? userBranch.name
                                    : 'لم يتم تعيين فرع'}
                    </div>
                    <div className="loc-status">
                        {locationStatus === 'error'
                            ? locationError
                            : distanceToOffice !== null && locationStatus !== 'loading'
                                ? `المسافة: ${formatDistance(distanceToOffice)}`
                                : locationStatus === 'loading'
                                    ? 'يرجى الانتظار...'
                                    : 'تحديد المسافة...'}
                    </div>
                </div>
                {locationStatus !== 'loading' && !branchLoading && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {(locationStatus === 'error' || locationStatus === 'inactive') && (
                            <button onClick={checkLocation} style={{
                                background: 'none', border: 'none', color: 'var(--text-muted)',
                                cursor: 'pointer', padding: 4, display: 'flex',
                            }}>
                                <RefreshCw size={16} />
                            </button>
                        )}
                        <span className={`location-badge ${locationStatus === 'active' ? 'in-range' : 'out-range'}`}>
                            {locationStatus === 'active' ? 'في النطاق ✓' : locationStatus === 'inactive' ? 'خارج النطاق' : 'خطأ'}
                        </span>
                    </div>
                )}
            </div>

            {/* Location Error - with retry */}
            {locationStatus === 'error' && (
                <div className="glass-card compact" style={{
                    background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)',
                    padding: '12px 14px', marginTop: 8,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                        <AlertTriangle size={18} style={{ color: 'var(--accent-rose)', flexShrink: 0 }} />
                        <div style={{ fontSize: 12, color: 'var(--accent-rose)', fontWeight: 600, flex: 1 }}>
                            {locationError}
                        </div>
                    </div>
                    <button onClick={checkLocation} style={{
                        width: '100%', padding: '10px', borderRadius: 'var(--radius-md)',
                        background: 'var(--accent-blue)', border: 'none',
                        color: 'white', fontSize: 13, fontWeight: 700,
                        cursor: 'pointer', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', gap: 8,
                    }}>
                        <RefreshCw size={15} />
                        إعادة تحديد الموقع
                    </button>
                </div>
            )}

            {/* Warning if out of range */}
            {locationStatus === 'inactive' && (
                <div className="glass-card compact" style={{
                    background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)',
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', marginTop: 8,
                }}>
                    <AlertTriangle size={18} style={{ color: 'var(--accent-amber)', flexShrink: 0 }} />
                    <div style={{ fontSize: 12, color: 'var(--accent-amber)', fontWeight: 600 }}>
                        أنت خارج نطاق الفرع. يجب أن تكون ضمن {userBranch?.radiusMeters || 500} متر من موقع الفرع لتسجيل الحضور.
                    </div>
                </div>
            )}

            {/* Biometric Error */}
            {biometricError && (
                <div className="glass-card compact" style={{
                    background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)',
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', marginTop: 8,
                }}>
                    <Lock size={18} style={{ color: 'var(--accent-rose)', flexShrink: 0 }} />
                    <div style={{ fontSize: 12, color: 'var(--accent-rose)', fontWeight: 600, flex: 1 }}>
                        {biometricError}
                    </div>
                    <button onClick={() => setBiometricError('')} style={{
                        background: 'none', border: 'none', color: 'var(--accent-rose)',
                        fontSize: 16, cursor: 'pointer', padding: 2, lineHeight: 1,
                    }}>×</button>
                </div>
            )}

            {/* Status Cards */}
            <div className="status-grid">
                <StatusCard
                    icon={<Clock size={18} />}
                    value={formatHours(todayTotalHours)}
                    label="ساعات اليوم"
                    color="blue"
                />
                <StatusCard
                    icon={<Timer size={18} />}
                    value={todayRecord?.isLate ? `${todayRecord.lateMinutes} د` : '٠'}
                    label="تأخير اليوم"
                    color={todayRecord?.isLate ? 'amber' : 'emerald'}
                />
                <StatusCard
                    icon={<CheckCircle size={18} />}
                    value={monthStats.present.toString()}
                    label="أيام الحضور"
                    color="emerald"
                />
                <StatusCard
                    icon={<Coffee size={18} />}
                    value={monthStats.absent.toString()}
                    label="أيام الغياب"
                    color="rose"
                />
            </div>
        </div>
    );
}
