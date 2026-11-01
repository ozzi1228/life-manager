"use server";

// 0단계 V-04 전용. ponytail: 구독은 서버 메모리에만(재시작하면 사라짐). 정식 저장은 push_subscriptions 테이블(14 §3)
import webpush, { type PushSubscription } from "web-push";

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
);

let subscription: PushSubscription | null = null;

export async function saveSubscription(sub: PushSubscription) {
  subscription = sub;
}

export async function clearSubscription() {
  subscription = null;
}

export async function sendTest(delaySeconds: number) {
  if (!subscription) return { ok: false, message: "알림 받기를 먼저 켜 주세요" };
  const sub = subscription;
  const send = () =>
    webpush.sendNotification(
      sub,
      JSON.stringify({ title: "우나", body: "푸시 알림 시험이에요 🐾", url: "/dev/push" }),
    );
  if (delaySeconds > 0) {
    // 앱을 닫거나 화면을 끈 상태에서도 오는지 보려고 늦게 보냄
    setTimeout(() => send().catch((e) => console.error("push failed", e)), delaySeconds * 1000);
    return { ok: true, message: `${delaySeconds}초 뒤에 보내요. 앱을 닫아 보세요` };
  }
  try {
    await send();
    return { ok: true, message: "보냈어요" };
  } catch (e) {
    console.error("push failed", e);
    return { ok: false, message: "보내지 못했어요" };
  }
}
