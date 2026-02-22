import React, { useState, useEffect } from 'react';
import {
    User, Building2, Clock, Star, Bell, LogOut,
    ChevronLeft, Shield, Info, Users, Crown, Image as ImageIcon, MapPin, Timer, Calendar, DollarSign, Fingerprint,
    Sun, Moon, Sparkles, Settings, LayoutGrid, Wallet, UserCog, BadgeCheck, Frame, CalendarCheck, CalendarOff,
    BriefcaseBusiness, ScanFace, ShieldCheck, Palette, CircleUser, Gem, Award, CreditCard, FileText
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

    // === GROUPED MENU SECTIONS ===
    type MenuItem = {
        id: SubPage;
        icon: React.ReactNode;
        label: string;
        description: string;
        gradient: string;
        iconColor: string;
        adminOnly?: boolean;
    };

    type MenuSection = {
        title: string;
        titleIcon: React.ReactNode;
        items: MenuItem[];
    };

    const sections: MenuSection[] = [
        {
            title: 'حسابي',
            titleIcon: <CircleUser size={16} />,
            items: [
                {
                    id: 'account',
                    icon: <UserCog size={19} strokeWidth={2.2} />,
                    label: 'معلومات الحساب',
                    description: 'البيانات الشخصية وكلمة المرور',
                    gradient: 'linear-gradient(135deg, #6366f1, #818cf8)',
                    iconColor: '#818cf8',
                },
                {
                    id: 'pointsWallet',
                    icon: <Wallet size={19} strokeWidth={2.2} />,
                    label: 'محفظة النقاط',
                    description: 'رصيد النقاط وكشف الحساب والاستبدال',
                    gradient: 'linear-gradient(135deg, #f59e0b, #fbbf24)',
                    iconColor: '#fbbf24',
                },
                {
                    id: 'notifications',
                    icon: <Bell size={19} strokeWidth={2.2} />,
                    label: 'الإشعارات',
                    description: 'التنبيهات والتقارير التلقائية',
                    gradient: 'linear-gradient(135deg, #f43f5e, #fb7185)',
                    iconColor: '#fb7185',
                },
            ],
        },
        {
            title: 'إدارة الفريق',
            titleIcon: <Users size={16} />,
            items: [
                {
                    id: 'employees',
                    icon: <Users size={19} strokeWidth={2.2} />,
                    label: 'إدارة الموظفين',
                    description: 'إضافة وتعديل وحذف الموظفين',
                    gradient: 'linear-gradient(135deg, #14b8a6, #2dd4bf)',
                    iconColor: '#2dd4bf',
                    adminOnly: true,
                },
                {
                    id: 'branches',
                    icon: <Building2 size={19} strokeWidth={2.2} />,
                    label: 'الأفرع',
                    description: 'إدارة الأفرع ومواقعها',
                    gradient: 'linear-gradient(135deg, #10b981, #34d399)',
                    iconColor: '#34d399',
                    adminOnly: true,
                },
                {
                    id: 'admin',
                    icon: <ShieldCheck size={19} strokeWidth={2.2} />,
                    label: 'لوحة الإدارة',
                    description: 'مراقبة الحضور وإدارة الموظفين',
                    gradient: 'linear-gradient(135deg, #3b82f6, #60a5fa)',
                    iconColor: '#60a5fa',
                    adminOnly: true,
                },
            ],
        },
        {
            title: 'الحضور والرواتب',
            titleIcon: <Clock size={16} />,
            items: [
                {
                    id: 'attendance',
                    icon: <Clock size={19} strokeWidth={2.2} />,
                    label: 'إعدادات الحضور',
                    description: 'الدوام والأوقات وفترة السماح',
                    gradient: 'linear-gradient(135deg, #8b5cf6, #a78bfa)',
                    iconColor: '#a78bfa',
                    adminOnly: true,
                },
                {
                    id: 'biometric',
                    icon: <ScanFace size={19} strokeWidth={2.2} />,
                    label: 'إعدادات البيومتري',
                    description: 'فرض أو إلغاء المصادقة البيومترية',
                    gradient: 'linear-gradient(135deg, #06b6d4, #22d3ee)',
                    iconColor: '#22d3ee',
                    adminOnly: true,
                },
                {
                    id: 'payroll',
                    icon: <CreditCard size={19} strokeWidth={2.2} />,
                    label: 'صرف الرواتب',
                    description: 'كشف رواتب الموظفين الشهري',
                    gradient: 'linear-gradient(135deg, #f59e0b, #fbbf24)',
                    iconColor: '#fbbf24',
                    adminOnly: true,
                },
            ],
        },
        {
            title: 'الإجازات',
            titleIcon: <Calendar size={16} />,
            items: [
                {
                    id: 'leaveSettings',
                    icon: <CalendarCheck size={19} strokeWidth={2.2} />,
                    label: 'إعدادات الإجازات',
                    description: 'أنواع الإجازات ورصيد كل مستوى',
                    gradient: 'linear-gradient(135deg, #3b82f6, #60a5fa)',
                    iconColor: '#60a5fa',
                    adminOnly: true,
                },
                {
                    id: 'leaveRequests',
                    icon: <FileText size={19} strokeWidth={2.2} />,
                    label: 'طلبات الإجازات',
                    description: 'مراجعة وقبول ورفض طلبات الإجازات',
                    gradient: 'linear-gradient(135deg, #10b981, #34d399)',
                    iconColor: '#34d399',
                    adminOnly: true,
                },
            ],
        },
        {
            title: 'المكافآت والمظهر',
            titleIcon: <Sparkles size={16} />,
            items: [
                {
                    id: 'points',
                    icon: <Award size={19} strokeWidth={2.2} />,
                    label: 'إعدادات النقاط',
                    description: 'نظام المكافآت والخصومات',
                    gradient: 'linear-gradient(135deg, #f97316, #fb923c)',
                    iconColor: '#fb923c',
                    adminOnly: true,
                },
                {
                    id: 'vipSettings',
                    icon: <Gem size={19} strokeWidth={2.2} />,
                    label: 'إعدادات VIP',
                    description: 'تخصيص نظام المستويات والنقاط',
                    gradient: 'linear-gradient(135deg, #eab308, #facc15)',
                    iconColor: '#facc15',
                    adminOnly: true,
                },
                {
                    id: 'frameSettings',
                    icon: <Frame size={19} strokeWidth={2.2} />,
                    label: 'إعدادات الإطارات',
                    description: 'رفع وتعيين إطارات المستويات',
                    gradient: 'linear-gradient(135deg, #a855f7, #c084fc)',
                    iconColor: '#c084fc',
                    adminOnly: true,
                },
            ],
        },
    ];

    // Filter admin-only items
    const filteredSections = sections
        .map(section => ({
            ...section,
            items: section.items.filter(item => !item.adminOnly || user.role === 'admin'),
        }))
        .filter(section => section.items.length > 0);

    return (
        <div className="page-content page-enter" style={{ paddingBottom: 120 }}>
            {/* ══════ PROFILE HERO CARD ══════ */}
            <div style={{
                position: 'relative',
                borderRadius: 'var(--radius-xl, 20px)',
                overflow: 'hidden',
                marginBottom: 24,
                background: 'linear-gradient(160deg, rgba(99,102,241,0.08) 0%, rgba(139,92,246,0.05) 50%, rgba(6,182,212,0.06) 100%)',
                border: '1px solid rgba(255,255,255,0.06)',
                backdropFilter: 'blur(12px)',
            }}>
                {/* Glass mesh background */}
                <div style={{
                    position: 'absolute', inset: 0, zIndex: 0,
                    background: `
                        radial-gradient(circle at 20% 20%, rgba(99,102,241,0.12) 0%, transparent 50%),
                        radial-gradient(circle at 80% 80%, rgba(139,92,246,0.08) 0%, transparent 50%)
                    `,
                }} />
                {/* Animated accent line at top */}
                <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, height: 3, zIndex: 2,
                    background: 'linear-gradient(90deg, #6366f1, #8b5cf6, #a855f7, #06b6d4, #6366f1)',
                    backgroundSize: '200% 100%',
                    animation: 'profileShimmer 3s linear infinite',
                }} />

                <div style={{ position: 'relative', zIndex: 1, padding: '28px 20px 22px' }}>
                    {/* Avatar */}
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
                        <VipFrame level={userVipLevel} size={88}>
                            {user.avatar ? (
                                <img
                                    src={user.avatar}
                                    alt={user.name}
                                    style={{
                                        width: '100%', height: '100%',
                                        borderRadius: '50%', objectFit: 'cover',
                                    }}
                                />
                            ) : (
                                <div style={{
                                    background: avatarColor,
                                    width: '100%', height: '100%', borderRadius: '50%',
                                    fontSize: 28, fontWeight: 800, color: 'white',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    letterSpacing: 1,
                                }}>
                                    {initials}
                                </div>
                            )}
                        </VipFrame>
                    </div>

                    {/* Name */}
                    <h2 style={{
                        fontSize: 20, fontWeight: 900, marginBottom: 2,
                        textAlign: 'center', letterSpacing: -0.3,
                    }}>{user.name}</h2>
                    <p style={{
                        fontSize: 12, color: 'var(--text-muted)',
                        marginBottom: 10, textAlign: 'center',
                    }}>{user.department}</p>

                    {/* Badges */}
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            padding: '4px 14px', borderRadius: 'var(--radius-full)',
                            fontSize: 11, fontWeight: 700,
                            background: user.role === 'admin'
                                ? 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(99,102,241,0.15))'
                                : 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(96,165,250,0.15))',
                            color: user.role === 'admin' ? '#a78bfa' : '#60a5fa',
                            border: user.role === 'admin' ? '1px solid rgba(139,92,246,0.2)' : '1px solid rgba(59,130,246,0.2)',
                        }}>
                            <BadgeCheck size={12} />
                            {user.role === 'admin' ? 'مشرف' : 'موظف'}
                        </span>
                        <span style={{
                            padding: '4px 14px', borderRadius: 'var(--radius-full)',
                            fontSize: 11, fontWeight: 700,
                            background: 'linear-gradient(135deg, rgba(16,185,129,0.12), rgba(52,211,153,0.12))',
                            color: '#34d399',
                            border: '1px solid rgba(16,185,129,0.18)',
                            fontFamily: 'var(--font-numeric)',
                            letterSpacing: 0.3,
                        }}>
                            {user.id}
                        </span>
                    </div>

                    {/* Compact Shift Info */}
                    <CompactShiftInfo
                        branch={user.branch || 'غير محدد'}
                        shiftStart={user.shiftStart || '08:00'}
                        shiftEnd={user.shiftEnd || '16:00'}
                    />
                </div>
            </div>

            {/* ══════ GROUPED MENU SECTIONS ══════ */}
            {filteredSections.map((section, si) => (
                <div key={si} style={{ marginBottom: 20 }}>
                    {/* Section title */}
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 7,
                        marginBottom: 10, paddingRight: 4,
                    }}>
                        <span style={{
                            color: 'var(--text-muted)', opacity: 0.7,
                            display: 'flex', alignItems: 'center',
                        }}>{section.titleIcon}</span>
                        <span style={{
                            fontSize: 13, fontWeight: 800,
                            color: 'var(--text-muted)',
                            letterSpacing: -0.2,
                        }}>{section.title}</span>
                        <div style={{
                            flex: 1, height: 1,
                            background: 'linear-gradient(90deg, var(--border-glass), transparent)',
                            marginRight: 8,
                        }} />
                    </div>

                    {/* Grouped items card */}
                    <div style={{
                        borderRadius: 'var(--radius-xl, 18px)',
                        overflow: 'hidden',
                        background: 'var(--bg-glass, rgba(255,255,255,0.03))',
                        border: '1px solid var(--border-glass)',
                        backdropFilter: 'blur(8px)',
                    }}>
                        {section.items.map((item, idx) => (
                            <button
                                key={item.id}
                                onClick={() => setSubPage(item.id)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 12,
                                    padding: '14px 16px', width: '100%',
                                    textAlign: 'right', cursor: 'pointer',
                                    transition: 'all 180ms ease',
                                    background: 'transparent',
                                    border: 'none',
                                    borderBottom: idx < section.items.length - 1
                                        ? '1px solid var(--border-glass)'
                                        : 'none',
                                    color: 'inherit',
                                    fontFamily: 'inherit',
                                }}
                            >
                                {/* Premium gradient icon */}
                                <div style={{
                                    width: 40, height: 40,
                                    borderRadius: 12,
                                    background: item.gradient,
                                    color: 'white',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    flexShrink: 0,
                                    boxShadow: `0 3px 12px ${item.iconColor}30`,
                                }}>
                                    {item.icon}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{
                                        fontSize: 14, fontWeight: 700, marginBottom: 2,
                                        color: 'var(--text-primary)',
                                    }}>{item.label}</div>
                                    <div style={{
                                        fontSize: 11, color: 'var(--text-muted)',
                                        overflow: 'hidden', textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                    }}>{item.description}</div>
                                </div>
                                <ChevronLeft size={17} style={{
                                    color: 'var(--text-muted)', opacity: 0.5, flexShrink: 0,
                                }} />
                            </button>
                        ))}
                    </div>
                </div>
            ))}

            {/* ══════ FOOTER SECTION ══════ */}
            <div style={{ marginTop: 8 }}>
                {/* App Info */}
                <div style={{
                    borderRadius: 'var(--radius-xl, 18px)',
                    overflow: 'hidden',
                    background: 'var(--bg-glass, rgba(255,255,255,0.03))',
                    border: '1px solid var(--border-glass)',
                    backdropFilter: 'blur(8px)',
                    marginBottom: 10,
                }}>
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '13px 16px',
                        borderBottom: '1px solid var(--border-glass)',
                    }}>
                        <div style={{
                            width: 40, height: 40, borderRadius: 12,
                            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                            color: 'white',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0,
                            boxShadow: '0 3px 12px rgba(99,102,241,0.3)',
                        }}>
                            <Info size={18} strokeWidth={2.2} />
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 14, fontWeight: 700 }}>الحضور والانصراف</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-numeric)' }}>v1.0.0</div>
                        </div>
                    </div>

                    {/* Theme Toggle */}
                    <button
                        onClick={toggleTheme}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 12,
                            padding: '13px 16px', width: '100%',
                            textAlign: 'right', cursor: 'pointer',
                            background: 'transparent', border: 'none',
                            color: 'inherit', fontFamily: 'inherit',
                            transition: 'all 200ms ease',
                        }}
                    >
                        <div style={{
                            width: 40, height: 40, borderRadius: 12,
                            background: isDark
                                ? 'linear-gradient(135deg, #f59e0b, #fbbf24)'
                                : 'linear-gradient(135deg, #6366f1, #818cf8)',
                            color: 'white',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0,
                            boxShadow: isDark
                                ? '0 3px 12px rgba(245,158,11,0.3)'
                                : '0 3px 12px rgba(99,102,241,0.3)',
                            transition: 'all 400ms ease',
                        }}>
                            {isDark ? <Sun size={19} strokeWidth={2.2} /> : <Moon size={19} strokeWidth={2.2} />}
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>
                                {isDark ? 'الوضع النهاري' : 'الوضع الليلي'}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                {isDark ? 'التبديل إلى الوضع الفاتح' : 'التبديل إلى الوضع الداكن'}
                            </div>
                        </div>
                        {/* Fancy toggle */}
                        <div style={{
                            width: 48, height: 26, borderRadius: 13,
                            background: isDark
                                ? 'linear-gradient(135deg, rgba(245,158,11,0.2), rgba(251,191,36,0.15))'
                                : 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(129,140,248,0.15))',
                            position: 'relative', transition: 'all 400ms ease',
                            border: isDark ? '1px solid rgba(245,158,11,0.25)' : '1px solid rgba(99,102,241,0.25)',
                        }}>
                            <div style={{
                                width: 20, height: 20, borderRadius: '50%',
                                background: isDark
                                    ? 'linear-gradient(135deg, #f59e0b, #fbbf24)'
                                    : 'linear-gradient(135deg, #6366f1, #818cf8)',
                                position: 'absolute', top: 2,
                                right: isDark ? 24 : 2,
                                transition: 'all 400ms cubic-bezier(0.4, 0, 0.2, 1)',
                                boxShadow: isDark
                                    ? '0 2px 8px rgba(245,158,11,0.4)'
                                    : '0 2px 8px rgba(99,102,241,0.4)',
                            }} />
                        </div>
                    </button>
                </div>

                {/* Logout */}
                <button
                    onClick={logout}
                    style={{
                        width: '100%', padding: '14px',
                        background: 'linear-gradient(135deg, rgba(244,63,94,0.1), rgba(251,113,133,0.08))',
                        border: '1px solid rgba(244, 63, 94, 0.18)',
                        borderRadius: 'var(--radius-xl, 18px)',
                        color: '#fb7185',
                        fontSize: 14, fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        gap: 8, cursor: 'pointer',
                        transition: 'all 200ms ease',
                    }}
                >
                    <LogOut size={18} strokeWidth={2.2} />
                    تسجيل خروج
                </button>
            </div>

            {/* Shimmer animation */}
            <style>{`
                @keyframes profileShimmer {
                    0% { background-position: 200% 0; }
                    100% { background-position: -200% 0; }
                }
            `}</style>
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
    const statusColor = isInShift ? '#34d399' : '#fbbf24';

    return (
        <div style={{ marginTop: 14, textAlign: 'center' }}>
            {/* Branch + Shift in one row */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center',
                marginBottom: 8,
            }}>
                <MapPin size={12} style={{ color: '#34d399' }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>{branch}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>•</span>
                <Clock size={12} style={{ color: '#60a5fa' }} />
                <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-numeric)', color: 'var(--text-secondary)' }}>
                    {shiftStart} - {shiftEnd}
                </span>
            </div>

            {/* Countdown pill */}
            <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '5px 16px', borderRadius: 'var(--radius-full)',
                background: `${statusColor}12`, border: `1px solid ${statusColor}25`,
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
