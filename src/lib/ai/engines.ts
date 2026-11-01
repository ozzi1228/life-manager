// AI 연결 종류별 실행 (docs/planning/12 §3): 질문 하나 → 답 하나(글자). 도구 호출·대화 기록은 C-05에서
// 실패는 세 가지로 나눠 돌려줌 — LIMIT(한도·크레딧 소진: 다음 연결로 넘기고 한동안 건너뜀), AUTH(로그인·키 문제), ERROR
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { claudeBinary, codexBinary, loggedIn, planEnv } from "./login.ts";

export const KINDS = ["claude_plan", "chatgpt_plan", "anthropic_key", "openai_key", "gemini_key"] as const;
export type Kind = (typeof KINDS)[number];
export const PLAN_KINDS: readonly Kind[] = ["claude_plan", "chatgpt_plan"];

export const KIND_LABEL: Record<Kind, string> = {
  claude_plan: "Claude 구독",
  chatgpt_plan: "ChatGPT 구독",
  anthropic_key: "Claude API 키",
  openai_key: "OpenAI API 키",
  gemini_key: "Gemini API 키",
};

export type Ask = { system: string; prompt: string; model?: string | null; secret?: string };
export type Outcome = { ok: true; text: string } | { ok: false; reason: "LIMIT" | "AUTH" | "ERROR"; message: string; retryAt?: number };

const OUT_OF_CREDITS = /out of credits|credit balance|insufficient (?:credits|quota|funds|balance)|billing|payment required|\b402\b/i;
const fail = (reason: "LIMIT" | "AUTH" | "ERROR", message: string, retryAt?: number): Outcome => ({ ok: false, reason, message: message.slice(0, 300), retryAt });
function classify(text: string): "LIMIT" | "AUTH" | "ERROR" {
  if (OUT_OF_CREDITS.test(text) || /usage limit|rate limit|too many requests|\b429\b|quota/i.test(text)) return "LIMIT";
  if (/log ?in|sign ?in|auth|unauthori[sz]ed|\b401\b|\b403\b|api key|credential/i.test(text)) return "AUTH";
  return "ERROR";
}

const TIMEOUT_MS = 120_000;

// ── Claude 구독: Agent SDK(Claude Code)를 도구 없이, 한 턴만, 기록 없이 ──
async function claudePlan(a: Ask): Promise<Outcome> {
  if (!loggedIn("claude")) return fail("AUTH", "Claude 구독 로그인이 필요해요(scripts/ai-login.mts claude)");
  const exe = claudeBinary();
  if (!exe) return fail("ERROR", "Claude Code 실행 파일을 찾지 못했어요");
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  const cwd = mkdtempSync(join(tmpdir(), "oona-claude-"));
  let text = "";
  let out: Outcome | null = null;
  try {
    for await (const m of query({
      prompt: a.prompt,
      options: {
        model: a.model ?? "claude-opus-5-5",
        systemPrompt: { type: "custom", prompt: a.system },
        tools: [],
        allowedTools: [],
        permissionMode: "dontAsk",
        settingSources: [],
        maxTurns: 1,
        persistSession: false,
        cwd,
        env: planEnv("claude"),
        abortController: abort,
        pathToClaudeCodeExecutable: exe,
      },
    })) {
      if (m.type === "system" && m.subtype === "init" && m.apiKeySource !== "none") {
        // 구독이 아니라 API 키로 과금될 상황이면 실행하지 않음
        out = fail("AUTH", `Claude Code가 구독 대신 API 키(${m.apiKeySource})를 잡았어요`);
        abort.abort();
      } else if (m.type === "rate_limit_event" && m.rate_limit_info.status === "rejected") {
        const at = m.rate_limit_info.resetsAt;
        out = fail("LIMIT", "Claude 구독 사용량 한도에 닿았어요", at ? at * 1000 : undefined);
      } else if (m.type === "assistant" && m.error) {
        out ??= m.error === "rate_limit" || m.error === "billing_error" ? fail("LIMIT", `Claude: ${m.error}`) : m.error === "authentication_failed" || m.error === "oauth_org_not_allowed" ? fail("AUTH", `Claude: ${m.error}`) : null;
      } else if (m.type === "result") {
        if (m.subtype === "success" && !m.is_error) text = m.result.trim();
        else out ??= fail(classify(m.subtype === "success" ? m.result : m.errors.join("; ")), m.subtype === "success" ? m.result : m.errors.join("; "));
      }
    }
  } catch (e) {
    out ??= fail(abort.signal.aborted ? "ERROR" : classify(String(e)), abort.signal.aborted ? "시간 초과" : String(e));
  } finally {
    clearTimeout(timer);
    rmSync(cwd, { recursive: true, force: true });
  }
  return out ?? (text ? { ok: true, text } : fail("ERROR", "빈 답"));
}

// ── ChatGPT 구독: Codex CLI `codex exec`(읽기 전용, 셸·검색 등 내장 기능 끔, 기록 없음) ──
// agent-company(codex 0.157)에서 쓰는 잠금 설정과 같음
const CODEX_DISABLED = [
  "shell_tool", "unified_exec", "unified_exec_tty", "shell_snapshot", "apps", "plugins", "remote_plugin",
  "browser_use", "browser_use_external", "browser_use_full_cdp_access", "in_app_browser", "computer_use",
  "image_generation", "view_image", "memories", "multi_agent", "hooks", "skill_search",
  "skill_mcp_dependency_install", "tool_suggest", "workspace_dependencies", "worktrees", "goals", "sleep_tool",
  "realtime_conversation",
];
async function chatgptPlan(a: Ask): Promise<Outcome> {
  if (!loggedIn("codex")) return fail("AUTH", "ChatGPT 구독 로그인이 필요해요(scripts/ai-login.mts codex)");
  const exe = codexBinary();
  if (!exe) return fail("ERROR", "Codex 실행 파일을 찾지 못했어요");
  const cwd = mkdtempSync(join(tmpdir(), "oona-codex-"));
  const cfg: [string, string | number | boolean][] = [
    ["approval_policy", "never"],
    ["web_search", "disabled"],
    ["forced_login_method", "chatgpt"],
    ["history.persistence", "none"],
    ["check_for_update_on_startup", false],
    ["analytics.enabled", false],
    ["feedback.enabled", false],
    ["project_doc_max_bytes", 0],
  ];
  const args = [
    "exec", "--experimental-json", "--ephemeral", "--ignore-user-config", "--ignore-rules", "--skip-git-repo-check",
    "--sandbox", "read-only", "--cd", cwd,
    ...(a.model ? ["--model", a.model] : []),
    ...cfg.flatMap(([k, v]) => ["-c", `${k}=${typeof v === "string" ? JSON.stringify(v) : String(v)}`]), // TOML 값
    ...CODEX_DISABLED.flatMap((f) => ["--disable", f]),
    "-",
  ];
  try {
    return await new Promise<Outcome>((resolve) => {
      const child = spawn(exe, args, { env: planEnv("codex"), stdio: ["pipe", "pipe", "pipe"] });
      const timer = setTimeout(() => child.kill(), TIMEOUT_MS);
      let buf = "";
      let err = "";
      let text = "";
      let failed: Outcome | null = null;
      child.stdout.on("data", (d) => {
        buf += d;
        let i;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i);
          buf = buf.slice(i + 1);
          try {
            const ev = JSON.parse(line);
            if (ev.type === "item.completed" && ev.item?.type === "agent_message" && ev.item.text?.trim()) text = ev.item.text.trim();
            if (ev.type === "turn.failed" || ev.type === "error") {
              const msg = ev.error?.message ?? ev.message ?? "codex error";
              const m = /try again in\s+(?:(\d+)\s*(?:hours?|h))?\s*(?:(\d+)\s*(?:minutes?|mins?|m))?/i.exec(msg);
              const retry = m && (m[1] || m[2]) ? Date.now() + (Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0) + 1) * 60_000 : undefined;
              failed ??= fail(classify(msg), msg, retry);
            }
          } catch {
            // JSON이 아닌 줄은 무시
          }
        }
      });
      child.stderr.on("data", (d) => (err = (err + d).slice(-2000)));
      child.on("error", (e) => resolve(fail("ERROR", String(e))));
      child.on("close", () => {
        clearTimeout(timer);
        resolve(failed ?? (text ? { ok: true, text } : fail(classify(err), err.trim() || "빈 답")));
      });
      child.stdin.end(`${a.system}\n\n${a.prompt}`);
    });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

// ── API 키 ──
async function anthropicKey(a: Ask): Promise<Outcome> {
  const client = new Anthropic({ apiKey: a.secret, timeout: TIMEOUT_MS });
  try {
    const r = await client.beta.messages.create({
      model: a.model ?? "claude-opus-5-5",
      max_tokens: 16000,
      output_config: { effort: "medium" },
      // 안전 분류기가 거절하면 서버가 다른 모델로 이어서 답함(claude-opus-5-5 기본 권장)
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: a.system,
      messages: [{ role: "user", content: a.prompt }],
    });
    if (r.stop_reason === "refusal") return fail("ERROR", "Claude가 답하지 않았어요(거절)");
    const text = r.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
    return text ? { ok: true, text } : fail("ERROR", "빈 답");
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return fail("LIMIT", e.message);
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return fail("AUTH", e.message);
    if (e instanceof Anthropic.APIError) return fail(OUT_OF_CREDITS.test(e.message) ? "LIMIT" : "ERROR", e.message);
    return fail("ERROR", String(e));
  }
}

// OpenAI·Gemini는 공식 HTTP API를 바로 호출(글자 답만 필요해서 SDK를 들이지 않음)
async function httpJson(url: string, headers: Record<string, string>, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS) });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}
function httpFail(status: number, json: Record<string, unknown>): Outcome {
  const msg = JSON.stringify(json.error ?? json).slice(0, 300);
  if (status === 429 || OUT_OF_CREDITS.test(msg)) return fail("LIMIT", msg);
  if (status === 401 || status === 403) return fail("AUTH", msg);
  return fail(status === 400 && /api key/i.test(msg) ? "AUTH" : "ERROR", `${status} ${msg}`);
}

async function openaiKey(a: Ask): Promise<Outcome> {
  if (!a.model) return fail("ERROR", "OpenAI 모델 이름을 넣어 주세요");
  try {
    const { status, json } = await httpJson("https://api.openai.com/v1/responses", { authorization: `Bearer ${a.secret}` }, { model: a.model, instructions: a.system, input: a.prompt });
    if (status !== 200) return httpFail(status, json);
    const output = (json.output ?? []) as { type: string; content?: { type: string; text?: string }[] }[];
    const text = output.flatMap((o) => (o.type === "message" ? (o.content ?? []).filter((c) => c.type === "output_text").map((c) => c.text ?? "") : [])).join("").trim();
    return text ? { ok: true, text } : fail("ERROR", "빈 답");
  } catch (e) {
    return fail("ERROR", String(e));
  }
}

async function geminiKey(a: Ask): Promise<Outcome> {
  if (!a.model) return fail("ERROR", "Gemini 모델 이름을 넣어 주세요");
  try {
    // 키는 주소가 아니라 헤더로(주소는 로그에 남을 수 있음)
    const { status, json } = await httpJson(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(a.model)}:generateContent`,
      { "x-goog-api-key": a.secret ?? "" },
      { systemInstruction: { parts: [{ text: a.system }] }, contents: [{ role: "user", parts: [{ text: a.prompt }] }] },
    );
    if (status !== 200) return httpFail(status, json);
    const cand = (json.candidates ?? []) as { content?: { parts?: { text?: string }[] } }[];
    const text = (cand[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
    return text ? { ok: true, text } : fail("ERROR", "빈 답");
  } catch (e) {
    return fail("ERROR", String(e));
  }
}

export const ENGINES: Record<Kind, (a: Ask) => Promise<Outcome>> = {
  claude_plan: claudePlan,
  chatgpt_plan: chatgptPlan,
  anthropic_key: anthropicKey,
  openai_key: openaiKey,
  gemini_key: geminiKey,
};
