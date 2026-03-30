const STATIC_CACHE = 'gestao-de-plantoes-static-v3';
const RUNTIME_CACHE = 'gestao-de-plantoes-runtime-v3';
const APP_SHELL = [
    '/',
    '/offline.html',
    '/manifest.webmanifest?v=20260329-gestao-de-plantoes',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    '/icons/icon-maskable-512.png'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(STATIC_CACHE).then(cache => cache.addAll(APP_SHELL))
    );
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys
                    .filter(key => ![STATIC_CACHE, RUNTIME_CACHE].includes(key))
                    .map(key => caches.delete(key))
            )
        )
    );
    self.clients.claim();
});

self.addEventListener('message', event => {
    if (event.data?.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

self.addEventListener('fetch', event => {
    const { request } = event;

    if (request.method !== 'GET') {
        return;
    }

    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
        event.respondWith(fetch(request));
        return;
    }

    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then(response => {
                    const copy = response.clone();
                    caches.open(RUNTIME_CACHE).then(cache => cache.put(request, copy));
                    return response;
                })
                .catch(async () => {
                    const cachedPage = await caches.match(request);
                    return cachedPage || caches.match('/offline.html');
                })
        );
        return;
    }

    if (url.pathname === '/manifest.webmanifest' || url.pathname === '/sw.js') {
        event.respondWith(fetch(request, { cache: 'no-store' }));
        return;
    }

    event.respondWith(
        fetch(request)
            .then(response => {
                if (!response || response.status !== 200 || response.type !== 'basic') {
                    return response;
                }

                const copy = response.clone();
                caches.open(RUNTIME_CACHE).then(cache => cache.put(request, copy));
                return response;
            })
            .catch(() => caches.match(request))
    );
});
