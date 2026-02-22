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

        // Store
        localStorage.setItem(FACE_KEY + userId, JSON.stringify({
            descriptor: Array.from(avgDescriptor),
            photo,
            registeredAt: new Date().toISOString(),
            frameCount: descriptors.length,
        }));

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
