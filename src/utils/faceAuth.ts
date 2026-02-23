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
    earBaseline: number;         // Running average EAR for relative blink detection
    earMin: number;              // Minimum EAR observed
    earMax: number;              // Maximum EAR observed
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
        earBaseline: 0,
        earMin: 1,
        earMax: 0,
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

    // Update EAR min/max for variance detection
    if (ear < tracker.earMin) tracker.earMin = ear;
    if (ear > tracker.earMax) tracker.earMax = ear;

    // Compute running baseline EAR (average of all readings)
    const earSum = tracker.earHistory.reduce((a, b) => a + b, 0);
    tracker.earBaseline = earSum / tracker.earHistory.length;

    // BLINK DETECTION — Relative approach (works with any eye size)
    // A blink is detected when EAR drops 25%+ below baseline, then recovers
    const earLen = tracker.earHistory.length;
    if (earLen >= 3 && tracker.earBaseline > 0.05) {
        const prev2 = tracker.earHistory[earLen - 3];
        const prev1 = tracker.earHistory[earLen - 2];
        const curr = tracker.earHistory[earLen - 1];
        const threshold = tracker.earBaseline * 0.75; // 25% drop from baseline
        const recovery = tracker.earBaseline * 0.85; // recovered to 85% of baseline

        // Pattern: open → closed → open (relative to personal baseline)
        if (prev2 > recovery && prev1 < threshold && curr > recovery) {
            tracker.blinkCount++;
            console.log(`👁️ Blink detected! count=${tracker.blinkCount}, EAR: ${prev2.toFixed(3)}→${prev1.toFixed(3)}→${curr.toFixed(3)}, baseline=${tracker.earBaseline.toFixed(3)}`);
        }

        // Also detect blink via significant single-frame EAR drop
        if (prev1 > recovery && curr < threshold && earLen >= 4) {
            // Check if this is a new blink (not the same one being counted)
            const prevPrev = tracker.earHistory[earLen - 4];
            if (prevPrev > recovery) {
                // Will be caught on the next frame when curr recovers
            }
        }
    }

    // Track head yaw for turn detection
    const yaw = estimateHeadYaw(frame.landmarks);
    tracker.headYawHistory.push(yaw);

    if (tracker.headYawHistory.length >= 2) {
        const minYaw = Math.min(...tracker.headYawHistory);
        const maxYaw = Math.max(...tracker.headYawHistory);
        // Lowered from 0.10 to 0.06 for easier detection (about 6-8 degrees)
        if (maxYaw - minYaw > 0.06) {
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
    earVariance: number;
    details: string;
} {
    const frames = tracker.frames;
    if (frames.length < 3) {
        return { score: 0, blinkDetected: false, headTurnDetected: false, textureScore: 0, movementScore: 0, earVariance: 0, details: 'جاري التحقق...' };
    }

    // 1. Movement score (25 points max) — face must move naturally
    let totalMovement = 0;
    for (let i = 1; i < frames.length; i++) {
        const p = frames[i - 1], c = frames[i];
        const dx = (c.box.x + c.box.width / 2) - (p.box.x + p.box.width / 2);
        const dy = (c.box.y + c.box.height / 2) - (p.box.y + p.box.height / 2);
        totalMovement += Math.sqrt(dx * dx + dy * dy);
    }
    const movementScore = Math.min((totalMovement / (frames.length * 2)), 1) * 25;

    // 2. Head turn score (30 points max) — primary liveness indicator
    const headTurnScore = tracker.headTurnDetected ? 30 : 0;

    // 3. Texture score (25 points max) — anti-screen/print spoofing
    const avgTexture = tracker.textureScores.length > 0
        ? tracker.textureScores.reduce((a, b) => a + b, 0) / tracker.textureScores.length
        : 0;
    const textureScore = Math.min((avgTexture / 12), 1) * 25;

    // 4. EAR variance score (20 points max) — eye activity indicator
    // Real eyes have natural micro-movements and blinks that create EAR variance
    // Photos/screens have near-zero variance
    const earVariance = tracker.earMax - tracker.earMin;
    const earVarianceScore = Math.min((earVariance / 0.06), 1) * 20;

    // Blink is a BONUS, not a requirement
    const blinkDetected = tracker.blinkCount >= 1;
    const blinkBonus = blinkDetected ? 10 : 0; // Extra points but not required

    const totalScore = Math.min(Math.round(movementScore + headTurnScore + textureScore + earVarianceScore + blinkBonus), 100);

    let details = '';
    if (totalScore < 20 && frames.length < 5) details = 'جاري التحقق...';
    else if (!tracker.headTurnDetected) details = 'حرّك رأسك يميناً أو يساراً قليلاً';
    else if (avgTexture < 5) details = 'لا يمكن التحقق - يبدو أنك تعرض صورة';
    else if (earVariance < 0.02) details = 'ارمش بعينيك أو حرّك وجهك بشكل طبيعي';
    else details = 'تم التحقق ✅';

    console.log(`🔍 Liveness: score=${totalScore}, move=${movementScore.toFixed(1)}, turn=${headTurnScore}, tex=${textureScore.toFixed(1)}, earVar=${earVarianceScore.toFixed(1)}, blink=${blinkBonus}, earRange=${tracker.earMin.toFixed(3)}-${tracker.earMax.toFixed(3)}`);

    return {
        score: totalScore,
        blinkDetected,
        headTurnDetected: tracker.headTurnDetected,
        textureScore: Math.round(avgTexture),
        movementScore: Math.round(movementScore),
        earVariance: Math.round(earVariance * 1000) / 1000,
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

        onProgress?.(`جاري تسجيل فيديو من ${label}...`, 10);

        // Video-style capture: 12 frames over 3 seconds (250ms apart)
        const totalFrames = 12;
        const frameInterval = 250; // ms
        const descriptors: Float32Array[] = [];
        for (let i = 0; i < totalFrames; i++) {
            const frame = await detectFace(video);
            if (frame) descriptors.push(frame.descriptor);
            const pct = Math.round(10 + (i / totalFrames) * 70);
            onProgress?.(`تسجيل ${i + 1}/${totalFrames} (${label})`, pct);
            await new Promise(r => setTimeout(r, frameInterval));
        }

        if (descriptors.length < 4) {
            return { success: false, error: `لم يتم اكتشاف وجه من ${label}. تأكد من الإضاءة والمسافة.` };
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

        // Cosine similarity threshold (lowered for easier real-world matching)
        const matchThreshold = storedAngles.length >= 2 ? 0.40 : 0.38;
        const minFrames = 4;

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

            // Require reasonable liveness score (movement + head turn + texture + EAR variance)
            // Blink is a BONUS, not required
            if (liveness.score < 30) {
                return {
                    success: false,
                    error: liveness.details || 'حرّك رأسك قليلاً للتحقق من هويتك',
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
// Scanning Beam Animation — premium face scan effect
// ============================================================

let scanBeamPhase = 0;

/**
 * Draw an animated scanning beam over the face region.
 * Call this each frame (every ~30ms via requestAnimationFrame or interval).
 * The beam sweeps up and down across the face bounding box.
 */
export function drawScanBeam(
    canvas: HTMLCanvasElement,
    video: HTMLVideoElement,
    frame: FaceScanFrame | null,
    status?: 'scanning' | 'success' | 'fail'
) {
    const ctx = canvas.getContext('2d');
    if (!ctx || !frame) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const { box } = frame;
    const beamColor = status === 'success' ? '#10b981'
        : status === 'fail' ? '#f43f5e'
            : '#6366f1';

    // Beam position oscillates up/down within the face box
    scanBeamPhase += 0.03;
    const t = (Math.sin(scanBeamPhase) + 1) / 2; // 0..1
    const beamY = box.y + t * box.height;
    const beamHeight = 4;

    // Draw the horizontal gradient beam
    const gradient = ctx.createLinearGradient(box.x - 20, beamY, box.x + box.width + 20, beamY);
    gradient.addColorStop(0, 'transparent');
    gradient.addColorStop(0.2, `${beamColor}99`);
    gradient.addColorStop(0.5, `${beamColor}ff`);
    gradient.addColorStop(0.8, `${beamColor}99`);
    gradient.addColorStop(1, 'transparent');

    ctx.fillStyle = gradient;
    ctx.fillRect(box.x - 20, beamY - beamHeight / 2, box.width + 40, beamHeight);

    // Glow effect around beam
    const glowGradient = ctx.createLinearGradient(box.x, beamY - 20, box.x, beamY + 20);
    glowGradient.addColorStop(0, 'transparent');
    glowGradient.addColorStop(0.5, `${beamColor}20`);
    glowGradient.addColorStop(1, 'transparent');
    ctx.fillStyle = glowGradient;
    ctx.fillRect(box.x - 10, beamY - 20, box.width + 20, 40);
}

/**
 * Combined face overlay with scanning beam — single call for verification UI.
 */
export function drawFaceOverlayWithBeam(
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
            : '#6366f1';

    // Draw corner brackets
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.setLineDash([]);
    const cornerLen = 24;
    const bx = box.x, by = box.y, bw = box.width, bh = box.height;

    ctx.beginPath();
    ctx.moveTo(bx, by + cornerLen); ctx.lineTo(bx, by); ctx.lineTo(bx + cornerLen, by);
    ctx.moveTo(bx + bw - cornerLen, by); ctx.lineTo(bx + bw, by); ctx.lineTo(bx + bw, by + cornerLen);
    ctx.moveTo(bx + bw, by + bh - cornerLen); ctx.lineTo(bx + bw, by + bh); ctx.lineTo(bx + bw - cornerLen, by + bh);
    ctx.moveTo(bx + cornerLen, by + bh); ctx.lineTo(bx, by + bh); ctx.lineTo(bx, by + bh - cornerLen);
    ctx.stroke();

    // Draw facial landmarks (small dots)
    ctx.fillStyle = `${color}88`;
    const positions = landmarks.positions;
    for (let i = 0; i < positions.length; i++) {
        const pt = positions[i];
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 1.2, 0, Math.PI * 2);
        ctx.fill();
    }

    // Scanning beam animation (only during scanning)
    if (status === 'scanning') {
        scanBeamPhase += 0.04;
        const t = (Math.sin(scanBeamPhase) + 1) / 2;
        const beamY = by + t * bh;
        const beamHeight = 3;

        const gradient = ctx.createLinearGradient(bx - 15, beamY, bx + bw + 15, beamY);
        gradient.addColorStop(0, 'transparent');
        gradient.addColorStop(0.15, `${color}66`);
        gradient.addColorStop(0.5, `${color}cc`);
        gradient.addColorStop(0.85, `${color}66`);
        gradient.addColorStop(1, 'transparent');
        ctx.fillStyle = gradient;
        ctx.fillRect(bx - 15, beamY - beamHeight / 2, bw + 30, beamHeight);

        // Glow
        const glow = ctx.createLinearGradient(bx, beamY - 16, bx, beamY + 16);
        glow.addColorStop(0, 'transparent');
        glow.addColorStop(0.5, `${color}15`);
        glow.addColorStop(1, 'transparent');
        ctx.fillStyle = glow;
        ctx.fillRect(bx, beamY - 16, bw, 32);
    }

    // Confidence text
    if (matchConfidence !== undefined) {
        const confText = `${Math.round(matchConfidence)}%`;
        ctx.font = 'bold 16px sans-serif';
        ctx.fillStyle = color;
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 3;
        ctx.strokeText(confText, bx, by - 8);
        ctx.fillText(confText, bx, by - 8);
    }

    // Detection score
    ctx.font = '10px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText(`Detection: ${(score * 100).toFixed(0)}%`, bx, by + bh + 14);
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