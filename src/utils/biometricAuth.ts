/**
 * Hybrid Authentication Service
 * - On HTTPS: uses WebAuthn (Face ID / fingerprint / device passcode)
 * - On HTTP: falls back to PIN code
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
}

interface StoredPIN {
    pinHash: string;
    registeredAt: string;
}

const SETTINGS_DOC = 'biometric';
const WEBAUTHN_PREFIX = 'bio_cred_';
const PIN_PREFIX = 'auth_pin_';

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

async function hashPIN(pin: string): Promise<string> {
    const data = new TextEncoder().encode(pin + '_attendance_salt_2024');
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ============================================================
// Check what's available
// ============================================================

export async function isBiometricAvailable(): Promise<boolean> {
    if (!window.PublicKeyCredential) return false;
    try {
        return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch {
        return false;
    }
}

/** Returns 'webauthn' if Face ID/fingerprint available, otherwise 'pin' */
export async function getAuthMethod(): Promise<'webauthn' | 'pin'> {
    const available = await isBiometricAvailable();
    return available ? 'webauthn' : 'pin';
}

// ============================================================
// WebAuthn (Face ID / Fingerprint)
// ============================================================

async function webauthnRegister(userId: string): Promise<{ success: boolean; error?: string }> {
    try {
        const challenge = new Uint8Array(32);
        crypto.getRandomValues(challenge);

        const credential = await navigator.credentials.create({
            publicKey: {
                challenge,
                rp: { name: 'نظام الحضور', id: window.location.hostname },
                user: {
                    id: new TextEncoder().encode(userId),
                    name: userId,
                    displayName: userId,
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

        localStorage.setItem(WEBAUTHN_PREFIX + userId, JSON.stringify({
            credentialId: bufferToBase64(credential.rawId),
            registeredAt: new Date().toISOString(),
        }));

        return { success: true };
    } catch (err: any) {
        if (err.name === 'NotAllowedError') return { success: false, error: 'تم رفض المصادقة' };
        return { success: false, error: err.message || 'فشل التسجيل' };
    }
}

async function webauthnVerify(userId: string): Promise<{ success: boolean; error?: string }> {
    try {
        const storedStr = localStorage.getItem(WEBAUTHN_PREFIX + userId);
        if (!storedStr) {
            // Auto-register on first use
            const reg = await webauthnRegister(userId);
            if (!reg.success) return reg;
            return { success: true }; // Registration itself verified identity
        }

        const stored: StoredCredential = JSON.parse(storedStr);
        const credentialId = base64ToBuffer(stored.credentialId);
        const challenge = new Uint8Array(32);
        crypto.getRandomValues(challenge);

        const assertion = await navigator.credentials.get({
            publicKey: {
                challenge,
                rpId: window.location.hostname,
                allowCredentials: [{ id: credentialId, type: 'public-key', transports: ['internal'] }],
                userVerification: 'required',
                timeout: 60000,
            },
        });

        return assertion ? { success: true } : { success: false, error: 'فشل التحقق' };
    } catch (err: any) {
        if (err.name === 'NotAllowedError') return { success: false, error: 'تم رفض المصادقة أو انتهت المهلة' };
        if (err.name === 'InvalidStateError') {
            localStorage.removeItem(WEBAUTHN_PREFIX + userId);
            return { success: false, error: 'أعد المحاولة' };
        }
        return { success: false, error: err.message || 'فشل التحقق' };
    }
}

// ============================================================
// PIN Fallback
// ============================================================

export async function registerPIN(userId: string, pin: string): Promise<{ success: boolean; error?: string }> {
    if (!pin || pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin)) {
        return { success: false, error: 'رمز المصادقة يجب أن يكون 4-6 أرقام' };
    }
    const pinHash = await hashPIN(pin);
    localStorage.setItem(PIN_PREFIX + userId, JSON.stringify({
        pinHash,
        registeredAt: new Date().toISOString(),
    }));
    return { success: true };
}

export async function verifyPIN(userId: string, pin: string): Promise<{ success: boolean; error?: string }> {
    const storedStr = localStorage.getItem(PIN_PREFIX + userId);
    if (!storedStr) return { success: false, error: 'لم يتم تسجيل رمز المصادقة' };
    if (!pin) return { success: false, error: 'يرجى إدخال الرمز' };

    const stored: StoredPIN = JSON.parse(storedStr);
    const inputHash = await hashPIN(pin);
    if (inputHash !== stored.pinHash) return { success: false, error: 'رمز المصادقة غير صحيح' };
    return { success: true };
}

export function isPINRegistered(userId: string): boolean {
    return !!localStorage.getItem(PIN_PREFIX + userId);
}

export function removePIN(userId: string): void {
    localStorage.removeItem(PIN_PREFIX + userId);
}

// ============================================================
// Unified verification (picks the right method)
// ============================================================

export async function verifyBiometric(userId: string): Promise<{ success: boolean; error?: string; needsPIN?: boolean }> {
    const method = await getAuthMethod();
    if (method === 'webauthn') {
        return webauthnVerify(userId);
    }
    // PIN method - need to show PIN UI
    if (!isPINRegistered(userId)) {
        return { success: false, error: 'سجّل رمز المصادقة أولاً من الإعدادات', needsPIN: true };
    }
    return { success: false, needsPIN: true }; // Signal to show PIN input
}

// ============================================================
// Credential Management
// ============================================================

export function isBiometricRegistered(userId: string): boolean {
    return !!localStorage.getItem(WEBAUTHN_PREFIX + userId);
}

export function removeBiometric(userId: string): void {
    localStorage.removeItem(WEBAUTHN_PREFIX + userId);
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
