import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Clock, MapPin, Timer, AlertTriangle, CheckCircle, Coffee, RefreshCw, Lock, ShieldAlert, Camera, Scan, Shield, ShieldCheck, Eye } from 'lucide-react';
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
    const [biometricError, setBiometricError] = useState('');
    const [biometricVerified, setBiometricVerified] = useState(false);
    const [biometricLoading, setBiometricLoading] = useState(false);
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

    // Load biometric settings
    useEffect(() => {
        const loadAndCheck = async () => {
            const settings = await getBiometricSettings();
            setBiometricSettings(settings);
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
    const hasFace = user?.id ? isFaceRegistered(user.id) : false;

    if (needsVerification) {
        return (
            <div className="page-content page-enter" style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', minHeight: '80vh', padding: '20px',
            }}>
                {/* Face Camera Mode */}
                {faceMode ? (
                    <div style={{ width: '100%', maxWidth: 380, textAlign: 'center' }}>
                        {/* Camera Container */}
                        <div style={{
                            position: 'relative', width: '100%', aspectRatio: '3/4',
                            borderRadius: 20, overflow: 'hidden',
                            border: `2px solid ${faceStatus === 'success' ? '#10b981'
                                : faceStatus === 'fail' ? '#f43f5e'
                                    : 'rgba(99,102,241,0.4)'}`,
                            background: '#000', marginBottom: 14,
                            boxShadow: faceStatus === 'success'
                                ? '0 0 40px rgba(16,185,129,0.3)'
                                : faceStatus === 'scanning'
                                    ? '0 0 30px rgba(99,102,241,0.2)'
                                    : 'none',
                            transition: 'all 0.5s ease',
                        }}>
                            <video ref={videoRef} autoPlay playsInline muted style={{
                                width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)',
                            }} />
                            <canvas ref={canvasRef} style={{
                                position: 'absolute', inset: 0, width: '100%', height: '100%',
                                transform: 'scaleX(-1)', pointerEvents: 'none',
                            }} />

                            {/* Scanning corner markers */}
                            {faceStatus === 'scanning' && (
                                <>
                                    {['top-right', 'top-left', 'bottom-right', 'bottom-left'].map(pos => (
                                        <div key={pos} style={{
                                            position: 'absolute',
                                            [pos.includes('top') ? 'top' : 'bottom']: 14,
                                            [pos.includes('right') ? 'right' : 'left']: 14,
                                            width: 28, height: 28,
                                            borderTop: pos.includes('top') ? '2.5px solid rgba(99,102,241,0.6)' : 'none',
                                            borderBottom: pos.includes('bottom') ? '2.5px solid rgba(99,102,241,0.6)' : 'none',
                                            borderRight: pos.includes('right') ? '2.5px solid rgba(99,102,241,0.6)' : 'none',
                                            borderLeft: pos.includes('left') ? '2.5px solid rgba(99,102,241,0.6)' : 'none',
                                            borderRadius: 6,
                                            animation: 'vipGlow 2s ease-in-out infinite',
                                        }} />
                                    ))}
                                </>
                            )}

                            {/* Top HUD badges */}
                            {faceStatus === 'scanning' && (
                                <div style={{
                                    position: 'absolute', top: 10, left: 10, right: 10,
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                }}>
                                    <div style={{
                                        background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)',
                                        borderRadius: 14, padding: '5px 12px',
                                        fontSize: 11, fontWeight: 700,
                                        color: faceConfidence > 60 ? '#34d399' : '#fbbf24',
                                        display: 'flex', alignItems: 'center', gap: 5,
                                        border: `1px solid ${faceConfidence > 60 ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}`,
                                        transition: 'all 0.3s ease',
                                    }}>
                                        <Eye size={12} />
                                        تطابق {faceConfidence}%
                                    </div>
                                    <div style={{
                                        background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)',
                                        borderRadius: 14, padding: '5px 12px',
                                        fontSize: 11, fontWeight: 700,
                                        color: livenessProgress > 30 ? '#34d399' : '#fbbf24',
                                        border: `1px solid ${livenessProgress > 30 ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}`,
                                        transition: 'all 0.3s ease',
                                    }}>
                                        حيوية {livenessProgress}%
                                    </div>
                                </div>
                            )}

                            {/* Progress bar */}
                            {faceStatus === 'scanning' && (
                                <div style={{
                                    position: 'absolute', bottom: 0, left: 0, right: 0,
                                    height: 4, background: 'rgba(0,0,0,0.5)',
                                }}>
                                    <div style={{
                                        height: '100%', borderRadius: 2,
                                        background: livenessProgress > 30
                                            ? 'linear-gradient(90deg, #10b981, #34d399)'
                                            : 'linear-gradient(90deg, #3b82f6, #818cf8)',
                                        width: `${Math.min(livenessProgress, 100)}%`,
                                        transition: 'width 300ms ease, background 500ms ease',
                                        boxShadow: livenessProgress > 30
                                            ? '0 0 10px rgba(16,185,129,0.5)'
                                            : '0 0 10px rgba(59,130,246,0.4)',
                                    }} />
                                </div>
                            )}

                            {/* Success overlay */}
                            {faceStatus === 'success' && (
                                <div style={{
                                    position: 'absolute', inset: 0,
                                    background: 'rgba(16,185,129,0.25)',
                                    backdropFilter: 'blur(4px)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{
                                            width: 80, height: 80, borderRadius: '50%',
                                            background: 'linear-gradient(135deg, #10b981, #059669)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            margin: '0 auto 12px',
                                            boxShadow: '0 8px 30px rgba(16,185,129,0.5)',
                                            animation: 'pulse-glow-green 1.5s ease-in-out infinite',
                                        }}>
                                            <CheckCircle size={40} color="white" strokeWidth={2} />
                                        </div>
                                        <div style={{ fontSize: 18, fontWeight: 900, color: 'white', textShadow: '0 2px 8px rgba(0,0,0,0.4)' }}>
                                            تم التحقق بنجاح!
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Loading overlay */}
                            {faceStatus === 'loading' && (
                                <div style={{
                                    position: 'absolute', inset: 0,
                                    background: 'rgba(0,0,0,0.85)',
                                    backdropFilter: 'blur(4px)',
                                    display: 'flex', flexDirection: 'column',
                                    alignItems: 'center', justifyContent: 'center', gap: 14,
                                }}>
                                    <div style={{
                                        width: 52, height: 52, borderRadius: '50%',
                                        border: '3px solid rgba(255,255,255,0.1)',
                                        borderTopColor: '#818cf8',
                                        animation: 'spin 0.8s linear infinite',
                                    }} />
                                    <div style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>
                                        جاري تحميل نظام التعرف...
                                    </div>
                                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
                                        قد يستغرق بضع ثواني
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Status message */}
                        <div style={{
                            fontSize: 14, fontWeight: 700, marginBottom: 6,
                            color: faceStatus === 'success' ? '#34d399'
                                : faceStatus === 'fail' ? '#fb7185'
                                    : 'var(--text-primary)',
                        }}>
                            {scanMessage}
                        </div>

                        {biometricError && (
                            <div style={{
                                fontSize: 12, fontWeight: 600, margin: '8px 0',
                                padding: '10px 14px', borderRadius: 12,
                                color: '#fb7185',
                                background: 'rgba(244,63,94,0.08)',
                                border: '1px solid rgba(244,63,94,0.15)',
                            }}>
                                {biometricError}
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                            {faceStatus === 'fail' && (
                                <button onClick={handleFaceVerify} style={{
                                    flex: 1, padding: '13px', borderRadius: 14,
                                    background: 'linear-gradient(135deg, #10b981, #059669)',
                                    border: 'none', color: 'white', fontSize: 13, fontWeight: 700,
                                    cursor: 'pointer', fontFamily: 'var(--font-arabic)',
                                    boxShadow: '0 4px 15px rgba(16,185,129,0.3)',
                                }}>
                                    إعادة المحاولة
                                </button>
                            )}
                            <button
                                onClick={() => { setFaceMode(false); cleanupCamera(); setFaceStatus('idle'); setBiometricError(''); setScanMessage(''); framesRef.current = []; }}
                                style={{
                                    flex: faceStatus === 'fail' ? 0 : 1,
                                    padding: '13px 20px', borderRadius: 14,
                                    background: 'rgba(255,255,255,0.05)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    color: 'var(--text-secondary)', fontSize: 13, fontWeight: 700,
                                    cursor: 'pointer', fontFamily: 'var(--font-arabic)',
                                }}
                            >
                                رجوع
                            </button>
                        </div>
                    </div>
                ) : (
                    /* Verification Menu */
                    <div style={{ width: '100%', maxWidth: 360, textAlign: 'center' }}>
                        {/* Icon */}
                        <div style={{
                            width: 88, height: 88, borderRadius: '50%', margin: '0 auto 22px',
                            background: 'linear-gradient(135deg, rgba(59,130,246,0.12), rgba(139,92,246,0.08))',
                            border: '2px solid rgba(99,102,241,0.2)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            position: 'relative',
                        }}>
                            <Shield size={40} color="#818cf8" strokeWidth={1.8} />
                            {/* Pulse ring */}
                            <div style={{
                                position: 'absolute', inset: -6, borderRadius: '50%',
                                border: '1px solid rgba(99,102,241,0.15)',
                                animation: 'leavePendingPulse 2.5s ease-in-out infinite',
                            }} />
                        </div>

                        <h2 style={{ fontSize: 21, fontWeight: 900, marginBottom: 6, color: 'var(--text-primary)' }}>
                            التحقق من الهوية
                        </h2>
                        <p style={{
                            fontSize: 13, color: 'var(--text-muted)',
                            marginBottom: 26, lineHeight: 1.8,
                        }}>
                            يجب التحقق من هويتك قبل الوصول لصفحة الحضور
                        </p>

                        {biometricError && (
                            <div style={{
                                fontSize: 12, color: '#fb7185', fontWeight: 600,
                                marginBottom: 16, padding: '10px 14px', borderRadius: 12,
                                background: 'rgba(244,63,94,0.08)',
                                border: '1px solid rgba(244,63,94,0.15)',
                            }}>
                                {biometricError}
                            </div>
                        )}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {hasFace ? (
                                <button onClick={handleFaceVerify} style={{
                                    width: '100%', padding: '16px', borderRadius: 14,
                                    background: 'linear-gradient(135deg, #10b981, #059669)',
                                    border: 'none', color: 'white', fontSize: 15, fontWeight: 800,
                                    cursor: 'pointer', fontFamily: 'var(--font-arabic)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                                    boxShadow: '0 6px 25px rgba(16,185,129,0.3)',
                                    transition: 'all 0.2s ease',
                                }}>
                                    <Camera size={20} strokeWidth={2} />
                                    التحقق بالوجه
                                </button>
                            ) : (
                                <div style={{
                                    padding: '16px', borderRadius: 14,
                                    background: 'rgba(245,158,11,0.08)',
                                    border: '1px solid rgba(245,158,11,0.2)',
                                    textAlign: 'center',
                                }}>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: '#fbbf24', marginBottom: 4 }}>
                                        ⚠️ لم يتم تسجيل بصمة الوجه
                                    </div>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.8 }}>
                                        يجب تسجيل بصمة الوجه عند إنشاء الحساب. تواصل مع المدير.
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Security badge */}
                        <div style={{
                            marginTop: 22, padding: '10px 14px', borderRadius: 12,
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid rgba(255,255,255,0.06)',
                            fontSize: 10, color: 'var(--text-muted)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        }}>
                            <ShieldCheck size={13} />
                            الجلسة تنتهي تلقائياً بعد 30 دقيقة أو عند مغادرة التطبيق
                        </div>
                    </div>
                )}

                <style>{`
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
