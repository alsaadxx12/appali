import React, { useState, useEffect } from 'react';
import {
    ArrowRight, Calendar, Check, X, Clock,
    Loader, Filter, Search, User, AlertTriangle
} from 'lucide-react';
import { db } from '../../firebase';
import { collection, getDocs, doc, updateDoc, query, orderBy, getDoc } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';

interface Props {
    onBack: () => void;
}

interface LeaveType {
    id: string;
    label: string;
    emoji: string;
    color: string;
}

interface LeaveRequest {
    id: string;
    employeeId: string;
    employeeName: string;
    type: string;
    startDate: string;
    endDate: string;
    startTime?: string;
    endTime?: string;
    reason: string;
    status: 'pending' | 'approved' | 'rejected';
    createdAt: string;
    reviewedBy?: string;
    reviewedAt?: string;
    days: number;
    isTimeBased?: boolean;
}

type FilterTab = 'pending' | 'approved' | 'rejected' | 'all';

export default function LeaveRequestsPage({ onBack }: Props) {
    const { user } = useAuth();
    const [requests, setRequests] = useState<LeaveRequest[]>([]);
    const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterTab, setFilterTab] = useState<FilterTab>('pending');
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            // Load leave types
            const leaveSnap = await getDoc(doc(db, 'settings', 'leaves'));
            if (leaveSnap.exists()) {
                const data = leaveSnap.data();
                if (data.leaveTypes) setLeaveTypes(data.leaveTypes);
            }

            // Load all leave requests
            const snap = await getDocs(collection(db, 'leaves'));
            const reqs: LeaveRequest[] = [];
            snap.forEach(d => {
                reqs.push({ id: d.id, ...d.data() } as LeaveRequest);
            });
            reqs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
            setRequests(reqs);
        } catch (e) {
            console.error('Error loading leave requests:', e);
        } finally {
            setLoading(false);
        }
    };

    const handleAction = async (requestId: string, action: 'approved' | 'rejected') => {
        if (!user) return;
        setActionLoading(requestId);
        try {
            await updateDoc(doc(db, 'leaves', requestId), {
                status: action,
                reviewedBy: user.name,
                reviewedAt: new Date().toISOString(),
            });
            setRequests(prev => prev.map(r =>
                r.id === requestId
                    ? { ...r, status: action, reviewedBy: user.name, reviewedAt: new Date().toISOString() }
                    : r
            ));
        } catch (e) {
            console.error('Error updating leave request:', e);
        } finally {
            setActionLoading(null);
        }
    };

    const getLeaveType = (typeId: string): LeaveType | undefined => {
        return leaveTypes.find(lt => lt.id === typeId);
    };

    const formatDate = (dateStr: string): string => {
        try {
            const d = new Date(dateStr);
            return d.toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' });
        } catch {
            return dateStr;
        }
    };

    const formatTime = (iso: string): string => {
        try {
            const d = new Date(iso);
            const now = Date.now();
            const diff = now - d.getTime();
            const mins = Math.floor(diff / 60000);
            if (mins < 60) return `منذ ${mins} دقيقة`;
            const hours = Math.floor(mins / 60);
            if (hours < 24) return `منذ ${hours} ساعة`;
            const days = Math.floor(hours / 24);
            if (days < 7) return `منذ ${days} يوم`;
            return d.toLocaleDateString('ar-SA');
        } catch {
            return '';
        }
    };

    const filtered = requests.filter(r => filterTab === 'all' || r.status === filterTab);
    const pendingCount = requests.filter(r => r.status === 'pending').length;

    const tabs: { id: FilterTab; label: string; color: string; count?: number }[] = [
        { id: 'pending', label: 'قيد الانتظار', color: '#f59e0b', count: pendingCount },
        { id: 'approved', label: 'مقبول', color: '#22c55e' },
        { id: 'rejected', label: 'مرفوض', color: '#ef4444' },
        { id: 'all', label: 'الكل', color: '#3b82f6' },
    ];

    if (loading) {
        return (
            <div className="page-content page-enter" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
                <Loader size={28} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent-blue)' }} />
            </div>
        );
    }

    return (
        <div className="page-content page-enter">
            {/* Header */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                marginBottom: 20, padding: '4px 0',
            }}>
                <button onClick={onBack} style={{
                    width: 36, height: 36, borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-glass)', border: '1px solid var(--border-glass)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--text-secondary)',
                }}>
                    <ArrowRight size={18} />
                </button>
                <div style={{ flex: 1 }}>
                    <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>📋 طلبات الإجازات</h2>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
                        {pendingCount > 0 ? `${pendingCount} طلب بانتظار المراجعة` : 'لا توجد طلبات معلقة'}
                    </p>
                </div>
            </div>

            {/* Filter Tabs */}
            <div style={{
                display: 'flex', gap: 6, marginBottom: 16,
                padding: '4px', borderRadius: 'var(--radius-lg)',
                background: 'var(--bg-glass)', border: '1px solid var(--border-glass)',
                overflowX: 'auto',
            }}>
                {tabs.map(tab => (
                    <button key={tab.id}
                        onClick={() => setFilterTab(tab.id)}
                        style={{
                            flex: 1, padding: '8px 10px', borderRadius: 'var(--radius-md)',
                            background: filterTab === tab.id
                                ? `${tab.color}20` : 'transparent',
                            border: filterTab === tab.id
                                ? `1px solid ${tab.color}40` : '1px solid transparent',
                            color: filterTab === tab.id ? tab.color : 'var(--text-muted)',
                            fontSize: 11, fontWeight: 700, transition: 'all 0.2s ease',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {tab.label}
                        {tab.count !== undefined && tab.count > 0 && (
                            <span style={{
                                padding: '1px 5px', borderRadius: 8,
                                background: tab.color, color: 'white',
                                fontSize: 9, fontWeight: 800, fontFamily: 'var(--font-numeric)',
                            }}>{tab.count}</span>
                        )}
                    </button>
                ))}
            </div>

            {/* Requests List */}
            {filtered.length === 0 ? (
                <div className="glass-card" style={{ textAlign: 'center', padding: '40px 16px' }}>
                    <Calendar size={36} style={{ color: 'var(--text-muted)', margin: '0 auto 10px', display: 'block', opacity: 0.3 }} />
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>
                        لا توجد طلبات
                    </div>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 30 }}>
                    {filtered.map(req => {
                        const lt = getLeaveType(req.type);
                        const color = lt?.color || '#3b82f6';
                        const isPending = req.status === 'pending';
                        const isLoading = actionLoading === req.id;

                        return (
                            <div key={req.id} className="glass-card" style={{
                                padding: '16px',
                                borderRight: `3px solid ${req.status === 'approved' ? '#22c55e' :
                                        req.status === 'rejected' ? '#ef4444' : '#f59e0b'
                                    }`,
                            }}>
                                {/* Top row: employee + status */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <div style={{
                                            width: 32, height: 32, borderRadius: 'var(--radius-full)',
                                            background: `${color}20`, display: 'flex', alignItems: 'center',
                                            justifyContent: 'center', fontSize: 16,
                                        }}>
                                            {lt?.emoji || '📋'}
                                        </div>
                                        <div>
                                            <div style={{ fontSize: 13, fontWeight: 800 }}>{req.employeeName}</div>
                                            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>
                                                {lt?.label || req.type}
                                                {req.isTimeBased && ' (زمنية)'}
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{
                                        padding: '3px 10px', borderRadius: 'var(--radius-full)',
                                        fontSize: 10, fontWeight: 700,
                                        background: req.status === 'approved' ? 'rgba(34,197,94,0.15)' :
                                            req.status === 'rejected' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                                        color: req.status === 'approved' ? '#22c55e' :
                                            req.status === 'rejected' ? '#ef4444' : '#f59e0b',
                                    }}>
                                        {req.status === 'approved' ? '✅ مقبول' :
                                            req.status === 'rejected' ? '❌ مرفوض' : '⏳ قيد الانتظار'}
                                    </div>
                                </div>

                                {/* Date info */}
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    padding: '8px 12px', borderRadius: 'var(--radius-md)',
                                    background: 'rgba(255,255,255,0.03)', marginBottom: 8,
                                    fontSize: 11, color: 'var(--text-secondary)',
                                }}>
                                    <Calendar size={13} style={{ flexShrink: 0 }} />
                                    <span style={{ fontFamily: 'var(--font-numeric)', fontWeight: 600 }}>
                                        {formatDate(req.startDate)} → {formatDate(req.endDate)}
                                    </span>
                                    <span style={{
                                        marginRight: 'auto', padding: '1px 6px',
                                        borderRadius: 6, background: `${color}15`, color,
                                        fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-numeric)',
                                    }}>
                                        {req.days} يوم
                                    </span>
                                </div>

                                {/* Time info for time-based leaves */}
                                {req.isTimeBased && req.startTime && req.endTime && (
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: 8,
                                        padding: '8px 12px', borderRadius: 'var(--radius-md)',
                                        background: 'rgba(139,92,246,0.06)', marginBottom: 8,
                                        fontSize: 11, color: '#8b5cf6', fontWeight: 600,
                                    }}>
                                        <Clock size={13} style={{ flexShrink: 0 }} />
                                        <span style={{ fontFamily: 'var(--font-numeric)' }}>
                                            من {req.startTime} إلى {req.endTime}
                                        </span>
                                    </div>
                                )}

                                {/* Reason */}
                                <div style={{
                                    fontSize: 11, color: 'var(--text-muted)',
                                    lineHeight: 1.6, marginBottom: 8,
                                    padding: '0 4px',
                                }}>
                                    💬 {req.reason}
                                </div>

                                {/* Timestamp */}
                                <div style={{
                                    fontSize: 9, color: 'var(--text-muted)',
                                    display: 'flex', alignItems: 'center', gap: 4,
                                    fontFamily: 'var(--font-numeric)', marginBottom: isPending ? 10 : 0,
                                }}>
                                    <Clock size={10} />
                                    {formatTime(req.createdAt)}
                                </div>

                                {/* Review info */}
                                {req.reviewedBy && (
                                    <div style={{
                                        fontSize: 10, color: 'var(--text-muted)',
                                        display: 'flex', alignItems: 'center', gap: 4,
                                        marginTop: 4,
                                    }}>
                                        <User size={10} />
                                        تمت المراجعة بواسطة: {req.reviewedBy}
                                    </div>
                                )}

                                {/* Actions for pending */}
                                {isPending && (
                                    <div style={{
                                        display: 'flex', gap: 8,
                                        paddingTop: 10, borderTop: '1px solid var(--border-glass)',
                                    }}>
                                        <button
                                            onClick={() => handleAction(req.id, 'approved')}
                                            disabled={isLoading}
                                            style={{
                                                flex: 1, padding: '10px 12px', borderRadius: 'var(--radius-md)',
                                                background: 'rgba(34,197,94,0.12)', color: '#22c55e',
                                                fontSize: 12, fontWeight: 700,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                                transition: 'all 0.2s ease',
                                                opacity: isLoading ? 0.5 : 1,
                                            }}
                                        >
                                            {isLoading ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={16} />}
                                            موافقة
                                        </button>
                                        <button
                                            onClick={() => handleAction(req.id, 'rejected')}
                                            disabled={isLoading}
                                            style={{
                                                flex: 1, padding: '10px 12px', borderRadius: 'var(--radius-md)',
                                                background: 'rgba(239,68,68,0.12)', color: '#ef4444',
                                                fontSize: 12, fontWeight: 700,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                                transition: 'all 0.2s ease',
                                                opacity: isLoading ? 0.5 : 1,
                                            }}
                                        >
                                            {isLoading ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <X size={16} />}
                                            رفض
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
