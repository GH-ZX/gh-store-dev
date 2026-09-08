/**
 * GH Store Service Worker cleanup.
 * Retires this worker and removes only the caches its previous versions owned.
 * There is deliberately no fetch handler or runtime cache.
 */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.allSettled(keys
        .filter((key) => key === "gh-store-v1" || key.startsWith("gh-store-pwa-"))
        .map((key) => Promise.resolve().then(() => caches.delete(key))));
    } catch { /* Cache storage may be unavailable; retirement must continue. */ }

    // Neither storage errors nor one failed lifecycle operation should prevent
    // the other retirement step from running.
    await Promise.allSettled([
      Promise.resolve().then(() => self.registration.unregister()),
      Promise.resolve().then(() => self.clients.claim()),
    ]);
  })());
});
