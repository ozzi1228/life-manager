// AI 연결 저장과 차례대로 시도하기 (docs/planning/12 §3·§4·§7, D-060)
// - 사용자마다 연결 목록과 순서를 저장. API 키는 암호화(secret.ts), 화면에는 끝 4자리만
// - 구독(claude_plan·chatgpt_plan)은 이 PC의 로그인 폴더를 쓰므로 소유자(.env OONA_OWNER_USERNAME)만. 다른 사용자 요청을
//   내 구독으로 보내는 것은 약관 위반(19 §4.2)
// - 순서대로 시도하고, 한도·로그인 문제·오류면 다음 연결로 자동으로 넘어감
import { pool } from "../db.ts";
import { ENGINES, KINDS, PLAN_KINDS, type Ask, type Kind, type Outcome } from "./engines.ts";
import { seal, unseal } from "./secret.ts";

export type Owner = { id: string; username?: string | null };
export const isOwner = (u: Owner) => !!process.env.OONA_OWNER_USERNAME && u.username === process.env.OONA_OWNER_USERNAME;

type Row = { id: string; kind: Kind; priority: number; secret: string | null; secret_last4: string | null; model: string | null };

export async function listConnections(userId: string) {
  const { rows } = await pool.query<Row>("select id, kind, priority, secret, secret_last4, model from ai_connection where user_id = $1 order by priority", [userId]);
  return rows;
}

export async function addConnection(u: Owner, kind: Kind, secret: string | null, model: string | null) {
  if (!KINDS.includes(kind)) throw new Error("알 수 없는 연결");
  if (PLAN_KINDS.includes(kind) && !isOwner(u)) throw new Error("구독 연결은 이 PC 주인 계정만 쓸 수 있어요");
  const key = secret?.trim() || null;
  if (!PLAN_KINDS.includes(kind) && !key) throw new Error("API 키를 넣어 주세요");
  await pool.query(
    `insert into ai_connection (user_id, kind, priority, secret, secret_last4, model)
     values ($1, $2, coalesce((select max(priority) + 1 from ai_connection where user_id = $1), 1), $3, $4, $5)
     on conflict (user_id, kind) do update set secret = excluded.secret, secret_last4 = excluded.secret_last4, model = excluded.model, updated_at = now()`,
    [u.id, kind, key && seal(key), key && key.slice(-4), model?.trim() || null],
  );
}

// 연결 해제는 바로 영구 삭제(비밀값은 보존 가치 없음, 12 §4)
export async function removeConnection(userId: string, id: string) {
  await pool.query("delete from ai_connection where user_id = $1 and id = $2", [userId, id]);
}

export async function moveConnection(userId: string, id: string, dir: -1 | 1) {
  const rows = await listConnections(userId);
  const i = rows.findIndex((r) => r.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= rows.length) return;
  await pool.query("update ai_connection set priority = case id when $2 then $4::int when $3 then $5::int end, updated_at = now() where user_id = $1 and id in ($2, $3)", [
    userId, rows[i].id, rows[j].id, rows[j].priority, rows[i].priority,
  ]);
}

// 한도에 닿은 연결은 풀릴 때까지 건너뜀(로그인·키 문제는 바로 실패하므로 건너뛰지 않음 — 다시 로그인하면 바로 쓰임)
// ponytail: 서버 메모리에만 둠(재시작하면 다시 시도). 여러 서버로 늘어나면 DB로
const skipUntil = new Map<string, number>();

export type Attempt = { kind: Kind; result: Outcome | { skipped: string } };

export async function askAI(u: Owner, ask: Omit<Ask, "model" | "secret">) {
  const tried: Attempt[] = [];
  for (const c of await listConnections(u.id)) {
    if (PLAN_KINDS.includes(c.kind) && !isOwner(u)) {
      tried.push({ kind: c.kind, result: { skipped: "주인 계정 전용" } });
      continue;
    }
    const until = skipUntil.get(c.id) ?? 0;
    if (until > Date.now()) {
      tried.push({ kind: c.kind, result: { skipped: `${new Date(until).toLocaleTimeString("ko-KR")}까지 건너뜀` } });
      continue;
    }
    const r = await ENGINES[c.kind]({ ...ask, model: c.model, secret: c.secret ? unseal(c.secret) : undefined });
    tried.push({ kind: c.kind, result: r });
    if (r.ok) return { text: r.text, by: c.kind, tried };
    if (r.reason === "LIMIT") skipUntil.set(c.id, r.retryAt ?? Date.now() + 60 * 60_000);
  }
  return { text: null, by: null, tried };
}
