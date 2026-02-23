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
// Anti-Spoofing Challenge System
// ============================================================

export type ChallengeDirection = 'right' | 'left' | 'up' | 'down';

export interface ChallengeStep {
    direction: ChallengeDirection;
    label: string;
    icon: string;
    completed: boolean;
    startedAt?: number;
}

const DIRECTION_LABELS: Record<ChallengeDirection, { label: string; icon: string }> = {
    right: { label: 'لف رأسك لليمين', icon: '→' },
    left: { label: 'لف رأسك لليسار', icon: '←' },
    up: { label: 'ارفع رأسك لفوق', icon: '↑' },
    down: { label: 'نزّل رأسك لجوه', icon: '↓' },
};

export function generateRandomChallenge(stepCount: number = 3): ChallengeStep[] {
    const directions: ChallengeDirection[] = ['right', 'left', 'up', 'down'];
    const shuffled = [...directions].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, stepCount);
    return selected.map(dir => ({
        direction: dir,
        label: DIRECTION_LABELS[dir].label,
        icon: DIRECTION_LABELS[dir].icon,
        completed: false,
    }));
}

// ============================================================
// Session Nonce — prevents replay attacks
// ============================================================

export interface VerificationSession {
    nonce: string;
    createdAt: number;
    expiresAt: number;
    used: boolean;
}

const activeSessions = new Map<string, VerificationSession>();

export function createVerificationSession(): VerificationSession {
    const nonce = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const session: VerificationSession = {
        nonce,
        createdAt: Date.now(),
        expiresAt: Date.now() + 20_000, // 20 seconds
        used: false,
    };
    activeSessions.set(nonce, session);
    // Auto-cleanup expired sessions
    setTimeout(() => activeSessions.delete(nonce), 25_000);
    return session;
}

export function validateSession(nonce: string): boolean {
    const session = activeSessions.get(nonce);
    if (!session) return false;
    if (session.used) return false;
    if (Date.now() > session.expiresAt) {
        activeSessions.delete(nonce);
        return false;
    }
    session.used = true;
    return true;
}

// ============================================================
// Liveness State Tracker — with Anti-Spoofing
// ============================================================

export interface LivenessTracker {
    frames: FaceScanFrame[];
    earHistory: number[];        // Eye Aspect Ratio history for blink detection
    blinkCount: number;
    headYawHistory: number[];    // Horizontal head yaw history
    headPitchHistory: number[];  // Vertical head pitch history
    headTurnDetected: boolean;
    textureScores: number[];     // Pixel variance scores
    startTime: number;
    earBaseline: number;
    earMin: number;
    earMax: number;
    // Anti-spoofing challenge
    challenge: ChallengeStep[];
    challengeIndex: number;      // Current challenge step
    challengeStartTime: number;  // When current step started
    challengeCompleted: boolean; // All steps done
    // Screen spoof detection
    brightnessHistory: number[]; // Brightness per frame for flicker detection
    moireScores: number[];       // High-freq artifact scores
    spoofScore: number;          // 0-100, higher = more likely spoof
    // Movement continuity
    faceSizeHistory: number[];   // Track face bounding box size changes
    positionJumps: number;       // Count of sudden position jumps
    // Session
    session: VerificationSession;
}

export function createLivenessTracker(): LivenessTracker {
    return {
        frames: [],
        earHistory: [],
        blinkCount: 0,
        headYawHistory: [],
        headPitchHistory: [],
        headTurnDetected: false,
        textureScores: [],
        startTime: Date.now(),
        earBaseline: 0,
        earMin: 1,
        earMax: 0,
        challenge: generateRandomChallenge(3),
        challengeIndex: 0,
        challengeStartTime: Date.now(),
        challengeCompleted: false,
        brightnessHistory: [],
        moireScores: [],
        spoofScore: 0,
        faceSizeHistory: [],
        positionJumps: 0,
        session: createVerificationSession(),
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
// Head Yaw & Pitch Estimation
// ============================================================

// Estimate head yaw from landmarks (horizontal head turn)
function estimateHeadYaw(landmarks: faceapi.FaceLandmarks68): number {
    const pts = landmarks.positions;
    const noseTip = pts[30];
    const leftEdge = pts[0];
    const rightEdge = pts[16];
    const leftDist = euclideanDist2D(noseTip, leftEdge);
    const rightDist = euclideanDist2D(noseTip, rightEdge);
    return leftDist / (leftDist + rightDist + 1e-6);
}

// Estimate head pitch from landmarks (vertical head tilt)
function estimateHeadPitch(landmarks: faceapi.FaceLandmarks68): number {
    const pts = landmarks.positions;
    const noseTip = pts[30];
    const chin = pts[8];
    const forehead = pts[27]; // top of nose bridge
    const upDist = euclideanDist2D(noseTip, forehead);
    const downDist = euclideanDist2D(noseTip, chin);
    return upDist / (upDist + downDist + 1e-6);
}

// ============================================================
// Face Texture Analysis — detect printed/screen faces
// ============================================================

function computeFaceTextureScore(video: HTMLVideoElement, frame: FaceScanFrame): number {
    try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return 0;
        const { x, y, width, height } = frame.box;
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(video, x, y, width, height, 0, 0, width, height);
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        let sum = 0, sumSq = 0, count = 0;
        for (let i = 0; i < data.length; i += 4) {
            const gray = (data[i] + data[i + 1] + data[i + 2]) / 3;
            sum += gray;
            sumSq += gray * gray;
            count++;
        }
        if (count === 0) return 0;
        const mean = sum / count;
        const variance = (sumSq / count) - (mean * mean);
        return Math.sqrt(Math.max(variance, 0));
    } catch {
        return 0;
    }
}

// ============================================================
// Screen Spoof Detection — Moiré + Flicker + Color Uniformity
// ============================================================

function detectScreenSpoof(video: HTMLVideoElement, frame: FaceScanFrame): {
    moireScore: number;
    brightness: number;
    colorUniformity: number;
} {
    try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return { moireScore: 0, brightness: 128, colorUniformity: 0 };

        const { x, y, width, height } = frame.box;
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(video, x, y, width, height, 0, 0, width, height);
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;

        // 1. Moiré detection: high-frequency edge patterns
        let highFreqCount = 0;
        for (let row = 0; row < height; row++) {
            let prevGray = 0;
            let transitions = 0;
            for (let col = 0; col < width; col++) {
                const idx = (row * width + col) * 4;
                const gray = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
                if (col > 0 && Math.abs(gray - prevGray) > 15) transitions++;
                prevGray = gray;
            }
            if (transitions > width * 0.35) highFreqCount++;
        }
        const moireScore = Math.min(highFreqCount / (height * 0.5), 1);

        // 2. Average brightness
        let brightnessSum = 0;
        const pixelCount = width * height;
        for (let i = 0; i < data.length; i += 4) {
            brightnessSum += (data[i] + data[i + 1] + data[i + 2]) / 3;
        }
        const brightness = brightnessSum / pixelCount;

        // 3. Color uniformity — screens have very even backlight
        const quadrants: number[] = [0, 0, 0, 0];
        const quadCounts: number[] = [0, 0, 0, 0];
        const halfW = Math.floor(width / 2);
        const halfH = Math.floor(height / 2);
        for (let row = 0; row < height; row++) {
            for (let col = 0; col < width; col++) {
                const idx = (row * width + col) * 4;
                const gray = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
                const qi = (row < halfH ? 0 : 2) + (col < halfW ? 0 : 1);
                quadrants[qi] += gray;
                quadCounts[qi]++;
            }
        }
        const quadAvgs = quadrants.map((s, i) => s / (quadCounts[i] || 1));
        const maxDiff = Math.max(...quadAvgs) - Math.min(...quadAvgs);
        const colorUniformity = 1 - Math.min(maxDiff / 20, 1);

        return { moireScore, brightness, colorUniformity };
    } catch {
        return { moireScore: 0, brightness: 128, colorUniformity: 0 };
    }
}

// ============================================================
// Movement Continuity — detect photo switching / unnatural jumps
// ============================================================

function checkMovementContinuity(tracker: LivenessTracker, frame: FaceScanFrame): {
    isSmooth: boolean;
    sizeJump: boolean;
} {
    const frames = tracker.frames;
    if (frames.length < 2) return { isSmooth: true, sizeJump: false };

    const prev = frames[frames.length - 1];
    const prevCX = prev.box.x + prev.box.width / 2;
    const prevCY = prev.box.y + prev.box.height / 2;
    const currCX = frame.box.x + frame.box.width / 2;
    const currCY = frame.box.y + frame.box.height / 2;

    const dist = Math.sqrt((currCX - prevCX) ** 2 + (currCY - prevCY) ** 2);
    const normalizedDist = dist / (frame.box.width || 1);
    const isSmooth = normalizedDist < 0.6;

    const prevSize = prev.box.width * prev.box.height;
    const currSize = frame.box.width * frame.box.height;
    const sizeRatio = Math.max(prevSize, currSize) / (Math.min(prevSize, currSize) || 1);
    const sizeJump = sizeRatio > 1.35;

    return { isSmooth, sizeJump };
}

// ============================================================
// Challenge Direction Detection
// ============================================================

function detectChallengeDirection(
    landmarks: faceapi.FaceLandmarks68,
    requiredDir: ChallengeDirection
): boolean {
    const yaw = estimateHeadYaw(landmarks);
    const pitch = estimateHeadPitch(landmarks);
    const yawThreshold = 0.06;
    const pitchThreshold = 0.05;

    switch (requiredDir) {
        case 'right': return yaw < (0.5 - yawThreshold);
        case 'left': return yaw > (0.5 + yawThreshold);
        case 'up': return pitch < (0.5 - pitchThreshold);
        case 'down': return pitch > (0.5 + pitchThreshold);
        default: return false;
    }
}

// ============================================================
// Update Liveness Tracker — called every frame during verification
// ============================================================

export function updateLivenessTracker(tracker: LivenessTracker, frame: FaceScanFrame, video: HTMLVideoElement): void {
    // --- Movement Continuity Check ---
    const continuity = checkMovementContinuity(tracker, frame);
    if (!continuity.isSmooth) tracker.positionJumps++;
    if (continuity.sizeJump) tracker.positionJumps++;

    tracker.frames.push(frame);
    tracker.faceSizeHistory.push(frame.box.width * frame.box.height);

    // --- EAR tracking (blink detection) ---
    const ear = computeEAR(frame.landmarks);
    tracker.earHistory.push(ear);
    if (ear < tracker.earMin) tracker.earMin = ear;
    if (ear > tracker.earMax) tracker.earMax = ear;
    const earSum = tracker.earHistory.reduce((a, b) => a + b, 0);
    tracker.earBaseline = earSum / tracker.earHistory.length;

    const earLen = tracker.earHistory.length;
    if (earLen >= 3 && tracker.earBaseline > 0.05) {
        const prev2 = tracker.earHistory[earLen - 3];
        const prev1 = tracker.earHistory[earLen - 2];
        const curr = tracker.earHistory[earLen - 1];
        const threshold = tracker.earBaseline * 0.75;
        const recovery = tracker.earBaseline * 0.85;
        if (prev2 > recovery && prev1 < threshold && curr > recovery) {
            tracker.blinkCount++;
            console.log(`👁️ Blink detected! count=${tracker.blinkCount}`);
        }
    }

    // --- Head yaw + pitch tracking ---
    const yaw = estimateHeadYaw(frame.landmarks);
    const pitch = estimateHeadPitch(frame.landmarks);
    tracker.headYawHistory.push(yaw);
    tracker.headPitchHistory.push(pitch);

    if (tracker.headYawHistory.length >= 2) {
        const minYaw = Math.min(...tracker.headYawHistory);
        const maxYaw = Math.max(...tracker.headYawHistory);
        if (maxYaw - minYaw > 0.06) tracker.headTurnDetected = true;
    }

    // --- Screen Spoof Detection ---
    const spoof = detectScreenSpoof(video, frame);
    tracker.brightnessHistory.push(spoof.brightness);
    tracker.moireScores.push(spoof.moireScore);

    // Flicker detection: brightness oscillation between frames
    if (tracker.brightnessHistory.length >= 4) {
        const recent = tracker.brightnessHistory.slice(-6);
        let flickerCount = 0;
        for (let i = 2; i < recent.length; i++) {
            const diff1 = recent[i] - recent[i - 1];
            const diff2 = recent[i - 1] - recent[i - 2];
            if (diff1 * diff2 < 0 && Math.abs(diff1) > 3) flickerCount++;
        }
        // Screen refresh causes rapid brightness oscillation
        const flickerRatio = flickerCount / Math.max(recent.length - 2, 1);
        const avgMoire = tracker.moireScores.reduce((a, b) => a + b, 0) / tracker.moireScores.length;
        const spoofScore = Math.min(Math.round(
            (avgMoire * 40) + (flickerRatio * 30) + (spoof.colorUniformity * 30)
        ), 100);
        tracker.spoofScore = spoofScore;
    }

    // --- Texture score ---
    const textureScore = computeFaceTextureScore(video, frame);
    tracker.textureScores.push(textureScore);

    // --- Challenge Direction Detection ---
    if (!tracker.challengeCompleted && tracker.challengeIndex < tracker.challenge.length) {
        const currentStep = tracker.challenge[tracker.challengeIndex];
        if (!currentStep.startedAt) {
            currentStep.startedAt = Date.now();
        }

        const isInPosition = detectChallengeDirection(frame.landmarks, currentStep.direction);
        if (isInPosition) {
            currentStep.completed = true;
            console.log(`🎯 Challenge step ${tracker.challengeIndex + 1}/${tracker.challenge.length} completed: ${currentStep.direction}`);
            tracker.challengeIndex++;
            if (tracker.challengeIndex >= tracker.challenge.length) {
                tracker.challengeCompleted = true;
                console.log(`✅ All challenge steps completed!`);
            }
        }

        // Timeout per step: 4 seconds
        if (currentStep.startedAt && Date.now() - currentStep.startedAt > 4000 && !currentStep.completed) {
            // Reset the timer (give more time)
            currentStep.startedAt = Date.now();
        }
    }
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
    challengeProgress: number; // 0-100
    spoofScore: number;
    continuityOk: boolean;
    details: string;
} {
    const frames = tracker.frames;
    const empty = { score: 0, blinkDetected: false, headTurnDetected: false, textureScore: 0, movementScore: 0, earVariance: 0, challengeProgress: 0, spoofScore: 0, continuityOk: true, details: 'جاري التحقق...' };
    if (frames.length < 3) return empty;

    // --- ANTI-SPOOFING CHECKS ---

    // 1. Challenge compliance (35 points max) — primary anti-spoof
    const challengeProgress = (tracker.challengeIndex / tracker.challenge.length) * 100;
    const challengeScore = tracker.challengeCompleted ? 35 : (tracker.challengeIndex / tracker.challenge.length) * 25;

    // 2. Screen spoof detection (25 points max) — moiré + flicker + uniformity
    const spoofPenalty = Math.min(tracker.spoofScore / 100, 1);
    const antiSpoofScore = (1 - spoofPenalty) * 25; // Low spoof = high score

    // 3. Movement continuity (20 points max) — smooth = real, jumps = fake
    const jumpPenalty = Math.min(tracker.positionJumps / 5, 1);
    const continuityScore = (1 - jumpPenalty) * 20;
    const continuityOk = tracker.positionJumps < 3;

    // 4. Texture + EAR variance (20 points max combined)
    const avgTexture = tracker.textureScores.length > 0
        ? tracker.textureScores.reduce((a, b) => a + b, 0) / tracker.textureScores.length
        : 0;
    const texturePoints = Math.min((avgTexture / 12), 1) * 10;
    const earVariance = tracker.earMax - tracker.earMin;
    const earPoints = Math.min((earVariance / 0.06), 1) * 10;

    const blinkDetected = tracker.blinkCount >= 1;
    const blinkBonus = blinkDetected ? 5 : 0;

    const totalScore = Math.min(Math.round(
        challengeScore + antiSpoofScore + continuityScore + texturePoints + earPoints + blinkBonus
    ), 100);

    // Generate user-facing details
    let details = '';
    if (tracker.spoofScore > 60) {
        details = '⚠️ تم كشف شاشة — استخدم وجهك الحقيقي';
    } else if (!continuityOk) {
        details = '⚠️ حركة غير طبيعية — لا تغيّر الصورة';
    } else if (!tracker.challengeCompleted) {
        const currentStep = tracker.challenge[tracker.challengeIndex];
        if (currentStep) {
            details = `${currentStep.icon} ${currentStep.label}`;
        } else {
            details = 'اتبع التعليمات...';
        }
    } else if (totalScore < 50) {
        details = 'جاري إتمام التحقق...';
    } else {
        details = 'تم التحقق ✅';
    }

    console.log(`🛡️ AntiSpoof: score=${totalScore}, challenge=${challengeScore.toFixed(0)}/35, spoof=${antiSpoofScore.toFixed(0)}/25(raw:${tracker.spoofScore}), cont=${continuityScore.toFixed(0)}/20(jumps:${tracker.positionJumps}), tex=${texturePoints.toFixed(0)}, ear=${earPoints.toFixed(0)}, blink=${blinkBonus}`);

    return {
        score: totalScore,
        blinkDetected,
        headTurnDetected: tracker.headTurnDetected,
        textureScore: Math.round(avgTexture),
        movementScore: Math.round(continuityScore),
        earVariance: Math.round(earVariance * 1000) / 1000,
        challengeProgress,
        spoofScore: tracker.spoofScore,
        continuityOk,
        details,
    };
}

// ============================================================
// Multi-Angle Face Registration System
// ============================================================

export type FaceAngle = 'front' | 'left' | 'right' | 'up' | 'down';

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
            up: 'أعلى',
            down: 'أسفل',
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
    const angles: FaceAngle[] = ['front', 'right', 'left', 'up', 'down'];
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

        // --- ADVANCED ANTI-SPOOFING LIVENESS CHECK ---
        if (livenessTracker) {
            const liveness = calculateAdvancedLivenessScore(livenessTracker);

            // HARD FAIL: Screen spoof detected
            if (liveness.spoofScore > 60 && livenessTracker.frames.length >= 6) {
                return {
                    success: false,
                    error: '⚠️ تم كشف شاشة — يجب أن يكون وجهك الحقيقي أمام الكاميرا',
                    confidence,
                    livenessScore: liveness.score,
                };
            }

            // HARD FAIL: Too many position jumps (photo switching)
            if (!liveness.continuityOk && livenessTracker.frames.length >= 6) {
                return {
                    success: false,
                    error: '⚠️ حركة غير طبيعية — لا تغيّر الصورة المعروضة',
                    confidence,
                    livenessScore: liveness.score,
                };
            }

            // Challenge not completed yet
            if (!livenessTracker.challengeCompleted) {
                return {
                    success: false,
                    error: liveness.details || 'اتبع تعليمات التحقق',
                    confidence,
                    livenessScore: liveness.score,
                };
            }

            // Session nonce validation
            if (!validateSession(livenessTracker.session.nonce)) {
                return {
                    success: false,
                    error: 'انتهت جلسة التحقق — حاول مرة أخرى',
                    confidence,
                    livenessScore: 0,
                };
            }

            // All anti-spoofing checks passed + challenge completed
            // Require minimum combined score of 50
            if (liveness.score < 50) {
                return {
                    success: false,
                    error: liveness.details || 'حرّك وجهك بشكل طبيعي',
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
        const angles: FaceAngle[] = ['front', 'right', 'left', 'up', 'down'];
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