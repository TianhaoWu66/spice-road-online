/* 香料商路 · Service Worker：离线缓存（飞机模式） */
const CACHE = "spice-road-v1";
const PRECACHE = [
  "/",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/audio/jimou.mp3",
  "/audio/laoshouxiwantong.mp3",
  "/audio/nizhou.mp3",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = request.url;
  if (request.method !== "GET" || !url.startsWith(self.location.origin)) return;
  if (url.includes("/api/")) return; // API 永不缓存，保证联机数据实时

  // 页面导航：网络优先，断网回退缓存
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((hit) => hit || caches.match("/")))
    );
    return;
  }

  // 静态资源：缓存优先，网络兜底
  event.respondWith(
    caches.match(request).then((hit) => hit || fetch(request).then((response) => {
      if (response.ok && response.type === "basic") {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    }))
  );
});
