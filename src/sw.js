// build.js replaces the two placeholder values below before writing public/sw.js
const CACHE = "fitment-dev";
const PRECACHE = ["/"];

self.addEventListener("install", (ev) => {
    ev.waitUntil(
        caches
            .open(CACHE)
            .then((cache) => cache.addAll(PRECACHE))
            .then(() => self.skipWaiting()),
    );
});

self.addEventListener("activate", (ev) => {
    ev.waitUntil(
        caches
            .keys()
            .then((keys) =>
                Promise.all(
                    keys
                        .filter((k) => k !== CACHE)
                        .map((k) => caches.delete(k)),
                ),
            )
            .then(() => self.clients.claim()),
    );
});

self.addEventListener("fetch", (ev) => {
    if (ev.request.method !== "GET") return;
    ev.respondWith(
        caches.match(ev.request).then((hit) => {
            if (hit) return hit;
            return fetch(ev.request)
                .then((res) => {
                    if (!res.ok) return res;
                    caches
                        .open(CACHE)
                        .then((c) => c.put(ev.request, res.clone()));
                    return res;
                })
                .catch(() => caches.match("/"));
        }),
    );
});
