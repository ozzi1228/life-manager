"use server";

// 0단계 AI 연결 시험(/dev/ai)의 서버 동작. 키 원문은 브라우저로 돌려보내지 않음(12 §4)
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { addConnection, askAI, isOwner, listConnections, moveConnection, removeConnection } from "@/lib/ai/chain";
import { KIND_LABEL, PLAN_KINDS, type Kind } from "@/lib/ai/engines";
import { loggedIn } from "@/lib/ai/login";

async function me() {
  const s = await auth.api.getSession({ headers: await headers() });
  if (!s) throw new Error("로그인이 필요해요(/dev/auth)");
  return { id: s.user.id, username: (s.user as { username?: string }).username ?? null };
}

export async function getState() {
  const s = await auth.api.getSession({ headers: await headers() });
  if (!s) return null;
  const u = { id: s.user.id, username: (s.user as { username?: string }).username ?? null };
  const owner = isOwner(u);
  return {
    username: u.username,
    owner,
    plans: owner ? { claude: loggedIn("claude"), codex: loggedIn("codex") } : null,
    connections: (await listConnections(u.id)).map((c) => ({
      id: c.id,
      kind: c.kind,
      label: KIND_LABEL[c.kind],
      plan: PLAN_KINDS.includes(c.kind),
      last4: c.secret_last4,
      model: c.model,
    })),
  };
}

export async function add(kind: Kind, secret: string, model: string) {
  try {
    await addConnection(await me(), kind, secret, model);
    return { ok: true, message: `${KIND_LABEL[kind]}을(를) 연결했어요` };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

export async function remove(id: string) {
  await removeConnection((await me()).id, id);
}

export async function move(id: string, dir: -1 | 1) {
  await moveConnection((await me()).id, id, dir);
}

export async function ask(prompt: string) {
  const r = await askAI(await me(), {
    system: "너는 개인 일상 관리 앱 '우나'의 AI 비서야. 한국어로 짧고 다정하게 답해.",
    prompt: prompt.slice(0, 2000),
  });
  return {
    text: r.text,
    by: r.by && KIND_LABEL[r.by],
    tried: r.tried.map((t) => ({
      label: KIND_LABEL[t.kind],
      result: "skipped" in t.result ? `건너뜀: ${t.result.skipped}` : t.result.ok ? "성공" : `${t.result.reason}: ${t.result.message}`,
    })),
  };
}
