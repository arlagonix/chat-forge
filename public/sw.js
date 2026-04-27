const CACHE_NAME = "chat-forge-v1.0";
const BASE_PATH = "/chat-forge";
const APP_SHELL = [
  `${BASE_PATH}/`,
  `${BASE_PATH}/manifest.webmanifest`,
  `${BASE_PATH}/icon.svg`,
  `${BASE_PATH}/icon.png`,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  if (req.method !== "GET") {
    return;
  }

  const url = new URL(req.url);

  if (req.mode === "navigate") {
    event.respondWith(networkFirst(req, `${BASE_PATH}/`));
    return;
  }

  if (
    req.destination === "font" ||
    url.pathname.endsWith(".woff") ||
    url.pathname.endsWith(".woff2") ||
    url.pathname.endsWith(".ttf") ||
    url.pathname.endsWith(".otf")
  ) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  if (
    url.pathname.endsWith(".css") ||
    url.hostname === "fonts.googleapis.com"
  ) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(req));
  }
});

async function networkFirst(req, fallbackKey) {
  try {
    const response = await fetch(req);

    if (isCacheable(response)) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(fallbackKey || req, response.clone());
    }

    return response;
  } catch {
    const cached = await caches.match(fallbackKey || req);
    if (cached) {
      return cached;
    }

    if (req.mode === "navigate") {
      return caches.match(`${BASE_PATH}/`);
    }

    throw new Error("Network error and no cache entry found.");
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);

  const networkPromise = fetch(req)
    .then(async (response) => {
      if (isCacheable(response)) {
        await cache.put(req, response.clone());
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    networkPromise.catch(() => {});
    return cached;
  }

  const networkResponse = await networkPromise;
  if (networkResponse) {
    return networkResponse;
  }

  throw new Error("Network error and no cache entry found.");
}

function isCacheable(response) {
  return response && (response.status === 200 || response.status === 0);
}
