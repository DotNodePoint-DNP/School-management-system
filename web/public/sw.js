// Existing installations check this URL for updates. Retire only our old worker.
self.addEventListener("install", (event) =>
  event.waitUntil(self.skipWaiting()),
);
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await caches.delete("asteria-shell-v1");
      await self.clients.claim();
      await self.registration.unregister();
    })(),
  );
});
