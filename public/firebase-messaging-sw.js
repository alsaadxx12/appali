// Firebase Cloud Messaging Service Worker
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyA-opqMrshlSsRd43YfPi3G0NZcb-Z2u3c",
    authDomain: "staff-f5aa2.firebaseapp.com",
    projectId: "staff-f5aa2",
    storageBucket: "staff-f5aa2.firebasestorage.app",
    messagingSenderId: "300173470868",
    appId: "1:300173470868:web:b18dcf8b3cd4dbf9b31881",
});

const APP_ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 192 192'%3E%3Crect width='192' height='192' rx='40' fill='%230a0e1a'/%3E%3Ccircle cx='96' cy='96' r='60' fill='none' stroke='%2310b981' stroke-width='4'/%3E%3Cline x1='96' y1='56' x2='96' y2='96' stroke='%2310b981' stroke-width='4' stroke-linecap='round'/%3E%3Cline x1='96' y1='96' x2='120' y2='108' stroke='%2314b8a6' stroke-width='3' stroke-linecap='round'/%3E%3Ccircle cx='96' cy='96' r='4' fill='%2310b981'/%3E%3C/svg%3E";

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
    const { title, body } = payload.notification || {};
    const data = payload.data || {};

    // Handle incoming call notification specially
    if (data.type === 'incoming_call') {
        self.registration.showNotification(title || '📞 مكالمة واردة', {
            body: body || 'مكالمة واردة...',
            icon: APP_ICON,
            badge: APP_ICON,
            data: data,
            vibrate: [500, 200, 500, 200, 500, 200, 500],
            tag: 'incoming-call',
            renotify: true,
            requireInteraction: true,
            actions: [
                { action: 'answer', title: '📞 رد' },
                { action: 'reject', title: '❌ رفض' },
            ],
        });
        return;
    }

    // Regular chat message notification
    self.registration.showNotification(title || 'رسالة جديدة', {
        body: body || '',
        icon: APP_ICON,
        badge: APP_ICON,
        data: data,
        vibrate: [200, 100, 200],
        tag: 'chat-message',
        renotify: true,
    });
});

// Handle notification click - open the app
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const data = event.notification.data || {};

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // If app is already open, focus it
            for (const client of clientList) {
                if ('focus' in client) {
                    client.focus();
                    // Send message to the client to handle the call/chat
                    if (data.type === 'incoming_call') {
                        client.postMessage({
                            type: 'INCOMING_CALL',
                            callId: data.callId,
                            callerId: data.callerId,
                            callerName: data.callerName,
                        });
                    }
                    return;
                }
            }
            // If app is not open, open it
            if (clients.openWindow) {
                return clients.openWindow('/');
            }
        })
    );
});
