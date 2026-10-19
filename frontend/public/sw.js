// Subtitle Studio service worker: lets the app open without a connection once it has been
// visited. Network first, so a new version is used as soon as it is published; the cached copy
// is only a fallback when offline. Your videos and projects are never sent anywhere.
const CACHE = "subtitle-studio-app-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch (error) {
        const cached =
          (await cache.match(request)) ??
          (request.mode === "navigate" ? await cache.match(new URL("./", self.registration.scope).href) : undefined);
        if (cached) return cached;
        throw error;
      }
    })(),
  );
});
