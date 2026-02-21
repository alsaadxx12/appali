import React from 'react';
import { LogIn, LogOut } from 'lucide-react';
import { formatTime } from '../utils/timeUtils';

interface AttendanceButtonProps {
    isCheckedIn: boolean;
    onPress: () => void;
    disabled?: boolean;
}

export default function AttendanceButton({ isCheckedIn, onPress, disabled }: AttendanceButtonProps) {
    const now = new Date();

    return (
        <div className="attendance-btn-container">
            <button
                className={`attendance-btn ${isCheckedIn ? 'check-out' : 'check-in'} pulse`}
                onClick={onPress}
                disabled={disabled}
            >
                {isCheckedIn ? (
                    <LogOut className="btn-icon" />
                ) : (
                    <LogIn className="btn-icon" />
                )}
                <span className="btn-label">
                    {isCheckedIn ? 'تسجيل انصراف' : 'تسجيل حضور'}
                </span>
                <span className="btn-time">{formatTime(now)}</span>
            </button>
        </div>
    );
}
