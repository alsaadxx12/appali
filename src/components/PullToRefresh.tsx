import React, { useRef, useState, useCallback } from 'react';

interface PullToRefreshProps {
    onRefresh: () => Promise<void> | void;
    children: React.ReactNode;
}

export default function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
    const [pulling, setPulling] = useState(false);
    const [pullDistance, setPullDistance] = useState(0);
    const [refreshing, setRefreshing] = useState(false);
    const startY = useRef(0);
    const containerRef = useRef<HTMLDivElement>(null);

    const THRESHOLD = 80;
    const MAX_PULL = 120;

    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        const el = containerRef.current;
        if (!el || el.scrollTop > 0) return;
        startY.current = e.touches[0].clientY;
        setPulling(true);
    }, []);

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
        if (!pulling || refreshing) return;
        const dy = e.touches[0].clientY - startY.current;
        if (dy > 0) {
            setPullDistance(Math.min(dy * 0.5, MAX_PULL));
        }
    }, [pulling, refreshing]);

    const handleTouchEnd = useCallback(async () => {
        if (!pulling) return;
        setPulling(false);

        if (pullDistance >= THRESHOLD && !refreshing) {
            setRefreshing(true);
            try {
                await onRefresh();
            } catch (err) {
                console.error('Refresh error:', err);
            }
            // Hold spinner briefly so user sees feedback
            await new Promise(r => setTimeout(r, 400));
            setRefreshing(false);
        }
        setPullDistance(0);
    }, [pulling, pullDistance, refreshing, onRefresh]);

    return (
        <div
            ref={containerRef}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{ position: 'relative', flex: 1, overflow: 'auto' }}
        >
            {/* Pull indicator */}
            {(pullDistance > 0 || refreshing) && (
                <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 50,
                    display: 'flex', justifyContent: 'center', alignItems: 'center',
                    height: refreshing ? 48 : pullDistance,
                    transition: refreshing ? 'height 200ms ease' : 'none',
                    overflow: 'hidden',
                }}>
                    <div style={{
                        width: 28, height: 28,
                        border: '3px solid rgba(255,255,255,0.1)',
                        borderTopColor: pullDistance >= THRESHOLD || refreshing ? 'var(--accent-blue)' : 'rgba(255,255,255,0.3)',
                        borderRadius: '50%',
                        animation: refreshing ? 'spin 0.6s linear infinite' : 'none',
                        transform: refreshing ? 'none' : `rotate(${pullDistance * 3}deg)`,
                        transition: 'border-color 200ms ease',
                    }} />
                </div>
            )}

            {/* Page content with pull offset */}
            <div style={{
                transform: pullDistance > 0 || refreshing
                    ? `translateY(${refreshing ? 48 : pullDistance}px)`
                    : 'none',
                transition: pulling ? 'none' : 'transform 200ms ease',
            }}>
                {children}
            </div>
        </div>
    );
}
