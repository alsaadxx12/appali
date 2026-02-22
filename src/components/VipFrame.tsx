import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';

interface Props {
    level: string;
    size?: number;
    children: React.ReactNode;
}

interface FrameItem {
    id: string;
    name: string;
    imageUrl: string;
    dateAdded: string;
}

interface VipLevelData {
    id: string;
    label: string;
    emoji: string;
    color: string;
    minPoints: number;
}

const LEVEL_CONFIG: Record<string, {
    colors: string[];
    glow: string;
    label: string;
    crown: string;
}> = {
    none: { colors: ['transparent', 'transparent'], glow: 'none', label: '', crown: '' },
    bronze: {
        colors: ['#cd7f32', '#a0522d', '#daa520', '#8b6914', '#cd7f32'],
        glow: '0 0 8px rgba(205,127,50,0.4), 0 0 16px rgba(205,127,50,0.2)',
        label: 'برونزي',
        crown: '🥉',
    },
    silver: {
        colors: ['#e8e8e8', '#b0b0b0', '#d4d4d4', '#9a9a9a', '#c0c0c0', '#e8e8e8'],
        glow: '0 0 10px rgba(192,192,192,0.4), 0 0 20px rgba(192,192,192,0.2)',
        label: 'فضي',
        crown: '🥈',
    },
    gold: {
        colors: ['#ffd700', '#ff8c00', '#ffb347', '#daa520', '#ffd700', '#ff6b00', '#ffd700'],
        glow: '0 0 12px rgba(255,215,0,0.5), 0 0 24px rgba(255,140,0,0.3), 0 0 36px rgba(255,215,0,0.15)',
        label: 'ذهبي',
        crown: '👑',
    },
    diamond: {
        colors: ['#b9f2ff', '#e0c3fc', '#8ec5fc', '#a0e7e5', '#d4b5ff', '#b9f2ff'],
        glow: '0 0 14px rgba(185,242,255,0.5), 0 0 28px rgba(142,197,252,0.3), 0 0 42px rgba(224,195,252,0.2)',
        label: 'ألماسي',
        crown: '💎',
    },
};

interface FrameAdjustment {
    scale: number;
    offsetX: number;
    offsetY: number;
    avatarScale: number;
}

const DEFAULT_ADJUSTMENT: FrameAdjustment = { scale: 1.2, offsetX: 0, offsetY: 0, avatarScale: 0.75 };

// Cache for VIP levels loaded from Firestore
let cachedVipLevels: VipLevelData[] | null = null;
let cachedDefaultLevel: string | null = null;
let cachedFrameData: {
    images: Record<string, string | null>;
    adjustments: Record<string, FrameAdjustment>;
    vipLevels: VipLevelData[];
} | null = null;

// Cache key for localStorage persistence
const FRAME_CACHE_KEY = 'vipFrameCache';

function loadPersistentCache(): typeof cachedFrameData {
    try {
        const raw = localStorage.getItem(FRAME_CACHE_KEY);
        if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return null;
}

function savePersistentCache(data: typeof cachedFrameData) {
    try {
        if (data) localStorage.setItem(FRAME_CACHE_KEY, JSON.stringify(data));
    } catch { /* ignore */ }
}

// Initialize memory cache from localStorage on module load (synchronous, instant)
if (!cachedFrameData) {
    cachedFrameData = loadPersistentCache();
    if (cachedFrameData?.vipLevels) cachedVipLevels = cachedFrameData.vipLevels;
}

// Export cache invalidation for when settings are saved
export function invalidateFrameCache() {
    cachedFrameData = null;
    try { localStorage.removeItem(FRAME_CACHE_KEY); } catch { /* ignore */ }
}

function useFrameData(): {
    images: Record<string, string | null>;
    adjustments: Record<string, FrameAdjustment>;
    vipLevels: VipLevelData[];
} {
    const [images, setImages] = useState<Record<string, string | null>>(cachedFrameData?.images || {});
    const [adjustments, setAdjustments] = useState<Record<string, FrameAdjustment>>(cachedFrameData?.adjustments || {});
    const [vipLevels, setVipLevels] = useState<VipLevelData[]>(cachedFrameData?.vipLevels || cachedVipLevels || []);

    const processData = (frames: FrameItem[], levelFrames: Record<string, string>, adj: Record<string, FrameAdjustment>) => {
        const map: Record<string, string | null> = {};
        Object.entries(levelFrames).forEach(([level, frameId]) => {
            const frame = frames.find(f => f.id === frameId);
            map[level] = frame?.imageUrl || null;
        });
        setImages(map);
        setAdjustments(adj || {});
    };

    useEffect(() => {
        // If we have cached data, still refresh from Firestore in background
        const hasCache = !!cachedFrameData && Object.keys(cachedFrameData.images).length > 0;

        const load = async () => {
            try {
                // Load VIP levels
                const vipSnap = await getDoc(doc(db, 'settings', 'vip'));
                if (vipSnap.exists()) {
                    const data = vipSnap.data();
                    if (data.levels) {
                        const levels = data.levels as VipLevelData[];
                        setVipLevels(levels);
                        cachedVipLevels = levels;
                    }
                    if (data.defaultLevel && data.defaultLevel !== 'none') {
                        cachedDefaultLevel = data.defaultLevel;
                    }
                }

                // Load frame settings
                const snap = await getDoc(doc(db, 'settings', 'frames'));
                if (snap.exists()) {
                    const data = snap.data();
                    processData(
                        data.frames || [],
                        data.levelFrames || {},
                        data.adjustments || {}
                    );
                    return;
                }
            } catch (e) {
                console.error('Error loading frames from Firestore:', e);
                // If we have cache, that's fine — we'll use it
                if (hasCache) return;
            }

            // Fallback to localStorage only if no Firestore data and no cache
            if (!hasCache) {
                try {
                    const framesJson = localStorage.getItem('vipFrames');
                    const levelFramesJson = localStorage.getItem('vipLevelFrames');
                    const adjJson = localStorage.getItem('vipFrameAdjustments');
                    if (framesJson && levelFramesJson) {
                        processData(
                            JSON.parse(framesJson),
                            JSON.parse(levelFramesJson),
                            adjJson ? JSON.parse(adjJson) : {}
                        );
                    }
                } catch { /* ignore */ }
            }
        };
        load();
    }, []);

    // Update both memory + persistent cache
    useEffect(() => {
        if (Object.keys(images).length > 0 || vipLevels.length > 0) {
            const newCache = { images, adjustments, vipLevels };
            cachedFrameData = newCache;
            savePersistentCache(newCache);
        }
    }, [images, adjustments, vipLevels]);

    return { images, adjustments, vipLevels };
}

// Determine VIP level from points - uses Firestore levels first, then hardcoded fallback
export function getVipLevel(points: number): string {
    // Try dynamic levels from cache
    if (cachedVipLevels && cachedVipLevels.length > 0) {
        const sorted = [...cachedVipLevels].sort((a, b) => b.minPoints - a.minPoints);
        for (const level of sorted) {
            if (points >= level.minPoints) {
                return level.id;
            }
        }
        // No level matched by points — use default permanent level
        if (cachedDefaultLevel) {
            return cachedDefaultLevel;
        }
        return 'none';
    }

    // Hardcoded fallback
    if (points >= 1000) return 'diamond';
    if (points >= 600) return 'gold';
    if (points >= 300) return 'silver';
    if (points >= 100) return 'bronze';
    // Use default permanent level if set
    if (cachedDefaultLevel) {
        return cachedDefaultLevel;
    }
    return 'none';
}

export function getVipLabel(level: string): string {
    // Try dynamic levels first
    if (cachedVipLevels) {
        const found = cachedVipLevels.find(l => l.id === level);
        if (found) return found.label;
    }
    return LEVEL_CONFIG[level]?.label || '';
}

export function getVipColor(level: string): string {
    // Try dynamic levels first
    if (cachedVipLevels) {
        const found = cachedVipLevels.find(l => l.id === level);
        if (found) return found.color;
    }
    const config = LEVEL_CONFIG[level];
    if (!config || level === 'none') return 'var(--text-muted)';
    return config.colors[0];
}

function getLevelConfig(level: string, vipLevels: VipLevelData[]) {
    // Try hardcoded config first
    if (LEVEL_CONFIG[level]) return LEVEL_CONFIG[level];

    // Generate config from dynamic level data
    const dynamicLevel = vipLevels.find(l => l.id === level);
    if (dynamicLevel) {
        const c = dynamicLevel.color;
        // Create a gradient set from the single color
        const darken = (hex: string, factor: number) => {
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            return `#${Math.round(r * factor).toString(16).padStart(2, '0')}${Math.round(g * factor).toString(16).padStart(2, '0')}${Math.round(b * factor).toString(16).padStart(2, '0')}`;
        };
        return {
            colors: [c, darken(c, 0.7), darken(c, 0.85), darken(c, 0.6), c],
            glow: `0 0 10px ${c}60, 0 0 20px ${c}30`,
            label: dynamicLevel.label,
            crown: dynamicLevel.emoji,
        };
    }

    return LEVEL_CONFIG.none;
}

export default function VipFrame({ level, size = 56, children }: Props) {
    const { images: frameImages, adjustments: frameAdjustments, vipLevels } = useFrameData();

    if (level === 'none' || !level) {
        return <div style={{ width: size, height: size, flexShrink: 0 }}>{children}</div>;
    }

    const config = getLevelConfig(level, vipLevels);
    const frameImage = frameImages[level];
    const adj = frameAdjustments[level] || DEFAULT_ADJUSTMENT;

    // Determine intensity tier for CSS effects
    const sorted = [...vipLevels].sort((a, b) => a.minPoints - b.minPoints);
    const levelIndex = sorted.findIndex(l => l.id === level);
    const tier = vipLevels.length > 0
        ? (levelIndex >= sorted.length - 1 ? 'top' : levelIndex >= sorted.length - 2 ? 'high' : levelIndex >= 1 ? 'mid' : 'low')
        : (level === 'diamond' ? 'top' : level === 'gold' ? 'high' : level === 'silver' ? 'mid' : 'low');

    // === IMAGE-BASED FRAME ===
    if (frameImage) {
        const frameSize = size * adj.scale;
        const avatarSize = size * adj.avatarScale;
        const containerSize = Math.max(frameSize, size) + 8;
        return (
            <div style={{
                width: containerSize, height: containerSize,
                flexShrink: 0, position: 'relative',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
                {/* Frame image overlay */}
                <img
                    src={frameImage}
                    alt={`${level} frame`}
                    style={{
                        position: 'absolute',
                        width: frameSize, height: frameSize,
                        top: '50%', left: '50%',
                        transform: `translate(-50%, -50%) translate(${adj.offsetX}px, ${adj.offsetY}px)`,
                        objectFit: 'contain',
                        zIndex: 3,
                        pointerEvents: 'none',
                    }}
                />

                {/* Photo circle behind frame */}
                <div style={{
                    width: avatarSize, height: avatarSize,
                    borderRadius: '50%',
                    overflow: 'hidden',
                    zIndex: 1,
                }}>
                    {children}
                </div>

                {/* Level badge */}
                <div style={{
                    position: 'absolute',
                    bottom: -3, left: '50%', transform: 'translateX(-50%)',
                    padding: '1px 8px', borderRadius: 'var(--radius-full)',
                    background: `linear-gradient(135deg, ${config.colors[0]}, ${config.colors[1]})`,
                    fontSize: 7, fontWeight: 900, color: '#1a1a2e',
                    zIndex: 5, whiteSpace: 'nowrap',
                    boxShadow: `0 2px 6px ${config.colors[0]}50`,
                    border: `1px solid ${config.colors[0]}60`,
                }}>
                    {config.label}
                </div>
            </div>
        );
    }

    // === CSS FALLBACK FRAME (when no image is assigned) ===
    const frameOuterSize = size + (tier === 'top' ? 20 : tier === 'high' ? 18 : 14);
    const primary = config.colors[0];
    const secondary = config.colors[1];
    const tertiary = config.colors[2] || config.colors[0];

    return (
        <div style={{
            width: frameOuterSize, height: frameOuterSize + 6, flexShrink: 0,
            position: 'relative',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
            {/* Crown on top */}
            <div style={{
                position: 'absolute',
                top: tier === 'top' ? -6 : tier === 'high' ? -4 : -2,
                left: '50%', transform: 'translateX(-50%)',
                fontSize: Math.max(14, 16 * (size / 56)),
                zIndex: 10,
                filter: `drop-shadow(0 2px 4px ${primary}80)`,
                animation: (tier === 'top' || tier === 'high')
                    ? 'vipCrownFloat 2s ease-in-out infinite' : undefined,
            }}>
                {config.crown}
            </div>

            {/* Outer rotating ring */}
            <div style={{
                position: 'absolute', inset: 0, borderRadius: '50%',
                background: `conic-gradient(from 0deg, ${config.colors.join(', ')})`,
                boxShadow: config.glow,
                animation: tier === 'top' ? 'vipRotate 3s linear infinite'
                    : tier === 'high' ? 'vipRotate 4s linear infinite'
                        : tier === 'mid' ? 'vipRotate 6s linear infinite'
                            : 'vipRotate 8s linear infinite',
            }} />

            {/* Dashed dots ring */}
            <div style={{
                position: 'absolute', inset: 2, borderRadius: '50%',
                border: `1px dashed ${primary}60`,
                animation: (tier === 'top' || tier === 'high') ? 'vipRotateReverse 6s linear infinite' : undefined,
            }} />

            {/* Inner gradient ring */}
            <div style={{
                position: 'absolute', inset: 3, borderRadius: '50%',
                background: `linear-gradient(135deg, ${primary}40, ${secondary}60, ${tertiary}40)`,
            }} />

            {/* Dark gap */}
            <div style={{
                position: 'absolute',
                inset: tier === 'top' ? 6 : tier === 'high' ? 5 : 4,
                borderRadius: '50%', background: '#0f0f1e',
                boxShadow: `inset 0 0 8px ${primary}30`,
            }} />

            {/* Inner metallic ring */}
            <div style={{
                position: 'absolute',
                inset: tier === 'top' ? 7 : tier === 'high' ? 6 : 5,
                borderRadius: '50%',
                background: `conic-gradient(from 180deg, ${config.colors.join(', ')})`,
                animation: tier === 'top' ? 'vipRotateReverse 4s linear infinite'
                    : tier === 'high' ? 'vipRotateReverse 5s linear infinite' : undefined,
            }} />

            {/* Photo mask */}
            <div style={{
                position: 'absolute',
                inset: tier === 'top' ? 9 : tier === 'high' ? 8 : 7,
                borderRadius: '50%', overflow: 'hidden', zIndex: 2,
                boxShadow: `inset 0 0 12px ${primary}20`,
            }}>
                {children}
            </div>

            {/* Shimmer */}
            {(tier === 'top' || tier === 'high') && (
                <div style={{
                    position: 'absolute', inset: 0, borderRadius: '50%',
                    background: `linear-gradient(105deg, transparent 40%, ${primary}25 50%, transparent 60%)`,
                    backgroundSize: '200% 100%',
                    animation: 'vipShimmer 3s ease-in-out infinite',
                    zIndex: 3, pointerEvents: 'none',
                }} />
            )}

            {/* Side ornaments */}
            {(tier === 'top' || tier === 'high') && (
                <>
                    <div style={{
                        position: 'absolute', left: -3, top: '50%', transform: 'translateY(-50%)',
                        fontSize: Math.max(8, 10 * (size / 56)), zIndex: 4,
                        filter: `drop-shadow(0 0 3px ${primary}80)`,
                        animation: 'vipGlow 2s ease-in-out infinite',
                    }}>
                        {tier === 'top' ? '✦' : '❋'}
                    </div>
                    <div style={{
                        position: 'absolute', right: -3, top: '50%', transform: 'translateY(-50%)',
                        fontSize: Math.max(8, 10 * (size / 56)), zIndex: 4,
                        filter: `drop-shadow(0 0 3px ${primary}80)`,
                        animation: 'vipGlow 2s ease-in-out infinite',
                        animationDelay: '1s',
                    }}>
                        {tier === 'top' ? '✦' : '❋'}
                    </div>
                </>
            )}

            {/* Level badge */}
            <div style={{
                position: 'absolute',
                bottom: (tier === 'top' || tier === 'high') ? -3 : -1,
                left: '50%', transform: 'translateX(-50%)',
                padding: '1px 8px', borderRadius: 'var(--radius-full)',
                background: `linear-gradient(135deg, ${primary}, ${secondary})`,
                fontSize: Math.max(7, 8 * (size / 56)), fontWeight: 900,
                color: '#1a1a2e', zIndex: 5, whiteSpace: 'nowrap',
                boxShadow: `0 2px 8px ${primary}50`,
                border: `1px solid ${primary}60`,
            }}>
                {config.label}
            </div>
        </div>
    );
}
