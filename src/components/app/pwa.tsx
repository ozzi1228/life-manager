"use client";

// PWA (17 M-20): 서비스 워커 등록·새 버전 안내, 연결 상태 띠(03 §10: 오프라인 / 서버에 연결할 수 없음)
import { CloudOff, ServerOff } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { HowToTip } from "@/components/app/help";

/** 루트에 한 번: 서비스 워커를 등록하고, 새 버전이 기다리면 "새로고침" 토스트 */
export function PwaUpdate() {
  useEffect(() => {
    // 개발 서버에서는 캐시가 화면 갱신을 방해하므로 운영에서만
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    let reloading = false;
    const ask = (w: ServiceWorker) =>
      toast("새 버전이 있어요", { duration: Infinity, action: { label: "새로고침", onClick: () => w.postMessage("SKIP_WAITING") } });
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloading) return;
      reloading = true;
      location.reload();
    });
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).then((reg) => {
      if (reg.waiting && navigator.serviceWorker.controller) ask(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const w = reg.installing;
        w?.addEventListener("statechange", () => {
          // 이미 다른 버전이 화면을 맡고 있을 때만(처음 설치는 안내하지 않음)
          if (w.state === "installed" && navigator.serviceWorker.controller) ask(w);
        });
      });
      // 앱을 다시 볼 때마다 새 버전 확인
      document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && reg.update());
    });
  }, []);
  return null;
}

const subscribeOnline = (cb: () => void) => {
  addEventListener("online", cb);
  addEventListener("offline", cb);
  return () => {
    removeEventListener("online", cb);
    removeEventListener("offline", cb);
  };
};

/** 기기는 온라인인데 집 PC 서버에 닿지 않는 경우까지 구분해 띠로 알림 */
export function ConnectionBanner() {
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const [serverDown, setServerDown] = useState(false);

  useEffect(() => {
    const ping = async () => {
      if (!navigator.onLine || document.visibilityState !== "visible") return;
      try {
        const r = await fetch("/api/health", { cache: "no-store", signal: AbortSignal.timeout(8000) });
        setServerDown(!r.ok);
      } catch {
        setServerDown(true);
      }
    };
    const t = setInterval(ping, 30_000);
    addEventListener("focus", ping);
    addEventListener("online", ping);
    return () => {
      clearInterval(t);
      removeEventListener("focus", ping);
      removeEventListener("online", ping);
    };
  }, []);

  if (!online)
    return (
      <div role="status" className="bg-warning text-warning-foreground flex items-center justify-center gap-2 px-4 py-1.5 text-sm">
        <CloudOff className="size-4" /> 오프라인이에요 · 최근 데이터를 보여 드려요
      </div>
    );
  if (serverDown)
    return (
      <div role="status" className="bg-warning text-warning-foreground flex items-center justify-center gap-1 px-4 py-1 text-sm">
        <ServerOff className="size-4" /> 서버에 연결할 수 없어요 · 최근 데이터를 보여 드려요
        <HowToTip label="서버 연결" steps={["휴대폰의 Tailscale이 켜져 있는지 확인해 주세요", "집 PC가 켜져 있는지 확인해 주세요"]} />
      </div>
    );
  return null;
}
