import React, { useState, useCallback } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { AttendanceProvider, useAttendance } from './context/AttendanceContext';
import LoginPage from './pages/LoginPage';
import ProfileCompletionPage from './pages/ProfileCompletionPage';
import BiometricRegistrationPage from './pages/BiometricRegistrationPage';
import HomePage from './pages/HomePage';
import HistoryPage from './pages/HistoryPage';
import VipPage from './pages/VipPage';
import ProfilePage from './pages/ProfilePage';
import SalaryPage from './pages/SalaryPage';
import LeavePage from './pages/LeavePage';
import NotificationInboxPage from './pages/NotificationInboxPage';
import ChatPage from './pages/ChatPage';
import Header from './components/Header';
import BottomNav from './components/BottomNav';
import PullToRefresh from './components/PullToRefresh';
import InstallPrompt from './components/InstallPrompt';
import { PageType } from './types';

function AppContent() {
    const { isAuthenticated, loading, isNewUser, needsBiometric, markProfileComplete, markBiometricComplete } = useAuth();
    const [currentPage, setCurrentPage] = useState<PageType>('home');
    const [refreshKey, setRefreshKey] = useState(0);

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

    if (needsBiometric) {
        return <BiometricRegistrationPage onComplete={() => {
            markBiometricComplete();
            setCurrentPage('home');
        }} />;
    }

    return (
        <AttendanceProvider>
            <AppInner
                currentPage={currentPage}
                setCurrentPage={setCurrentPage}
                refreshKey={refreshKey}
                setRefreshKey={setRefreshKey}
            />
        </AttendanceProvider>
    );
}

function AppInner({
    currentPage, setCurrentPage, refreshKey, setRefreshKey,
}: {
    currentPage: PageType;
    setCurrentPage: (p: PageType) => void;
    refreshKey: number;
    setRefreshKey: (fn: (k: number) => number) => void;
}) {
    const { refreshRecords } = useAttendance();

    const handleRefresh = useCallback(async () => {
        await refreshRecords();
    }, [refreshRecords]);

    const handlePageChange = useCallback((page: PageType) => {
        if (page === currentPage) {
            setRefreshKey(k => k + 1);
            refreshRecords();
        } else {
            setCurrentPage(page);
        }
    }, [currentPage, refreshRecords, setCurrentPage, setRefreshKey]);

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
            case 'chat':
                return <ChatPage onBack={() => setCurrentPage('home')} />;
            default:
                return <HomePage />;
        }
    };

    return (
        <>
            <div className="app-layout">
                <div className="bg-pattern" />
                <Header
                    onNavigateProfile={() => setCurrentPage('profile')}
                    onNavigateNotifications={() => setCurrentPage('notificationInbox')}
                    onNavigateChat={() => setCurrentPage('chat')}
                />
                <PullToRefresh onRefresh={handleRefresh}>
                    <div
                        key={`${currentPage}-${refreshKey}`}
                        style={{
                            animation: 'pageIn 0.3s ease-out both',
                            flex: 1,
                            overflow: 'auto',
                        }}
                    >
                        {renderPage()}
                    </div>
                </PullToRefresh>
                <BottomNav currentPage={currentPage} onPageChange={handlePageChange} />
                <InstallPrompt />
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
        </>
    );
}

export default function App() {
    return (
        <ThemeProvider>
            <AuthProvider>
                <AppContent />
            </AuthProvider>
        </ThemeProvider>
    );
}
