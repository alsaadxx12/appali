import React from 'react';

interface StatusCardProps {
    icon: React.ReactNode;
    value: string;
    label: string;
    color: 'emerald' | 'rose' | 'amber' | 'blue' | 'purple';
}

export default function StatusCard({ icon, value, label, color }: StatusCardProps) {
    return (
        <div className="status-card">
            <div className={`status-icon ${color}`}>
                {icon}
            </div>
            <div className="status-value">{value}</div>
            <div className="status-label">{label}</div>
        </div>
    );
}
