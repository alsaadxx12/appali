import React, { useState, useEffect } from 'react';
import {
    ArrowRight, Bell, BellOff, Check, Clock, Star, AlertCircle,
    DollarSign, Calendar, Megaphone, Trash2, CheckCheck, Loader
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, getDocs, doc, updateDoc, deleteDoc, query, orderBy } from 'firebase/firestore';

interface Props {
    onBack: () => void;
}

interface Notification {
    id: string;
    title: string;
    body: string;
    type: 'points' | 'attendance' | 'leave' | 'salary' | 'announcement' | 'general';
    read: boolean;
    createdAt: string;
}

const TYPE_CONFIG: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
    points: { icon: <Star size={15} />, color: '#eab308', label: 'النقاط' },
    attendance: { icon: <Clock size={15} />, color: '#3b82f6', label: 'الحضور' },
    leave: { icon: <Calendar size={15} />, color: '#8b5cf6', label: 'الإجازات' },
    salary: { icon: <DollarSign size={15} />, color: '#22c55e', label: 'الرواتب' },
    announcement: { icon: <Megaphone size={15} />, color: '#f97316', label: 'إعلان' },
    general: { icon: <Bell size={15} />, color: '#64748b', label: 'عام' },
};

export default function NotificationInboxPage({ onBack }: Props) {
    const { user } = useAuth();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'unread'>('all');

    useEffect(() => {
        loadNotifications();
    }, []);

    const loadNotifications = async () => {
        if (!user) return;
        setLoading(true);
        try {
            const snap = await getDocs(
                query(collection(db, 'users', user.id, 'notifications'), orderBy('createdAt', 'desc'))
            );
            const notifs = snap.docs.map(d => ({
                id: d.id,
                title: d.data().title || '',
                body: d.data().body || '',
                type: d.data().type || 'general',
                read: d.data().read || false,
                createdAt: d.data().createdAt || '',
            })) as Notification[];
            setNotifications(notifs);
        } catch (e) {
            console.error('Error loading notifications:', e);
        } finally {
            setLoading(false);
        }
    };

    const markAsRead = async (notifId: string) => {
        if (!user) return;
        try {
            await updateDoc(doc(db, 'users', user.id, 'notifications', notifId), { read: true });
            setNotifications(prev => prev.map(n => n.id === notifId ? { ...n, read: true } : n));
        } catch (e) {
            console.error('Error:', e);
        }
    };

    const markAllAsRead = async () => {
        if (!user) return;
        try {
            const unread = notifications.filter(n => !n.read);
            await Promise.all(
                unread.map(n => updateDoc(doc(db, 'users', user.id, 'notifications', n.id), { read: true }))
            );
            setNotifications(prev => prev.map(n => ({ ...n, read: true })));
        } catch (e) {
            console.error('Error:', e);
        }
    };

    const deleteNotification = async (notifId: string) => {
        if (!user) return;
        try {
            await deleteDoc(doc(db, 'users', user.id, 'notifications', notifId));
            setNotifications(prev => prev.filter(n => n.id !== notifId));
        } catch (e) {
            console.error('Error:', e);
        }
    };

    const formatTime = (iso: string) => {
        try {
            const d = new Date(iso);
            const now = new Date();
            const diffMs = now.getTime() - d.getTime();
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMs / 3600000);
            const diffDays = Math.floor(diffMs / 86400000);

            if (diffMins < 1) return 'الآن';
            if (diffMins < 60) return `منذ ${diffMins} دقيقة`;
            if (diffHours < 24) return `منذ ${diffHours} ساعة`;
            if (diffDays < 7) return `منذ ${diffDays} يوم`;
            return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
        } catch {
            return '';
        }
    };

    const unreadCount = notifications.filter(n => !n.read).length;
    const filtered = filter === 'unread' ? notifications.filter(n => !n.read) : notifications;

    return (
        <div className="page-content page-enter">
            {/* Header */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                marginBottom: 14, padding: '4px 0',
            }}>
                <button onClick={onBack} style={{
                    width: 36, height: 36, borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-glass)', border: '1px solid var(--border-glass)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--text-secondary)',
                }}>
                    <ArrowRight size={18} />
                </button>
                <div style={{ flex: 1 }}>
                    <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                        🔔 الإشعارات
                        {unreadCount > 0 && (
                            <span style={{
                                padding: '1px 8px', borderRadius: 10,
                                background: 'rgba(239,68,68,0.15)', color: '#ef4444',
                                fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-numeric)',
                            }}>
                                {unreadCount}
                            </span>
                        )}
                    </h2>
                </div>
                {unreadCount > 0 && (
                    <button onClick={markAllAsRead} style={{
                        padding: '6px 10px', borderRadius: 'var(--radius-md)',
                        background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)',
                        color: '#22c55e', fontSize: 10, fontWeight: 700,
                        display: 'flex', alignItems: 'center', gap: 4,
                    }}>
                        <CheckCheck size={13} />
                        قراءة الكل
                    </button>
                )}
            </div>

            {/* Filter tabs */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                <button onClick={() => setFilter('all')} style={{
                    padding: '6px 14px', borderRadius: 'var(--radius-md)',
                    background: filter === 'all' ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.04)',
                    border: filter === 'all' ? '1px solid rgba(59,130,246,0.3)' : '1px solid var(--border-glass)',
                    color: filter === 'all' ? '#3b82f6' : 'var(--text-muted)',
                    fontSize: 11, fontWeight: 700,
                }}>
                    الكل ({notifications.length})
                </button>
                <button onClick={() => setFilter('unread')} style={{
                    padding: '6px 14px', borderRadius: 'var(--radius-md)',
                    background: filter === 'unread' ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.04)',
                    border: filter === 'unread' ? '1px solid rgba(239,68,68,0.3)' : '1px solid var(--border-glass)',
                    color: filter === 'unread' ? '#ef4444' : 'var(--text-muted)',
                    fontSize: 11, fontWeight: 700,
                }}>
                    غير مقروءة ({unreadCount})
                </button>
            </div>

            {/* Notifications List */}
            {loading ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 0' }}>
                    <Loader size={24} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent-blue)' }} />
                </div>
            ) : filtered.length === 0 ? (
                <div className="glass-card" style={{ textAlign: 'center', padding: '50px 16px' }}>
                    <BellOff size={40} style={{ color: 'var(--text-muted)', opacity: 0.25, margin: '0 auto 12px', display: 'block' }} />
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>
                        {filter === 'unread' ? 'لا توجد إشعارات غير مقروءة' : 'لا توجد إشعارات'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        ستظهر إشعاراتك الواردة هنا
                    </div>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 20 }}>
                    {filtered.map((notif) => {
                        const config = TYPE_CONFIG[notif.type] || TYPE_CONFIG.general;
                        return (
                            <div
                                key={notif.id}
                                className="glass-card"
                                onClick={() => !notif.read && markAsRead(notif.id)}
                                style={{
                                    padding: '12px 14px',
                                    display: 'flex', gap: 10, alignItems: 'flex-start',
                                    cursor: notif.read ? 'default' : 'pointer',
                                    background: notif.read ? undefined : 'rgba(59,130,246,0.04)',
                                    border: notif.read ? undefined : '1px solid rgba(59,130,246,0.15)',
                                    transition: 'all 0.2s',
                                }}
                            >
                                {/* Type icon */}
                                <div style={{
                                    width: 38, height: 38, borderRadius: 'var(--radius-md)',
                                    background: `${config.color}15`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: config.color, flexShrink: 0,
                                }}>
                                    {config.icon}
                                </div>

                                {/* Content */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                        <span style={{
                                            fontSize: 13, fontWeight: notif.read ? 600 : 800,
                                            color: 'var(--text-primary)',
                                            flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                        }}>
                                            {notif.title}
                                        </span>
                                        {!notif.read && (
                                            <div style={{
                                                width: 8, height: 8, borderRadius: '50%',
                                                background: '#3b82f6', flexShrink: 0,
                                                boxShadow: '0 0 6px rgba(59,130,246,0.4)',
                                            }} />
                                        )}
                                    </div>
                                    <div style={{
                                        fontSize: 11, color: 'var(--text-muted)',
                                        lineHeight: 1.5, marginBottom: 4,
                                    }}>
                                        {notif.body}
                                    </div>
                                    <div style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    }}>
                                        <div style={{
                                            fontSize: 9, color: 'var(--text-muted)',
                                            display: 'flex', alignItems: 'center', gap: 4,
                                            fontFamily: 'var(--font-numeric)',
                                        }}>
                                            <Clock size={9} />
                                            {formatTime(notif.createdAt)}
                                        </div>
                                        <div style={{ display: 'flex', gap: 4 }}>
                                            <span style={{
                                                padding: '1px 6px', borderRadius: 6,
                                                background: `${config.color}12`,
                                                color: config.color,
                                                fontSize: 9, fontWeight: 700,
                                            }}>
                                                {config.label}
                                            </span>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); deleteNotification(notif.id); }}
                                                style={{
                                                    width: 22, height: 22, borderRadius: 'var(--radius-sm)',
                                                    background: 'rgba(239,68,68,0.08)', border: 'none',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    color: '#ef4444', cursor: 'pointer', opacity: 0.6,
                                                    transition: 'opacity 0.15s',
                                                }}
                                            >
                                                <Trash2 size={11} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
