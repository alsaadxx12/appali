/**
 * Biometric Authentication Service
 * Uses WebAuthn to trigger device native authentication:
 * Face ID / Fingerprint / Device Passcode
 * Requires HTTPS to function.
 */

import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

// ============================================================
// Types
// ============================================================

export interface BiometricSettings {
    enabled: boolean;
    required: boolean;
}

interface StoredCredential {
    credentialId: string;
    registeredAt: string;
    domain: string;
}

const SETTINGS_DOC = 'biometric';
const CRED_PREFIX = 'bio_cred_';

// ============================================================
// Helpers
// ============================================================

function bufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
}

function base64ToBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
}

// ============================================================
// Availability Check (used for UI display only, not blocking)
// ============================================================

export async function isBiometricAvailable(): Promise<boolean> {
    if (!window.isSecureContext) return false;
    if (!window.PublicKeyCredential) return false;
    try {
        return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch {
        return false;
    }
}

// ============================================================
// Register credential (auto-called on first verification)
// ============================================================

async function registerCredential(userId: string): Promise<{ success: boolean; error?: string }> {
    try {
        const challenge = new Uint8Array(32);
        crypto.getRandomValues(challenge);

        const options: PublicKeyCredentialCreationOptions = {
            challenge,
            rp: {
                name: 'Attendance System',
            },
            user: {
                id: new TextEncoder().encode(userId),
                name: userId,
                displayName: 'User',
            },
            pubKeyCredParams: [
                { alg: -7, type: 'public-key' },
                { alg: -257, type: 'public-key' },
            ],
            authenticatorSelection: {
                authenticatorAttachment: 'platform',
                userVerification: 'required',
                residentKey: 'preferred',
            },
            timeout: 60000,
            attestation: 'none',
        };

        const credential = await navigator.credentials.create({
            publicKey: options,
        }) as PublicKeyCredential;

        if (!credential) return { success: false, error: 'فشل التسجيل' };

        localStorage.setItem(CRED_PREFIX + userId, JSON.stringify({
            credentialId: bufferToBase64(credential.rawId),
            registeredAt: new Date().toISOString(),
            domain: window.location.hostname,
        }));

        return { success: true };
    } catch (err: any) {
        console.error('WebAuthn register error:', err.name, err.message);
        if (err.name === 'NotAllowedError') return { success: false, error: 'تم إلغاء المصادقة. اضغط تحقق الآن وأكمل التحقق.' };
        if (err.name === 'SecurityError') return { success: false, error: 'خطأ أمني — تأكد من فتح الموقع عبر HTTPS' };
        if (err.name === 'NotSupportedError') return { success: false, error: 'المتصفح لا يدعم هذه الميزة. استخدم Safari أو Chrome' };
        return { success: false, error: `خطأ: ${err.name} - ${err.message}` };
    }
}

// ============================================================
// Verify - triggers device native auth
// Does NOT pre-check availability — tries directly and handles errors
// Auto-registers on first use or when domain changes
// ============================================================

export async function verifyBiometric(userId: string): Promise<{ success: boolean; error?: string }> {
    // Check secure context
    if (!window.isSecureContext) {
        return { success: false, error: 'يتطلب فتح الموقع عبر HTTPS' };
    }

    // Check if WebAuthn API exists at all
    if (!window.PublicKeyCredential || !navigator.credentials) {
        return { success: false, error: 'المتصفح لا يدعم WebAuthn. استخدم Safari أو Chrome' };
    }

    try {
        const storedStr = localStorage.getItem(CRED_PREFIX + userId);
        let stored: StoredCredential | null = null;

        if (storedStr) {
            stored = JSON.parse(storedStr);
            // Re-register if domain changed (e.g. localhost → netlify)
            if (stored && stored.domain !== window.location.hostname) {
                localStorage.removeItem(CRED_PREFIX + userId);
                stored = null;
            }
        }

        // First time: register (this triggers Face ID / fingerprint / passcode)
        if (!stored) {
            const reg = await registerCredential(userId);
            if (!reg.success) return reg;
            return { success: true }; // Registration itself verified identity
        }

        // Subsequent: verify with existing credential
        const credentialId = base64ToBuffer(stored.credentialId);
        const challenge = new Uint8Array(32);
        crypto.getRandomValues(challenge);

        const assertion = await navigator.credentials.get({
            publicKey: {
                challenge,
                allowCredentials: [{
                    id: credentialId,
                    type: 'public-key',
                    transports: ['internal'],
                }],
                userVerification: 'required',
                timeout: 60000,
            },
        });

        if (!assertion) return { success: false, error: 'فشل التحقق من الهوية' };
        return { success: true };

    } catch (err: any) {
        console.error('WebAuthn verify error:', err.name, err.message);

        if (err.name === 'NotAllowedError') {
            return { success: false, error: 'تم إلغاء المصادقة أو انتهت المهلة. حاول مرة أخرى.' };
        }

        // Credential stale or domain mismatch — remove and re-register
        if (err.name === 'InvalidStateError' || err.name === 'SecurityError') {
            localStorage.removeItem(CRED_PREFIX + userId);
            // Try once more with fresh registration
            try {
                const reg = await registerCredential(userId);
                if (!reg.success) return reg;
                return { success: true };
            } catch (retryErr: any) {
                return { success: false, error: `فشل إعادة التسجيل: ${retryErr.message}` };
            }
        }

        return { success: false, error: `خطأ: ${err.name} - ${err.message}` };
    }
}

// ============================================================
// Settings (Firestore)
// ============================================================

const defaultSettings: BiometricSettings = { enabled: false, required: false };

export async function getBiometricSettings(): Promise<BiometricSettings> {
    try {
        const snap = await getDoc(doc(db, 'settings', SETTINGS_DOC));
        if (snap.exists()) {
            const data = snap.data();
            return { enabled: data.enabled ?? false, required: data.required ?? false };
        }
        return { ...defaultSettings };
    } catch (e) {
        console.error('Error loading biometric settings:', e);
        return { ...defaultSettings };
    }
}

export async function saveBiometricSettings(settings: BiometricSettings): Promise<void> {
    try {
        await setDoc(doc(db, 'settings', SETTINGS_DOC), {
            ...settings,
            updatedAt: new Date().toISOString(),
        });
    } catch (e) {
        console.error('Error saving biometric settings:', e);
        throw e;
    }
}
