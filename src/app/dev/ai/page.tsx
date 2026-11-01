"use client";

// 0단계 AI 연결 시험: 연결 추가·순서·삭제, 질문해서 어느 연결이 답했는지 확인(docs/planning/12 §3, D-060)
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { add, ask, getState, move, remove } from "./actions";

type State = Awaited<ReturnType<typeof getState>>;
type Answer = Awaited<ReturnType<typeof ask>>;

const KEY_KINDS = [
  { kind: "anthropic_key", label: "Claude API 키", model: "비우면 claude-opus-5-5" },
  { kind: "openai_key", label: "OpenAI API 키", model: "모델 이름(필수)" },
  { kind: "gemini_key", label: "Gemini API 키", model: "모델 이름(필수)" },
] as const;

export default function AiTest() {
  const [state, setState] = useState<State | undefined>();
  const [msg, setMsg] = useState("");
  const [kind, setKind] = useState<(typeof KEY_KINDS)[number]["kind"]>("anthropic_key");
  const [secret, setSecret] = useState("");
  const [model, setModel] = useState("");
  const [prompt, setPrompt] = useState("오늘 하루 응원 한마디 해줘");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [busy, start] = useTransition();

  const refresh = () => getState().then(setState);
  useEffect(() => {
    queueMicrotask(refresh);
  }, []);

  const run = (f: () => Promise<unknown>) => start(async () => {
    await f();
    await refresh();
  });

  if (state === undefined) return <main className="p-6">불러오는 중…</main>;
  if (state === null)
    return (
      <main className="mx-auto max-w-md space-y-3 p-6">
        <h1 className="text-2xl font-bold">AI 연결 시험</h1>
        <p>먼저 <a className="underline" href="/dev/auth">로그인 시험</a>에서 로그인해 주세요.</p>
      </main>
    );

  const has = (k: string) => state.connections.some((c) => c.kind === k);

  return (
    <main className="mx-auto w-full max-w-xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">AI 연결 시험</h1>
      <p className="text-muted-foreground text-sm">
        {state.username} 계정 · {state.owner ? "이 PC 주인 계정(구독 연결 가능)" : "구독 연결은 이 PC 주인 계정만 쓸 수 있어요"}
      </p>

      <section className="space-y-2">
        <p className="font-semibold">사용 순서 (위에서부터 시도, 안 되면 다음으로)</p>
        {state.connections.length === 0 && <p className="text-muted-foreground text-sm">아직 연결이 없어요.</p>}
        <ol className="space-y-2">
          {state.connections.map((c, i) => (
            <li key={c.id} className="bg-card flex items-center gap-2 rounded-lg border p-3 text-sm">
              <span className="w-5 text-center font-semibold">{i + 1}</span>
              <span className="flex-1">
                {c.label}
                {c.last4 && <span className="text-muted-foreground"> · …{c.last4}</span>}
                {c.model && <span className="text-muted-foreground"> · {c.model}</span>}
                {c.plan && state.plans && (
                  <span className="text-muted-foreground"> · {state.plans[c.kind === "claude_plan" ? "claude" : "codex"] ? "로그인됨" : "로그인 필요"}</span>
                )}
              </span>
              <Button size="sm" variant="outline" disabled={busy || i === 0} onClick={() => run(() => move(c.id, -1))} aria-label="위로">↑</Button>
              <Button size="sm" variant="outline" disabled={busy || i === state.connections.length - 1} onClick={() => run(() => move(c.id, 1))} aria-label="아래로">↓</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => remove(c.id))}>
                삭제
              </Button>
            </li>
          ))}
        </ol>
      </section>

      {state.owner && (
        <section className="space-y-2 text-sm">
          <p className="font-semibold">구독 연결 (이 PC에 로그인된 구독)</p>
          <div className="flex flex-wrap gap-2">
            {(["claude_plan", "chatgpt_plan"] as const).map((k) => (
              <Button key={k} variant="outline" disabled={busy || has(k)} onClick={() => run(async () => setMsg((await add(k, "", "")).message))}>
                {k === "claude_plan" ? "Claude 구독 추가" : "ChatGPT 구독 추가"}
              </Button>
            ))}
          </div>
          <p className="text-muted-foreground">
            로그인은 이 PC 터미널에서: <code>node --env-file=.env scripts/ai-login.mts claude</code> (ChatGPT는 <code>codex</code>)
          </p>
        </section>
      )}

      <section className="space-y-2 text-sm">
        <p className="font-semibold">API 키 연결</p>
        <select className="w-full rounded-md border px-3 py-2" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          {KEY_KINDS.map((k) => (
            <option key={k.kind} value={k.kind}>
              {k.label}
            </option>
          ))}
        </select>
        <input type="password" autoComplete="off" placeholder="API 키" className="w-full rounded-md border px-3 py-2" value={secret} onChange={(e) => setSecret(e.target.value)} />
        <input placeholder={KEY_KINDS.find((k) => k.kind === kind)!.model} className="w-full rounded-md border px-3 py-2" value={model} onChange={(e) => setModel(e.target.value)} />
        <Button
          disabled={busy || !secret}
          onClick={() =>
            run(async () => {
              const r = await add(kind, secret, model);
              setMsg(r.message);
              if (r.ok) setSecret("");
            })
          }
        >
          키 저장
        </Button>
        <p className="text-muted-foreground">키는 암호화해 저장하고 끝 4자리만 보여요. 같은 종류를 다시 저장하면 바뀌어요.</p>
      </section>

      {msg && <p className="text-sm">{msg}</p>}

      <section className="space-y-2 text-sm">
        <p className="font-semibold">질문해 보기</p>
        <textarea className="w-full rounded-md border px-3 py-2" rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
        <Button disabled={busy || !prompt.trim()} onClick={() => start(async () => setAnswer(await ask(prompt)))}>
          {busy ? "답을 기다리는 중…" : "보내기"}
        </Button>
        {answer && (
          <div className="bg-card space-y-2 rounded-lg border p-3">
            <p className="whitespace-pre-wrap">{answer.text ?? "모든 연결이 실패했어요."}</p>
            {answer.by && <p className="text-muted-foreground">답한 연결: {answer.by}</p>}
            <ul className="text-muted-foreground list-disc pl-5">
              {answer.tried.map((t, i) => (
                <li key={i}>
                  {t.label}: {t.result}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </main>
  );
}
