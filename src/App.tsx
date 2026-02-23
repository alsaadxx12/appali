import React, { useState, useCallback, useRef } from 'react';
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
        return <BiometricRegistrationPage onComplete={async () => {
            await markBiometricComplete();
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
    const [chatActive, setChatActive] = useState(false);

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

    // ========== Swipe-back gesture ==========
    const swipeStartX = useRef(0);
    const swipeStartY = useRef(0);
    const swiping = useRef(false);

    const handleSwipeStart = useCallback((e: React.TouchEvent) => {
        swipeStartX.current = e.touches[0].clientX;
        swipeStartY.current = e.touches[0].clientY;
        swiping.current = true;
    }, []);

    const handleSwipeEnd = useCallback((e: React.TouchEvent) => {
        if (!swiping.current) return;
        swiping.current = false;
        const dx = e.changedTouches[0].clientX - swipeStartX.current;
        const dy = Math.abs(e.changedTouches[0].clientY - swipeStartY.current);
        // Must swipe at least 80px horizontally and more horizontal than vertical
        if (dx > 80 && dx > dy * 1.5) {
            // Swipe right → go back
            if (chatActive) return; // ChatPage handles its own internal swipe
            if (currentPage === 'chat') {
                setCurrentPage('home');
            } else if (currentPage !== 'home') {
                setCurrentPage('home');
            }
        }
    }, [chatActive, currentPage, setCurrentPage]);

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
                return <ChatPage onBack={() => setCurrentPage('home')} onChatActive={setChatActive} />;
            default:
                return <HomePage />;
        }
    };

    return (
        <>
            <div className="app-layout">
                <div className="bg-pattern" />
                {!chatActive && <Header
                    onNavigateProfile={() => setCurrentPage('profile')}
                    onNavigateNotifications={() => setCurrentPage('notificationInbox')}
                    onNavigateChat={() => setCurrentPage('chat')}
                />}
                <PullToRefresh onRefresh={handleRefresh} disabled={chatActive}>
                    <div
                        key={`${currentPage}-${refreshKey}`}
                        onTouchStart={handleSwipeStart}
                        onTouchEnd={handleSwipeEnd}
                        style={{
                            animation: chatActive ? 'none' : 'pageIn 0.3s ease-out both',
                            flex: 1,
                            overflow: chatActive ? 'hidden' : 'auto',
                            height: chatActive ? '100%' : undefined,
                        }}
                    >
                        {renderPage()}
                    </div>
                </PullToRefresh>
                {!chatActive && <BottomNav currentPage={currentPage} onPageChange={handlePageChange} />}
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
