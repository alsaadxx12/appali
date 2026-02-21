import React, { useState, useEffect } from 'react';
import { Clock, MapPin, Timer, AlertTriangle, CheckCircle, Coffee, RefreshCw, Lock, ShieldAlert, Eye, EyeOff, X } from 'lucide-react';
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
    verifyPIN,
    getBiometricSettings,
    BiometricSettings,
} from '../utils/biometricAuth';

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
    const [showPinModal, setShowPinModal] = useState(false);
    const [pinInput, setPinInput] = useState('');
    const [showPinText, setShowPinText] = useState(false);
    const [pinLoading, setPinLoading] = useState(false);
    const [pendingLocation, setPendingLocation] = useState<GeoLocation | null>(null);

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
        getBiometricSettings().then(s => setBiometricSettings(s));
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
        // Hybrid auth: Face ID on HTTPS, PIN on HTTP
        if (biometricSettings?.enabled && user?.id) {
            const result = await verifyBiometric(user.id);
            if (result.needsPIN) {
                // Need PIN input - show modal
                setPendingLocation(loc);
                setShowPinModal(true);
                setPinInput('');
                setShowPinText(false);
                setBiometricError(result.error || '');
                return;
            }
            if (!result.success) {
                setBiometricError(result.error || 'فشل التحقق من الهوية');
                return;
            }
        }

        if (isCheckedIn) {
            checkOut(loc);
        } else {
            checkIn(loc);
        }
    };

    const handlePinSubmit = async () => {
        if (!user?.id || !pendingLocation) return;
        setPinLoading(true);
        setBiometricError('');
        const result = await verifyPIN(user.id, pinInput);
        setPinLoading(false);

        if (result.success) {
            setShowPinModal(false);
            setPinInput('');
            if (isCheckedIn) {
                checkOut(pendingLocation);
            } else {
                checkIn(pendingLocation);
            }
        } else {
            setBiometricError(result.error || 'رمز المصادقة غير صحيح');
            setPinInput('');
        }
    };

    const isLocationBlocked = locationStatus !== 'active';

    const hours = currentTime.getHours();
    const minutes = currentTime.getMinutes().toString().padStart(2, '0');
    const seconds = currentTime.getSeconds().toString().padStart(2, '0');
    const period = hours >= 12 ? 'م' : 'ص';
    const displayHours = (hours % 12 || 12).toString().padStart(2, '0');

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
            {biometricError && !showPinModal && (
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

            {/* PIN Modal */}
            {showPinModal && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 9999,
                    background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: 20,
                }}>
                    <div className="glass-card" style={{
                        width: '100%', maxWidth: 340, padding: '28px 24px',
                        textAlign: 'center', position: 'relative',
                    }}>
                        <button onClick={() => { setShowPinModal(false); setPinInput(''); setBiometricError(''); }} style={{
                            position: 'absolute', top: 12, left: 12,
                            background: 'none', border: 'none', color: 'var(--text-muted)',
                            cursor: 'pointer', padding: 4,
                        }}>
                            <X size={20} />
                        </button>

                        <div style={{
                            width: 64, height: 64, borderRadius: '50%', margin: '0 auto 14px',
                            background: 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(139,92,246,0.1))',
                            border: '2px solid rgba(59,130,246,0.25)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: 'var(--accent-blue)',
                        }}>
                            <Lock size={28} />
                        </div>

                        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>أدخل رمز المصادقة</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 18 }}>
                            أدخل رمز PIN للتحقق من هويتك
                        </div>

                        <div style={{ position: 'relative', marginBottom: 16 }}>
                            <input
                                type={showPinText ? 'text' : 'password'}
                                inputMode="numeric"
                                pattern="[0-9]*"
                                maxLength={6}
                                value={pinInput}
                                onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                                placeholder="• • • •"
                                autoFocus
                                style={{
                                    width: '100%', padding: '14px 50px 14px 14px',
                                    fontSize: 24, fontWeight: 800, letterSpacing: 10,
                                    textAlign: 'center', direction: 'ltr',
                                    borderRadius: 'var(--radius-md)',
                                    background: 'var(--bg-glass-strong)',
                                    border: '2px solid var(--border-glass)',
                                    color: 'var(--text-primary)',
                                    outline: 'none',
                                    fontFamily: 'var(--font-numeric)',
                                }}
                                onFocus={(e) => (e.target.style.borderColor = 'var(--accent-blue)')}
                                onBlur={(e) => (e.target.style.borderColor = 'var(--border-glass)')}
                                onKeyDown={(e) => { if (e.key === 'Enter' && pinInput.length >= 4) handlePinSubmit(); }}
                            />
                            <button
                                onClick={() => setShowPinText(!showPinText)}
                                style={{
                                    position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                                    background: 'none', border: 'none', color: 'var(--text-muted)',
                                    cursor: 'pointer', padding: 4,
                                }}
                            >
                                {showPinText ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>

                        {biometricError && (
                            <div style={{
                                fontSize: 12, color: 'var(--accent-rose)', fontWeight: 600,
                                marginBottom: 12, padding: '8px', borderRadius: 'var(--radius-sm)',
                                background: 'rgba(244,63,94,0.08)',
                            }}>
                                {biometricError}
                            </div>
                        )}

                        <button
                            onClick={handlePinSubmit}
                            disabled={pinLoading || pinInput.length < 4}
                            style={{
                                width: '100%', padding: '14px', borderRadius: 'var(--radius-md)',
                                background: pinInput.length >= 4 ? 'var(--accent-blue)' : 'var(--bg-glass-strong)',
                                border: 'none', color: pinInput.length >= 4 ? 'white' : 'var(--text-muted)',
                                fontSize: 14, fontWeight: 700, cursor: 'pointer',
                                opacity: pinLoading ? 0.6 : 1,
                                transition: 'all 200ms ease',
                            }}
                        >
                            {pinLoading ? 'جاري التحقق...' : 'تأكيد'}
                        </button>
                    </div>
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
