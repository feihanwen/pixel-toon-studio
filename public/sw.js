/* Offline app shell. API requests and cross-origin traffic are never cached. */
const CACHE = 'pixel-toon-app-v5';
self.addEventListener('install', event => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE);
        const response = await fetch(new URL('offline-manifest.json', self.registration.scope), { cache: 'no-store' });
        if (!response.ok) throw new Error('Offline manifest missing');
        const files = await response.json();
        await cache.addAll(files.map(file => new URL(file, self.registration.scope).href));
        await self.skipWaiting();
    })());
});
self.addEventListener('activate', event => event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('pixel-toon-app-') && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/api/') || url.pathname.endsWith('/sw.js')) return;
    event.respondWith((async () => {
        const cache = await caches.open(CACHE);
        if (event.request.mode === 'navigate') {
            try { const response = await fetch(event.request); if (response.ok) await cache.put(event.request, response.clone()); return response; }
            catch { return await cache.match(new URL('index.html', self.registration.scope).href) || Response.error(); }
        }
        const hit = await cache.match(event.request); if (hit) return hit;
        const response = await fetch(event.request);
        if (response.ok && (url.pathname.includes('/assets/') || url.pathname.includes('/models/'))) await cache.put(event.request, response.clone());
        return response;
    })());
});
