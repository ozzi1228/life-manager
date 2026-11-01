// 서비스 워커 (docs/planning/16 PWA, 17 M-20). 빌드마다 버전이 바뀌어 브라우저가 새 버전을 알아챔 → 앱이 "새 버전" 안내
// - 정적 파일(_next/static·펫·아이콘): 캐시 먼저(파일 이름에 해시가 있어 바뀌지 않음)
// - 화면 이동: 네트워크 먼저, 실패하면 저장해 둔 화면, 그것도 없으면 /offline
// - API·인증: 캐시하지 않음(데이터는 항상 서버에서)
// - 푸시 알림 받기·누르기(V-04)
const VERSION = process.env.OONA_BUILD ?? "dev";

const script = `
const VERSION = ${JSON.stringify(VERSION)};
const STATIC = "oona-static-" + VERSION;
const PAGES = "oona-pages-" + VERSION;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(PAGES).then((c) => c.add("/offline")));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => !k.endsWith(VERSION)).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

// 앱이 "새로고침"을 누르면 기다리던 새 버전으로 바로 바꿈
self.addEventListener("message", (e) => {
  if (e.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;

  if (/^\\/(_next\\/static|pets|icons)\\//.test(url.pathname)) {
    e.respondWith(
      caches.open(STATIC).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) c.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          // 로그인 화면 등으로 돌려보낸 응답(redirect)은 담지 않음
          if (res.ok && !res.redirected) caches.open(PAGES).then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(async () => (await caches.match(req)) || (await caches.match("/offline"))),
    );
  }
});

self.addEventListener("push", (e) => {
  const data = e.data ? e.data.json() : {};
  e.waitUntil(
    self.registration.showNotification(data.title || "우나", {
      body: data.body || "",
      icon: "/icons/small-96.png",
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data?.url || "/"));
});
`;

export function GET() {
  return new Response(script, { headers: { "content-type": "application/javascript; charset=utf-8" } });
}
