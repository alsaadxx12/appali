import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Clock, MapPin, Timer, AlertTriangle, CheckCircle, Coffee, RefreshCw, Lock, ShieldAlert, Fingerprint, Camera, Scan, Shield } from 'lucide-react';
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
    verifyBiometric,
    getBiometricSettings,
    BiometricSettings,
} from '../utils/biometricAuth';
import {
    isFaceRegistered,
    verifyFace,
    loadFaceModels,
    startCamera,
    stopCamera,
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
    // Face verification
    const [faceMode, setFaceMode] = useState(false);
    const [faceStatus, setFaceStatus] = useState<'idle' | 'loading' | 'scanning' | 'success' | 'fail'>('idle');
    const [modelsReady, setModelsReady] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const scanIntervalRef = useRef<any>(null);

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

    const handleBiometricVerify = async () => {
        if (!user?.id) return;
        setBiometricLoading(true);
        setBiometricError('');
        const result = await verifyBiometric(user.id);
        setBiometricLoading(false);
        if (result.success) {
            setBiometricVerified(true);
            setFaceMode(false);
            cleanupCamera();
        } else {
            setBiometricError(result.error || 'فشل التحقق من الهوية');
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

        // Load models
        const loaded = await loadFaceModels();
        if (!loaded) {
            setBiometricError('فشل تحميل نماذج التعرف على الوجه');
            setFaceStatus('fail');
            return;
        }
        setModelsReady(true);

        // Start camera
        await new Promise(r => setTimeout(r, 300));
        if (!videoRef.current) return;
        const stream = await startCamera(videoRef.current);
        if (!stream) {
            setBiometricError('فشل فتح الكاميرا. اسمح بالوصول للكاميرا.');
            setFaceStatus('fail');
            return;
        }
        streamRef.current = stream;
        setFaceStatus('scanning');

        // Auto-scan every 2 seconds
        let attempts = 0;
        scanIntervalRef.current = setInterval(async () => {
            if (!videoRef.current || !user?.id) return;
            attempts++;
            const result = await verifyFace(user.id, videoRef.current);
            if (result.success) {
                setFaceStatus('success');
                cleanupCamera();
                setTimeout(() => {
                    setBiometricVerified(true);
                    setFaceMode(false);
                }, 1000);
                if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
            } else if (attempts >= 15) {
                // 30 seconds timeout
                setFaceStatus('fail');
                setBiometricError('انتهت المهلة. لم يتم التعرف على الوجه.');
                cleanupCamera();
                if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
            }
        }, 2000);
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
                        <div style={{
                            position: 'relative', width: '100%', aspectRatio: '3/4',
                            borderRadius: 'var(--radius-lg)', overflow: 'hidden',
                            border: `3px solid ${faceStatus === 'success' ? 'var(--accent-emerald)'
                                    : faceStatus === 'fail' ? 'var(--accent-rose)'
                                        : 'var(--accent-blue)'
                                }`,
                            background: '#000', marginBottom: 16,
                        }}>
                            <video
                                ref={videoRef}
                                autoPlay playsInline muted
                                style={{
                                    width: '100%', height: '100%', objectFit: 'cover',
                                    transform: 'scaleX(-1)',
                                }}
                            />
                            {/* Scanning overlay */}
                            {faceStatus === 'scanning' && (
                                <div style={{
                                    position: 'absolute', inset: 0,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <div style={{
                                        width: 200, height: 250, borderRadius: '50%',
                                        border: '3px dashed rgba(59,130,246,0.6)',
                                        animation: 'leavePendingPulse 2s ease-in-out infinite',
                                    }} />
                                </div>
                            )}
                            {/* Success overlay */}
                            {faceStatus === 'success' && (
                                <div style={{
                                    position: 'absolute', inset: 0,
                                    background: 'rgba(16,185,129,0.3)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <CheckCircle size={64} style={{ color: '#fff' }} />
                                </div>
                            )}
                            {/* Loading models */}
                            {faceStatus === 'loading' && (
                                <div style={{
                                    position: 'absolute', inset: 0,
                                    background: 'rgba(0,0,0,0.7)',
                                    display: 'flex', flexDirection: 'column',
                                    alignItems: 'center', justifyContent: 'center', gap: 12,
                                    color: 'white',
                                }}>
                                    <Scan size={36} style={{ animation: 'spin 1.5s linear infinite' }} />
                                    <div style={{ fontSize: 13, fontWeight: 600 }}>جاري تحميل نظام التعرف...</div>
                                </div>
                            )}
                        </div>

                        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
                            {faceStatus === 'scanning' ? 'جاري المسح... ضع وجهك أمام الكاميرا'
                                : faceStatus === 'success' ? '✅ تم التحقق بنجاح!'
                                    : faceStatus === 'loading' ? 'جاري التحميل...'
                                        : 'فشل التحقق'}
                        </div>

                        {biometricError && (
                            <div style={{
                                fontSize: 12, color: 'var(--accent-rose)', fontWeight: 600,
                                margin: '8px 0', padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                                background: 'rgba(244,63,94,0.08)',
                            }}>
                                {biometricError}
                            </div>
                        )}

                        <button
                            onClick={() => { setFaceMode(false); cleanupCamera(); setFaceStatus('idle'); setBiometricError(''); }}
                            style={{
                                marginTop: 12, padding: '12px 24px', borderRadius: 'var(--radius-md)',
                                background: 'var(--bg-glass)', border: '1px solid var(--border-glass)',
                                color: 'var(--text-secondary)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                            }}
                        >
                            رجوع
                        </button>
                    </div>
                ) : (
                    /* Verification Menu */
                    <div style={{ width: '100%', maxWidth: 360, textAlign: 'center' }}>
                        <div style={{
                            width: 90, height: 90, borderRadius: '50%', margin: '0 auto 20px',
                            background: 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(139,92,246,0.1))',
                            border: '2px solid rgba(59,130,246,0.25)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: 'var(--accent-blue)',
                            animation: 'leavePendingPulse 2.5s ease-in-out infinite',
                        }}>
                            <Shield size={42} />
                        </div>

                        <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>التحقق من الهوية</h2>
                        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24, lineHeight: 1.6 }}>
                            يجب التحقق من هويتك قبل الوصول لصفحة الحضور
                        </p>

                        {biometricError && (
                            <div style={{
                                fontSize: 12, color: 'var(--accent-rose)', fontWeight: 600,
                                marginBottom: 14, padding: '10px 12px', borderRadius: 'var(--radius-sm)',
                                background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.15)',
                            }}>
                                {biometricError}
                            </div>
                        )}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {/* Face Recognition Option */}
                            {hasFace && (
                                <button
                                    onClick={handleFaceVerify}
                                    style={{
                                        width: '100%', padding: '16px', borderRadius: 'var(--radius-md)',
                                        background: 'linear-gradient(135deg, #10b981, #06b6d4)',
                                        border: 'none', color: 'white',
                                        fontSize: 15, fontWeight: 800, cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                                        transition: 'all 200ms ease',
                                    }}
                                >
                                    <Camera size={22} />
                                    التحقق بالوجه
                                </button>
                            )}

                            {/* WebAuthn / Device Auth Option */}
                            <button
                                onClick={handleBiometricVerify}
                                disabled={biometricLoading}
                                style={{
                                    width: '100%', padding: '16px', borderRadius: 'var(--radius-md)',
                                    background: 'linear-gradient(135deg, var(--accent-blue), #7c3aed)',
                                    border: 'none', color: 'white',
                                    fontSize: 15, fontWeight: 800, cursor: 'pointer',
                                    opacity: biometricLoading ? 0.7 : 1,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                                    transition: 'all 200ms ease',
                                }}
                            >
                                <Fingerprint size={22} />
                                {biometricLoading ? 'جاري التحقق...' : 'بصمة / Face ID / رمز الجهاز'}
                            </button>

                            {!hasFace && (
                                <div style={{
                                    fontSize: 11, color: 'var(--text-muted)', marginTop: 4,
                                    padding: '8px', borderRadius: 'var(--radius-sm)',
                                    background: 'var(--bg-glass)',
                                }}>
                                    💡 لتفعيل التحقق بالوجه، سجّل وجهك من صفحة الملف الشخصي → إعدادات المصادقة
                                </div>
                            )}
                        </div>
                    </div>
                )}
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
