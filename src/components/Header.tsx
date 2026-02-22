import React, { useState, useEffect } from 'react';
import { Bell, MessageCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';

interface HeaderProps {
    onNavigateProfile?: () => void;
    onNavigateNotifications?: () => void;
    onNavigateChat?: () => void;
}

export default function Header({ onNavigateProfile, onNavigateNotifications, onNavigateChat }: HeaderProps) {
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

    return (
        <header className="app-header" style={{
            justifyContent: 'flex-end',
            padding: '4px 16px',
            paddingTop: 'calc(12px + var(--safe-top))',
            gap: 10,
            minHeight: 32,
        }}>
            {/* Chat button */}
            <button
                onClick={onNavigateChat}
                style={{
                    width: 34, height: 34, borderRadius: 'var(--radius-full)',
                    background: 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(139,92,246,0.15))',
                    border: '1px solid rgba(99,102,241,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#818cf8',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                }}
            >
                <MessageCircle size={20} />
            </button>

            {/* Notification bell */}
            <button
                onClick={onNavigateNotifications}
                style={{
                    width: 34, height: 34, borderRadius: 'var(--radius-full)',
                    background: 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(251,191,36,0.12))',
                    border: '1px solid rgba(245,158,11,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fbbf24',
                    position: 'relative', cursor: 'pointer',
                    transition: 'all 0.2s ease',
                }}
            >
                <Bell size={20} />
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
