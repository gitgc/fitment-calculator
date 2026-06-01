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
                    // Clone synchronously — before `res` is returned and its body
                    // consumed — otherwise the async cache write throws
                    // "Response body is already used".
                    const copy = res.clone();
                    // Tie the write to the event lifetime so it isn't terminated
                    // when the response is delivered, and so failures surface.
                    ev.waitUntil(
                        caches.open(CACHE).then((c) => c.put(ev.request, copy)),
                    );
                    return res;
                })
                .catch(() => caches.match("/"));
        }),
    );
});
