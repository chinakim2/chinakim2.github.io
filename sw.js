const CACHE_NAME = "qing-plan-20260317-2";
const APP_REVISION = "20260317-2";
const CORE_ASSETS = [
  "./",
  "./index.html",
  `./styles.css?v=${APP_REVISION}`,
  `./app.js?v=${APP_REVISION}`,
  `./config.js?v=${APP_REVISION}`,
  `./manifest.webmanifest?v=${APP_REVISION}`,
  `./icons/icon-192.png?v=${APP_REVISION}`,
  `./icons/icon-512.png?v=${APP_REVISION}`,
  `./icons/apple-touch-icon.png?v=${APP_REVISION}`,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  const isAppShellRequest =
    event.request.mode === "navigate" ||
    ["document", "style", "script", "manifest"].includes(event.request.destination);

  if (isAppShellRequest) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const responseCopy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseCopy));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          return cached || caches.match("./index.html");
        }),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(event.request).then((response) => {
        const responseCopy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseCopy));
        return response;
      });
    }),
  );
});
