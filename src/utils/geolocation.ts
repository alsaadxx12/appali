import { GeoLocation, Branch } from '../types';

/**
 * Get the current GPS position
 */
export function getCurrentPosition(): Promise<GeoLocation> {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('الموقع الجغرافي غير مدعوم في هذا المتصفح'));
            return;
        }

        const handleSuccess = (position: GeolocationPosition) => {
            resolve({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy: position.coords.accuracy,
                timestamp: position.timestamp,
            });
        };

        const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

        const handleError = (error: GeolocationPositionError) => {
            // On iOS, high accuracy can fail — retry with lower accuracy
            if (error.code === error.TIMEOUT || error.code === error.POSITION_UNAVAILABLE) {
                navigator.geolocation.getCurrentPosition(
                    handleSuccess,
                    (retryError) => {
                        rejectWithMessage(retryError);
                    },
                    {
                        enableHighAccuracy: false,
                        timeout: 30000,
                        maximumAge: 120000,
                    }
                );
                return;
            }
            rejectWithMessage(error);
        };

        const rejectWithMessage = (error: GeolocationPositionError) => {
            switch (error.code) {
                case error.PERMISSION_DENIED:
                    reject(new Error(
                        isIOS
                            ? 'تم رفض إذن الموقع. افتح الإعدادات → الخصوصية → خدمات الموقع → Safari وفعّل الموقع'
                            : 'تم رفض إذن الوصول للموقع. يرجى السماح بالوصول للموقع من إعدادات المتصفح'
                    ));
                    break;
                case error.POSITION_UNAVAILABLE:
                    reject(new Error(
                        isIOS
                            ? 'تعذر تحديد الموقع. تأكد من تفعيل خدمات الموقع: الإعدادات → الخصوصية → خدمات الموقع'
                            : 'الموقع غير متاح حالياً. تأكد من تفعيل GPS في جهازك'
                    ));
                    break;
                case error.TIMEOUT:
                    reject(new Error('انتهت مهلة تحديد الموقع. تأكد من تفعيل GPS وحاول مرة أخرى'));
                    break;
                default:
                    reject(new Error('خطأ في تحديد الموقع. تأكد من تفعيل خدمات الموقع'));
            }
        };

        // First attempt: high accuracy with generous timeout
        navigator.geolocation.getCurrentPosition(
            handleSuccess,
            handleError,
            {
                enableHighAccuracy: true,
                timeout: 20000,
                maximumAge: 60000,
            }
        );
    });
}

/**
 * Calculate distance between two points using Haversine formula
 * Returns distance in meters
 */
export function calculateDistance(
    lat1: number, lon1: number,
    lat2: number, lon2: number
): number {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
        Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

/**
 * Check if a location is within the allowed radius of a branch
 */
export function isWithinRadius(
    userLocation: GeoLocation,
    branch: Branch
): boolean {
    const distance = calculateDistance(
        userLocation.latitude,
        userLocation.longitude,
        branch.latitude,
        branch.longitude
    );
    return distance <= branch.radiusMeters;
}

/**
 * Format distance for display
 */
export function formatDistance(meters: number): string {
    if (meters < 1000) {
        return `${Math.round(meters)} متر`;
    }
    return `${(meters / 1000).toFixed(1)} كم`;
}
