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
import { db } from '../firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';

const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights';
const FACE_KEY = 'face_data_';

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
// Multi-Angle Face Registration System
// ============================================================

export type FaceAngle = 'front' | 'left' | 'right';

export interface MultiAngleFaceData {
    descriptor: number[];
    angle: FaceAngle;
    registeredAt: string;
    frameCount?: number;
}

export interface RegisterAngleOptions {
    userId: string;
    video: HTMLVideoElement;
    angle: FaceAngle;
    onProgress?: (step: string, progress: number) => void;
}

// ============================================================
// Register a SINGLE angle (called 3x: front, left, right)
// Stores into face_front / face_left / face_right Firestore docs
// ============================================================

export async function registerFaceAngle({
    userId,
    video,
    angle,
    onProgress,
}: RegisterAngleOptions): Promise<{ success: boolean; error?: string; descriptor?: number[] }> {
    try {
        const loaded = await loadFaceModels();
        if (!loaded) return { success: false, error: 'فشل تحميل نماذج التعرف' };

        const angleLabels: Record<FaceAngle, string> = {
            front: 'الأمام',
            left: 'اليسار',
            right: 'اليمين',
        };
        const label = angleLabels[angle];

        onProgress?.(`جاري التقاط وجه من ${label}...`, 20);

        // Capture 4 frames per angle and average them
        const descriptors: Float32Array[] = [];
        for (let i = 0; i < 4; i++) {
            const frame = await detectFace(video);
            if (frame) descriptors.push(frame.descriptor);
            onProgress?.(`التقاط إطار ${i + 1}/4 (${label})`, 25 + i * 15);
            await new Promise(r => setTimeout(r, 600));
        }

        if (descriptors.length < 2) {
            return { success: false, error: `لم يتم اكتشاف وجه من ${label}. تأكد من الإضاءة.` };
        }

        // Average descriptors for stability
        const avgDescriptor = new Float32Array(128);
        for (const d of descriptors) {
            for (let j = 0; j < 128; j++) avgDescriptor[j] += d[j];
        }
        for (let j = 0; j < 128; j++) avgDescriptor[j] /= descriptors.length;
        const descriptorArray = Array.from(avgDescriptor);

        onProgress?.('حفظ بيانات التعرف...', 85);

        // Save ONLY embedding (no photos) — angle-specific Firestore doc
        const docData: MultiAngleFaceData = {
            descriptor: descriptorArray,
            angle,
            registeredAt: new Date().toISOString(),
            frameCount: descriptors.length,
        };
        try {
            await setDoc(doc(db, 'users', userId, 'biometrics', `face_${angle}`), docData);
            console.log(`✅ Face embedding "${angle}" saved to Firestore (no photo)`);
        } catch (e: any) {
            console.error(`❌ Failed to save face_${angle}:`, e?.message);
            return { success: false, error: `فشل حفظ زاوية ${label} في قاعدة البيانات` };
        }

        // Cache embedding locally per-angle
        localStorage.setItem(`${FACE_KEY}${userId}_${angle}`, JSON.stringify({
            descriptor: descriptorArray,
            angle,
            registeredAt: new Date().toISOString(),
        }));

        // Front angle: also update legacy face doc for backward compat
        if (angle === 'front') {
            localStorage.setItem(FACE_KEY + userId, JSON.stringify({
                descriptor: descriptorArray,
                registeredAt: new Date().toISOString(),
                frameCount: descriptors.length,
            }));
            try {
                await setDoc(doc(db, 'users', userId, 'biometrics', 'face'), {
                    descriptor: descriptorArray,
                    registeredAt: new Date().toISOString(),
                    frameCount: descriptors.length,
                    locked: true, multiAngle: true,
                });
            } catch (e) {
                console.warn('Could not update legacy face doc:', e);
            }
        }

        onProgress?.('تم!', 100);
        return { success: true, descriptor: descriptorArray };
    } catch (err: any) {
        console.error('registerFaceAngle error:', err);
        return { success: false, error: err.message || 'فشل التسجيل' };
    }
}

// ============================================================
// Check if a specific angle is registered in Firestore
// ============================================================

export async function isFaceAngleRegistered(userId: string, angle: FaceAngle): Promise<boolean> {
    try {
        const d = await getDoc(doc(db, 'users', userId, 'biometrics', `face_${angle}`));
        return d.exists();
    } catch {
        return false;
    }
}

// ============================================================
// Load ALL stored angle descriptors for a user (for verification)
// ============================================================

export async function loadAllFaceDescriptors(userId: string): Promise<Array<{
    angle: FaceAngle;
    descriptor: Float32Array;
}>> {
    const angles: FaceAngle[] = ['front', 'left', 'right'];
    const results: Array<{ angle: FaceAngle; descriptor: Float32Array }> = [];

    for (const angle of angles) {
        // Try localStorage cache first
        const cacheKey = `${FACE_KEY}${userId}_${angle}`;
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
            try {
                const data = JSON.parse(cached);
                if (Array.isArray(data.descriptor) && data.descriptor.length === 128) {
                    results.push({ angle, descriptor: new Float32Array(data.descriptor) });
                    continue;
                }
            } catch { /* ignore */ }
        }

        // Load from Firestore
        try {
            const snap = await getDoc(doc(db, 'users', userId, 'biometrics', `face_${angle}`));
            if (snap.exists()) {
                const data = snap.data() as MultiAngleFaceData;
                if (Array.isArray(data.descriptor) && data.descriptor.length === 128) {
                    const descriptor = new Float32Array(data.descriptor);
                    localStorage.setItem(cacheKey, JSON.stringify({
                        descriptor: data.descriptor, angle,
                        registeredAt: data.registeredAt,
                    }));
                    results.push({ angle, descriptor });
                }
            }
        } catch (e) {
            console.warn(`Could not load face_${angle}:`, e);
        }
    }

    // Fallback: if no multi-angle data found, try legacy face doc
    if (results.length === 0) {
        try {
            const legacy = localStorage.getItem(FACE_KEY + userId);
            if (legacy) {
                const data = JSON.parse(legacy);
                if (Array.isArray(data.descriptor) && data.descriptor.length === 128) {
                    results.push({ angle: 'front', descriptor: new Float32Array(data.descriptor) });
                }
            } else {
                const snap = await getDoc(doc(db, 'users', userId, 'biometrics', 'face'));
                if (snap.exists()) {
                    const data = snap.data() as any;
                    if (Array.isArray(data.descriptor) && data.descriptor.length === 128) {
                        results.push({ angle: 'front', descriptor: new Float32Array(data.descriptor) });
                    }
                }
            }
        } catch { /* ignore */ }
    }

    return results;
}

// ============================================================
// Legacy registerFace — delegates to registerFaceAngle(front)
// ============================================================

export async function registerFace(
    userId: string,
    video: HTMLVideoElement,
    onProgress?: (step: string, progress: number) => void
): Promise<{ success: boolean; error?: string; photo?: string }> {
    const result = await registerFaceAngle({ userId, video, angle: 'front', onProgress });
    return { success: result.success, error: result.error };
}




// ============================================================
// Advanced Face Verification with Liveness + Multi-Angle Matching
// ============================================================

export async function verifyFaceAdvanced(
    userId: string,
    video: HTMLVideoElement,
    collectedFrames: FaceScanFrame[],
    livenessTracker?: LivenessTracker
): Promise<FaceVerifyResult> {
    try {
        const loaded = await loadFaceModels();
        if (!loaded) return { success: false, error: 'فشل تحميل النماذج' };

        // Load ALL registered angle descriptors (front, left, right)
        const storedAngles = await loadAllFaceDescriptors(userId);
        if (storedAngles.length === 0) {
            return { success: false, error: 'لم يتم تسجيل وجه. يرجى إعادة التسجيل.' };
        }

        // Detect current face frame
        const currentFrame = await detectFace(video);
        if (!currentFrame) return { success: false, error: 'لم يتم اكتشاف وجه' };

        // Add to collected frames for liveness analysis
        collectedFrames.push(currentFrame);

        // Update liveness tracker if provided
        if (livenessTracker) updateLivenessTracker(livenessTracker, currentFrame, video);

        // Multi-angle matching via COSINE SIMILARITY (production-grade)
        // Cosine similarity: 1.0 = identical, 0.0 = unrelated
        let bestScore = -1;
        let bestAngle: FaceAngle = 'front';
        for (const { angle, descriptor } of storedAngles) {
            const score = cosineSimilarity(currentFrame.descriptor, descriptor);
            if (score > bestScore) {
                bestScore = score;
                bestAngle = angle;
            }
        }

        const similarity = bestScore;
        const confidence = Math.max(0, Math.min(100, Math.round(similarity * 100)));
        console.log(`🔍 Best match: angle=${bestAngle}, cosine=${similarity.toFixed(4)}, confidence=${confidence}%`);

        // Cosine similarity threshold (0.55 = very strict, 0.45 = lenient)
        const matchThreshold = storedAngles.length >= 2 ? 0.50 : 0.48;
        const minFrames = 6;

        if (similarity < matchThreshold) {
            return { success: false, error: 'الوجه غير مطابق', confidence };
        }

        if (collectedFrames.length < minFrames) {
            return { success: false, error: 'جاري التحقق...', confidence };
        }

        // --- ADVANCED LIVENESS CHECK ---
        if (livenessTracker) {
            const liveness = calculateAdvancedLivenessScore(livenessTracker);

            // Hard-fail on photo: texture score too low
            if (liveness.textureScore < 5 && livenessTracker.textureScores.length >= 5) {
                return {
                    success: false,
                    error: '⚠️ تم اكتشاف صورة - يجب أن يكون وجهك الحقيقي أمام الكاميرا',
                    confidence,
                    livenessScore: liveness.score,
                };
            }

            // Require blink + head turn (or high overall score)
            if (liveness.score < 55) {
                return {
                    success: false,
                    error: liveness.details || 'يرجى الرمش بعينيك وتحريك رأسك قليلاً',
                    confidence,
                    livenessScore: liveness.score,
                };
            }

            // After many frames, blink is mandatory
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
            // Fallback to basic liveness
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
// Cosine Similarity — production-grade matching
// More robust than Euclidean for face embeddings
// ============================================================

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
    let dot = 0, normA = 0, normB = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
}

// ============================================================
// Firestore Biometric Helpers (face-only)
// ============================================================

export async function isBiometricRegisteredInFirestore(
    userId: string,
    type: 'face' | 'face_front' | 'face_left' | 'face_right'
): Promise<boolean> {
    try {
        const snap = await getDoc(doc(db, 'users', userId, 'biometrics', type));
        return snap.exists();
    } catch {
        return false;
    }
}

export async function loadBiometricFromFirestore(
    userId: string,
    type: string
): Promise<Record<string, any> | null> {
    try {
        const snap = await getDoc(doc(db, 'users', userId, 'biometrics', type));
        if (snap.exists()) return snap.data();
    } catch (e) {
        console.error(`Failed to load ${type} from Firestore:`, e);
    }
    return null;
}

export async function checkFaceBiometricRegistered(userId: string): Promise<boolean> {
    // At minimum, front angle must be registered
    return isBiometricRegisteredInFirestore(userId, 'face_front');
}

/**
 * Preload face embeddings from Firestore into localStorage on app start.
 * This ensures isFaceRegistered() works synchronously on any device.
 */
export async function ensureBiometricDataLoaded(userId: string): Promise<void> {
    try {
        const angles: FaceAngle[] = ['front', 'left', 'right'];
        const promises: Promise<void>[] = [];

        for (const angle of angles) {
            const cacheKey = `${FACE_KEY}${userId}_${angle}`;
            if (!localStorage.getItem(cacheKey)) {
                promises.push(
                    loadBiometricFromFirestore(userId, `face_${angle}`).then(fsData => {
                        if (fsData?.descriptor && Array.isArray(fsData.descriptor) && fsData.descriptor.length === 128) {
                            localStorage.setItem(cacheKey, JSON.stringify({
                                descriptor: fsData.descriptor,
                                angle,
                                registeredAt: fsData.registeredAt,
                            }));
                            console.log(`✅ Face ${angle} synced from Firestore to localStorage`);
                        }
                    })
                );
            }
        }

        // Also check legacy face key
        if (!localStorage.getItem(FACE_KEY + userId)) {
            promises.push(
                loadBiometricFromFirestore(userId, 'face').then(fsData => {
                    if (fsData?.descriptor) {
                        localStorage.setItem(FACE_KEY + userId, JSON.stringify({
                            descriptor: fsData.descriptor,
                            registeredAt: fsData.registeredAt,
                            frameCount: fsData.frameCount,
                        }));
                        console.log('✅ Face data synced from Firestore to localStorage');
                    }
                })
            );
        }

        if (promises.length > 0) await Promise.all(promises);
    } catch (e) {
        console.error('Error syncing biometric data from Firestore:', e);
    }
}