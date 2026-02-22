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

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
    const { title, body } = payload.notification || {};
    self.registration.showNotification(title || 'رسالة جديدة', {
        body: body || '',
        icon: '/icon-192x192.png',
        badge: '/icon-192x192.png',
        data: payload.data,
        vibrate: [200, 100, 200],
    });
});
