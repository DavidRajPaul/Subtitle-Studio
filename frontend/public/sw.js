// Subtitle Studio service worker: lets the app open without a connection once it has been
// visited. Network first, so a new version is used as soon as it is published; the cached copy
// is only a fallback when offline. Your videos and projects are never sent anywhere.
const CACHE = "subtitle-studio-app-v4";

// On install, store the start page and the files it loads, so the app opens offline even if
// the first visit never reloaded the page. Files loaded later are stored as they are used.
async function precache() {
  const cache = await caches.open(CACHE);
  const start = new URL("./", self.registration.scope).href;
  const response = await fetch(start, { cache: "no-cache" });
  if (!response.ok) return;
  await cache.put(start, response.clone());
  const html = await response.text();
  const urls = new Set(["manifest.webmanifest", "icon-192.png", "apple-touch-icon.png", "favicon.png"]);
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) urls.add(match[1]);
  await Promise.all(
    [...urls].map(async (u) => {
      const url = new URL(u, start);
      if (url.origin !== self.location.origin) return;
      try {
        const r = await fetch(url, { cache: "no-cache" });
        if (r.ok) await cache.put(url.href, r);
      } catch {
        // Stored later when used.
      }
    }),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache().catch(() => undefined));
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
  // The speech engine's WebAssembly files are large and cached by the engine itself.
  if (url.pathname.includes("/ort/")) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch (error) {
        // ignoreVary: module scripts carry an Origin header that the stored copy was not keyed on.
        const cached =
          (await cache.match(request, { ignoreVary: true })) ??
          (request.mode === "navigate"
            ? await cache.match(new URL("./", self.registration.scope).href, { ignoreVary: true })
            : undefined);
        if (cached) return cached;
        throw error;
      }
    })(),
  );
});
