import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, browserLocalPersistence, setPersistence } from "firebase/auth";
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getMessaging, getToken, onMessage } from "firebase/messaging";

const firebaseConfig = {
    apiKey: "AIzaSyA-opqMrshlSsRd43YfPi3G0NZcb-Z2u3c",
    authDomain: "staff-f5aa2.firebaseapp.com",
    projectId: "staff-f5aa2",
    storageBucket: "staff-f5aa2.firebasestorage.app",
    messagingSenderId: "300173470868",
    appId: "1:300173470868:web:b18dcf8b3cd4dbf9b31881",
    measurementId: "G-JD98DVPZL2"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

// Persist auth session across app restarts (IndexedDB)
setPersistence(auth, browserLocalPersistence).catch(console.error);

// Enable Firestore offline cache (IndexedDB)
enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
        console.warn('Firestore persistence: multiple tabs open');
    } else if (err.code === 'unimplemented') {
        console.warn('Firestore persistence: browser not supported');
    }
});

// Initialize FCM (may fail in unsupported browsers)
let messaging: ReturnType<typeof getMessaging> | null = null;
try {
    messaging = getMessaging(app);
} catch (e) {
    console.warn('FCM not supported in this browser');
}

export { messaging, getToken, onMessage };
export default app;
