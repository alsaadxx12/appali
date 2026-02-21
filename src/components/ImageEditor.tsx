import React, { useState, useRef, useCallback } from 'react';
import { X, ZoomIn, ZoomOut, RotateCcw, Check, Crop, Sparkles } from 'lucide-react';

interface Props {
    imageUrl: string;
    onSave: (editedUrl: string, filter: string) => void;
    onCancel: () => void;
    aspectRatio?: 'circle' | 'cover'; // circle for avatar, cover for banner
}

const FILTERS = [
    { id: 'none', name: 'أصلي', css: 'none' },
    { id: 'vivid', name: 'حيوي', css: 'saturate(1.4) contrast(1.1)' },
    { id: 'warm', name: 'دافئ', css: 'sepia(0.25) saturate(1.3) brightness(1.05)' },
    { id: 'cool', name: 'بارد', css: 'saturate(0.9) hue-rotate(15deg) brightness(1.05)' },
    { id: 'bright', name: 'ساطع', css: 'brightness(1.2) contrast(1.05)' },
    { id: 'noir', name: 'كلاسيكي', css: 'grayscale(1) contrast(1.2)' },
    { id: 'vintage', name: 'قديم', css: 'sepia(0.5) contrast(0.9) brightness(1.1)' },
    { id: 'dramatic', name: 'درامي', css: 'contrast(1.4) saturate(0.8) brightness(0.95)' },
    { id: 'fade', name: 'باهت', css: 'contrast(0.85) brightness(1.1) saturate(0.8)' },
    { id: 'ocean', name: 'محيط', css: 'hue-rotate(200deg) saturate(0.7) brightness(1.1)' },
    { id: 'sunset', name: 'غروب', css: 'sepia(0.3) hue-rotate(-15deg) saturate(1.5) brightness(1.05)' },
    { id: 'emerald', name: 'زمردي', css: 'hue-rotate(90deg) saturate(0.6) brightness(1.1)' },
];

export default function ImageEditor({ imageUrl, onSave, onCancel, aspectRatio = 'circle' }: Props) {
    const [zoom, setZoom] = useState(1);
    const [offsetX, setOffsetX] = useState(0);
    const [offsetY, setOffsetY] = useState(0);
    const [selectedFilter, setSelectedFilter] = useState('none');
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const containerRef = useRef<HTMLDivElement>(null);

    const currentFilter = FILTERS.find(f => f.id === selectedFilter)?.css || 'none';

    const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.2, 3));
    const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.2, 0.5));
    const handleReset = () => { setZoom(1); setOffsetX(0); setOffsetY(0); setSelectedFilter('none'); };

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        setIsDragging(true);
        setDragStart({ x: e.clientX - offsetX, y: e.clientY - offsetY });
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }, [offsetX, offsetY]);

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (!isDragging) return;
        setOffsetX(e.clientX - dragStart.x);
        setOffsetY(e.clientY - dragStart.y);
    }, [isDragging, dragStart]);

    const handlePointerUp = () => setIsDragging(false);

    const handleSave = () => {
        onSave(imageUrl, selectedFilter);
    };

    const previewSize = aspectRatio === 'circle' ? 220 : 220;
    const previewHeight = aspectRatio === 'circle' ? 220 : 130;

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(20px)',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            padding: '20px 16px', overflow: 'hidden',
        }}>
            {/* Top bar */}
            <div style={{
                width: '100%', maxWidth: 400,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginBottom: 16,
            }}>
                <button onClick={onCancel} style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: 'rgba(255,255,255,0.1)', color: 'white',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}><X size={20} /></button>
                <span style={{ fontSize: 15, fontWeight: 700, color: 'white' }}>
                    <Sparkles size={16} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: 4 }} />
                    تعديل الصورة
                </span>
                <button onClick={handleSave} style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: 'var(--accent-emerald)', color: 'white',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}><Check size={20} /></button>
            </div>

            {/* Preview Area */}
            <div
                ref={containerRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                style={{
                    width: previewSize, height: previewHeight,
                    borderRadius: aspectRatio === 'circle' ? '50%' : 'var(--radius-xl)',
                    overflow: 'hidden',
                    border: '3px solid rgba(255,255,255,0.2)',
                    boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
                    cursor: isDragging ? 'grabbing' : 'grab',
                    touchAction: 'none',
                    marginBottom: 20,
                    background: '#111',
                    position: 'relative',
                }}
            >
                <img
                    src={imageUrl}
                    alt=""
                    draggable={false}
                    style={{
                        width: '100%', height: '100%',
                        objectFit: 'cover',
                        transform: `scale(${zoom}) translate(${offsetX / zoom}px, ${offsetY / zoom}px)`,
                        filter: currentFilter,
                        transition: isDragging ? 'none' : 'filter 300ms ease',
                        pointerEvents: 'none',
                    }}
                />
            </div>

            {/* Zoom & Control buttons */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20,
            }}>
                <button onClick={handleZoomOut} style={controlBtnStyle}><ZoomOut size={18} /></button>
                <div style={{
                    width: 120, height: 4, borderRadius: 2,
                    background: 'rgba(255,255,255,0.15)', position: 'relative',
                }}>
                    <div style={{
                        position: 'absolute', top: 0, right: 0,
                        width: `${((zoom - 0.5) / 2.5) * 100}%`, height: '100%',
                        borderRadius: 2, background: 'var(--accent-blue)',
                        transition: 'width 200ms ease',
                    }} />
                    <div style={{
                        position: 'absolute', top: -6,
                        right: `calc(${((zoom - 0.5) / 2.5) * 100}% - 8px)`,
                        width: 16, height: 16, borderRadius: '50%',
                        background: 'white', boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                        transition: 'right 200ms ease',
                    }} />
                </div>
                <button onClick={handleZoomIn} style={controlBtnStyle}><ZoomIn size={18} /></button>
                <button onClick={handleReset} style={{ ...controlBtnStyle, marginRight: 8 }}><RotateCcw size={16} /></button>
            </div>

            {/* Zoom label */}
            <div style={{
                fontSize: 11, color: 'rgba(255,255,255,0.5)', fontFamily: 'var(--font-numeric)',
                marginBottom: 16, fontWeight: 600,
            }}>
                {Math.round(zoom * 100)}%
            </div>

            {/* Filters */}
            <div style={{
                width: '100%', maxWidth: 400,
                marginBottom: 8,
                display: 'flex', alignItems: 'center', gap: 6,
            }}>
                <Sparkles size={14} style={{ color: 'var(--accent-amber)', flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-amber)' }}>الفلاتر</span>
            </div>

            <div style={{
                width: '100%', maxWidth: 400,
                display: 'flex', gap: 8, overflowX: 'auto',
                paddingBottom: 16,
                WebkitOverflowScrolling: 'touch',
            }}>
                {FILTERS.map(filter => (
                    <button
                        key={filter.id}
                        onClick={() => setSelectedFilter(filter.id)}
                        style={{
                            flexShrink: 0, display: 'flex', flexDirection: 'column',
                            alignItems: 'center', gap: 6,
                        }}
                    >
                        <div style={{
                            width: 56, height: 56, borderRadius: 'var(--radius-md)',
                            overflow: 'hidden',
                            border: selectedFilter === filter.id
                                ? '2px solid var(--accent-blue)'
                                : '2px solid rgba(255,255,255,0.1)',
                            boxShadow: selectedFilter === filter.id
                                ? '0 0 12px rgba(59,130,246,0.4)'
                                : 'none',
                            transition: 'all 200ms ease',
                        }}>
                            <img
                                src={imageUrl}
                                alt=""
                                style={{
                                    width: '100%', height: '100%',
                                    objectFit: 'cover',
                                    filter: filter.css,
                                }}
                            />
                        </div>
                        <span style={{
                            fontSize: 9, fontWeight: 600,
                            color: selectedFilter === filter.id ? 'var(--accent-blue)' : 'rgba(255,255,255,0.5)',
                        }}>
                            {filter.name}
                        </span>
                    </button>
                ))}
            </div>
        </div>
    );
}

const controlBtnStyle: React.CSSProperties = {
    width: 36, height: 36, borderRadius: '50%',
    background: 'rgba(255,255,255,0.1)', color: 'white',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: '1px solid rgba(255,255,255,0.1)',
    transition: 'all 200ms ease',
};
