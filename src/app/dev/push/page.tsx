"use client";

// 0단계 V-04: 홈 화면 설치 + 웹 푸시 시험
import { useEffect, useState } from "react";
import type { PushSubscription as WebPushSubscription } from "web-push";
import { Button } from "@/components/ui/button";
import { clearSubscription, saveSubscription, sendTest } from "./actions";

function base64ToBytes(base64: string) {
  const b64 = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

type Env = { supported: boolean; standalone: boolean; ios: boolean; permission: string };

export default function PushTest() {
  const [env, setEnv] = useState<Env | null>(null);
  const [sub, setSub] = useState<PushSubscription | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const supported = "serviceWorker" in navigator && "PushManager" in window;
    // 화면이 가려져 있어도 실행되도록 프레임이 아닌 마이크로태스크로
    queueMicrotask(() =>
      setEnv({
        supported,
        standalone: window.matchMedia("(display-mode: standalone)").matches,
        ios: /iPad|iPhone|iPod/.test(navigator.userAgent),
        permission: "Notification" in window ? Notification.permission : "없음",
      }),
    );
    if (supported) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .then((reg) => reg.pushManager.getSubscription())
        .then(setSub)
        .catch(() => setMsg("서비스 워커를 등록하지 못했어요"));
    }
  }, []);

  // 권한 요청은 반드시 버튼 탭에서(iOS 규칙)
  async function subscribe() {
    try {
      const reg = await navigator.serviceWorker.ready;
      const s = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64ToBytes(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
      });
      setSub(s);
      await saveSubscription(JSON.parse(JSON.stringify(s)) as WebPushSubscription);
      setMsg("알림 받기를 켰어요");
    } catch {
      setMsg("알림을 켜지 못했어요. 브라우저 알림 권한을 확인해 주세요");
    }
  }

  async function unsubscribe() {
    await sub?.unsubscribe();
    setSub(null);
    await clearSubscription();
    setMsg("알림 받기를 껐어요");
  }

  async function test(delay: number) {
    setMsg((await sendTest(delay)).message);
  }

  return (
    <main className="mx-auto w-full max-w-md space-y-5 p-6">
      <h1 className="text-2xl font-bold">푸시 알림 시험</h1>

      {env && (
        <ul className="text-muted-foreground space-y-1 text-sm">
          <li>푸시 지원: {env.supported ? "예" : "아니요"}</li>
          <li>홈 화면 앱으로 실행 중: {env.standalone ? "예" : "아니요"}</li>
          <li>알림 권한: {env.permission}</li>
        </ul>
      )}

      {env?.ios && !env.standalone && (
        <p className="rounded-md border p-3 text-sm">
          iPhone은 홈 화면에 추가한 앱에서만 알림을 받을 수 있어요. Safari 공유 버튼 → 홈 화면에 추가 → 추가한
          아이콘으로 다시 열어 주세요.
        </p>
      )}

      {env?.supported &&
        (sub ? (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => test(0)}>지금 보내기</Button>
            <Button variant="secondary" onClick={() => test(10)}>
              10초 뒤 보내기
            </Button>
            <Button variant="outline" onClick={unsubscribe}>
              알림 끄기
            </Button>
          </div>
        ) : (
          <Button onClick={subscribe}>알림 받기</Button>
        ))}

      {msg && <p className="text-sm">{msg}</p>}
    </main>
  );
}
