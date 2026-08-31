/* =========================================================================
   Oremus - Service Worker (Offline PWA & Dynamic Cache Manager)
   ========================================================================= */

// ── Cache Versioning (Increment this string upon updates to refresh cache across browsers) ──
const CACHE_NAME = 'oremus-pwa-v1.3.6';

// Core shell assets to cache on install
const PRECACHE_ASSETS = [
    './divinum-officium.html',
    './manifest.webmanifest',
    './css/modern.css',
    './css/divinum_officium.css',
    './css/gregorian_search.css',
    './jquery.min.js',
    './moment.min.js',
    './moment.easter.js',
    './propersdata.js',
    './ordinarydata.js',
    './miscChants.js',
    './incipits.js',
    './js/Tone.min.js',
    './js/tones.js',
    './util.js',
    './exsurge.min.js',
    './jquery.hypher.js',
    './patterns/la-hypher.js',
    './patterns/fr-FR.js',
    './patterns/en-us.js',
    './patterns/it.js',
    './patterns/pl.js',
    './do_manifest.js',
    './js/bible_mappings.js',
    './js/divinum_officium.js',
    './js/vendor/dexie.min.js',
    './js/vendor/flexsearch.bundle.min.js',
    './js/gregorian_db.js',
    './js/gregorian_search_worker.js',
    './js/gregorian_search_ui.js',
    './data/gregorian_index.json',
    './Caeciliae-Staffless.ttf',
    './Caeciliae-Staffless-print.ttf',
    './icon/favicon.svg',
    './icon/apple-touch-icon.png',
    './icon/icon-192.png',
    './icon/icon-512.png'
];

// Install Event - Precache core assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(async (cache) => {
            // Cache essential assets individually so single failures don't break install
            await Promise.allSettled(
                PRECACHE_ASSETS.map((asset) =>
                    cache.add(asset).catch((err) => {
                        console.warn('[SW] Could not precache:', asset, err);
                    })
                )
            );
        }).then(() => self.skipWaiting())
    );
});

// Activate Event - Clean up old caches & claim clients
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        console.log('[SW] Removing old cache:', key);
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch Event - Hybrid Strategy:
// - HTML / Navigation & Scripts / CSS: Network-First with Cache Fallback
// - Static assets, Fonts, Chants & Data files: Cache-First (ignoreSearch: true) with Network Fallback + Dynamic Cache
self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    // Only handle HTTP/HTTPS GET requests
    if (request.method !== 'GET' || !url.protocol.startsWith('http')) {
        return;
    }

    // Ignore GitHub API updates & external feedback forms from caching
    if (url.hostname.includes('github.com') || url.hostname.includes('tally.so')) {
        return;
    }

    // HTML Navigation requests: Network-First, fallback to Cache
    if (request.mode === 'navigate' || request.destination === 'document' || url.pathname.endsWith('divinum-officium.html')) {
        event.respondWith(
            fetch(request)
                .then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        const responseClone = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(request, responseClone);
                        });
                    }
                    return networkResponse;
                })
                .catch(async () => {
                    const cachedResponse = await caches.match(request, { ignoreSearch: true });
                    if (cachedResponse) return cachedResponse;
                    const fallbackDoc = await caches.match('./divinum-officium.html', { ignoreSearch: true });
                    return fallbackDoc || Response.error();
                })
        );
        return;
    }

    // Static Assets & Data files (do_data, js, css, images, fonts)
    event.respondWith(
        fetch(request)
            .then((networkResponse) => {
                if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(request, responseClone);
                    });
                }
                return networkResponse;
            })
            .catch(async () => {
                // Offline fallback with ignoreSearch: true so cache hits succeed even with query strings
                const cached = await caches.match(request, { ignoreSearch: true });
                if (cached) return cached;
                return new Response('', { status: 408, statusText: 'Offline' });
            })
    );
});

// Listen for messages from client (e.g. skipWaiting on update)
self.addEventListener('message', (event) => {
    if (event.data && event.data.action === 'skipWaiting') {
        self.skipWaiting();
    }
});
