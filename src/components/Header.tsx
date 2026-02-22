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
            padding: '14px 18px',
            paddingTop: 'calc(32px + var(--safe-top))',
            gap: 10,
            minHeight: 56,
        }}>
            {/* Chat button */}
            <button
                onClick={onNavigateChat}
                style={{
                    width: 42, height: 42, borderRadius: 'var(--radius-full)',
                    background: 'var(--bg-glass)',
                    border: '1px solid var(--border-glass)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                }}
            >
                <MessageCircle size={19} />
            </button>

            {/* Notification bell */}
            <button
                onClick={onNavigateNotifications}
                style={{
                    width: 42, height: 42, borderRadius: 'var(--radius-full)',
                    background: 'var(--bg-glass)',
                    border: '1px solid var(--border-glass)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--text-secondary)',
                    position: 'relative', cursor: 'pointer',
                    transition: 'all 0.2s ease',
                }}
            >
                <Bell size={19} />
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
