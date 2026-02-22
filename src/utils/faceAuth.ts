/**
 * Advanced Face Recognition Authentication Service
 * Features:
 * - Face detection & descriptor matching via face-api.js
 * - Liveness detection (anti-spoofing): requires face movement across multiple frames
 * - Confidence scoring with visual feedback
 * - Face landmark visualization
 * Requires HTTPS. Models loaded from CDN on first use.
 */

import * as faceapi from 'face-api.js';
import { db, storage } from '../firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';

const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights';
const FACE_KEY = 'face_data_';

// Upload photo to Firebase Storage and return download URL
async function uploadPhotoToStorage(userId: string, type: 'face' | 'iris', base64Photo: string): Promise<string> {
    const storageRef = ref(storage, `biometrics/${userId}/${type}.jpg`);
    await uploadString(storageRef, base64Photo, 'data_url');
    return await getDownloadURL(storageRef);
}

let modelsLoaded = false;
let modelsLoading = false;

// ============================================================
// Types
// ============================================================

export interface FaceVerifyResult {
    success: boolean;
    error?: string;
    confidence?: number;   // 0-100 percentage
    livenessScore?: number; // 0-100
}

export interface FaceScanFrame {
    descriptor: Float32Array;
    box: { x: number; y: number; width: number; height: number };
    landmarks: faceapi.FaceLandmarks68;
    score: number;
}

// ============================================================
// Load Models
// ============================================================

export async function loadFaceModels(): Promise<boolean> {
    if (modelsLoaded) return true;
    if (modelsLoading) {
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
// Single-frame face detection with full data
// ============================================================

export async function detectFace(input: HTMLVideoElement | HTMLCanvasElement): Promise<FaceScanFrame | null> {
    try {
        const result = await faceapi
            .detectSingleFace(input, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.5 }))
            .withFaceLandmarks(true)
            .withFaceDescriptor();
        if (!result) return null;
        const box = result.detection.box;
        return {
            descriptor: result.descriptor,
            box: { x: box.x, y: box.y, width: box.width, height: box.height },
            landmarks: result.landmarks,
            score: result.detection.score,
        };
    } catch {
        return null;
    }
}

// ============================================================
// Draw face overlay on canvas (box + landmarks + confidence)
// ============================================================

export function drawFaceOverlay(
    canvas: HTMLCanvasElement,
    video: HTMLVideoElement,
    frame: FaceScanFrame | null,
    matchConfidence?: number,
    status?: 'scanning' | 'success' | 'fail'
) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!frame) return;

    const { box, landmarks, score } = frame;

    // Color based on status
    const color = status === 'success' ? '#10b981'
        : status === 'fail' ? '#f43f5e'
            : '#3b82f6';

    // Draw face bounding box with rounded corners
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.setLineDash([]);

    // Corner brackets instead of full box
    const cornerLen = 20;
    const bx = box.x, by = box.y, bw = box.width, bh = box.height;

    ctx.beginPath();
    // Top-left
    ctx.moveTo(bx, by + cornerLen); ctx.lineTo(bx, by); ctx.lineTo(bx + cornerLen, by);
    // Top-right
    ctx.moveTo(bx + bw - cornerLen, by); ctx.lineTo(bx + bw, by); ctx.lineTo(bx + bw, by + cornerLen);
    // Bottom-right
    ctx.moveTo(bx + bw, by + bh - cornerLen); ctx.lineTo(bx + bw, by + bh); ctx.lineTo(bx + bw - cornerLen, by + bh);
    // Bottom-left
    ctx.moveTo(bx + cornerLen, by + bh); ctx.lineTo(bx, by + bh); ctx.lineTo(bx, by + bh - cornerLen);
    ctx.stroke();

    // Draw facial landmarks (dots)
    ctx.fillStyle = color;
    const positions = landmarks.positions;
    for (let i = 0; i < positions.length; i++) {
        const pt = positions[i];
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 1.5, 0, Math.PI * 2);
        ctx.fill();
    }

    // Draw confidence text
    if (matchConfidence !== undefined) {
        const confText = `${Math.round(matchConfidence)}%`;
        ctx.font = 'bold 16px sans-serif';
        ctx.fillStyle = color;
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 3;
        ctx.strokeText(confText, bx, by - 8);
        ctx.fillText(confText, bx, by - 8);
    }

    // Detection score as small text
    ctx.font = '10px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(`Detection: ${(score * 100).toFixed(0)}%`, bx, by + bh + 14);
}

// ============================================================
// Liveness Detection
// Check face movement across multiple frames to prevent photo attacks
// Returns liveness score 0-100
// ============================================================

export function calculateLivenessScore(frames: FaceScanFrame[]): number {
    if (frames.length < 3) return 0;

    let totalMovement = 0;
    let sizeVariation = 0;
    const sizes: number[] = [];

    for (let i = 1; i < frames.length; i++) {
        const prev = frames[i - 1];
        const curr = frames[i];

        // Calculate center-point movement
        const prevCX = prev.box.x + prev.box.width / 2;
        const prevCY = prev.box.y + prev.box.height / 2;
        const currCX = curr.box.x + curr.box.width / 2;
        const currCY = curr.box.y + curr.box.height / 2;

        const dx = Math.abs(currCX - prevCX);
        const dy = Math.abs(currCY - prevCY);
        totalMovement += Math.sqrt(dx * dx + dy * dy);

        sizes.push(curr.box.width * curr.box.height);
    }
    sizes.push(frames[0].box.width * frames[0].box.height);

    // Calculate face size variation (indicates 3D object, not flat photo)
    const avgSize = sizes.reduce((a, b) => a + b, 0) / sizes.length;
    sizeVariation = sizes.reduce((a, b) => a + Math.abs(b - avgSize), 0) / sizes.length;

    // Score based on movement (some movement = real, too static = photo)
    // Expect slight natural movement between 2-50 pixels total
    const movementScore = Math.min(totalMovement / 15, 1) * 60;

    // Score based on size variation (real face has slight depth changes)
    const sizeScore = Math.min(sizeVariation / (avgSize * 0.02), 1) * 40;

    return Math.min(Math.round(movementScore + sizeScore), 100);
}

// ============================================================
// Register Face (with averaging multiple frames for better accuracy)
// ============================================================

export async function registerFace(
    userId: string,
    video: HTMLVideoElement,
    onProgress?: (step: string, progress: number) => void
): Promise<{ success: boolean; error?: string; photo?: string }> {
    try {
        const loaded = await loadFaceModels();
        if (!loaded) return { success: false, error: 'فشل تحميل نماذج التعرف على الوجه' };

        onProgress?.('جاري التقاط الوجه...', 20);

        // Capture multiple frames for better descriptor
        const descriptors: Float32Array[] = [];
        for (let i = 0; i < 3; i++) {
            const frame = await detectFace(video);
            if (frame) descriptors.push(frame.descriptor);
            onProgress?.(`إطار ${i + 1}/3`, 30 + i * 20);
            await new Promise(r => setTimeout(r, 500));
        }

        if (descriptors.length < 2) {
            return { success: false, error: 'لم يتم اكتشاف وجه واضح. تأكد من إضاءة جيدة ووجهك أمام الكاميرا مباشرة.' };
        }

        // Average the descriptors for more stable matching
        const avgDescriptor = new Float32Array(128);
        for (const d of descriptors) {
            for (let j = 0; j < 128; j++) avgDescriptor[j] += d[j];
        }
        for (let j = 0; j < 128; j++) avgDescriptor[j] /= descriptors.length;

        onProgress?.('حفظ البيانات...', 85);

        // Capture photo
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d')!.drawImage(video, 0, 0);
        const photo = canvas.toDataURL('image/jpeg', 0.6);

        // Store locally
        localStorage.setItem(FACE_KEY + userId, JSON.stringify({
            descriptor: Array.from(avgDescriptor),
            photo,
            registeredAt: new Date().toISOString(),
            frameCount: descriptors.length,
        }));

        // Upload photo to Firebase Storage & save data to Firestore
        try {
            console.log('💾 Uploading face photo to Storage for user:', userId);
            const photoURL = await uploadPhotoToStorage(userId, 'face', photo);
            console.log('✅ Face photo uploaded to Storage');

            await setDoc(doc(db, 'users', userId, 'biometrics', 'face'), {
                descriptor: Array.from(avgDescriptor),
                photoURL,
                registeredAt: new Date().toISOString(),
                frameCount: descriptors.length,
                locked: true,
            });
            console.log('✅ Face data saved to Firestore successfully');
        } catch (e: any) {
            console.error('❌ Failed to save face to Storage/Firestore:', e?.message || e);
        }

        onProgress?.('تم!', 100);
        return { success: true, photo };
    } catch (err: any) {
        console.error('Face register error:', err);
        return { success: false, error: err.message || 'فشل تسجيل الوجه' };
    }
}

// ============================================================
// Advanced Face Verification with Liveness + Confidence
// ============================================================

export async function verifyFaceAdvanced(
    userId: string,
    video: HTMLVideoElement,
    collectedFrames: FaceScanFrame[]
): Promise<FaceVerifyResult> {
    try {
        const storedStr = localStorage.getItem(FACE_KEY + userId);
        if (!storedStr) return { success: false, error: 'لم يتم تسجيل وجه' };

        const stored = JSON.parse(storedStr);
        const storedDescriptor = new Float32Array(stored.descriptor);

        const loaded = await loadFaceModels();
        if (!loaded) return { success: false, error: 'فشل تحميل النماذج' };

        // Detect current face
        const currentFrame = await detectFace(video);
        if (!currentFrame) return { success: false, error: 'لم يتم اكتشاف وجه' };

        // Add to collected frames for liveness
        collectedFrames.push(currentFrame);

        // Calculate match distance
        const distance = faceapi.euclideanDistance(currentFrame.descriptor, storedDescriptor);
        const confidence = Math.max(0, Math.min(100, Math.round((1 - distance / 1.0) * 100)));

        // Calculate liveness score
        const livenessScore = calculateLivenessScore(collectedFrames);

        // Decision thresholds
        const matchThreshold = 0.55; // Stricter matching
        const livenessThreshold = 25;  // Minimum liveness
        const minFrames = 4;

        if (distance > matchThreshold) {
            return { success: false, error: 'الوجه غير مطابق', confidence, livenessScore };
        }

        if (collectedFrames.length < minFrames) {
            return { success: false, error: 'جاري التحقق...', confidence, livenessScore };
        }

        if (livenessScore < livenessThreshold) {
            return { success: false, error: 'يرجى تحريك وجهك قليلاً للتأكد من أنك شخص حقيقي', confidence, livenessScore };
        }

        return { success: true, confidence, livenessScore };
    } catch (err: any) {
        console.error('Face verify error:', err);
        return { success: false, error: err.message || 'فشل التحقق' };
    }
}

// Simple verify (backward compat)
export async function verifyFace(
    userId: string,
    video: HTMLVideoElement
): Promise<{ success: boolean; error?: string; distance?: number }> {
    const stored = localStorage.getItem(FACE_KEY + userId);
    if (!stored) return { success: false, error: 'لم يتم تسجيل وجه' };
    const data = JSON.parse(stored);
    const storedDesc = new Float32Array(data.descriptor);

    const frame = await detectFace(video);
    if (!frame) return { success: false, error: 'لم يتم اكتشاف وجه' };

    const distance = faceapi.euclideanDistance(frame.descriptor, storedDesc);
    if (distance < 0.55) return { success: true, distance };
    return { success: false, error: 'الوجه غير مطابق', distance };
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

// ============================================================
// Iris / Eye Recognition
// Uses face-api.js landmarks to extract eye regions and match
// Landmark indices: Left eye 36-41, Right eye 42-47
// ============================================================

const IRIS_KEY = 'iris_data_';

function extractEyeRegion(
    video: HTMLVideoElement,
    landmarks: faceapi.FaceLandmarks68,
    eye: 'left' | 'right'
): ImageData | null {
    try {
        const positions = landmarks.positions;
        // Left eye landmarks: 36-41, Right eye: 42-47
        const startIdx = eye === 'left' ? 36 : 42;
        const endIdx = eye === 'left' ? 41 : 47;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (let i = startIdx; i <= endIdx; i++) {
            const pt = positions[i];
            if (pt.x < minX) minX = pt.x;
            if (pt.y < minY) minY = pt.y;
            if (pt.x > maxX) maxX = pt.x;
            if (pt.y > maxY) maxY = pt.y;
        }

        // Expand region by 40% for better capture
        const padding = Math.max((maxX - minX), (maxY - minY)) * 0.4;
        minX = Math.max(0, minX - padding);
        minY = Math.max(0, minY - padding);
        maxX = Math.min(video.videoWidth, maxX + padding);
        maxY = Math.min(video.videoHeight, maxY + padding);

        const w = Math.round(maxX - minX);
        const h = Math.round(maxY - minY);
        if (w < 10 || h < 10) return null;

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        ctx.drawImage(video, Math.round(minX), Math.round(minY), w, h, 0, 0, w, h);
        return ctx.getImageData(0, 0, w, h);
    } catch {
        return null;
    }
}

function computeEyeSignature(imageData: ImageData): Float32Array {
    // Compute a compact signature from eye region pixels
    // Divide into 8x8 grid cells, compute average intensity per cell
    const { width, height, data } = imageData;
    const gridSize = 8;
    const signature = new Float32Array(gridSize * gridSize);

    const cellW = width / gridSize;
    const cellH = height / gridSize;

    for (let gy = 0; gy < gridSize; gy++) {
        for (let gx = 0; gx < gridSize; gx++) {
            let sum = 0;
            let count = 0;
            const startX = Math.floor(gx * cellW);
            const endX = Math.floor((gx + 1) * cellW);
            const startY = Math.floor(gy * cellH);
            const endY = Math.floor((gy + 1) * cellH);

            for (let y = startY; y < endY; y++) {
                for (let x = startX; x < endX; x++) {
                    const idx = (y * width + x) * 4;
                    // Grayscale intensity
                    sum += data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114;
                    count++;
                }
            }
            signature[gy * gridSize + gx] = count > 0 ? sum / count / 255 : 0;
        }
    }
    return signature;
}

function compareEyeSignatures(a: Float32Array, b: Float32Array): number {
    let sumSq = 0;
    for (let i = 0; i < a.length; i++) {
        const diff = a[i] - b[i];
        sumSq += diff * diff;
    }
    return Math.sqrt(sumSq / a.length);
}

export async function registerIris(
    userId: string,
    video: HTMLVideoElement,
    onProgress?: (step: string, progress: number) => void
): Promise<{ success: boolean; error?: string; photo?: string }> {
    try {
        const loaded = await loadFaceModels();
        if (!loaded) return { success: false, error: 'فشل تحميل النماذج' };

        onProgress?.('جاري مسح قزحية العين...', 10);

        const allLeftSigs: Float32Array[] = [];
        const allRightSigs: Float32Array[] = [];
        const allDescriptors: Float32Array[] = [];

        for (let i = 0; i < 5; i++) {
            onProgress?.(`إطار ${i + 1}/5`, 15 + i * 15);
            const frame = await detectFace(video);
            if (!frame) continue;

            allDescriptors.push(frame.descriptor);

            const leftEye = extractEyeRegion(video, frame.landmarks, 'left');
            const rightEye = extractEyeRegion(video, frame.landmarks, 'right');

            if (leftEye) allLeftSigs.push(computeEyeSignature(leftEye));
            if (rightEye) allRightSigs.push(computeEyeSignature(rightEye));

            await new Promise(r => setTimeout(r, 400));
        }

        if (allLeftSigs.length < 3 || allRightSigs.length < 3) {
            return { success: false, error: 'لم يتم اكتشاف العينين بوضوح. تأكد من إضاءة جيدة.' };
        }

        onProgress?.('معالجة بصمة القزحية...', 80);

        // Average the signatures
        const avgLeft = new Float32Array(64);
        const avgRight = new Float32Array(64);
        for (const s of allLeftSigs) { for (let j = 0; j < 64; j++) avgLeft[j] += s[j]; }
        for (const s of allRightSigs) { for (let j = 0; j < 64; j++) avgRight[j] += s[j]; }
        for (let j = 0; j < 64; j++) avgLeft[j] /= allLeftSigs.length;
        for (let j = 0; j < 64; j++) avgRight[j] /= allRightSigs.length;

        // Average face descriptor too for combined matching
        const avgDesc = new Float32Array(128);
        for (const d of allDescriptors) { for (let j = 0; j < 128; j++) avgDesc[j] += d[j]; }
        for (let j = 0; j < 128; j++) avgDesc[j] /= allDescriptors.length;

        // Capture photo
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d')!.drawImage(video, 0, 0);
        const photo = canvas.toDataURL('image/jpeg', 0.6);

        onProgress?.('حفظ بيانات القزحية...', 90);

        // Store locally
        localStorage.setItem(IRIS_KEY + userId, JSON.stringify({
            leftEye: Array.from(avgLeft),
            rightEye: Array.from(avgRight),
            faceDescriptor: Array.from(avgDesc),
            photo,
            registeredAt: new Date().toISOString(),
            frameCount: allLeftSigs.length,
        }));

        // Upload photo to Firebase Storage & save data to Firestore
        try {
            console.log('💾 Uploading iris photo to Storage for user:', userId);
            const photoURL = await uploadPhotoToStorage(userId, 'iris', photo);
            console.log('✅ Iris photo uploaded to Storage');

            await setDoc(doc(db, 'users', userId, 'biometrics', 'iris'), {
                leftEye: Array.from(avgLeft),
                rightEye: Array.from(avgRight),
                faceDescriptor: Array.from(avgDesc),
                photoURL,
                registeredAt: new Date().toISOString(),
                frameCount: allLeftSigs.length,
                locked: true,
            });
            console.log('✅ Iris data saved to Firestore successfully');
        } catch (e: any) {
            console.error('❌ Failed to save iris to Storage/Firestore:', e?.message || e);
        }

        onProgress?.('تم التسجيل!', 100);
        return { success: true, photo };
    } catch (err: any) {
        console.error('Iris register error:', err);
        return { success: false, error: err.message || 'فشل تسجيل القزحية' };
    }
}

export async function verifyIris(
    userId: string,
    video: HTMLVideoElement
): Promise<{ success: boolean; error?: string; confidence?: number }> {
    try {
        const storedStr = localStorage.getItem(IRIS_KEY + userId);
        if (!storedStr) return { success: false, error: 'لم يتم تسجيل قزحية العين' };

        const stored = JSON.parse(storedStr);
        const storedLeft = new Float32Array(stored.leftEye);
        const storedRight = new Float32Array(stored.rightEye);
        const storedDesc = new Float32Array(stored.faceDescriptor);

        const loaded = await loadFaceModels();
        if (!loaded) return { success: false, error: 'فشل تحميل النماذج' };

        const frame = await detectFace(video);
        if (!frame) return { success: false, error: 'لم يتم اكتشاف وجه' };

        // Face descriptor match (40% weight)
        const faceDistance = faceapi.euclideanDistance(frame.descriptor, storedDesc);
        const faceScore = Math.max(0, 1 - faceDistance / 0.8);

        // Eye signature match (60% weight)
        const leftEye = extractEyeRegion(video, frame.landmarks, 'left');
        const rightEye = extractEyeRegion(video, frame.landmarks, 'right');

        if (!leftEye || !rightEye) {
            return { success: false, error: 'لم يتم اكتشاف العينين' };
        }

        const leftSig = computeEyeSignature(leftEye);
        const rightSig = computeEyeSignature(rightEye);

        const leftDist = compareEyeSignatures(leftSig, storedLeft);
        const rightDist = compareEyeSignatures(rightSig, storedRight);
        const eyeAvgDist = (leftDist + rightDist) / 2;
        const eyeScore = Math.max(0, 1 - eyeAvgDist / 0.3);

        // Combined score
        const combinedScore = faceScore * 0.4 + eyeScore * 0.6;
        const confidence = Math.round(combinedScore * 100);

        if (combinedScore >= 0.55) {
            return { success: true, confidence };
        }
        return { success: false, error: 'القزحية غير مطابقة', confidence };
    } catch (err: any) {
        console.error('Iris verify error:', err);
        return { success: false, error: err.message || 'فشل التحقق من القزحية' };
    }
}

export function isIrisRegistered(userId: string): boolean {
    return !!localStorage.getItem(IRIS_KEY + userId);
}

export function getIrisPhoto(userId: string): string | null {
    try {
        const stored = localStorage.getItem(IRIS_KEY + userId);
        if (!stored) return null;
        return JSON.parse(stored).photo;
    } catch { return null; }
}

export function removeIrisData(userId: string): void {
    localStorage.removeItem(IRIS_KEY + userId);
}

// ============================================================
// Firestore Biometric Helpers
// ============================================================

export async function isBiometricRegisteredInFirestore(
    userId: string,
    type: 'face' | 'iris'
): Promise<boolean> {
    try {
        const snap = await getDoc(doc(db, 'users', userId, 'biometrics', type));
        return snap.exists() && snap.data()?.locked === true;
    } catch {
        return false;
    }
}

export async function loadBiometricFromFirestore(
    userId: string,
    type: 'face' | 'iris'
): Promise<Record<string, any> | null> {
    try {
        const snap = await getDoc(doc(db, 'users', userId, 'biometrics', type));
        if (snap.exists()) return snap.data();
    } catch (e) {
        console.error(`Failed to load ${type} from Firestore:`, e);
    }
    return null;
}

export async function checkBothBiometricsRegistered(userId: string): Promise<boolean> {
    const [face, iris] = await Promise.all([
        isBiometricRegisteredInFirestore(userId, 'face'),
        isBiometricRegisteredInFirestore(userId, 'iris'),
    ]);
    return face && iris;
}
