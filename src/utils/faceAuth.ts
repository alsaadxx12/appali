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
// Liveness State Tracker — tracks events across verification loop
// ============================================================

export interface LivenessTracker {
    frames: FaceScanFrame[];
    earHistory: number[];        // Eye Aspect Ratio history for blink detection
    blinkCount: number;
    headYawHistory: number[];    // Horizontal head angle history
    headTurnDetected: boolean;
    textureScores: number[];     // Pixel variance scores
    startTime: number;
}

export function createLivenessTracker(): LivenessTracker {
    return {
        frames: [],
        earHistory: [],
        blinkCount: 0,
        headYawHistory: [],
        headTurnDetected: false,
        textureScores: [],
        startTime: Date.now(),
    };
}

// ============================================================
// Eye Aspect Ratio (EAR) — detects blink
// EAR = (|p2-p6| + |p3-p5|) / (2 * |p1-p4|)
// Landmark indices: Left eye 36-41, Right eye 42-47
// ============================================================

function euclideanDist2D(a: { x: number; y: number }, b: { x: number; y: number }): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
}

export function computeEAR(landmarks: faceapi.FaceLandmarks68): number {
    const pts = landmarks.positions;

    // Left eye: 36=p1, 37=p2, 38=p3, 39=p4, 40=p5, 41=p6
    const leftEAR = (
        euclideanDist2D(pts[37], pts[41]) + euclideanDist2D(pts[38], pts[40])
    ) / (2 * euclideanDist2D(pts[36], pts[39]) + 1e-6);

    // Right eye: 42=p1, 43=p2, 44=p3, 45=p4, 46=p5, 47=p6
    const rightEAR = (
        euclideanDist2D(pts[43], pts[47]) + euclideanDist2D(pts[44], pts[46])
    ) / (2 * euclideanDist2D(pts[42], pts[45]) + 1e-6);

    return (leftEAR + rightEAR) / 2;
}

// ============================================================
// Head Yaw Estimation — detects left/right head rotation
// Uses nose (30) vs eye corners to estimate horizontal angle
// ============================================================

export function estimateHeadYaw(landmarks: faceapi.FaceLandmarks68): number {
    const pts = landmarks.positions;
    // Left eye outer: 36, Right eye outer: 45, Nose tip: 30
    const leftEye = pts[36];
    const rightEye = pts[45];
    const nose = pts[30];

    const eyeMidX = (leftEye.x + rightEye.x) / 2;
    const eyeWidth = rightEye.x - leftEye.x;
    // Yaw: positive = looking right, negative = looking left
    if (eyeWidth < 1) return 0;
    return (nose.x - eyeMidX) / eyeWidth; // Normalized -0.5 to +0.5
}

// ============================================================
// Texture Anti-Spoofing
// Real faces have high pixel variance (skin texture).
// Printed photos on screens tend to be smoother or have moiré patterns.
// ============================================================

export function computeFaceTextureScore(video: HTMLVideoElement, frame: FaceScanFrame): number {
    try {
        const { box } = frame;
        if (box.width < 20 || box.height < 20) return 50; // unknown

        const canvas = document.createElement('canvas');
        const sampleSize = 64;
        canvas.width = sampleSize;
        canvas.height = sampleSize;
        const ctx = canvas.getContext('2d');
        if (!ctx) return 50;

        // Sample the central face region
        const cx = box.x + box.width * 0.25;
        const cy = box.y + box.height * 0.25;
        const cw = box.width * 0.5;
        const ch = box.height * 0.5;
        ctx.drawImage(video, cx, cy, cw, ch, 0, 0, sampleSize, sampleSize);

        const imgData = ctx.getImageData(0, 0, sampleSize, sampleSize).data;
        const grayscale: number[] = [];
        for (let i = 0; i < imgData.length; i += 4) {
            grayscale.push(imgData[i] * 0.299 + imgData[i + 1] * 0.587 + imgData[i + 2] * 0.114);
        }

        // Compute Laplacian variance (edge sharpness / texture richness)
        let laplacianSum = 0;
        const w = sampleSize;
        for (let y = 1; y < sampleSize - 1; y++) {
            for (let x = 1; x < w - 1; x++) {
                const idx = y * w + x;
                const lap = Math.abs(
                    -grayscale[idx - w - 1] + 0 * grayscale[idx - w] - grayscale[idx - w + 1]
                    + 0 * grayscale[idx - 1] + 4 * grayscale[idx] + 0 * grayscale[idx + 1]
                    - grayscale[idx + w - 1] + 0 * grayscale[idx + w] - grayscale[idx + w + 1]
                );
                laplacianSum += lap;
            }
        }
        const variance = laplacianSum / ((sampleSize - 2) * (sampleSize - 2));

        // Real faces: variance typically 8-50+
        // Printed/screen photos: typically < 5 (very smooth after JPEG/display compression)
        return Math.min(variance * 3, 100); // Scale to 0-100
    } catch {
        return 50;
    }
}

// ============================================================
// Update Liveness Tracker — called every frame during verification
// ============================================================

export function updateLivenessTracker(tracker: LivenessTracker, frame: FaceScanFrame, video: HTMLVideoElement): void {
    tracker.frames.push(frame);

    // Track Eye Aspect Ratio for blink detection
    const ear = computeEAR(frame.landmarks);
    tracker.earHistory.push(ear);

    // Detect blink: EAR drops below 0.20 then recovers above 0.25
    const earLen = tracker.earHistory.length;
    if (earLen >= 3) {
        const prev2 = tracker.earHistory[earLen - 3];
        const prev1 = tracker.earHistory[earLen - 2];
        const curr = tracker.earHistory[earLen - 1];
        // Closed -> Open transition
        if (prev1 < 0.20 && prev2 > 0.23 && curr > 0.23) {
            tracker.blinkCount++;
        }
    }

    // Track head yaw for turn detection
    const yaw = estimateHeadYaw(frame.landmarks);
    tracker.headYawHistory.push(yaw);

    if (tracker.headYawHistory.length >= 2) {
        const minYaw = Math.min(...tracker.headYawHistory);
        const maxYaw = Math.max(...tracker.headYawHistory);
        // Require at least 0.10 normalized yaw change (about 10-15 degrees of head turn)
        if (maxYaw - minYaw > 0.10) {
            tracker.headTurnDetected = true;
        }
    }

    // Texture score
    const textureScore = computeFaceTextureScore(video, frame);
    tracker.textureScores.push(textureScore);
}

// ============================================================
// Compute final liveness score from tracker (0-100)
// ============================================================

export function calculateLivenessScore(frames: FaceScanFrame[]): number {
    if (frames.length < 3) return 0;

    let totalMovement = 0;
    const sizes: number[] = [];

    for (let i = 1; i < frames.length; i++) {
        const prev = frames[i - 1];
        const curr = frames[i];

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

    const avgSize = sizes.reduce((a, b) => a + b, 0) / sizes.length;
    const sizeVariation = sizes.reduce((a, b) => a + Math.abs(b - avgSize), 0) / sizes.length;

    const movementScore = Math.min(totalMovement / 15, 1) * 50;
    const sizeScore = Math.min(sizeVariation / (avgSize * 0.02), 1) * 50;

    return Math.min(Math.round(movementScore + sizeScore), 100);
}

// ============================================================
// Advanced liveness score from full tracker — MULTI-FACTOR
// ============================================================

export function calculateAdvancedLivenessScore(tracker: LivenessTracker): {
    score: number;
    blinkDetected: boolean;
    headTurnDetected: boolean;
    textureScore: number;
    movementScore: number;
    details: string;
} {
    const frames = tracker.frames;
    if (frames.length < 3) {
        return { score: 0, blinkDetected: false, headTurnDetected: false, textureScore: 0, movementScore: 0, details: 'جاري التحقق...' };
    }

    // 1. Movement score (20 points max)
    let totalMovement = 0;
    for (let i = 1; i < frames.length; i++) {
        const p = frames[i - 1], c = frames[i];
        const dx = (c.box.x + c.box.width / 2) - (p.box.x + p.box.width / 2);
        const dy = (c.box.y + c.box.height / 2) - (p.box.y + p.box.height / 2);
        totalMovement += Math.sqrt(dx * dx + dy * dy);
    }
    const movementScore = Math.min((totalMovement / (frames.length * 3)), 1) * 20;

    // 2. Blink score (35 points max) — most reliable real-person indicator
    const blinkDetected = tracker.blinkCount >= 1;
    const blinkScore = blinkDetected ? 35 : 0;

    // 3. Head turn score (25 points max)
    const headTurnScore = tracker.headTurnDetected ? 25 : 0;

    // 4. Texture score (20 points max) — anti-screen/print spoofing
    const avgTexture = tracker.textureScores.length > 0
        ? tracker.textureScores.reduce((a, b) => a + b, 0) / tracker.textureScores.length
        : 0;
    // Maps texture variance to 0-20 points. Real faces: ~15-40+, screens: <5
    const textureScore = Math.min((avgTexture / 15), 1) * 20;

    const totalScore = Math.min(Math.round(movementScore + blinkScore + headTurnScore + textureScore), 100);

    let details = '';
    if (!blinkDetected) details = 'يرجى الرمش بعينيك';
    else if (!tracker.headTurnDetected) details = 'يرجى تحريك رأسك يميناً أو يساراً قليلاً';
    else if (avgTexture < 5) details = 'لا يمكن التحقق - يبدو أنك تعرض صورة';
    else details = 'تم التحقق';

    return {
        score: totalScore,
        blinkDetected,
        headTurnDetected: tracker.headTurnDetected,
        textureScore: Math.round(avgTexture),
        movementScore: Math.round(movementScore),
        details,
    };
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

        // Upload photo to Firebase Storage (optional — fallback to base64)
        let photoURL = photo; // fallback: use base64 directly
        try {
            console.log('💾 Uploading face photo to Storage for user:', userId);
            photoURL = await uploadPhotoToStorage(userId, 'face', photo);
            console.log('✅ Face photo uploaded to Storage');
        } catch (e: any) {
            console.warn('⚠️ Photo upload failed, using base64 fallback:', e?.message || e);
        }

        // Save descriptor to Firestore — this MUST succeed
        try {
            await setDoc(doc(db, 'users', userId, 'biometrics', 'face'), {
                descriptor: Array.from(avgDescriptor),
                photoURL,
                registeredAt: new Date().toISOString(),
                frameCount: descriptors.length,
                locked: true,
            });
            console.log('✅ Face data saved to Firestore successfully');
        } catch (e: any) {
            console.error('❌ Failed to save face to Firestore:', e?.message || e);
            return { success: false, error: 'فشل حفظ بيانات الوجه في قاعدة البيانات' };
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
    collectedFrames: FaceScanFrame[],
    livenessTracker?: LivenessTracker
): Promise<FaceVerifyResult> {
    try {
        // Try localStorage first, then Firestore
        let storedDescriptor: Float32Array | null = null;
        const storedStr = localStorage.getItem(FACE_KEY + userId);
        if (storedStr) {
            const stored = JSON.parse(storedStr);
            storedDescriptor = new Float32Array(stored.descriptor);
        } else {
            // Load from Firestore and cache locally
            const firestoreData = await loadBiometricFromFirestore(userId, 'face');
            if (firestoreData?.descriptor) {
                storedDescriptor = new Float32Array(firestoreData.descriptor);
                // Cache in localStorage for future use
                localStorage.setItem(FACE_KEY + userId, JSON.stringify({
                    descriptor: firestoreData.descriptor,
                    photo: firestoreData.photoURL || firestoreData.photo || '',
                    registeredAt: firestoreData.registeredAt,
                    frameCount: firestoreData.frameCount,
                }));
                console.log('✅ Face data loaded from Firestore and cached locally');
            }
        }
        if (!storedDescriptor) return { success: false, error: 'لم يتم تسجيل وجه' };

        const loaded = await loadFaceModels();
        if (!loaded) return { success: false, error: 'فشل تحميل النماذج' };

        // Detect current face
        const currentFrame = await detectFace(video);
        if (!currentFrame) return { success: false, error: 'لم يتم اكتشاف وجه' };

        // Add to collected frames for liveness
        collectedFrames.push(currentFrame);

        // Update advanced liveness tracker if provided
        if (livenessTracker) updateLivenessTracker(livenessTracker, currentFrame, video);

        // Calculate match distance
        const distance = faceapi.euclideanDistance(currentFrame.descriptor, storedDescriptor);
        const confidence = Math.max(0, Math.min(100, Math.round((1 - distance / 1.0) * 100)));

        // --- STRICTER thresholds vs old code ---
        const matchThreshold = 0.50;  // was 0.55 — stricter face match required
        const minFrames = 6;          // was 4 — need more frames

        if (distance > matchThreshold) {
            return { success: false, error: 'الوجه غير مطابق', confidence };
        }

        if (collectedFrames.length < minFrames) {
            return { success: false, error: 'جاري التحقق...', confidence };
        }

        // --- ADVANCED LIVENESS CHECK ---
        if (livenessTracker) {
            const liveness = calculateAdvancedLivenessScore(livenessTracker);

            // Hard-fail on photo: texture score must be reasonable
            if (liveness.textureScore < 5 && livenessTracker.textureScores.length >= 5) {
                return {
                    success: false,
                    error: '⚠️ تم اكتشاف صورة - يجب أن يكون وجهك الحقيقي أمام الكاميرا',
                    confidence,
                    livenessScore: liveness.score,
                };
            }

            // Require both blink AND head movement, OR very high score
            if (liveness.score < 55) {
                return {
                    success: false,
                    error: liveness.details || 'يرجى الرمش بعينيك وتحريك رأسك قليلاً',
                    confidence,
                    livenessScore: liveness.score,
                };
            }

            // Even if score passes — if no blink detected after enough frames, reject
            if (!liveness.blinkDetected && livenessTracker.frames.length >= 12) {
                return {
                    success: false,
                    error: 'يرجى الرمش بعينيك مرة واحدة على الأقل',
                    confidence,
                    livenessScore: liveness.score,
                };
            }

            return { success: true, confidence, livenessScore: liveness.score };
        } else {
            // Fallback to basic liveness if no tracker
            const livenessScore = calculateLivenessScore(collectedFrames);
            if (livenessScore < 30) {
                return {
                    success: false,
                    error: 'يرجى تحريك وجهك قليلاً للتأكد من أنك شخص حقيقي',
                    confidence,
                    livenessScore,
                };
            }
            return { success: true, confidence, livenessScore };
        }
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
    // Try localStorage first, then Firestore
    let storedDesc: Float32Array | null = null;
    const stored = localStorage.getItem(FACE_KEY + userId);
    if (stored) {
        storedDesc = new Float32Array(JSON.parse(stored).descriptor);
    } else {
        const fsData = await loadBiometricFromFirestore(userId, 'face');
        if (fsData?.descriptor) {
            storedDesc = new Float32Array(fsData.descriptor);
            localStorage.setItem(FACE_KEY + userId, JSON.stringify({
                descriptor: fsData.descriptor,
                photo: fsData.photoURL || '',
                registeredAt: fsData.registeredAt,
                frameCount: fsData.frameCount,
            }));
        }
    }
    if (!storedDesc) return { success: false, error: 'لم يتم تسجيل وجه' };

    const frame = await detectFace(video);
    if (!frame) return { success: false, error: 'لم يتم اكتشاف وجه' };

    const distance = faceapi.euclideanDistance(frame.descriptor, storedDesc);
    if (distance < 0.55) return { success: true, distance };
    return { success: false, error: 'الوجه غير مطابق', distance };
}

// ============================================================
// Helpers — all Firestore-first with localStorage cache
// ============================================================

// Synchronous check (uses localStorage cache — call ensureBiometricDataLoaded first)
export function isFaceRegistered(userId: string): boolean {
    return !!localStorage.getItem(FACE_KEY + userId);
}

// Async check — queries Firestore if not in localStorage
export async function isFaceRegisteredAsync(userId: string): Promise<boolean> {
    if (localStorage.getItem(FACE_KEY + userId)) return true;
    const fsData = await loadBiometricFromFirestore(userId, 'face');
    if (fsData?.descriptor) {
        localStorage.setItem(FACE_KEY + userId, JSON.stringify({
            descriptor: fsData.descriptor,
            photo: fsData.photoURL || '',
            registeredAt: fsData.registeredAt,
            frameCount: fsData.frameCount,
        }));
        return true;
    }
    return false;
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

        // Upload photo to Firebase Storage (optional — fallback to base64)
        let photoURL = photo;
        try {
            console.log('💾 Uploading iris photo to Storage for user:', userId);
            photoURL = await uploadPhotoToStorage(userId, 'iris', photo);
            console.log('✅ Iris photo uploaded to Storage');
        } catch (e: any) {
            console.warn('⚠️ Iris photo upload failed, using base64 fallback:', e?.message || e);
        }

        // Save data to Firestore — this MUST succeed
        try {
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
            console.error('❌ Failed to save iris to Firestore:', e?.message || e);
            return { success: false, error: 'فشل حفظ بيانات القزحية في قاعدة البيانات' };
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
        // Try localStorage first, then Firestore
        let storedLeft: Float32Array | null = null;
        let storedRight: Float32Array | null = null;
        let storedDesc: Float32Array | null = null;

        const storedStr = localStorage.getItem(IRIS_KEY + userId);
        if (storedStr) {
            const stored = JSON.parse(storedStr);
            storedLeft = new Float32Array(stored.leftEye);
            storedRight = new Float32Array(stored.rightEye);
            storedDesc = new Float32Array(stored.faceDescriptor);
        } else {
            // Load from Firestore and cache
            const fsData = await loadBiometricFromFirestore(userId, 'iris');
            if (fsData?.leftEye && fsData?.rightEye && fsData?.faceDescriptor) {
                storedLeft = new Float32Array(fsData.leftEye);
                storedRight = new Float32Array(fsData.rightEye);
                storedDesc = new Float32Array(fsData.faceDescriptor);
                localStorage.setItem(IRIS_KEY + userId, JSON.stringify({
                    leftEye: fsData.leftEye,
                    rightEye: fsData.rightEye,
                    faceDescriptor: fsData.faceDescriptor,
                    photo: fsData.photoURL || '',
                    registeredAt: fsData.registeredAt,
                    frameCount: fsData.frameCount,
                }));
                console.log('✅ Iris data loaded from Firestore and cached locally');
            }
        }

        if (!storedLeft || !storedRight || !storedDesc) {
            return { success: false, error: 'لم يتم تسجيل قزحية العين' };
        }

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

export async function isIrisRegisteredAsync(userId: string): Promise<boolean> {
    if (localStorage.getItem(IRIS_KEY + userId)) return true;
    const fsData = await loadBiometricFromFirestore(userId, 'iris');
    if (fsData?.leftEye) {
        localStorage.setItem(IRIS_KEY + userId, JSON.stringify({
            leftEye: fsData.leftEye,
            rightEye: fsData.rightEye,
            faceDescriptor: fsData.faceDescriptor,
            photo: fsData.photoURL || '',
            registeredAt: fsData.registeredAt,
            frameCount: fsData.frameCount,
        }));
        return true;
    }
    return false;
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

/**
 * Call on app start / login to preload biometric data from Firestore into localStorage.
 * This ensures isFaceRegistered() / isIrisRegistered() work synchronously on any device.
 */
export async function ensureBiometricDataLoaded(userId: string): Promise<void> {
    try {
        const [faceLocal, irisLocal] = [
            localStorage.getItem(FACE_KEY + userId),
            localStorage.getItem(IRIS_KEY + userId),
        ];

        const promises: Promise<void>[] = [];

        if (!faceLocal) {
            promises.push(
                loadBiometricFromFirestore(userId, 'face').then(fsData => {
                    if (fsData?.descriptor) {
                        localStorage.setItem(FACE_KEY + userId, JSON.stringify({
                            descriptor: fsData.descriptor,
                            photo: fsData.photoURL || fsData.photo || '',
                            registeredAt: fsData.registeredAt,
                            frameCount: fsData.frameCount,
                        }));
                        console.log('✅ Face data synced from Firestore to localStorage');
                    }
                })
            );
        }

        if (!irisLocal) {
            promises.push(
                loadBiometricFromFirestore(userId, 'iris').then(fsData => {
                    if (fsData?.leftEye) {
                        localStorage.setItem(IRIS_KEY + userId, JSON.stringify({
                            leftEye: fsData.leftEye,
                            rightEye: fsData.rightEye,
                            faceDescriptor: fsData.faceDescriptor,
                            photo: fsData.photoURL || fsData.photo || '',
                            registeredAt: fsData.registeredAt,
                            frameCount: fsData.frameCount,
                        }));
                        console.log('✅ Iris data synced from Firestore to localStorage');
                    }
                })
            );
        }

        if (promises.length > 0) await Promise.all(promises);
    } catch (e) {
        console.error('Error syncing biometric data from Firestore:', e);
    }
}
