import React from 'react';
import { CalendarDays, Crown, Fingerprint, CalendarCheck2 } from 'lucide-react';
import { PageType } from '../types';
import { useAuth } from '../context/AuthContext';
import { AVATAR_COLORS } from '../data/demoData';

interface BottomNavProps {
    currentPage: PageType;
    onPageChange: (page: PageType) => void;
}

export default function BottomNav({ currentPage, onPageChange }: BottomNavProps) {
    const { user } = useAuth();

    // Build avatar for Account tab
    const userIndex = user ? (user.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) : 0;
    const avatarColor = AVATAR_COLORS[userIndex % AVATAR_COLORS.length];
    const initials = user ? user.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2) : '؟';

    return (
        <nav className="bottom-nav">
            {/* Order RTL: السجل - الراتب - الحضور(center) - المستوى - الحساب */}

            <button
                className={`nav-item ${currentPage === 'profile' ? 'active' : ''}`}
                onClick={() => onPageChange('profile')}
            >
                {/* User Avatar */}
                {user?.avatar ? (
                    <img src={user.avatar} alt="" style={{
                        width: 30, height: 30, borderRadius: '50%',
                        border: currentPage === 'profile' ? '2px solid var(--accent-blue)' : '2px solid transparent',
                        transition: 'all 200ms ease',
                        objectFit: 'cover',
                    }} />
                ) : (
                    <div style={{
                        width: 30, height: 30, borderRadius: '50%',
                        background: avatarColor,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 800, color: 'white',
                        border: currentPage === 'profile' ? '2px solid var(--accent-blue)' : '2px solid transparent',
                        transition: 'all 200ms ease',
                    }}>
                        {initials}
                    </div>
                )}

            </button>

            <button
                className={`nav-item ${currentPage === 'vip' ? 'active' : ''}`}
                onClick={() => onPageChange('vip')}
            >
                <Crown size={20} />

            </button>

            {/* Center - Fingerprint */}
            <button
                className="nav-center-btn"
                onClick={() => onPageChange('home')}
            >
                <div className={`center-circle ${currentPage === 'home' ? 'active' : 'inactive'}`}>
                    <Fingerprint size={26} strokeWidth={2} />
                </div>

            </button>

            <button
                className={`nav-item ${currentPage === 'leaves' ? 'active' : ''}`}
                onClick={() => onPageChange('leaves')}
            >
                <CalendarCheck2 size={20} />

            </button>

            <button
                className={`nav-item ${currentPage === 'history' ? 'active' : ''}`}
                onClick={() => onPageChange('history')}
            >
                <CalendarDays size={20} />

            </button>
        </nav >
    );
}
