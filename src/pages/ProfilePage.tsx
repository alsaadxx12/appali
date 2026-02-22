import React, { useState, useEffect } from 'react';
import {
    User, Building2, Clock, Star, Bell, LogOut,
    ChevronLeft, Shield, Info, Users, Crown, Image as ImageIcon, MapPin, Timer, Calendar, DollarSign, Fingerprint,
    Sun, Moon
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { AVATAR_COLORS } from '../data/demoData';
import VipFrame, { getVipLevel, getVipLabel, getVipColor } from '../components/VipFrame';
import BranchesPage from './profile/BranchesPage';
import AttendanceSettingsPage from './profile/AttendanceSettingsPage';
import PointsSettingsPage from './profile/PointsSettingsPage';
import AccountInfoPage from './profile/AccountInfoPage';
import NotificationsPage from './profile/NotificationsPage';
import EmployeeManagementPage from './profile/EmployeeManagementPage';
import AdminPage from './AdminPage';
import VipSettingsPage from './profile/VipSettingsPage';
import FrameSettingsPage from './profile/FrameSettingsPage';
import PointsWalletPage from './profile/PointsWalletPage';
import LeaveSettingsPage from './profile/LeaveSettingsPage';
import LeaveRequestsPage from './profile/LeaveRequestsPage';
import PayrollPage from './profile/PayrollPage';
import BiometricSettingsPage from './profile/BiometricSettingsPage';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';

type SubPage = 'main' | 'branches' | 'attendance' | 'points' | 'account' | 'notifications' | 'employees' | 'admin' | 'vipSettings' | 'frameSettings' | 'pointsWallet' | 'leaveSettings' | 'leaveRequests' | 'payroll' | 'biometric';

interface VipLevelData {
    id: string;
    label: string;
    emoji: string;
    color: string;
    minPoints: number;
}

interface ProfilePageProps {
    initialSubPage?: SubPage;
    onSubPageChange?: () => void;
}

export default function ProfilePage({ initialSubPage, onSubPageChange }: ProfilePageProps) {
    const { user, logout } = useAuth();
    const { theme, toggleTheme, isDark } = useTheme();
    const [subPage, setSubPage] = useState<SubPage>(initialSubPage || 'main');
    const [vipLevels, setVipLevels] = useState<VipLevelData[]>([]);
    const [defaultLevel, setDefaultLevel] = useState<string>('none');

    useEffect(() => {
        if (initialSubPage) setSubPage(initialSubPage);
    }, [initialSubPage]);

    useEffect(() => {
        const load = async () => {
            try {
                const snap = await getDoc(doc(db, 'settings', 'vip'));
                if (snap.exists()) {
                    const data = snap.data();
                    if (data.levels) setVipLevels(data.levels);
                    if (data.defaultLevel) setDefaultLevel(data.defaultLevel);
                }
            } catch (e) {
                console.error('Error loading VIP settings:', e);
            }
        };
        load();
    }, []);

    if (!user) return null;

    // Sub-page routing
    if (subPage === 'branches') return <BranchesPage onBack={() => setSubPage('main')} />;
    if (subPage === 'attendance') return <AttendanceSettingsPage onBack={() => setSubPage('main')} />;
    if (subPage === 'points') return <PointsSettingsPage onBack={() => setSubPage('main')} />;
    if (subPage === 'account') return <AccountInfoPage onBack={() => setSubPage('main')} />;
    if (subPage === 'notifications') return <NotificationsPage onBack={() => setSubPage('main')} />;
    if (subPage === 'employees') return <EmployeeManagementPage onBack={() => setSubPage('main')} />;
    if (subPage === 'admin') return <AdminPage onBack={() => setSubPage('main')} />;
    if (subPage === 'vipSettings') return <VipSettingsPage onBack={() => setSubPage('main')} />;
    if (subPage === 'frameSettings') return <FrameSettingsPage onBack={() => setSubPage('main')} />;
    if (subPage === 'pointsWallet') return <PointsWalletPage onBack={() => setSubPage('main')} userId={user.id} />;
    if (subPage === 'leaveSettings') return <LeaveSettingsPage onBack={() => setSubPage('main')} />;
    if (subPage === 'leaveRequests') return <LeaveRequestsPage onBack={() => setSubPage('main')} />;
    if (subPage === 'payroll') return <PayrollPage onBack={() => setSubPage('main')} />;
    if (subPage === 'biometric') return <BiometricSettingsPage onBack={() => setSubPage('main')} />;

    const userIndex = user.id.split('').reduce((a: number, c: string) => a + c.charCodeAt(0), 0);
    const avatarColor = AVATAR_COLORS[userIndex % AVATAR_COLORS.length];
    const initials = user.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2);
    const userPoints = (user as any).points || 0;

    // Compute level: check points against levels, fallback to defaultLevel
    let userVipLevel = 'none';
    if (vipLevels.length > 0) {
        const sorted = [...vipLevels].sort((a, b) => b.minPoints - a.minPoints);
        for (const lvl of sorted) {
            if (userPoints >= lvl.minPoints) {
                userVipLevel = lvl.id;
                break;
            }
        }
        if (userVipLevel === 'none' && defaultLevel && defaultLevel !== 'none') {
            userVipLevel = defaultLevel;
        }
    } else {
        userVipLevel = getVipLevel(userPoints);
    }

    const menuItems: {
        id: SubPage;
        icon: React.ReactNode;
        label: string;
        description: string;
        color: string;
        adminOnly?: boolean;
    }[] = [
            {
                id: 'account',
                icon: <User size={20} />,
                label: 'معلومات الحساب',
                description: 'البيانات الشخصية وكلمة المرور',
                color: 'var(--accent-blue)',
            },
            {
                id: 'pointsWallet',
                icon: <Star size={20} />,
                label: 'محفظة النقاط',
                description: 'رصيد النقاط وكشف الحساب والاستبدال',
                color: 'var(--accent-amber)',
            },
            {
                id: 'notifications',
                icon: <Bell size={20} />,
                label: 'الإشعارات',
                description: 'التنبيهات والتقارير التلقائية',
                color: 'var(--accent-amber)',
            },
            {
                id: 'employees',
                icon: <Users size={20} />,
                label: 'إدارة الموظفين',
                description: 'إضافة وتعديل وحذف الموظفين',
                color: 'var(--accent-teal, #14b8a6)',
                adminOnly: true,
            },
            {
                id: 'branches',
                icon: <Building2 size={20} />,
                label: 'الأفرع',
                description: 'إدارة الأفرع ومواقعها',
                color: 'var(--accent-emerald)',
                adminOnly: true,
            },
            {
                id: 'attendance',
                icon: <Clock size={20} />,
                label: 'إعدادات الحضور',
                description: 'الدوام والأوقات وفترة السماح',
                color: 'var(--accent-purple)',
                adminOnly: true,
            },
            {
                id: 'points',
                icon: <Star size={20} />,
                label: 'إعدادات النقاط',
                description: 'نظام المكافآت والخصومات',
                color: 'var(--accent-orange, #f97316)',
                adminOnly: true,
            },
            {
                id: 'biometric',
                icon: <Fingerprint size={20} />,
                label: 'إعدادات البيومتري',
                description: 'فرض أو إلغاء المصادقة البيومترية للموظفين',
                color: 'var(--accent-teal, #14b8a6)',
                adminOnly: true,
            },
            {
                id: 'admin',
                icon: <Shield size={20} />,
                label: 'لوحة الإدارة',
                description: 'مراقبة الحضور وإدارة الموظفين',
                color: 'var(--accent-blue)',
                adminOnly: true,
            },
            {
                id: 'vipSettings',
                icon: <Crown size={20} />,
                label: 'إعدادات VIP',
                description: 'تخصيص نظام المستويات والنقاط',
                color: '#ffd700',
                adminOnly: true,
            },
            {
                id: 'frameSettings',
                icon: <ImageIcon size={20} />,
                label: 'إعدادات الإطارات',
                description: 'رفع وتعيين إطارات المستويات',
                color: 'var(--accent-purple)',
                adminOnly: true,
            },
            {
                id: 'leaveSettings',
                icon: <Calendar size={20} />,
                label: 'إعدادات الإجازات',
                description: 'أنواع الإجازات ورصيد كل مستوى',
                color: '#3b82f6',
                adminOnly: true,
            },
            {
                id: 'leaveRequests',
                icon: <Calendar size={20} />,
                label: 'طلبات الإجازات',
                description: 'مراجعة وقبول ورفض طلبات الإجازات',
                color: '#10b981',
                adminOnly: true,
            },
            {
                id: 'payroll',
                icon: <DollarSign size={20} />,
                label: 'صرف الرواتب',
                description: 'كشف رواتب الموظفين الشهري',
                color: '#f59e0b',
                adminOnly: true,
            },
        ];

    const visibleItems = menuItems.filter(item => !item.adminOnly || user.role === 'admin');

    return (
        <div className="page-content page-enter">
            {/* Profile Card */}
            <div
                className="glass-card"
                style={{
                    textAlign: 'center',
                    padding: '24px 20px',
                    marginBottom: 20,
                    position: 'relative',
                    overflow: 'hidden',
                }}
            >
                {/* Decorative background */}
                <div style={{
                    position: 'absolute',
                    top: -40,
                    left: -40,
                    width: 120,
                    height: 120,
                    borderRadius: '50%',
                    background: avatarColor,
                    opacity: 0.08,
                    filter: 'blur(30px)',
                }} />
                <div style={{
                    position: 'absolute',
                    bottom: -30,
                    right: -30,
                    width: 100,
                    height: 100,
                    borderRadius: '50%',
                    background: 'var(--accent-purple)',
                    opacity: 0.06,
                    filter: 'blur(25px)',
                }} />

                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
                    <VipFrame level={userVipLevel} size={80}>
                        {user.avatar ? (
                            <img
                                src={user.avatar}
                                alt={user.name}
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    borderRadius: '50%',
                                    objectFit: 'cover',
                                }}
                            />
                        ) : (
                            <div
                                style={{
                                    background: avatarColor,
                                    width: '100%',
                                    height: '100%',
                                    borderRadius: '50%',
                                    fontSize: 26,
                                    fontWeight: 800,
                                    color: 'white',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                            >
                                {initials}
                            </div>
                        )}
                    </VipFrame>
                </div>

                <h2 style={{ fontSize: 19, fontWeight: 800, marginBottom: 3 }}>{user.name}</h2>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{user.department}</p>

                <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
                    <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '3px 12px',
                        borderRadius: 'var(--radius-full)',
                        fontSize: 11,
                        fontWeight: 700,
                        background: user.role === 'admin' ? 'var(--accent-purple-soft)' : 'var(--accent-blue-soft)',
                        color: user.role === 'admin' ? 'var(--accent-purple)' : 'var(--accent-blue)',
                    }}>
                        <Shield size={11} />
                        {user.role === 'admin' ? 'مشرف' : 'موظف'}
                    </span>
                    <span style={{
                        padding: '3px 12px',
                        borderRadius: 'var(--radius-full)',
                        fontSize: 11,
                        fontWeight: 700,
                        background: 'var(--accent-emerald-soft)',
                        color: 'var(--accent-emerald)',
                        fontFamily: 'var(--font-numeric)',
                    }}>
                        {user.id}
                    </span>
                </div>

                {/* Compact Shift Info - inside profile card */}
                <CompactShiftInfo
                    branch={user.branch || 'غير محدد'}
                    shiftStart={user.shiftStart || '08:00'}
                    shiftEnd={user.shiftEnd || '16:00'}
                />
            </div>

            {/* Quick Menu */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                {visibleItems.map((item) => (
                    <button
                        key={item.id}
                        onClick={() => setSubPage(item.id)}
                        className="glass-card"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            padding: '14px 16px',
                            width: '100%',
                            textAlign: 'right',
                            cursor: 'pointer',
                            transition: 'all 200ms ease',
                            border: '1px solid var(--border-glass)',
                        }}
                    >
                        <div style={{
                            width: 42,
                            height: 42,
                            borderRadius: 'var(--radius-md)',
                            background: `${item.color}18`,
                            color: item.color,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                        }}>
                            {item.icon}
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>{item.label}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.description}</div>
                        </div>
                        <ChevronLeft size={18} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                    </button>
                ))}
            </div>

            {/* App Info */}
            <div className="glass-card" style={{ marginBottom: 12, padding: '12px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                        width: 36, height: 36, borderRadius: 'var(--radius-md)',
                        background: 'var(--accent-purple-soft)', color: 'var(--accent-purple)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                        <Info size={16} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>الحضور والانصراف</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>الإصدار 1.0.0</div>
                    </div>
                </div>
            </div>

            {/* Theme Toggle */}
            <button
                onClick={toggleTheme}
                className="glass-card"
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '14px 16px',
                    width: '100%',
                    textAlign: 'right',
                    cursor: 'pointer',
                    marginBottom: 12,
                    border: '1px solid var(--border-glass)',
                    transition: 'all 200ms ease',
                }}
            >
                <div style={{
                    width: 42, height: 42, borderRadius: 'var(--radius-md)',
                    background: isDark ? 'rgba(245,158,11,0.12)' : 'rgba(99,102,241,0.12)',
                    color: isDark ? '#f59e0b' : '#6366f1',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    transition: 'all 300ms ease',
                }}>
                    {isDark ? <Sun size={20} /> : <Moon size={20} />}
                </div>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>
                        {isDark ? 'الوضع النهاري' : 'الوضع الليلي'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {isDark ? 'التبديل إلى الوضع الفاتح' : 'التبديل إلى الوضع الداكن'}
                    </div>
                </div>
                <div style={{
                    width: 44, height: 24, borderRadius: 12,
                    background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(99,102,241,0.2)',
                    position: 'relative', transition: 'background 300ms ease',
                }}>
                    <div style={{
                        width: 20, height: 20, borderRadius: '50%',
                        background: isDark ? '#f59e0b' : '#6366f1',
                        position: 'absolute', top: 2,
                        right: isDark ? 22 : 2,
                        transition: 'all 300ms ease',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                    }} />
                </div>
            </button>

            {/* Logout */}
            <button
                onClick={logout}
                style={{
                    width: '100%',
                    padding: '14px',
                    background: 'var(--accent-rose-soft)',
                    border: '1px solid rgba(244, 63, 94, 0.15)',
                    borderRadius: 'var(--radius-lg)',
                    color: 'var(--accent-rose)',
                    fontSize: 14,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    marginBottom: 16,
                    transition: 'all 200ms ease',
                }}
            >
                <LogOut size={18} />
                تسجيل خروج
            </button>
        </div>
    );
}

// === Compact Shift Info (inside profile card) ===
function CompactShiftInfo({ branch, shiftStart, shiftEnd }: { branch: string; shiftStart: string; shiftEnd: string }) {
    const [now, setNow] = useState(new Date());

    useEffect(() => {
        const interval = setInterval(() => setNow(new Date()), 60_000);
        return () => clearInterval(interval);
    }, []);

    const toMinutes = (time: string) => {
        const [h, m] = time.split(':').map(Number);
        return h * 60 + m;
    };

    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const startMin = toMinutes(shiftStart);
    const endMin = toMinutes(shiftEnd);
    const isInShift = currentMinutes >= startMin && currentMinutes < endMin;

    const formatRemaining = (targetMin: number) => {
        let diff = targetMin - currentMinutes;
        if (diff < 0) diff += 24 * 60;
        const h = Math.floor(diff / 60);
        const m = diff % 60;
        return h > 0 ? `${h}:${m.toString().padStart(2, '0')}` : `${m} د`;
    };

    const remaining = isInShift ? formatRemaining(endMin) : formatRemaining(startMin);
    const statusLabel = isInShift ? 'بصمة الخروج' : 'بصمة الحضور';
    const statusColor = isInShift ? 'var(--accent-emerald)' : 'var(--accent-amber)';

    return (
        <div style={{ marginTop: 14 }}>
            {/* Branch + Shift in one row */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center',
                marginBottom: 8,
            }}>
                <MapPin size={12} style={{ color: 'var(--accent-emerald)' }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>{branch}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>•</span>
                <Clock size={12} style={{ color: 'var(--accent-blue)' }} />
                <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-numeric)', color: 'var(--text-secondary)' }}>
                    {shiftStart} - {shiftEnd}
                </span>
            </div>

            {/* Countdown pill */}
            <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '4px 14px', borderRadius: 'var(--radius-full)',
                background: `${statusColor}15`, border: `1px solid ${statusColor}30`,
            }}>
                <Timer size={12} style={{ color: statusColor }} />
                <span style={{ fontSize: 10, fontWeight: 600, color: statusColor }}>{statusLabel}</span>
                <span style={{ fontSize: 13, fontWeight: 800, fontFamily: 'var(--font-numeric)', color: statusColor }}>
                    {remaining}
                </span>
            </div>
        </div>
    );
}
