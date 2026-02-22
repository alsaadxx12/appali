import React, { useState, useEffect, useRef } from 'react';
import { Download, X, Smartphone } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function InstallPrompt() {
    const [show, setShow] = useState(false);
    const [isIOS, setIsIOS] = useState(false);
    const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);

    useEffect(() => {
        // Don't show if already installed as PWA
        if (window.matchMedia('(display-mode: standalone)').matches) return;
        if ((navigator as any).standalone) return;

        // Check if dismissed recently (don't show again for 24h)
        const dismissed = localStorage.getItem('pwa-install-dismissed');
        if (dismissed && Date.now() - parseInt(dismissed) < 24 * 60 * 60 * 1000) return;

        // Detect iOS (no beforeinstallprompt on iOS)
        const ua = navigator.userAgent;
        const isiOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        setIsIOS(isiOS);

        if (isiOS) {
            // Show iOS manual instructions after 2s
            const timer = setTimeout(() => setShow(true), 2000);
            return () => clearTimeout(timer);
        }

        // Android/Chrome: capture beforeinstallprompt
        const handler = (e: Event) => {
            e.preventDefault();
            deferredPrompt.current = e as BeforeInstallPromptEvent;
            setTimeout(() => setShow(true), 1500);
        };

        window.addEventListener('beforeinstallprompt', handler);
        return () => window.removeEventListener('beforeinstallprompt', handler);
    }, []);

    const handleInstall = async () => {
        if (deferredPrompt.current) {
            await deferredPrompt.current.prompt();
            const choice = await deferredPrompt.current.userChoice;
            if (choice.outcome === 'accepted') {
                setShow(false);
            }
            deferredPrompt.current = null;
        }
    };

    const handleDismiss = () => {
        setShow(false);
        localStorage.setItem('pwa-install-dismissed', Date.now().toString());
    };

    if (!show) return null;

    return (
        <div style={{
            position: 'fixed',
            bottom: 100,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 'calc(100% - 32px)',
            maxWidth: 400,
            zIndex: 200,
            animation: 'slideUpBanner 0.4s ease-out both',
        }}>
            <div style={{
                background: 'linear-gradient(135deg, rgba(16,185,129,0.95), rgba(20,184,166,0.95))',
                backdropFilter: 'blur(20px)',
                borderRadius: 'var(--radius-xl)',
                padding: '16px 18px',
                boxShadow: '0 12px 40px rgba(0,0,0,0.3)',
                direction: 'rtl',
            }}>
                {/* Close button */}
                <button
                    onClick={handleDismiss}
                    style={{
                        position: 'absolute', top: 10, left: 10,
                        width: 28, height: 28, borderRadius: '50%',
                        background: 'rgba(255,255,255,0.2)',
                        border: 'none', color: 'white',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', fontSize: 14,
                    }}
                >
                    <X size={14} />
                </button>

                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    {/* App icon */}
                    <div style={{
                        width: 52, height: 52, borderRadius: 14,
                        background: 'rgba(255,255,255,0.2)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                    }}>
                        <Smartphone size={26} color="white" />
                    </div>

                    <div style={{ flex: 1 }}>
                        <div style={{
                            fontSize: 15, fontWeight: 800, color: 'white',
                            marginBottom: 3,
                        }}>
                            تثبيت التطبيق
                        </div>
                        <div style={{
                            fontSize: 11, color: 'rgba(255,255,255,0.85)',
                            lineHeight: 1.4,
                        }}>
                            {isIOS
                                ? 'اضغط على أيقونة المشاركة ⬆ ثم \"إضافة إلى الشاشة الرئيسية\"'
                                : 'ثبّت التطبيق على جهازك للوصول السريع وتجربة أفضل'
                            }
                        </div>
                    </div>
                </div>

                {/* Install button (Android only — iOS can't trigger install programmatically) */}
                {!isIOS && (
                    <button
                        onClick={handleInstall}
                        style={{
                            width: '100%',
                            marginTop: 12,
                            padding: '12px',
                            borderRadius: 'var(--radius-md)',
                            background: 'white',
                            border: 'none',
                            color: '#059669',
                            fontSize: 14,
                            fontWeight: 800,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8,
                            fontFamily: 'var(--font-arabic)',
                        }}
                    >
                        <Download size={18} />
                        تثبيت الآن
                    </button>
                )}
            </div>

            <style>{`
                @keyframes slideUpBanner {
                    from {
                        opacity: 0;
                        transform: translateX(-50%) translateY(30px);
                    }
                    to {
                        opacity: 1;
                        transform: translateX(-50%) translateY(0);
                    }
                }
            `}</style>
        </div>
    );
}
