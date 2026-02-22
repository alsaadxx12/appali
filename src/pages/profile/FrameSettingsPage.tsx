import React, { useState, useRef, useEffect } from 'react';
import {
    ArrowRight, Upload, Trash2, Image, Crown, Check, X, Plus, Layers,
    Eye, ZoomIn, ZoomOut, Move, RotateCcw, Save
} from 'lucide-react';
import { invalidateFrameCache } from '../../components/VipFrame';

interface Props {
    onBack: () => void;
}

interface FrameItem {
    id: string;
    name: string;
    imageUrl: string;
    dateAdded: string;
}

interface FrameAdjustment {
    scale: number;      // frame scale (0.8 - 2.0)
    offsetX: number;    // horizontal offset (-20 to 20)
    offsetY: number;    // vertical offset (-20 to 20)
    avatarScale: number; // avatar size inside frame (0.5 - 1.0)
}

const DEFAULT_ADJUSTMENT: FrameAdjustment = {
    scale: 1.2,
    offsetX: 0,
    offsetY: 0,
    avatarScale: 0.75,
};

import { db, storage } from '../../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';

interface VipLevelData {
    id: string;
    label: string;
    emoji: string;
    color: string;
    minPoints: number;
}

const SAMPLE_AVATARS = [
    { name: 'معاينة', color: '#3b82f6', initials: 'م' },
];

export default function FrameSettingsPage({ onBack }: Props) {

    const [vipLevels, setVipLevels] = useState<VipLevelData[]>([]);
    const [frames, setFrames] = useState<FrameItem[]>([]);
    const [levelFrames, setLevelFrames] = useState<Record<string, string>>({});
    const [adjustments, setAdjustments] = useState<Record<string, FrameAdjustment>>({});
    const [showUpload, setShowUpload] = useState(false);
    const [uploadName, setUploadName] = useState('');
    const [uploadPreview, setUploadPreview] = useState<string | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);
    const [selectingLevel, setSelectingLevel] = useState<string | null>(null);
    const [previewLevel, setPreviewLevel] = useState<string | null>(null);
    const [previewAvatar, setPreviewAvatar] = useState(0);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Load VIP levels and frame settings from Firestore
    useEffect(() => {
        const loadData = async () => {
            try {
                // Load VIP levels
                const vipSnap = await getDoc(doc(db, 'settings', 'vip'));
                if (vipSnap.exists() && vipSnap.data().levels) {
                    setVipLevels(vipSnap.data().levels);
                }

                // Load frame settings
                const framesSnap = await getDoc(doc(db, 'settings', 'frames'));
                if (framesSnap.exists()) {
                    const data = framesSnap.data();
                    if (data.frames) setFrames(data.frames);
                    if (data.levelFrames) setLevelFrames(data.levelFrames);
                    if (data.adjustments) setAdjustments(data.adjustments);
                }
            } catch (e) {
                console.error('Error loading settings:', e);
                // Fallback to localStorage
                try {
                    const f = localStorage.getItem('vipFrames');
                    const lf = localStorage.getItem('vipLevelFrames');
                    const adj = localStorage.getItem('vipFrameAdjustments');
                    if (f) setFrames(JSON.parse(f));
                    if (lf) setLevelFrames(JSON.parse(lf));
                    if (adj) setAdjustments(JSON.parse(adj));
                } catch { /* ignore */ }
            }
        };
        loadData();
    }, []);

    const getAdj = (levelId: string): FrameAdjustment => adjustments[levelId] || DEFAULT_ADJUSTMENT;

    const updateAdj = (levelId: string, partial: Partial<FrameAdjustment>) => {
        setAdjustments({
            ...adjustments,
            [levelId]: { ...getAdj(levelId), ...partial },
        });
    };

    const resetAdj = (levelId: string) => {
        setAdjustments({
            ...adjustments,
            [levelId]: { ...DEFAULT_ADJUSTMENT },
        });
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => setUploadPreview(ev.target?.result as string);
            reader.readAsDataURL(file);
        }
    };

    const handleUpload = () => {
        if (!uploadName.trim() || !uploadPreview) return;
        const newFrame: FrameItem = {
            id: `frame-${Date.now()}`,
            name: uploadName.trim(),
            imageUrl: uploadPreview,
            dateAdded: new Date().toISOString().split('T')[0],
        };
        setFrames([newFrame, ...frames]);
        setUploadName('');
        setUploadPreview(null);
        setShowUpload(false);
    };

    const handleDelete = (id: string) => {
        setFrames(frames.filter(f => f.id !== id));
        const updated = { ...levelFrames };
        Object.keys(updated).forEach(key => {
            if (updated[key] === id) delete updated[key];
        });
        setLevelFrames(updated);
        setDeleteConfirm(null);
    };

    const handleAssignFrame = (level: string, frameId: string) => {
        setLevelFrames({ ...levelFrames, [level]: frameId });
        setSelectingLevel(null);
    };

    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        setSaving(true);
        try {
            // Upload base64 images to Firebase Storage and replace with download URLs
            const uploadedFrames: FrameItem[] = await Promise.all(
                frames.map(async (frame) => {
                    // Skip if already a URL (not base64)
                    if (frame.imageUrl && !frame.imageUrl.startsWith('data:')) {
                        return frame;
                    }
                    // Upload base64 to Storage
                    if (frame.imageUrl && frame.imageUrl.startsWith('data:')) {
                        try {
                            const storageRef = ref(storage, `frames/${frame.id}`);
                            await uploadString(storageRef, frame.imageUrl, 'data_url');
                            const downloadUrl = await getDownloadURL(storageRef);
                            return { ...frame, imageUrl: downloadUrl };
                        } catch (uploadErr) {
                            console.error(`Failed to upload frame ${frame.id}:`, uploadErr);
                            // Keep base64 as fallback for localStorage
                            return frame;
                        }
                    }
                    return frame;
                })
            );

            // Save metadata (with Storage URLs) to Firestore
            // Strip base64 data for Firestore — only keep URL-based frames
            const firestoreFrames = uploadedFrames.map(f => ({
                ...f,
                imageUrl: f.imageUrl?.startsWith('data:') ? '' : f.imageUrl,
            }));

            await setDoc(doc(db, 'settings', 'frames'), {
                frames: firestoreFrames,
                levelFrames,
                adjustments,
                updatedAt: new Date().toISOString(),
            });

            // Update local state with uploaded URLs
            setFrames(uploadedFrames);

            // Also save to localStorage as cache (with full URLs)
            localStorage.setItem('vipFrames', JSON.stringify(uploadedFrames));
            localStorage.setItem('vipLevelFrames', JSON.stringify(levelFrames));
            localStorage.setItem('vipFrameAdjustments', JSON.stringify(adjustments));
            // Invalidate VipFrame cache so all components reload
            invalidateFrameCache();
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch (e: any) {
            console.error('Error saving frame settings:', e);
            alert(`حدث خطأ أثناء الحفظ: ${e?.message || e}`);
        } finally {
            setSaving(false);
        }
    };

    const getFrameById = (id: string) => frames.find(f => f.id === id);

    // === PREVIEW COMPONENT ===
    const FramePreview = ({ levelId, size = 100 }: { levelId: string; size?: number }) => {
        const frameId = levelFrames[levelId];
        const frame = frameId ? getFrameById(frameId) : null;
        const adj = getAdj(levelId);
        const avatar = SAMPLE_AVATARS[previewAvatar];
        const lvl = vipLevels.find(l => l.id === levelId)!;
        const avatarSize = size * adj.avatarScale;

        return (
            <div style={{
                width: size, height: size,
                position: 'relative',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
                {/* Avatar circle */}
                <div style={{
                    width: avatarSize, height: avatarSize,
                    borderRadius: '50%',
                    background: avatar.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: avatarSize * 0.35, fontWeight: 800, color: 'white',
                    zIndex: 1,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                }}>
                    {avatar.initials}
                </div>

                {/* Frame image overlay */}
                {frame && frame.imageUrl ? (
                    <img
                        src={frame.imageUrl}
                        alt={frame.name}
                        style={{
                            position: 'absolute',
                            width: size * adj.scale,
                            height: size * adj.scale,
                            top: '50%', left: '50%',
                            transform: `translate(-50%, -50%) translate(${adj.offsetX}px, ${adj.offsetY}px)`,
                            objectFit: 'contain',
                            zIndex: 2,
                            pointerEvents: 'none',
                        }}
                    />
                ) : (
                    /* CSS fallback frame circle */
                    <div style={{
                        position: 'absolute',
                        width: size * 0.9, height: size * 0.9,
                        borderRadius: '50%',
                        border: `3px solid ${lvl.color}`,
                        boxShadow: `0 0 12px ${lvl.color}40, inset 0 0 8px ${lvl.color}20`,
                        zIndex: 2,
                        pointerEvents: 'none',
                    }} />
                )}

                {/* Level label */}
                <div style={{
                    position: 'absolute', bottom: -4, left: '50%', transform: 'translateX(-50%)',
                    padding: '1px 10px', borderRadius: 'var(--radius-full)',
                    background: `linear-gradient(135deg, ${lvl.color}, ${lvl.color}cc)`,
                    fontSize: 8, fontWeight: 900, color: '#1a1a2e',
                    zIndex: 5, whiteSpace: 'nowrap',
                    boxShadow: `0 2px 6px ${lvl.color}50`,
                }}>
                    {lvl.emoji} {lvl.label}
                </div>
            </div>
        );
    };

    return (
        <div className="page-content page-enter">
            {/* Header */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                marginBottom: 20, padding: '4px 0',
            }}>
                <button
                    onClick={onBack}
                    style={{
                        width: 36, height: 36, borderRadius: 'var(--radius-md)',
                        background: 'var(--bg-glass)', border: '1px solid var(--border-glass)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'var(--text-secondary)',
                    }}
                >
                    <ArrowRight size={18} />
                </button>
                <div>
                    <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>إعدادات الإطارات</h2>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>رفع وتعيين ومعاينة الإطارات</p>
                </div>
            </div>

            {/* ====== LIVE PREVIEW SECTION ====== */}
            <h3 className="section-title" style={{ fontSize: 14 }}>
                <Eye size={16} />
                معاينة الإطارات على المستخدم
            </h3>

            <div className="glass-card" style={{
                padding: 16, marginBottom: 16,
                background: 'linear-gradient(135deg, rgba(139,92,246,0.06), rgba(59,130,246,0.06))',
                border: '1px solid rgba(139,92,246,0.15)',
            }}>
                {/* Avatar selector */}
                <div style={{
                    display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 16,
                }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', alignSelf: 'center' }}>
                        اختر الصورة:
                    </span>
                    {SAMPLE_AVATARS.map((av, i) => (
                        <button
                            key={i}
                            onClick={() => setPreviewAvatar(i)}
                            style={{
                                width: 32, height: 32, borderRadius: '50%',
                                background: av.color,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 10, fontWeight: 800, color: 'white',
                                border: previewAvatar === i ? '2px solid white' : '2px solid transparent',
                                opacity: previewAvatar === i ? 1 : 0.5,
                                transition: 'all 150ms ease',
                            }}
                        >
                            {av.initials}
                        </button>
                    ))}
                </div>

                {/* 4 level previews in a row */}
                <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: 8, marginBottom: 12,
                }}>
                    {vipLevels.map(lvl => (
                        <div key={lvl.id} style={{ textAlign: 'center' }}>
                            <div style={{
                                display: 'flex', justifyContent: 'center',
                                marginBottom: 6, minHeight: 72,
                                alignItems: 'center',
                            }}>
                                <FramePreview levelId={lvl.id} size={64} />
                            </div>
                            <button
                                onClick={() => setPreviewLevel(previewLevel === lvl.id ? null : lvl.id)}
                                style={{
                                    padding: '3px 8px', borderRadius: 'var(--radius-sm)',
                                    background: previewLevel === lvl.id ? `${lvl.color}25` : 'rgba(255,255,255,0.05)',
                                    border: previewLevel === lvl.id ? `1px solid ${lvl.color}40` : '1px solid transparent',
                                    fontSize: 9, fontWeight: 700,
                                    color: previewLevel === lvl.id ? lvl.color : 'var(--text-muted)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
                                    width: '100%',
                                }}
                            >
                                <Move size={10} />
                                ضبط
                            </button>
                        </div>
                    ))}
                </div>

                {/* Adjustment controls (shown when a level preview is selected) */}
                {previewLevel && (() => {
                    const adj = getAdj(previewLevel);
                    const lvl = vipLevels.find(l => l.id === previewLevel)!;
                    const frameId = levelFrames[previewLevel];
                    const frame = frameId ? getFrameById(frameId) : null;

                    return (
                        <div style={{
                            padding: 14, borderRadius: 'var(--radius-lg)',
                            background: 'rgba(0,0,0,0.2)',
                            border: `1px solid ${lvl.color}25`,
                        }}>
                            {/* Large preview */}
                            <div style={{
                                display: 'flex', justifyContent: 'center', marginBottom: 14,
                                padding: 16,
                                background: 'radial-gradient(circle, rgba(255,255,255,0.04), transparent)',
                                borderRadius: 'var(--radius-lg)',
                            }}>
                                <FramePreview levelId={previewLevel} size={120} />
                            </div>

                            <div style={{
                                fontSize: 11, fontWeight: 700, color: lvl.color,
                                textAlign: 'center', marginBottom: 12,
                            }}>
                                🔧 ضبط إطار {lvl.label}
                                {frame ? ` — ${frame.name}` : ''}
                            </div>

                            {!frame || !frame.imageUrl ? (
                                <div style={{
                                    fontSize: 11, color: 'var(--text-muted)', textAlign: 'center',
                                    padding: 12, opacity: 0.7,
                                }}>
                                    قم بتعيين إطار حقيقي (صورة) لهذا المستوى لتتمكن من ضبطه
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    {/* Scale slider */}
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                <ZoomIn size={12} /> حجم الإطار
                                            </span>
                                            <span style={{ fontSize: 10, fontWeight: 800, fontFamily: 'var(--font-numeric)', color: lvl.color }}>
                                                {Math.round(adj.scale * 100)}%
                                            </span>
                                        </div>
                                        <input type="range" min="80" max="200" value={Math.round(adj.scale * 100)}
                                            onChange={e => updateAdj(previewLevel, { scale: parseInt(e.target.value) / 100 })}
                                            style={{ width: '100%', accentColor: lvl.color, height: 4 }}
                                        />
                                    </div>

                                    {/* Avatar scale */}
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                <ZoomOut size={12} /> حجم الصورة الشخصية
                                            </span>
                                            <span style={{ fontSize: 10, fontWeight: 800, fontFamily: 'var(--font-numeric)', color: lvl.color }}>
                                                {Math.round(adj.avatarScale * 100)}%
                                            </span>
                                        </div>
                                        <input type="range" min="40" max="100" value={Math.round(adj.avatarScale * 100)}
                                            onChange={e => updateAdj(previewLevel, { avatarScale: parseInt(e.target.value) / 100 })}
                                            style={{ width: '100%', accentColor: lvl.color, height: 4 }}
                                        />
                                    </div>

                                    {/* Offset X */}
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)' }}>
                                                ↔️ إزاحة أفقية
                                            </span>
                                            <span style={{ fontSize: 10, fontWeight: 800, fontFamily: 'var(--font-numeric)', color: lvl.color }}>
                                                {adj.offsetX}px
                                            </span>
                                        </div>
                                        <input type="range" min="-20" max="20" value={adj.offsetX}
                                            onChange={e => updateAdj(previewLevel, { offsetX: parseInt(e.target.value) })}
                                            style={{ width: '100%', accentColor: lvl.color, height: 4 }}
                                        />
                                    </div>

                                    {/* Offset Y */}
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)' }}>
                                                ↕️ إزاحة عمودية
                                            </span>
                                            <span style={{ fontSize: 10, fontWeight: 800, fontFamily: 'var(--font-numeric)', color: lvl.color }}>
                                                {adj.offsetY}px
                                            </span>
                                        </div>
                                        <input type="range" min="-20" max="20" value={adj.offsetY}
                                            onChange={e => updateAdj(previewLevel, { offsetY: parseInt(e.target.value) })}
                                            style={{ width: '100%', accentColor: lvl.color, height: 4 }}
                                        />
                                    </div>

                                    {/* Reset button */}
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <button
                                            onClick={() => resetAdj(previewLevel)}
                                            style={{
                                                flex: 1, padding: '10px', borderRadius: 'var(--radius-md)',
                                                background: 'rgba(255,255,255,0.05)',
                                                color: 'var(--text-muted)', fontSize: 11, fontWeight: 600,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                            }}
                                        >
                                            <RotateCcw size={12} />
                                            إعادة ضبط
                                        </button>
                                        <button
                                            onClick={handleSave}
                                            disabled={saving}
                                            style={{
                                                flex: 1, padding: '10px', borderRadius: 'var(--radius-md)',
                                                background: saved ? 'rgba(34,197,94,0.2)' : saving ? 'rgba(255,255,255,0.05)' : `${lvl.color}20`,
                                                color: saved ? '#22c55e' : saving ? 'var(--text-muted)' : lvl.color, fontSize: 11, fontWeight: 700,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                                border: saved ? '1px solid rgba(34,197,94,0.3)' : `1px solid ${lvl.color}30`,
                                                transition: 'all 0.3s ease',
                                                opacity: saving ? 0.6 : 1,
                                            }}
                                        >
                                            {saving ? '⏳' : saved ? <Check size={14} /> : <Save size={14} />}
                                            {saving ? 'جاري الحفظ...' : saved ? 'تم الحفظ ✓' : 'حفظ الضبط'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })()}
            </div>

            {/* ====== LEVEL FRAME ASSIGNMENT ====== */}
            <h3 className="section-title" style={{ fontSize: 14 }}>
                <Crown size={16} />
                تعيين الإطارات للمستويات
            </h3>

            <div className="glass-card" style={{ padding: 16, marginBottom: 16 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {vipLevels.map(level => {
                        const assignedFrame = levelFrames[level.id] ? getFrameById(levelFrames[level.id]) : null;
                        return (
                            <div key={level.id}>
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    padding: '10px 12px', borderRadius: 'var(--radius-lg)',
                                    background: `${level.color}10`,
                                    border: `1px solid ${level.color}25`,
                                }}>
                                    <span style={{ fontSize: 22 }}>{level.emoji}</span>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: 13, fontWeight: 700, color: level.color }}>
                                            {level.label}
                                        </div>
                                        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>
                                            {assignedFrame ? `الإطار: ${assignedFrame.name}` : 'لم يتم تعيين إطار'}
                                        </div>
                                    </div>

                                    {assignedFrame && assignedFrame.imageUrl ? (
                                        <div style={{
                                            width: 44, height: 44, borderRadius: 'var(--radius-md)',
                                            border: `2px solid ${level.color}40`,
                                            overflow: 'hidden', flexShrink: 0, cursor: 'pointer',
                                        }}
                                            onClick={() => setSelectingLevel(selectingLevel === level.id ? null : level.id)}
                                        >
                                            <img src={assignedFrame.imageUrl} alt={assignedFrame.name}
                                                style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => setSelectingLevel(selectingLevel === level.id ? null : level.id)}
                                            style={{
                                                padding: '6px 12px', borderRadius: 'var(--radius-md)',
                                                background: `${level.color}20`, color: level.color,
                                                fontSize: 11, fontWeight: 700,
                                                border: `1px solid ${level.color}30`,
                                                display: 'flex', alignItems: 'center', gap: 4,
                                            }}
                                        >
                                            <Layers size={12} />
                                            {assignedFrame ? 'تغيير' : 'تعيين'}
                                        </button>
                                    )}
                                </div>

                                {/* Frame selection dropdown */}
                                {selectingLevel === level.id && (
                                    <div style={{
                                        marginTop: 8, padding: 10,
                                        background: 'var(--bg-glass-strong)',
                                        borderRadius: 'var(--radius-lg)',
                                        border: '1px solid var(--border-glass)',
                                        maxHeight: 200, overflowY: 'auto',
                                    }}>
                                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>
                                            اختر إطار لمستوى {level.label}:
                                        </div>
                                        {frames.length === 0 ? (
                                            <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', padding: 12 }}>
                                                لا توجد إطارات. قم برفع إطار أولاً.
                                            </div>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                <button
                                                    onClick={() => {
                                                        const updated = { ...levelFrames };
                                                        delete updated[level.id];
                                                        setLevelFrames(updated);
                                                        setSelectingLevel(null);
                                                    }}
                                                    style={{
                                                        display: 'flex', alignItems: 'center', gap: 8,
                                                        padding: '6px 10px', borderRadius: 'var(--radius-md)',
                                                        background: !levelFrames[level.id] ? 'rgba(239,68,68,0.1)' : 'transparent',
                                                        border: !levelFrames[level.id] ? '1px solid rgba(239,68,68,0.3)' : '1px solid transparent',
                                                        textAlign: 'right',
                                                    }}
                                                >
                                                    <X size={14} color="var(--text-muted)" />
                                                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>بدون إطار</span>
                                                </button>

                                                {frames.map(frame => {
                                                    const isSelected = levelFrames[level.id] === frame.id;
                                                    return (
                                                        <button
                                                            key={frame.id}
                                                            onClick={() => handleAssignFrame(level.id, frame.id)}
                                                            style={{
                                                                display: 'flex', alignItems: 'center', gap: 8,
                                                                padding: '6px 10px', borderRadius: 'var(--radius-md)',
                                                                background: isSelected ? `${level.color}15` : 'transparent',
                                                                border: isSelected ? `1px solid ${level.color}40` : '1px solid transparent',
                                                                textAlign: 'right',
                                                                transition: 'all 150ms ease',
                                                            }}
                                                        >
                                                            <div style={{
                                                                width: 32, height: 32, borderRadius: 'var(--radius-sm)',
                                                                background: frame.imageUrl ? 'transparent' : `${level.color}15`,
                                                                border: `1px solid ${level.color}20`,
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                overflow: 'hidden', flexShrink: 0,
                                                            }}>
                                                                {frame.imageUrl ? (
                                                                    <img src={frame.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                                ) : (
                                                                    <Image size={14} color={level.color} />
                                                                )}
                                                            </div>
                                                            <span style={{
                                                                flex: 1, fontSize: 11, fontWeight: isSelected ? 700 : 600,
                                                                color: isSelected ? level.color : 'var(--text-secondary)',
                                                            }}>{frame.name}</span>
                                                            {isSelected && <Check size={14} color={level.color} />}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {level.id !== 'diamond' && (
                                    <div style={{ height: 1, background: 'var(--border-glass)', marginTop: 12 }} />
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ====== UPLOADED FRAMES GALLERY ====== */}
            <h3 className="section-title" style={{ fontSize: 14 }}>
                <Image size={16} />
                الإطارات المرفوعة
                <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 8px',
                    borderRadius: 'var(--radius-full)',
                    background: 'rgba(255,255,255,0.08)',
                    color: 'var(--text-muted)', marginRight: 'auto', marginLeft: 0,
                }}>{frames.length}</span>
            </h3>

            {/* Upload Button */}
            <button
                onClick={() => setShowUpload(!showUpload)}
                style={{
                    width: '100%', padding: '12px',
                    borderRadius: 'var(--radius-lg)',
                    background: showUpload ? 'rgba(239,68,68,0.1)' : 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(59,130,246,0.15))',
                    border: showUpload ? '1px solid rgba(239,68,68,0.3)' : '1px dashed rgba(139,92,246,0.4)',
                    color: showUpload ? 'var(--accent-rose)' : 'var(--accent-purple)',
                    fontSize: 12, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    marginBottom: 12,
                    transition: 'all 200ms ease',
                }}
            >
                {showUpload ? (<><X size={16} /> إلغاء</>) : (<><Plus size={16} /> رفع إطار جديد</>)}
            </button>

            {/* Upload Form */}
            {showUpload && (
                <div className="glass-card" style={{ padding: 16, marginBottom: 12, animation: 'slideUp 200ms ease' }}>
                    <input ref={fileInputRef} type="file" accept="image/png,image/webp,image/svg+xml"
                        style={{ display: 'none' }} onChange={handleFileSelect} />

                    <div
                        onClick={() => fileInputRef.current?.click()}
                        style={{
                            padding: uploadPreview ? '8px' : '28px 12px',
                            borderRadius: 'var(--radius-lg)',
                            border: '2px dashed rgba(139,92,246,0.3)',
                            background: 'rgba(139,92,246,0.05)',
                            textAlign: 'center', cursor: 'pointer', marginBottom: 12,
                        }}
                    >
                        {uploadPreview ? (
                            <div style={{ display: 'flex', justifyContent: 'center', position: 'relative' }}>
                                {/* Upload preview with sample avatar */}
                                <div style={{ position: 'relative', width: 120, height: 120 }}>
                                    <div style={{
                                        position: 'absolute', top: '50%', left: '50%',
                                        transform: 'translate(-50%, -50%)',
                                        width: 60, height: 60, borderRadius: '50%',
                                        background: SAMPLE_AVATARS[previewAvatar].color,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 18, fontWeight: 800, color: 'white', zIndex: 1,
                                    }}>
                                        {SAMPLE_AVATARS[previewAvatar].initials}
                                    </div>
                                    <img src={uploadPreview} alt="preview" style={{
                                        width: '100%', height: '100%',
                                        objectFit: 'contain',
                                        position: 'relative', zIndex: 2,
                                    }} />
                                </div>
                                <div style={{
                                    position: 'absolute', top: 4, left: 4,
                                    background: 'rgba(0,0,0,0.6)', borderRadius: 'var(--radius-sm)',
                                    padding: '2px 6px', fontSize: 9, color: 'white', fontWeight: 600,
                                }}>
                                    معاينة على المستخدم
                                </div>
                            </div>
                        ) : (
                            <>
                                <Upload size={28} color="var(--accent-purple)" style={{ marginBottom: 8 }} />
                                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>
                                    انقر لاختيار صورة الإطار
                                </div>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                                    PNG / WebP / SVG — يفضل خلفية شفافة
                                </div>
                            </>
                        )}
                    </div>

                    <input className="form-input" placeholder="اسم الإطار..."
                        value={uploadName} onChange={e => setUploadName(e.target.value)}
                        style={{ marginBottom: 10, fontSize: 13 }} />

                    <button
                        onClick={handleUpload}
                        disabled={!uploadName.trim() || !uploadPreview}
                        style={{
                            width: '100%', padding: '11px', borderRadius: 'var(--radius-md)',
                            background: (uploadName.trim() && uploadPreview)
                                ? 'linear-gradient(135deg, var(--accent-purple), var(--accent-blue))'
                                : 'var(--bg-glass-strong)',
                            color: (uploadName.trim() && uploadPreview) ? 'white' : 'var(--text-muted)',
                            fontSize: 13, fontWeight: 700,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        }}
                    >
                        <Upload size={14} /> رفع الإطار
                    </button>
                </div>
            )}

            {/* Frames Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 20 }}>
                {frames.map(frame => {
                    const usedByLevel = Object.entries(levelFrames).find(([_, fId]) => fId === frame.id);
                    const usedLevel = usedByLevel ? vipLevels.find(l => l.id === usedByLevel[0]) : null;

                    return (
                        <div key={frame.id} className="glass-card" style={{
                            padding: 10, position: 'relative',
                            border: usedLevel ? `1px solid ${usedLevel.color}30` : undefined,
                        }}>
                            <div style={{
                                width: '100%', aspectRatio: '1', borderRadius: 'var(--radius-md)',
                                background: 'rgba(255,255,255,0.03)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                marginBottom: 8, overflow: 'hidden',
                                border: '1px solid var(--border-glass)', position: 'relative',
                            }}>
                                {frame.imageUrl ? (
                                    /* Preview with avatar behind */
                                    <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <div style={{
                                            width: '45%', height: '45%', borderRadius: '50%',
                                            background: SAMPLE_AVATARS[0].color,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: 16, fontWeight: 800, color: 'white', zIndex: 1,
                                        }}>
                                            {SAMPLE_AVATARS[0].initials}
                                        </div>
                                        <img src={frame.imageUrl} alt={frame.name}
                                            style={{
                                                position: 'absolute', inset: 0,
                                                width: '100%', height: '100%', objectFit: 'contain', zIndex: 2,
                                            }} />
                                    </div>
                                ) : (
                                    <div style={{ textAlign: 'center' }}>
                                        <Image size={28} color="var(--text-muted)" style={{ opacity: 0.3 }} />
                                        <div style={{ fontSize: 8, color: 'var(--text-muted)', marginTop: 4, opacity: 0.5 }}>
                                            صورة تجريبية
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div style={{
                                fontSize: 11, fontWeight: 700, marginBottom: 4,
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                                {frame.name}
                            </div>

                            {usedLevel && (
                                <div style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 4,
                                    padding: '2px 8px', borderRadius: 'var(--radius-full)',
                                    background: `${usedLevel.color}15`,
                                    fontSize: 9, fontWeight: 700, color: usedLevel.color, marginBottom: 4,
                                }}>
                                    {usedLevel.emoji} {usedLevel.label}
                                </div>
                            )}

                            <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-numeric)' }}>
                                {frame.dateAdded}
                            </div>

                            <button onClick={() => setDeleteConfirm(frame.id)} style={{
                                position: 'absolute', top: 6, left: 6,
                                width: 24, height: 24, borderRadius: 'var(--radius-sm)',
                                background: 'rgba(239,68,68,0.15)', color: 'var(--accent-rose)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <Trash2 size={12} />
                            </button>
                        </div>
                    );
                })}
            </div>

            {frames.length === 0 && (
                <div className="glass-card" style={{ padding: '30px 16px', textAlign: 'center', marginBottom: 20 }}>
                    <Image size={36} color="var(--text-muted)" style={{ opacity: 0.3, marginBottom: 8 }} />
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>
                        لا توجد إطارات
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', opacity: 0.7 }}>
                        ارفع إطارات PNG بخلفية شفافة لاستخدامها
                    </div>
                </div>
            )}

            {/* Save Button */}
            <button
                onClick={handleSave}
                disabled={saving}
                style={{
                    width: '100%', padding: '14px', borderRadius: 'var(--radius-lg)',
                    background: saved
                        ? 'linear-gradient(135deg, var(--accent-emerald), var(--accent-teal))'
                        : saving
                            ? 'rgba(255,255,255,0.08)'
                            : 'linear-gradient(135deg, var(--accent-purple), var(--accent-blue))',
                    color: saving ? 'var(--text-muted)' : 'white', fontSize: 14, fontWeight: 800,
                    marginBottom: 100, transition: 'all 300ms ease',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    opacity: saving ? 0.7 : 1,
                }}
            >
                {saving ? '⏳ جاري رفع الإطارات وحفظ الإعدادات...' : saved ? '✓ تم الحفظ بنجاح' : 'حفظ التعيينات'}
            </button>

            {/* Delete Confirmation */}
            {deleteConfirm && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 1000,
                    background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
                }}>
                    <div className="glass-card" style={{ padding: 20, maxWidth: 300, width: '100%', textAlign: 'center' }}>
                        <div style={{ fontSize: 32, marginBottom: 12 }}>🗑️</div>
                        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>حذف الإطار</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
                            هل تريد حذف "{frames.find(f => f.id === deleteConfirm)?.name}"؟
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => handleDelete(deleteConfirm)} style={{
                                flex: 1, padding: '10px', borderRadius: 'var(--radius-md)',
                                background: 'rgba(239,68,68,0.2)', color: '#ef4444', fontSize: 13, fontWeight: 700,
                            }}>حذف</button>
                            <button onClick={() => setDeleteConfirm(null)} style={{
                                flex: 1, padding: '10px', borderRadius: 'var(--radius-md)',
                                background: 'var(--bg-glass-strong)', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 700,
                            }}>إلغاء</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
