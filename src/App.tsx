import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AttendanceProvider } from './context/AttendanceContext';
import LoginPage from './pages/LoginPage';
import ProfileCompletionPage from './pages/ProfileCompletionPage';
import HomePage from './pages/HomePage';
import HistoryPage from './pages/HistoryPage';
import VipPage from './pages/VipPage';
import ProfilePage from './pages/ProfilePage';
import SalaryPage from './pages/SalaryPage';
import LeavePage from './pages/LeavePage';
import NotificationInboxPage from './pages/NotificationInboxPage';
import Header from './components/Header';
import BottomNav from './components/BottomNav';
import { PageType } from './types';

function AppContent() {
    const { isAuthenticated, loading, isNewUser, markProfileComplete } = useAuth();
    const [currentPage, setCurrentPage] = useState<PageType>('home');

    if (loading) {
        return (
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                height: '100dvh', background: 'var(--bg-primary)',
            }}>
                <div style={{
                    width: 36, height: 36,
                    border: '3px solid rgba(255,255,255,0.1)',
                    borderTopColor: 'var(--accent-blue)',
                    borderRadius: '50%',
                    animation: 'spin 0.6s linear infinite',
                }} />
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        );
    }

    if (!isAuthenticated) {
        return <LoginPage onLoginSuccess={() => setCurrentPage('home')} />;
    }

    if (isNewUser) {
        return <ProfileCompletionPage onComplete={() => {
            markProfileComplete();
            setCurrentPage('home');
        }} />;
    }

    const renderPage = () => {
        switch (currentPage) {
            case 'home':
                return <HomePage />;
            case 'history':
                return <HistoryPage />;
            case 'vip':
                return <VipPage />;
            case 'profile':
                return <ProfilePage />;
            case 'salary':
                return <SalaryPage />;
            case 'leaves':
                return <LeavePage />;
            case 'notificationInbox':
                return <NotificationInboxPage onBack={() => setCurrentPage('home')} />;
            default:
                return <HomePage />;
        }
    };

    return (
        <AttendanceProvider>
            <div className="app-layout">
                <div className="bg-pattern" />
                <Header
                    onNavigateProfile={() => setCurrentPage('profile')}
                    onNavigateNotifications={() => setCurrentPage('notificationInbox')}
                />
                <div
                    key={currentPage}
                    style={{
                        animation: 'pageIn 0.3s ease-out both',
                        flex: 1,
                        overflow: 'auto',
                    }}
                >
                    {renderPage()}
                </div>
                <BottomNav currentPage={currentPage} onPageChange={setCurrentPage} />
            </div>
            <style>{`
                @keyframes pageIn {
                    from {
                        opacity: 0;
                        transform: translateY(12px) scale(0.98);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0) scale(1);
                    }
                }
            `}</style>
        </AttendanceProvider>
    );
}

export default function App() {
    return (
        <AuthProvider>
            <AppContent />
        </AuthProvider>
    );
}
