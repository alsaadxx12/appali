import React, { useState, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AVATAR_COLORS } from '../data/demoData';
import { db } from '../firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';

interface HeaderProps {
    onNavigateProfile?: () => void;
    onNavigateNotifications?: () => void;
}

export default function Header({ onNavigateProfile, onNavigateNotifications }: HeaderProps) {
    const { user } = useAuth();
    const [unreadCount, setUnreadCount] = useState(0);

    useEffect(() => {
        if (!user) return;
        const loadUnread = async () => {
            try {
                const snap = await getDocs(
                    query(collection(db, 'users', user.id, 'notifications'), where('read', '==', false))
                );
                setUnreadCount(snap.size);
            } catch (e) {
                console.error('Error loading unread count:', e);
            }
        };
        loadUnread();
        const interval = setInterval(loadUnread, 30000);
        return () => clearInterval(interval);
    }, [user]);

    if (!user) return null;

    const userIndex = user.id.split('').reduce((a: number, c: string) => a + c.charCodeAt(0), 0);
    const avatarColor = AVATAR_COLORS[userIndex % AVATAR_COLORS.length];
    const initials = user.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2);

    return (
        <header className="app-header" style={{ justifyContent: 'space-between', padding: '10px 16px' }}>
            {/* Right side (RTL) - User avatar */}
            <div
                onClick={onNavigateProfile}
                style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    cursor: onNavigateProfile ? 'pointer' : 'default',
                }}
            >
                <div style={{
                    width: 36, height: 36, borderRadius: 'var(--radius-full)',
                    background: `linear-gradient(135deg, ${avatarColor}, ${avatarColor}cc)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', fontSize: 13, fontWeight: 800,
                    border: '2px solid rgba(255,255,255,0.15)',
                    boxShadow: `0 2px 8px ${avatarColor}40`,
                }}>
                    {initials}
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 13, fontWeight: 800, lineHeight: 1.2 }}>{user.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{user.department}</div>
                </div>
            </div>

            {/* Left side (RTL) - Notification bell */}
            <button
                onClick={onNavigateNotifications}
                style={{
                    width: 40, height: 40, borderRadius: 'var(--radius-full)',
                    background: 'var(--bg-glass)',
                    border: '1px solid var(--border-glass)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--text-secondary)',
                    position: 'relative', cursor: 'pointer',
                    transition: 'all 0.2s ease',
                }}
            >
                <Bell size={18} />
                {unreadCount > 0 && (
                    <div style={{
                        position: 'absolute', top: 6, right: 6,
                        minWidth: 16, height: 16, borderRadius: '50%',
                        background: '#ef4444',
                        border: '2px solid var(--bg-primary)',
                        boxShadow: '0 0 6px rgba(239,68,68,0.5)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 9, fontWeight: 800, color: 'white',
                        fontFamily: 'var(--font-numeric)',
                    }}>
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </div>
                )}
            </button>
        </header>
    );
}
