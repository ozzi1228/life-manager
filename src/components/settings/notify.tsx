"use client";

// 설정 > 알림 (SCR-SET-04, 04 §8.4): 이 기기에서 알림 받기(권한 요청은 버튼 탭에서 — iOS 규칙), 종류별 켜기·끄기
// + 주인만: 운영 상태(마지막 백업·예약 작업)
// ponytail: 방해 금지 시간·알림 시점 고르기·일정 알림은 아직(일정 알림은 시각 UTC 저장과 함께)
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { loadOpsStatus, notifySettings, setNotify, subscribePush, unsubscribePush } from "@/app/actions/settings";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { timeLabel } from "@/lib/format";
import type { OpsStatus } from "@/server/ops";

const KINDS = [
  { kind: "payment", title: "결제 예정", desc: "고정 지출 결제 하루 전 아침" },
  { kind: "budget", title: "예산", desc: "이번 달 예산의 80%를 쓰거나 넘었을 때" },
  { kind: "restraint", title: "참은 소비 정산", desc: "매달 1일 지난달 결과" },
] as const;
type Kind = (typeof KINDS)[number]["kind"];

const bytes = (b64: string) => Uint8Array.from(atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const deviceName = () => {
  const ua = navigator.userAgent;
  return /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac/.test(ua) ? "Mac" : "기타";
};

export function NotifySection() {
  const [state, setState] = useState<"loading" | "unsupported" | "ios-install" | "denied" | "off" | "on">("loading");
  const [prefs, setPrefs] = useState<Record<Kind, boolean> | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    notifySettings().then((r) => r.ok && setPrefs(r.data));
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const standalone = matchMedia("(display-mode: standalone)").matches;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return void queueMicrotask(() => setState(ios && !standalone ? "ios-install" : "unsupported"));
    if (Notification.permission === "denied") return void queueMicrotask(() => setState("denied"));
    navigator.serviceWorker.ready.then((reg) => reg.pushManager.getSubscription()).then((s) => setState(s ? "on" : "off"));
  }, []);

  async function turnOn() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!) });
      const r = await subscribePush(JSON.parse(JSON.stringify(sub)), deviceName());
      if (!r.ok) throw new Error();
      setState("on");
      toast("이 기기에서 알림을 받아요");
    } catch {
      setState(Notification.permission === "denied" ? "denied" : "off");
      toast("알림을 켜지 못했어요. 브라우저 알림 권한을 확인해 주세요");
    }
    setBusy(false);
  }
  async function turnOff() {
    setBusy(true);
    const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
    if (sub) {
      await unsubscribePush(sub.endpoint);
      await sub.unsubscribe();
    }
    setState("off");
    setBusy(false);
  }
  async function toggle(kind: Kind, on: boolean) {
    setPrefs((p) => p && { ...p, [kind]: on });
    const r = await setNotify(kind, on);
    if (!r.ok) setPrefs((p) => p && { ...p, [kind]: !on });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border p-4">
        <span className="min-w-0 flex-1">
          <span className="block font-medium">이 기기에서 알림 받기</span>
          <span className="text-muted-foreground text-sm">
            {state === "on" && "켜져 있어요"}
            {state === "off" && "꺼져 있어요"}
            {state === "denied" && "브라우저에서 알림이 꺼져 있어요. 브라우저 설정에서 우나의 알림을 허용해 주세요"}
            {state === "ios-install" && "iPhone은 공유 → 홈 화면에 추가한 앱에서만 알림을 받을 수 있어요"}
            {state === "unsupported" && "이 브라우저는 알림을 지원하지 않아요"}
          </span>
        </span>
        {state === "off" && (
          <Button size="sm" disabled={busy} onClick={turnOn}>
            알림 켜기
          </Button>
        )}
        {state === "on" && (
          <Button size="sm" variant="outline" disabled={busy} onClick={turnOff}>
            끄기
          </Button>
        )}
      </div>
      {prefs && (
        <ul className="divide-y rounded-lg border">
          {KINDS.map((k) => (
            <li key={k.kind}>
              <label className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block">{k.title}</span>
                  <span className="text-muted-foreground text-sm">{k.desc}</span>
                </span>
                <Switch checked={prefs[k.kind]} onCheckedChange={(on) => toggle(k.kind, on)} aria-label={`${k.title} 알림`} />
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const ago = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  return d.toDateString() === today.toDateString() ? `오늘 ${timeLabel(d)}` : `${d.getMonth() + 1}월 ${d.getDate()}일 ${timeLabel(d)}`;
};

export function OpsSection() {
  const [s, setS] = useState<OpsStatus | null | undefined>(undefined);
  useEffect(() => {
    loadOpsStatus().then((r) => setS(r.ok ? r.data : null));
  }, []);
  if (!s) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-subtitle font-semibold">운영</h2>
      <ul className="divide-y rounded-lg border text-sm">
        {s.jobs.map((j) => (
          <li key={j.job} className="flex items-center gap-3 px-4 py-2.5">
            <span className="flex-1">{j.label}</span>
            <span className={j.status === "failed" ? "text-destructive-text" : j.status ? "text-muted-foreground" : "text-warning-text"}>
              {!j.status ? "아직 안 했어요" : j.status === "failed" ? `실패 · ${ago(j.at!)}` : j.status === "running" ? "하는 중" : `${ago(j.at!)} 완료`}
            </span>
          </li>
        ))}
        <li className="flex items-center gap-3 px-4 py-2.5">
          <span className="flex-1">꺼짐 감시(하트비트)</span>
          <span className={s.heartbeat ? "text-muted-foreground" : "text-warning-text"}>{s.heartbeat ? "연결됨" : "연결 안 됨"}</span>
        </li>
      </ul>
    </section>
  );
}
