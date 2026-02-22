const CACHE_NAME = 'attendance-cache-v3';
const STATIC_ASSETS = [
    '/',
    '/index.html',
];

// Install - Cache static assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS);
        })
    );
    self.skipWaiting();
});

// Activate - Clean old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys
                    .filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            );
        })
    );
    self.clients.claim();
});

// Fetch - Smart caching strategy
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);

    // Skip external/third-party requests (except Google Fonts & CDN assets)
    if (url.origin !== self.location.origin &&
        !url.hostname.includes('fonts.googleapis.com') &&
        !url.hostname.includes('fonts.gstatic.com') &&
        !url.hostname.includes('cdn.jsdelivr.net')) {
        return;
    }

    // For Firestore API calls - network first, cache fallback
    if (url.hostname.includes('firestore.googleapis.com') ||
        url.hostname.includes('firebase')) {
        return; // Let Firebase SDK handle its own caching via IndexedDB
    }

    // For fonts and CDN assets - cache first, network fallback (rarely change)
    if (url.hostname.includes('fonts.') || url.hostname.includes('cdn.jsdelivr')) {
        event.respondWith(
            caches.match(event.request).then((cached) => {
                if (cached) return cached;
                return fetch(event.request).then((response) => {
                    if (response.status === 200) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, clone);
                        });
                    }
                    return response;
                });
            })
        );
        return;
    }

    // For JS/CSS/HTML app assets - stale-while-revalidate
    event.respondWith(
        caches.match(event.request).then((cached) => {
            const fetchPromise = fetch(event.request)
                .then((response) => {
                    if (response.status === 200) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, clone);
                        });
                    }
                    return response;
                })
                .catch(() => {
                    // Offline - fall back to cached version
                    if (cached) return cached;
                    // For navigation requests, return the app shell
                    if (event.request.mode === 'navigate') {
                        return caches.match('/');
                    }
                    return new Response('Offline', { status: 503 });
                });

            // Return cached immediately, update in background
            return cached || fetchPromise;
        })
    );
});
