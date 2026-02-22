/**
 * Face Recognition Authentication Service
 * Uses face-api.js for face detection, landmark extraction, and descriptor matching.
 * Models loaded from CDN on first use.
 */

import * as faceapi from 'face-api.js';

const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights';
const FACE_KEY = 'face_data_';

let modelsLoaded = false;
let modelsLoading = false;

// ============================================================
// Load face detection models from CDN
// ============================================================

export async function loadFaceModels(): Promise<boolean> {
    if (modelsLoaded) return true;
    if (modelsLoading) {
        // Wait for ongoing load
        while (modelsLoading) await new Promise(r => setTimeout(r, 200));
        return modelsLoaded;
    }
    modelsLoading = true;
    try {
        await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
            faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);
        modelsLoaded = true;
        return true;
    } catch (err) {
        console.error('Failed to load face models:', err);
        return false;
    } finally {
        modelsLoading = false;
    }
}

// ============================================================
// Detect face in video/image and get descriptor
// ============================================================

export async function detectFace(input: HTMLVideoElement | HTMLCanvasElement): Promise<faceapi.WithFaceDescriptor<faceapi.WithFaceLandmarks<{ detection: faceapi.FaceDetection }, faceapi.FaceLandmarks68>> | null> {
    const result = await faceapi
        .detectSingleFace(input, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.5 }))
        .withFaceLandmarks(true)
        .withFaceDescriptor();
    return result || null;
}

// ============================================================
// Register face — extract descriptor and save photo
// ============================================================

export async function registerFace(
    userId: string,
    video: HTMLVideoElement
): Promise<{ success: boolean; error?: string; photo?: string }> {
    try {
        const loaded = await loadFaceModels();
        if (!loaded) return { success: false, error: 'فشل تحميل نماذج التعرف على الوجه' };

        const detection = await detectFace(video);
        if (!detection) return { success: false, error: 'لم يتم اكتشاف وجه. تأكد من إضاءة جيدة ووجهك أمام الكاميرا' };

        // Capture photo
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d')!.drawImage(video, 0, 0);
        const photo = canvas.toDataURL('image/jpeg', 0.6);

        // Store
        const data = {
            descriptor: Array.from(detection.descriptor),
            photo,
            registeredAt: new Date().toISOString(),
        };
        localStorage.setItem(FACE_KEY + userId, JSON.stringify(data));

        return { success: true, photo };
    } catch (err: any) {
        console.error('Face register error:', err);
        return { success: false, error: err.message || 'فشل تسجيل الوجه' };
    }
}

// ============================================================
// Verify face — compare live face with stored descriptor
// ============================================================

export async function verifyFace(
    userId: string,
    video: HTMLVideoElement
): Promise<{ success: boolean; error?: string; distance?: number }> {
    try {
        const storedStr = localStorage.getItem(FACE_KEY + userId);
        if (!storedStr) return { success: false, error: 'لم يتم تسجيل وجه. سجّل وجهك من الإعدادات أولاً' };

        const stored = JSON.parse(storedStr);
        const storedDescriptor = new Float32Array(stored.descriptor);

        const loaded = await loadFaceModels();
        if (!loaded) return { success: false, error: 'فشل تحميل نماذج التعرف على الوجه' };

        const detection = await detectFace(video);
        if (!detection) return { success: false, error: 'لم يتم اكتشاف وجه' };

        const distance = faceapi.euclideanDistance(detection.descriptor, storedDescriptor);
        const threshold = 0.6; // Lower = stricter

        if (distance < threshold) {
            return { success: true, distance };
        }
        return { success: false, error: 'الوجه غير مطابق', distance };
    } catch (err: any) {
        console.error('Face verify error:', err);
        return { success: false, error: err.message || 'فشل التحقق من الوجه' };
    }
}

// ============================================================
// Helpers
// ============================================================

export function isFaceRegistered(userId: string): boolean {
    return !!localStorage.getItem(FACE_KEY + userId);
}

export function getFacePhoto(userId: string): string | null {
    try {
        const stored = localStorage.getItem(FACE_KEY + userId);
        if (!stored) return null;
        return JSON.parse(stored).photo;
    } catch { return null; }
}

export function removeFaceData(userId: string): void {
    localStorage.removeItem(FACE_KEY + userId);
}

// ============================================================
// Camera helpers
// ============================================================

export async function startCamera(video: HTMLVideoElement): Promise<MediaStream | null> {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
            audio: false,
        });
        video.srcObject = stream;
        await video.play();
        return stream;
    } catch (err) {
        console.error('Camera error:', err);
        return null;
    }
}

export function stopCamera(stream: MediaStream | null): void {
    stream?.getTracks().forEach(t => t.stop());
}
