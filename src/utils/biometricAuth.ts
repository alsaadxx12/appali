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
// Check if running on HTTPS
// ============================================================

function isSecureContext(): boolean {
    return window.isSecureContext === true;
}

// ============================================================
// Availability Check
// ============================================================

export async function isBiometricAvailable(): Promise<boolean> {
    // Must be secure context (HTTPS or localhost)
    if (!isSecureContext()) return false;
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

        const credential = await navigator.credentials.create({
            publicKey: {
                challenge,
                rp: {
                    name: 'Attendance System',
                    // Let browser auto-detect the rpId from current origin
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
            },
        }) as PublicKeyCredential;

        if (!credential) return { success: false, error: 'فشل التسجيل' };

        // Store credential with current domain
        localStorage.setItem(CRED_PREFIX + userId, JSON.stringify({
            credentialId: bufferToBase64(credential.rawId),
            registeredAt: new Date().toISOString(),
            domain: window.location.hostname,
        }));

        return { success: true };
    } catch (err: any) {
        console.error('WebAuthn register error:', err.name, err.message);
        if (err.name === 'NotAllowedError') return { success: false, error: 'تم إلغاء المصادقة' };
        if (err.name === 'SecurityError') return { success: false, error: 'خطأ أمني - جرب إعادة فتح الصفحة' };
        return { success: false, error: err.message || 'فشل التسجيل' };
    }
}

// ============================================================
// Verify - triggers device native auth
// Auto-registers on first use or when domain changes
// ============================================================

export async function verifyBiometric(userId: string): Promise<{ success: boolean; error?: string }> {
    try {
        // Check secure context first
        if (!isSecureContext()) {
            return { success: false, error: 'يتطلب اتصال HTTPS آمن' };
        }

        // Check if WebAuthn is available
        const available = await isBiometricAvailable();
        if (!available) {
            return { success: false, error: 'جهازك لا يدعم المصادقة البيومترية' };
        }

        const storedStr = localStorage.getItem(CRED_PREFIX + userId);
        let stored: StoredCredential | null = null;

        if (storedStr) {
            stored = JSON.parse(storedStr);
            // If domain changed (e.g. moved from localhost to netlify), re-register
            if (stored && stored.domain !== window.location.hostname) {
                localStorage.removeItem(CRED_PREFIX + userId);
                stored = null;
            }
        }

        // Auto-register on first use
        if (!stored) {
            const reg = await registerCredential(userId);
            if (!reg.success) return reg;
            return { success: true }; // Registration itself verified identity
        }

        // Verify with existing credential
        const credentialId = base64ToBuffer(stored.credentialId);
        const challenge = new Uint8Array(32);
        crypto.getRandomValues(challenge);

        const assertion = await navigator.credentials.get({
            publicKey: {
                challenge,
                // Don't set rpId - let browser use the default from the origin
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
            return { success: false, error: 'تم إلغاء المصادقة أو انتهت المهلة' };
        }
        if (err.name === 'InvalidStateError' || err.name === 'SecurityError') {
            // Credential is stale or domain mismatch, remove and retry
            localStorage.removeItem(CRED_PREFIX + userId);
            return verifyBiometric(userId);
        }
        return { success: false, error: err.message || 'فشل التحقق' };
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
