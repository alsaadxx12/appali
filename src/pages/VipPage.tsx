import React, { useState, useEffect } from 'react';
import {
    Flame, Award,
    TrendingUp, Sparkles, Target
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AVATAR_COLORS } from '../data/demoData';
import VipFrame, { getVipLevel, getVipLabel, getVipColor } from '../components/VipFrame';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';

interface VipLevelData {
    id: string;
    label: string;
    emoji: string;
    color: string;
    minPoints: number;
}

interface PointValues {
    onTimeAttendance: number;
    streak5Days: number;
    noAbsenceMonth: number;
    employeeOfMonth: number;
}

export default function VipPage() {
    const { user } = useAuth();
    const [levels, setLevels] = useState<VipLevelData[]>([]);
    const [pointValues, setPointValues] = useState<PointValues | null>(null);
    const [defaultLevel, setDefaultLevel] = useState<string>('none');
    const [dataLoaded, setDataLoaded] = useState(false);

    useEffect(() => {
        loadVipSettings();
    }, []);

    const loadVipSettings = async () => {
        try {
            const snap = await getDoc(doc(db, 'settings', 'vip'));
            if (snap.exists()) {
                const data = snap.data();
                if (data.levels) setLevels(data.levels);
                if (data.pointValues) setPointValues(data.pointValues);
                if (data.defaultLevel) setDefaultLevel(data.defaultLevel);
            }
        } catch (e) {
            console.error('Error loading VIP settings:', e);
        } finally {
            setDataLoaded(true);
        }
    };

    if (!user) return null;

    const currentPoints = (user as any).points || 0;

    // Compute level: check points against levels, fallback to defaultLevel
    let currentLevel = 'none';
    if (levels.length > 0) {
        const sorted = [...levels].sort((a, b) => b.minPoints - a.minPoints);
        for (const lvl of sorted) {
            if (currentPoints >= lvl.minPoints) {
                currentLevel = lvl.id;
                break;
            }
        }
        if (currentLevel === 'none' && defaultLevel && defaultLevel !== 'none') {
            currentLevel = defaultLevel;
        }
    } else if (dataLoaded && defaultLevel && defaultLevel !== 'none') {
        currentLevel = defaultLevel;
    } else {
        currentLevel = getVipLevel(currentPoints);
    }

    // Sort levels ascending by minPoints
    const sortedLevels = [...levels].sort((a, b) => a.minPoints - b.minPoints);
    // Find next level: must be ABOVE current level, not just above current points
    const currentLevelIndex = sortedLevels.findIndex(l => l.id === currentLevel);
    const nextLevel = currentLevelIndex >= 0
        ? sortedLevels[currentLevelIndex + 1] || null
        : sortedLevels.find(l => l.minPoints > currentPoints) || null;
    const progressToNext = nextLevel
        ? Math.min(100, Math.round((currentPoints / nextLevel.minPoints) * 100))
        : 100;

    return (
        <div className="page-content page-enter">
            {/* My VIP Card */}
            <div style={{
                background: 'linear-gradient(135deg, rgba(185,242,255,0.08), rgba(255,215,0,0.06), rgba(142,197,252,0.08))',
                borderRadius: 'var(--radius-xl)',
                border: '1px solid rgba(185,242,255,0.15)',
                padding: '20px 16px',
                marginBottom: 16,
                position: 'relative',
                overflow: 'hidden',
            }}>
                {/* Decorative sparkles */}
                <div style={{
                    position: 'absolute', top: 10, left: 20,
                    fontSize: 40, opacity: 0.06,
                }}>✨</div>
                <div style={{
                    position: 'absolute', bottom: 10, right: 20,
                    fontSize: 50, opacity: 0.06,
                }}>👑</div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                    <VipFrame level={currentLevel} size={80}>
                        {user.avatar ? (
                            <img src={user.avatar} alt="" style={{
                                width: '100%', height: '100%',
                                borderRadius: '50%', objectFit: 'cover',
                            }} />
                        ) : (
                            <div style={{
                                width: '100%', height: '100%',
                                borderRadius: '50%',
                                background: AVATAR_COLORS[user.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length],
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 22, fontWeight: 800, color: 'white',
                            }}>
                                {user.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                            </div>
                        )}
                    </VipFrame>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 2 }}>{user.name}</div>
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                        }}>
                            <span style={{
                                padding: '2px 10px', borderRadius: 'var(--radius-full)',
                                fontSize: 10, fontWeight: 800,
                                background: `${getVipColor(currentLevel)}22`,
                                color: getVipColor(currentLevel),
                            }}>
                                {getVipLabel(currentLevel) || 'مبتدئ'}
                            </span>

                        </div>
                    </div>
                    <div style={{
                        textAlign: 'center', padding: '8px 14px',
                        background: 'rgba(255,255,255,0.05)',
                        borderRadius: 'var(--radius-lg)',
                    }}>
                        <div style={{
                            fontSize: 22, fontWeight: 900,
                            fontFamily: 'var(--font-numeric)',
                            background: 'linear-gradient(135deg, #ffd700, #ff8c00)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                        }}>{currentPoints.toLocaleString()}</div>
                        <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600 }}>نقطة</div>
                    </div>
                </div>

                {/* Progress to next level */}
                {nextLevel && (
                    <div>
                        <div style={{
                            display: 'flex', justifyContent: 'space-between',
                            fontSize: 10, fontWeight: 600, marginBottom: 6,
                            color: 'var(--text-muted)',
                        }}>
                            <span>التقدم نحو {nextLevel.emoji} {nextLevel.label}</span>
                            <span style={{ fontFamily: 'var(--font-numeric)' }}>{progressToNext}%</span>
                        </div>
                        <div style={{
                            width: '100%', height: 6, borderRadius: 3,
                            background: 'rgba(255,255,255,0.08)',
                        }}>
                            <div style={{
                                width: `${progressToNext}%`, height: '100%', borderRadius: 3,
                                background: `linear-gradient(90deg, ${nextLevel.color}88, ${nextLevel.color})`,
                                transition: 'width 1s ease',
                            }} />
                        </div>
                        <div style={{
                            fontSize: 10, color: nextLevel.color, fontWeight: 600,
                            textAlign: 'center', marginTop: 6, fontFamily: 'var(--font-numeric)',
                        }}>
                            متبقي {(nextLevel.minPoints - currentPoints).toLocaleString()} نقطة للوصول إلى {nextLevel.label}
                        </div>
                    </div>
                )}
            </div>

            {/* All Levels */}
            {sortedLevels.length > 0 && (
                <div className="glass-card" style={{ marginBottom: 16, padding: 14 }}>
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        marginBottom: 12, fontSize: 13, fontWeight: 700,
                    }}>
                        <Sparkles size={16} style={{ color: 'var(--accent-amber)' }} />
                        المستويات
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {sortedLevels.map(lvl => {
                            const achieved = currentPoints >= lvl.minPoints;
                            return (
                                <div key={lvl.id} style={{
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    padding: '8px 12px', borderRadius: 'var(--radius-md)',
                                    background: achieved ? `${lvl.color}15` : 'var(--bg-glass)',
                                    border: `1px solid ${achieved ? `${lvl.color}33` : 'var(--border-glass)'}`,
                                    opacity: achieved ? 1 : 0.55,
                                }}>
                                    <span style={{ fontSize: 20 }}>{lvl.emoji}</span>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: 12, fontWeight: 700, color: lvl.color }}>{lvl.label}</div>
                                        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-numeric)' }}>
                                            {lvl.minPoints.toLocaleString()} نقطة
                                        </div>
                                    </div>
                                    {achieved && (
                                        <span style={{
                                            fontSize: 9, fontWeight: 700, padding: '2px 8px',
                                            borderRadius: 'var(--radius-full)',
                                            background: `${lvl.color}22`, color: lvl.color,
                                        }}>✓ محقق</span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Earning Rules — loaded from Firestore */}
            <div className="glass-card" style={{ marginBottom: 16, padding: 14 }}>
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    marginBottom: 12, fontSize: 13, fontWeight: 700,
                }}>
                    <Sparkles size={16} style={{ color: 'var(--accent-amber)' }} />
                    كيف تكسب النقاط
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <EarnRow icon={<Target size={14} />} text="حضور في الوقت" points={`+${pointValues?.onTimeAttendance ?? 10}`} color="var(--accent-emerald)" />
                    <EarnRow icon={<Flame size={14} />} text="حضور 5 أيام متتالية" points={`+${pointValues?.streak5Days ?? 50}`} color="var(--accent-amber)" />
                    <EarnRow icon={<Award size={14} />} text="شهر بدون غياب" points={`+${pointValues?.noAbsenceMonth ?? 100}`} color="var(--accent-blue)" />
                    <EarnRow icon={<TrendingUp size={14} />} text="أفضل موظف الشهر" points={`+${pointValues?.employeeOfMonth ?? 200}`} color="var(--accent-purple)" />
                </div>
            </div>
        </div>
    );
}

// === Earn Rule Row ===
function EarnRow({ icon, text, points, color }: {
    icon: React.ReactNode; text: string; points: string; color: string;
}) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
                width: 28, height: 28, borderRadius: 'var(--radius-md)',
                background: `${color}22`, color, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{icon}</div>
            <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{text}</span>
            <span style={{
                fontSize: 12, fontWeight: 800, fontFamily: 'var(--font-numeric)',
                color, padding: '2px 8px', borderRadius: 'var(--radius-full)',
                background: `${color}15`,
            }}>{points}</span>
        </div>
    );
}
