import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '../types';
import { DEMO_USERS } from '../data/demoData';
import { auth, googleProvider, db } from '../firebase';
import {
    signInWithPopup,
    signOut,
    onAuthStateChanged,
    User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';

interface ProfileUpdate {
    name?: string;
    phone?: string;
    password?: string;
}

interface AuthContextType {
    user: User | null;
    firebaseUser: FirebaseUser | null;
    isAuthenticated: boolean;
    isNewUser: boolean;
    needsBiometric: boolean;
    login: (username: string, password: string) => boolean;
    loginWithGoogle: () => Promise<{ success: boolean; error?: string }>;
    registerWithGoogle: () => Promise<{ success: boolean; error?: string }>;
    updateProfile: (data: ProfileUpdate) => Promise<void>;
    markProfileComplete: () => void;
    markBiometricComplete: () => void;
    logout: () => void;
    loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Helper: check if user doc exists in Firestore
async function userExistsInFirestore(uid: string): Promise<boolean> {
    try {
        const snap = await getDoc(doc(db, 'users', uid));
        return snap.exists();
    } catch (e) {
        console.error('Error checking user in Firestore:', e);
        return false;
    }
}

// Helper: load user profile from Firestore
async function loadUserFromFirestore(uid: string): Promise<Record<string, any> | null> {
    try {
        const snap = await getDoc(doc(db, 'users', uid));
        if (snap.exists()) {
            return snap.data();
        }
    } catch (e) {
        console.error('Error loading user from Firestore:', e);
    }
    return null;
}

// Helper: save user profile to Firestore
async function saveUserToFirestore(uid: string, data: Record<string, any>): Promise<boolean> {
    try {
        await setDoc(doc(db, 'users', uid), data, { merge: true });
        console.log('✅ Saved to Firestore:', uid, data);
        return true;
    } catch (e) {
        console.error('❌ Error saving user to Firestore:', e);
        return false;
    }
}

// Helper: build app user from Firestore data + Firebase user
function buildAppUser(fbUser: FirebaseUser, firestoreData: Record<string, any> | null): User {
    return {
        id: fbUser.uid,
        name: firestoreData?.name || fbUser.displayName || 'مستخدم',
        username: fbUser.email?.split('@')[0] || 'user',
        phone: firestoreData?.phone || fbUser.phoneNumber || '',
        role: (firestoreData?.role as any) || 'admin',
        department: firestoreData?.department || 'الإدارة',
        avatar: firestoreData?.avatar || fbUser.photoURL || undefined,
        branch: firestoreData?.branch || '',
        shiftStart: firestoreData?.shiftStart || '08:00',
        shiftEnd: firestoreData?.shiftEnd || '16:00',
    };
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
    const [loading, setLoading] = useState(true);
    const [isNewUser, setIsNewUser] = useState(false);
    const [needsBiometric, setNeedsBiometric] = useState(false);
    // Guard: skip onAuthStateChanged during login eligibility check
    const loginCheckRef = React.useRef(false);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
            // Skip processing during login eligibility check
            if (loginCheckRef.current) return;

            setFirebaseUser(fbUser);
            if (fbUser) {
                const firestoreData = await loadUserFromFirestore(fbUser.uid);
                const appUser = buildAppUser(fbUser, firestoreData);
                setUser(appUser);
                localStorage.setItem('attendance-user', JSON.stringify(appUser));

                // Show profile completion if not marked complete
                if (firestoreData && !firestoreData.profileComplete) {
                    setIsNewUser(true);
                    setNeedsBiometric(false);
                } else if (firestoreData && firestoreData.profileComplete && !firestoreData.biometricComplete) {
                    setIsNewUser(false);
                    setNeedsBiometric(true);
                } else if (!firestoreData) {
                    // No Firestore doc = unregistered, sign out
                    setIsNewUser(false);
                    setNeedsBiometric(false);
                } else {
                    setIsNewUser(false);
                    setNeedsBiometric(false);
                }
            } else {
                const savedUser = localStorage.getItem('attendance-user');
                if (savedUser) {
                    try {
                        setUser(JSON.parse(savedUser));
                    } catch {
                        localStorage.removeItem('attendance-user');
                        setUser(null);
                    }
                } else {
                    setUser(null);
                }
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const login = (phoneOrUsername: string, _password: string): boolean => {
        const found = DEMO_USERS.find(u => u.phone === phoneOrUsername || u.username === phoneOrUsername);
        if (found) {
            setUser(found);
            localStorage.setItem('attendance-user', JSON.stringify(found));
            return true;
        }
        return false;
    };

    // ========== Google Sign-In (existing accounts only) ==========
    const loginWithGoogle = async (): Promise<{ success: boolean; error?: string }> => {
        loginCheckRef.current = true;
        try {
            const result = await signInWithPopup(auth, googleProvider);
            const fbUser = result.user;

            // Check Firestore for user registration
            const exists = await userExistsInFirestore(fbUser.uid);

            if (!exists) {
                // Not registered — sign out (don't delete!)
                await signOut(auth);
                setUser(null);
                setFirebaseUser(null);
                loginCheckRef.current = false;
                return {
                    success: false,
                    error: 'هذا الإيميل غير مسجل في النظام. انتقل لإنشاء حساب جديد.'
                };
            }

            // User exists — load their data
            loginCheckRef.current = false;
            const firestoreData = await loadUserFromFirestore(fbUser.uid);
            const appUser = buildAppUser(fbUser, firestoreData);
            setUser(appUser);
            setFirebaseUser(fbUser);
            localStorage.setItem('attendance-user', JSON.stringify(appUser));
            setIsNewUser(false);

            return { success: true };
        } catch (error: any) {
            loginCheckRef.current = false;
            console.error('Google sign-in error:', error);
            return { success: false, error: 'فشل تسجيل الدخول بحساب Google' };
        }
    };

    // ========== Google Registration (new account + Firestore) ==========
    const registerWithGoogle = async (): Promise<{ success: boolean; error?: string }> => {
        try {
            const result = await signInWithPopup(auth, googleProvider);
            const fbUser = result.user;

            // Try to check if already registered
            const exists = await userExistsInFirestore(fbUser.uid);

            if (exists) {
                // Already registered, just log them in
                const firestoreData = await loadUserFromFirestore(fbUser.uid);
                const appUser = buildAppUser(fbUser, firestoreData);
                setUser(appUser);
                setFirebaseUser(fbUser);
                localStorage.setItem('attendance-user', JSON.stringify(appUser));
                if (firestoreData?.profileComplete) {
                    setIsNewUser(false);
                } else {
                    setIsNewUser(true);
                }
                return { success: true };
            }

            // New user — set user state immediately
            const appUser = buildAppUser(fbUser, null);
            setUser(appUser);
            setFirebaseUser(fbUser);
            localStorage.setItem('attendance-user', JSON.stringify(appUser));

            // Try to save to Firestore (may fail if rules not set)
            await saveUserToFirestore(fbUser.uid, {
                name: fbUser.displayName || '',
                email: fbUser.email || '',
                phone: fbUser.phoneNumber || '',
                avatar: fbUser.photoURL || '',
                role: 'admin',
                department: 'الإدارة',
                profileComplete: false,
                createdAt: new Date().toISOString(),
            });

            // Always show profile completion — even if Firestore failed
            setIsNewUser(true);
            return { success: true };
        } catch (error: any) {
            console.error('Google register error:', error);
            return { success: false, error: 'فشل إنشاء الحساب بحساب Google' };
        }
    };

    // ========== Update Profile (saves to Firestore) ==========
    const updateProfile = async (data: ProfileUpdate): Promise<void> => {
        if (!user) return;

        const updatedUser = {
            ...user,
            name: data.name || user.name,
            phone: data.phone || user.phone,
        };
        setUser(updatedUser);
        localStorage.setItem('attendance-user', JSON.stringify(updatedUser));

        // Build Firestore update
        const firestoreUpdate: Record<string, any> = {
            updatedAt: new Date().toISOString(),
        };
        if (data.name) firestoreUpdate.name = data.name;
        if (data.phone) firestoreUpdate.phone = data.phone;
        if (data.password) firestoreUpdate.password = data.password;

        const saved = await saveUserToFirestore(user.id, firestoreUpdate);
        if (!saved) {
            console.error('❌ Failed to save profile to Firestore');
        }
    };

    // ========== Mark Profile Complete ==========
    const markProfileComplete = async () => {
        setIsNewUser(false);
        setNeedsBiometric(true);
        if (user) {
            const saved = await saveUserToFirestore(user.id, { profileComplete: true });
            if (!saved) {
                console.error('❌ Failed to mark profile complete in Firestore');
            }
        }
    };

    // ========== Mark Biometric Complete ==========
    const markBiometricComplete = async () => {
        setNeedsBiometric(false);
        if (user) {
            const saved = await saveUserToFirestore(user.id, { biometricComplete: true });
            if (!saved) {
                console.error('❌ Failed to mark biometric complete in Firestore');
            }
        }
    };

    const logout = () => {
        signOut(auth).catch(console.error);
        setUser(null);
        setFirebaseUser(null);
        setIsNewUser(false);
        setNeedsBiometric(false);
        localStorage.removeItem('attendance-user');
    };

    return (
        <AuthContext.Provider value={{
            user,
            firebaseUser,
            isAuthenticated: !!user,
            isNewUser,
            needsBiometric,
            login,
            loginWithGoogle,
            registerWithGoogle,
            updateProfile,
            markProfileComplete,
            markBiometricComplete,
            logout,
            loading,
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth(): AuthContextType {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
