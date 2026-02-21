import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

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
export const googleProvider = new GoogleAuthProvider();

export default app;
