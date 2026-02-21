import React, { useState } from 'react';
import {
    Users, UserCheck, UserX, AlertTriangle, Clock, Search,
    Filter, TrendingUp, Calendar, ChevronDown, ChevronUp,
    ArrowRight, Crown, Shield, Download, FileText, Gift
} from 'lucide-react';
import { AVATAR_COLORS } from '../data/demoData';
import { formatTimeString } from '../utils/timeUtils';
import VipFrame, { getVipLevel, getVipLabel, getVipColor } from '../components/VipFrame';
import VipBenefitsPage from './profile/VipBenefitsPage';

type FilterTab = 'all' | 'present' | 'late' | 'absent';
type AdminTab = 'attendance' | 'vip';

export default function AdminPage({ onBack }: { onBack: () => void }) {
    const employeeStatuses: any[] = [];
    const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [adminTab, setAdminTab] = useState<AdminTab>('attendance');
    const [showBenefits, setShowBenefits] = useState(false);

    const presentCount = 0;
    const absentCount = 0;
    const lateCount = 0;
    const totalCount = 0;
    const attendanceRate = 0;

    const statusConfig: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
        present: { label: 'حاضر', color: 'var(--accent-emerald)', bg: 'var(--accent-emerald-soft)', icon: <UserCheck size={14} /> },
        absent: { label: 'غائب', color: 'var(--accent-rose)', bg: 'var(--accent-rose-soft)', icon: <UserX size={14} /> },
        late: { label: 'متأخر', color: 'var(--accent-amber)', bg: 'var(--accent-amber-soft, rgba(245,158,11,0.15))', icon: <AlertTriangle size={14} /> },
    };

    const filteredEmployees = employeeStatuses;

    const getLateMinutes = (checkInTime?: string): number => {
        if (!checkInTime) return 0;
        const [h, m] = checkInTime.split(':').map(Number);
        const checkInMinutes = h * 60 + m;
        const shiftStart = 8 * 60 + 15;
        return Math.max(0, checkInMinutes - shiftStart);
    };

    const monthlyStats = { totalDays: 0, presentDays: 0, lateDays: 0, absentDays: 0 };

    const filterTabs: { id: FilterTab; label: string; count: number; color: string }[] = [
        { id: 'all', label: 'الكل', count: totalCount, color: 'var(--accent-blue)' },
        { id: 'present', label: 'حاضر', count: presentCount, color: 'var(--accent-emerald)' },
        { id: 'late', label: 'متأخر', count: lateCount, color: 'var(--accent-amber)' },
        { id: 'absent', label: 'غائب', count: absentCount, color: 'var(--accent-rose)' },
    ];

    // VIP data — empty (will be loaded from Firestore later)
    const vipEmployees: any[] = [];

    // ======== EXPORT FUNCTIONS ========
    const statusLabel = (s: string) => s === 'present' ? 'حاضر' : s === 'late' ? 'متأخر' : 'غائب';
    const todayStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'numeric', year: 'numeric' });

    const exportExcel = () => {
        const BOM = '\uFEFF';
        const header = 'الاسم,القسم,الحالة,وقت الحضور,دقائق التأخير';
        const rows = filteredEmployees.map(emp => {
            const lateMins = getLateMinutes(emp.checkInTime);
            return [
                emp.user.name,
                emp.user.department,
                statusLabel(emp.status),
                emp.checkInTime ? formatTimeString(emp.checkInTime) : 'لم يسجل',
                emp.status === 'late' ? lateMins.toString() : '0',
            ].join(',');
        });
        const csv = BOM + header + '\n' + rows.join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `بصمات_${todayStr.replace(/\//g, '-')}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const exportPDF = () => {
        const statusColor = (s: string) => s === 'present' ? '#10b981' : s === 'late' ? '#f59e0b' : '#ef4444';
        const tableRows = filteredEmployees.map((emp, i) => {
            const lateMins = getLateMinutes(emp.checkInTime);
            return `<tr style="border-bottom:1px solid #eee;">
                <td style="padding:8px 12px;text-align:center;font-family:'Segoe UI',sans-serif;">${i + 1}</td>
                <td style="padding:8px 12px;font-weight:600;">${emp.user.name}</td>
                <td style="padding:8px 12px;">${emp.user.department}</td>
                <td style="padding:8px 12px;text-align:center;"><span style="padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700;background:${statusColor(emp.status)}20;color:${statusColor(emp.status)};">${statusLabel(emp.status)}</span></td>
                <td style="padding:8px 12px;text-align:center;font-family:monospace;">${emp.checkInTime ? formatTimeString(emp.checkInTime) : '—'}</td>
                <td style="padding:8px 12px;text-align:center;">${emp.status === 'late' ? lateMins + ' دقيقة' : '—'}</td>
            </tr>`;
        }).join('');

        const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8">
<title>تقرير البصمات - ${todayStr}</title>
<style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;direction:rtl;padding:30px;background:#fff;color:#1a1a2e}
    .header{text-align:center;margin-bottom:30px;padding-bottom:20px;border-bottom:3px solid #3b82f6}
    .header h1{font-size:22px;color:#1a1a2e;margin-bottom:6px}
    .header p{font-size:14px;color:#666}
    .stats{display:flex;justify-content:center;gap:30px;margin-bottom:24px}
    .stat{text-align:center;padding:12px 20px;border-radius:10px}
    .stat .num{font-size:28px;font-weight:800}
    .stat .lbl{font-size:11px;font-weight:600;margin-top:4px}
    table{width:100%;border-collapse:collapse;margin-bottom:20px}
    th{padding:10px 12px;background:#f1f5f9;font-weight:700;font-size:12px;text-align:right;border-bottom:2px solid #e2e8f0}
    td{font-size:13px}
    .footer{text-align:center;font-size:11px;color:#999;margin-top:30px;padding-top:15px;border-top:1px solid #eee}
    @media print{body{padding:15px} .no-print{display:none!important}}
</style></head><body>
<div class="header">
    <h1>تقرير البصمات اليومي</h1>
    <p>التاريخ: ${todayStr}</p>
</div>
<div class="stats">
    <div class="stat" style="background:#10b98115;"><div class="num" style="color:#10b981;">${presentCount}</div><div class="lbl" style="color:#10b981;">حاضر</div></div>
    <div class="stat" style="background:#f59e0b15;"><div class="num" style="color:#f59e0b;">${lateCount}</div><div class="lbl" style="color:#f59e0b;">متأخر</div></div>
    <div class="stat" style="background:#ef444415;"><div class="num" style="color:#ef4444;">${absentCount}</div><div class="lbl" style="color:#ef4444;">غائب</div></div>
    <div class="stat" style="background:#3b82f615;"><div class="num" style="color:#3b82f6;">${attendanceRate}%</div><div class="lbl" style="color:#3b82f6;">نسبة الحضور</div></div>
</div>
<table>
    <thead><tr>
        <th style="text-align:center;width:40px;">#</th>
        <th>الاسم</th>
        <th>القسم</th>
        <th style="text-align:center;">الحالة</th>
        <th style="text-align:center;">وقت الحضور</th>
        <th style="text-align:center;">التأخير</th>
    </tr></thead>
    <tbody>${tableRows}</tbody>
</table>
<div class="footer">تم الإنشاء بواسطة نظام إدارة الحضور • ${new Date().toLocaleString('ar-IQ')}</div>
<script>window.onload=()=>window.print();</script>
</body></html>`;

        const w = window.open('', '_blank');
        if (w) { w.document.write(html); w.document.close(); }
    };

    return (
        <div className="page-content page-enter">
            {/* Back Header */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                marginBottom: 16, padding: '4px 0',
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
                    <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>لوحة الإدارة</h2>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>مراقبة الحضور وإدارة VIP</p>
                </div>
            </div>

            {/* Admin Tabs */}
            <div style={{
                display: 'flex', gap: 4, marginBottom: 16,
                padding: 4, borderRadius: 'var(--radius-lg)',
                background: 'var(--bg-glass)',
            }}>
                <button
                    onClick={() => setAdminTab('attendance')}
                    style={{
                        flex: 1, padding: '10px',
                        borderRadius: 'var(--radius-md)',
                        fontSize: 12, fontWeight: 700,
                        background: adminTab === 'attendance' ? 'linear-gradient(135deg, var(--accent-blue), var(--accent-purple))' : 'transparent',
                        color: adminTab === 'attendance' ? 'white' : 'var(--text-muted)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        transition: 'all 200ms ease',
                    }}
                >
                    <Shield size={14} />
                    الحضور
                </button>
                <button
                    onClick={() => setAdminTab('vip')}
                    style={{
                        flex: 1, padding: '10px',
                        borderRadius: 'var(--radius-md)',
                        fontSize: 12, fontWeight: 700,
                        background: adminTab === 'vip' ? 'linear-gradient(135deg, #ffd700, #ff8c00)' : 'transparent',
                        color: adminTab === 'vip' ? '#1a1a2e' : 'var(--text-muted)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        transition: 'all 200ms ease',
                    }}
                >
                    <Crown size={14} />
                    إدارة VIP
                </button>
            </div>

            {/* ========== ATTENDANCE TAB ========== */}
            {adminTab === 'attendance' && (
                <>
                    {/* Today's Summary */}
                    <div className="glass-card" style={{ padding: '18px', marginBottom: 16, position: 'relative', overflow: 'hidden' }}>
                        <div style={{
                            position: 'absolute', top: -30, left: -30, width: 100, height: 100,
                            borderRadius: '50%', background: 'var(--accent-blue)', opacity: 0.06, filter: 'blur(25px)',
                        }} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                            <Calendar size={16} style={{ color: 'var(--accent-blue)' }} />
                            <span style={{ fontSize: 13, fontWeight: 700 }}>ملخص اليوم</span>
                            <span style={{
                                fontSize: 11, color: 'var(--text-muted)', marginRight: 'auto',
                                fontFamily: 'var(--font-numeric)',
                            }}>
                                {todayStr}
                            </span>
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                            <div style={{ flex: 1, textAlign: 'center', padding: '12px 8px', borderRadius: 'var(--radius-md)', background: 'var(--accent-emerald-soft)' }}>
                                <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--accent-emerald)', fontFamily: 'var(--font-numeric)' }}>{presentCount}</div>
                                <div style={{ fontSize: 10, color: 'var(--accent-emerald)', fontWeight: 600, marginTop: 2 }}>حاضر</div>
                            </div>
                            <div style={{ flex: 1, textAlign: 'center', padding: '12px 8px', borderRadius: 'var(--radius-md)', background: 'var(--accent-amber-soft, rgba(245,158,11,0.15))' }}>
                                <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--accent-amber)', fontFamily: 'var(--font-numeric)' }}>{lateCount}</div>
                                <div style={{ fontSize: 10, color: 'var(--accent-amber)', fontWeight: 600, marginTop: 2 }}>متأخر</div>
                            </div>
                            <div style={{ flex: 1, textAlign: 'center', padding: '12px 8px', borderRadius: 'var(--radius-md)', background: 'var(--accent-rose-soft)' }}>
                                <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--accent-rose)', fontFamily: 'var(--font-numeric)' }}>{absentCount}</div>
                                <div style={{ fontSize: 10, color: 'var(--accent-rose)', fontWeight: 600, marginTop: 2 }}>غائب</div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--bg-glass-strong)', overflow: 'hidden' }}>
                                <div style={{
                                    height: '100%', borderRadius: 4, transition: 'width 500ms ease',
                                    width: `${attendanceRate}%`,
                                    background: attendanceRate >= 80
                                        ? 'linear-gradient(90deg, var(--accent-emerald), var(--accent-teal))'
                                        : attendanceRate >= 60
                                            ? 'linear-gradient(90deg, var(--accent-amber), var(--accent-orange))'
                                            : 'linear-gradient(90deg, var(--accent-rose), var(--accent-pink, #ec4899))',
                                }} />
                            </div>
                            <span style={{
                                fontSize: 14, fontWeight: 800, fontFamily: 'var(--font-numeric)',
                                color: attendanceRate >= 80 ? 'var(--accent-emerald)' : attendanceRate >= 60 ? 'var(--accent-amber)' : 'var(--accent-rose)',
                            }}>{attendanceRate}%</span>
                        </div>

                        {/* Export Buttons */}
                        <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
                            <button onClick={exportExcel} style={{
                                flex: 1, padding: '10px', borderRadius: 'var(--radius-md)',
                                background: 'linear-gradient(135deg, rgba(16,185,129,0.12), rgba(16,185,129,0.06))',
                                border: '1px solid rgba(16,185,129,0.2)',
                                color: 'var(--accent-emerald)',
                                fontSize: 11, fontWeight: 700,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                transition: 'all 200ms ease',
                            }}>
                                <Download size={14} />
                                تحميل Excel
                            </button>
                            <button onClick={exportPDF} style={{
                                flex: 1, padding: '10px', borderRadius: 'var(--radius-md)',
                                background: 'linear-gradient(135deg, rgba(239,68,68,0.12), rgba(239,68,68,0.06))',
                                border: '1px solid rgba(239,68,68,0.2)',
                                color: 'var(--accent-rose)',
                                fontSize: 11, fontWeight: 700,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                transition: 'all 200ms ease',
                            }}>
                                <FileText size={14} />
                                تحميل PDF
                            </button>
                        </div>
                    </div>

                    {/* Monthly Overview */}
                    <div className="glass-card" style={{ padding: '14px 16px', marginBottom: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                            <TrendingUp size={16} style={{ color: 'var(--accent-purple)' }} />
                            <span style={{ fontSize: 13, fontWeight: 700 }}>إحصائيات الشهر</span>
                        </div>
                        <div style={{ display: 'flex', gap: 16 }}>
                            <StatItem label="أيام الحضور" value={monthlyStats.presentDays} color="var(--accent-emerald)" />
                            <StatItem label="أيام التأخير" value={monthlyStats.lateDays} color="var(--accent-amber)" />
                            <StatItem label="أيام الغياب" value={monthlyStats.absentDays} color="var(--accent-rose)" />
                            <StatItem label="إجمالي الأيام" value={monthlyStats.totalDays} color="var(--accent-blue)" />
                        </div>
                    </div>

                    {/* Search & Filter */}
                    <div style={{ position: 'relative', marginBottom: 12 }}>
                        <Search size={16} style={{
                            position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                            color: 'var(--text-muted)',
                        }} />
                        <input
                            type="text" className="form-input"
                            placeholder="ابحث عن موظف..."
                            value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                            style={{ paddingRight: 38 }}
                        />
                    </div>

                    <div style={{ display: 'flex', gap: 6, marginBottom: 16, overflowX: 'auto' }}>
                        {filterTabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveFilter(tab.id)}
                                style={{
                                    padding: '8px 14px', borderRadius: 'var(--radius-full)',
                                    fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
                                    border: '1px solid',
                                    borderColor: activeFilter === tab.id ? tab.color : 'var(--border-glass)',
                                    background: activeFilter === tab.id ? `${tab.color}18` : 'var(--bg-glass)',
                                    color: activeFilter === tab.id ? tab.color : 'var(--text-muted)',
                                    transition: 'all 200ms ease',
                                    display: 'flex', alignItems: 'center', gap: 6,
                                }}
                            >
                                {tab.label}
                                <span style={{
                                    padding: '1px 7px', borderRadius: 'var(--radius-full)',
                                    fontSize: 10, fontWeight: 800,
                                    background: activeFilter === tab.id ? `${tab.color}25` : 'var(--bg-glass-strong)',
                                    color: activeFilter === tab.id ? tab.color : 'var(--text-muted)',
                                    fontFamily: 'var(--font-numeric)',
                                }}>{tab.count}</span>
                            </button>
                        ))}
                    </div>

                    {/* Employee List */}
                    <h3 className="section-title" style={{ fontSize: 14 }}>
                        <Users size={16} /> الموظفون
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400, marginRight: 6 }}>
                            ({filteredEmployees.length})
                        </span>
                    </h3>

                    {filteredEmployees.length === 0 ? (
                        <div className="glass-card" style={{ textAlign: 'center', padding: '30px 20px' }}>
                            <Filter size={32} style={{ color: 'var(--text-muted)', margin: '0 auto 10px', display: 'block' }} />
                            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>لا يوجد موظفون</div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>جرب تعديل معايير البحث أو الفلتر</div>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 20 }}>
                            {filteredEmployees.map((emp, idx) => {
                                const initials = emp.user.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2);
                                const color = AVATAR_COLORS[idx % AVATAR_COLORS.length];
                                const config = statusConfig[emp.status];
                                const isExpanded = expandedId === emp.user.id;
                                const lateMins = getLateMinutes(emp.checkInTime);
                                const empVipLevel = getVipLevel((emp.user as any).points || 0);

                                return (
                                    <div key={emp.user.id}>
                                        <button
                                            onClick={() => setExpandedId(isExpanded ? null : emp.user.id)}
                                            className="glass-card"
                                            style={{
                                                width: '100%', padding: '14px 16px', textAlign: 'right',
                                                transition: 'all 200ms ease',
                                                borderColor: isExpanded ? config.color : undefined,
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                <VipFrame level={empVipLevel} size={44}>
                                                    <div style={{
                                                        width: '100%', height: '100%', borderRadius: '50%',
                                                        background: color, color: 'white',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        fontSize: 15, fontWeight: 800, flexShrink: 0,
                                                        boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                                                    }}>
                                                        {initials}
                                                    </div>
                                                </VipFrame>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 3 }}>{emp.user.name}</div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-muted)' }}>
                                                        <span>{emp.user.department}</span>
                                                        {emp.checkInTime && (
                                                            <>
                                                                <span>•</span>
                                                                <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontFamily: 'var(--font-numeric)' }}>
                                                                    <Clock size={10} />
                                                                    {formatTimeString(emp.checkInTime)}
                                                                </span>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <span style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: 4,
                                                        padding: '4px 10px', borderRadius: 'var(--radius-full)',
                                                        fontSize: 11, fontWeight: 700,
                                                        background: config.bg, color: config.color,
                                                    }}>
                                                        {config.icon} {config.label}
                                                    </span>
                                                    {isExpanded ? <ChevronUp size={16} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={16} style={{ color: 'var(--text-muted)' }} />}
                                                </div>
                                            </div>
                                            {emp.status === 'late' && lateMins > 0 && (
                                                <div style={{
                                                    marginTop: 10, padding: '6px 12px', borderRadius: 'var(--radius-md)',
                                                    background: 'var(--accent-amber-soft, rgba(245,158,11,0.1))',
                                                    display: 'flex', alignItems: 'center', gap: 6,
                                                    fontSize: 11, color: 'var(--accent-amber)',
                                                }}>
                                                    <AlertTriangle size={12} />
                                                    <span>تأخير {lateMins} دقيقة عن الموعد</span>
                                                </div>
                                            )}
                                        </button>
                                        {isExpanded && (
                                            <div style={{
                                                padding: '14px 16px', marginTop: -4,
                                                borderRadius: '0 0 var(--radius-lg) var(--radius-lg)',
                                                background: 'var(--bg-glass)', border: '1px solid var(--border-glass)', borderTop: 'none',
                                            }}>
                                                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                                                    <DetailItem label="رقم الموظف" value={emp.user.id} color="var(--accent-blue)" />
                                                    <DetailItem label="الصلاحية" value={emp.user.role === 'admin' ? 'مشرف' : 'موظف'} color="var(--accent-purple)" />
                                                </div>
                                                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                                                    <DetailItem
                                                        label="وقت الحضور"
                                                        value={emp.checkInTime ? formatTimeString(emp.checkInTime) : 'لم يسجل'}
                                                        color={emp.checkInTime ? 'var(--accent-emerald)' : 'var(--accent-rose)'}
                                                    />
                                                    <DetailItem label="القسم" value={emp.user.department} color="var(--accent-teal)" />
                                                </div>
                                                {emp.status === 'late' && (
                                                    <div style={{
                                                        padding: '8px 12px', borderRadius: 'var(--radius-md)',
                                                        background: 'var(--accent-rose-soft)',
                                                        fontSize: 12, color: 'var(--accent-rose)', fontWeight: 600, textAlign: 'center',
                                                    }}>
                                                        خصم {lateMins * 2} نقطة بسبب التأخير ({lateMins} دقيقة × 2 نقطة)
                                                    </div>
                                                )}
                                                {emp.status === 'absent' && (
                                                    <div style={{
                                                        padding: '8px 12px', borderRadius: 'var(--radius-md)',
                                                        background: 'var(--accent-rose-soft)',
                                                        fontSize: 12, color: 'var(--accent-rose)', fontWeight: 600, textAlign: 'center',
                                                    }}>
                                                        غائب بدون تسجيل حضور — تم خصم النقاط الكاملة
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </>
            )}

            {/* ========== VIP MANAGEMENT TAB ========== */}
            {adminTab === 'vip' && showBenefits ? (
                <VipBenefitsPage onBack={() => setShowBenefits(false)} />
            ) : adminTab === 'vip' && (
                <div style={{ paddingBottom: 20 }}>
                    {/* VIP Benefits Button */}
                    <button
                        onClick={() => setShowBenefits(true)}
                        className="glass-card"
                        style={{
                            width: '100%', padding: '14px 16px', marginBottom: 16,
                            display: 'flex', alignItems: 'center', gap: 12,
                            background: 'linear-gradient(135deg, rgba(245,158,11,0.1), rgba(234,88,12,0.08))',
                            border: '1px solid rgba(245,158,11,0.2)',
                            cursor: 'pointer', transition: 'all 0.2s ease',
                        }}
                    >
                        <Gift size={22} style={{ color: '#f59e0b' }} />
                        <div style={{ flex: 1, textAlign: 'right' }}>
                            <div style={{ fontSize: 13, fontWeight: 800, color: '#f59e0b' }}>مزايا VIP</div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>مكافآت النقاط ورصيد الإجازات لكل مستوى</div>
                        </div>
                        <ChevronDown size={16} style={{ color: '#f59e0b', transform: 'rotate(-90deg)' }} />
                    </button>
                    {/* VIP Stats */}
                    <div className="glass-card" style={{ padding: '16px', marginBottom: 16, position: 'relative', overflow: 'hidden' }}>
                        <div style={{
                            position: 'absolute', top: -20, right: -20, width: 80, height: 80,
                            borderRadius: '50%', background: '#ffd700', opacity: 0.06, filter: 'blur(25px)',
                        }} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                            <Crown size={16} style={{ color: '#ffd700' }} />
                            <span style={{ fontSize: 13, fontWeight: 700 }}>إحصائيات VIP</span>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <div style={{
                                flex: 1, textAlign: 'center', padding: '10px 6px',
                                borderRadius: 'var(--radius-md)', background: 'rgba(185,242,255,0.08)',
                            }}>
                                <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--font-numeric)', color: '#b9f2ff' }}>
                                    {vipEmployees.filter(e => e.vipLevel === 'diamond').length}
                                </div>
                                <div style={{ fontSize: 9, fontWeight: 600, color: '#b9f2ff', marginTop: 2 }}>💎 ألماسي</div>
                            </div>
                            <div style={{
                                flex: 1, textAlign: 'center', padding: '10px 6px',
                                borderRadius: 'var(--radius-md)', background: 'rgba(255,215,0,0.08)',
                            }}>
                                <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--font-numeric)', color: '#ffd700' }}>
                                    {vipEmployees.filter(e => e.vipLevel === 'gold').length}
                                </div>
                                <div style={{ fontSize: 9, fontWeight: 600, color: '#ffd700', marginTop: 2 }}>👑 ذهبي</div>
                            </div>
                            <div style={{
                                flex: 1, textAlign: 'center', padding: '10px 6px',
                                borderRadius: 'var(--radius-md)', background: 'rgba(192,192,192,0.08)',
                            }}>
                                <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--font-numeric)', color: '#c0c0c0' }}>
                                    {vipEmployees.filter(e => e.vipLevel === 'silver').length}
                                </div>
                                <div style={{ fontSize: 9, fontWeight: 600, color: '#c0c0c0', marginTop: 2 }}>🥈 فضي</div>
                            </div>
                            <div style={{
                                flex: 1, textAlign: 'center', padding: '10px 6px',
                                borderRadius: 'var(--radius-md)', background: 'rgba(205,127,50,0.08)',
                            }}>
                                <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--font-numeric)', color: '#cd7f32' }}>
                                    {vipEmployees.filter(e => e.vipLevel === 'bronze').length}
                                </div>
                                <div style={{ fontSize: 9, fontWeight: 600, color: '#cd7f32', marginTop: 2 }}>🥉 برونزي</div>
                            </div>
                        </div>
                    </div>

                    {/* VIP Members List */}
                    <h3 className="section-title" style={{ fontSize: 14 }}>
                        <Crown size={16} />
                        أعضاء VIP
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400, marginRight: 6 }}>
                            ({vipEmployees.filter(e => e.vipLevel !== 'none').length})
                        </span>
                    </h3>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {vipEmployees.map((emp, idx) => {
                            const empIndex = emp.id.split('').reduce((a: number, c: string) => a + c.charCodeAt(0), 0);
                            const avatarColor = AVATAR_COLORS[empIndex % AVATAR_COLORS.length];
                            const initials = emp.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2);

                            return (
                                <div key={emp.id} className="glass-card" style={{ padding: '14px 16px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                        <VipFrame level={emp.vipLevel} size={48}>
                                            <div style={{
                                                width: '100%', height: '100%', borderRadius: '50%',
                                                background: avatarColor, color: 'white',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: 16, fontWeight: 800,
                                            }}>
                                                {initials}
                                            </div>
                                        </VipFrame>

                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 3 }}>{emp.name}</div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <span style={{
                                                    fontSize: 9, fontWeight: 700, padding: '2px 8px',
                                                    borderRadius: 'var(--radius-full)',
                                                    background: `${getVipColor(emp.vipLevel)}22`,
                                                    color: getVipColor(emp.vipLevel),
                                                }}>
                                                    {getVipLabel(emp.vipLevel) || 'مبتدئ'}
                                                </span>
                                                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{emp.department}</span>
                                            </div>
                                        </div>

                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{
                                                fontSize: 16, fontWeight: 900, fontFamily: 'var(--font-numeric)',
                                                color: getVipColor(emp.vipLevel),
                                            }}>{emp.points.toLocaleString()}</div>
                                            <div style={{ fontSize: 8, color: 'var(--text-muted)', fontWeight: 600 }}>نقطة</div>
                                        </div>
                                    </div>

                                    {/* Admin controls */}
                                    <div style={{
                                        display: 'flex', gap: 6, marginTop: 10, paddingTop: 10,
                                        borderTop: '1px solid var(--border-glass)',
                                    }}>
                                        <button style={{
                                            flex: 1, padding: '6px 10px', borderRadius: 'var(--radius-md)',
                                            background: 'var(--accent-emerald-soft)', color: 'var(--accent-emerald)',
                                            fontSize: 11, fontWeight: 700,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                                        }}>
                                            + إضافة نقاط
                                        </button>
                                        <button style={{
                                            flex: 1, padding: '6px 10px', borderRadius: 'var(--radius-md)',
                                            background: 'var(--accent-rose-soft)', color: 'var(--accent-rose)',
                                            fontSize: 11, fontWeight: 700,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                                        }}>
                                            - خصم نقاط
                                        </button>
                                    </div>

                                    {emp.badges.length > 0 && (
                                        <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
                                            {emp.badges.map((badge: string, i: number) => (
                                                <span key={i} style={{
                                                    fontSize: 9, fontWeight: 600, padding: '2px 8px',
                                                    borderRadius: 'var(--radius-full)',
                                                    background: 'rgba(255,255,255,0.05)',
                                                    color: 'var(--text-secondary)',
                                                }}>{badge}</span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

// === Small Stat Component ===
function StatItem({ label, value, color }: { label: string; value: number; color: string }) {
    return (
        <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color, fontFamily: 'var(--font-numeric)' }}>{value}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
        </div>
    );
}

// === Detail Item Component ===
function DetailItem({ label, value, color }: { label: string; value: string; color: string }) {
    return (
        <div style={{
            flex: 1, padding: '8px 10px', borderRadius: 'var(--radius-md)',
            background: 'var(--bg-glass-strong)',
        }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color }}>{value}</div>
        </div>
    );
}
