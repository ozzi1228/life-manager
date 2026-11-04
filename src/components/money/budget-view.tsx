"use client";

// 월별 예산 (SCR-FIN-04) + 예산 편집 (SCR-FIN-05). 계산은 서버(src/server/budget.ts)가 해서 넘겨 줌
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { copyLastMonthBudget, markPlannedDone, saveMonthBudget } from "@/app/actions/budget";
import { InfoTip } from "@/components/app/help";
import { AmountInput, BudgetBar } from "@/components/app/money";
import { ResponsiveModal } from "@/components/app/responsive";
import { EmptyState } from "@/components/app/states";
import { MonthNav } from "@/components/money/controls";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { dayLabel, fromYmd, money } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { budgetView } from "@/server/budget";

type View = Awaited<ReturnType<typeof budgetView>>;
type Opt = { id: string; name: string };

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`;

export function BudgetView({ view, categories, lastActual, today }: { view: View; categories: Opt[]; lastActual: Record<string, number>; today: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const { summary: s, month } = view;
  const name = (id: string) => categories.find((c) => c.id === id)?.name ?? "지운 분류";
  const has = !!view.budget || view.planned.length > 0;
  const m = Number(month.slice(5));

  async function copy() {
    setBusy(true);
    const r = await copyLastMonthBudget(month);
    setBusy(false);
    if (!r.ok) return toast(r.error.message);
    toast("지난달 분류별 예산을 가져왔어요");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthNav month={month} />
        {has && (
          <Button variant="outline" onClick={() => setEditing(true)}>
            예산 수정
          </Button>
        )}
      </div>

      {!has ? (
        <EmptyState
          pet="pomong"
          title={`${m}월 예산을 정해 보세요`}
          description={s.spent > 0 ? `${m}월에 쓴 돈 ${money(s.spent)}` : "분류별 한도와 이번 달 큰 지출을 적어 두면 남은 돈을 알려 드려요"}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => setEditing(true)}>예산 정하기</Button>
              {view.prevLines && (
                <Button variant="outline" disabled={busy} onClick={copy}>
                  지난달 예산 복사
                </Button>
              )}
            </div>
          }
        />
      ) : (
        <>
          <section className="bg-card space-y-3 rounded-xl border p-5 shadow-sm">
            <div className="flex items-center gap-1">
              <p className="text-muted-foreground text-sm">{s.left >= 0 ? "남은 예산" : "예산 초과"}</p>
              <InfoTip label="예산 계산 방식">예산 = 분류별 예산 + 이번 달 큰 지출 + 고정 지출. 남은 예산 = 예산 − 쓴 돈(오늘까지, 환불 뺀 금액)</InfoTip>
            </div>
            <p className={cn("text-display font-bold tabular-nums", s.left < 0 && "text-destructive-text")}>{money(Math.abs(s.left))}</p>
            <p className="text-muted-foreground text-sm tabular-nums">
              {money(s.total)} 중 {money(s.spent)} 썼어요
              {s.scheduled > 0 && ` · 예정 ${money(s.scheduled)}`}
            </p>
            <BudgetBar used={s.spent} planned={s.scheduled} budget={s.total} label={`${m}월 예산 사용`} compact />
            {view.budget?.copied && view.budget.version === 1 && <p className="text-muted-foreground text-caption">지난달 분류별 예산을 그대로 가져왔어요. 바꾸려면 예산 수정을 눌러 주세요.</p>}
          </section>

          <Collapsible className="rounded-xl border">
            {/* 설명 버튼은 펼치기 버튼 밖에(버튼 안에 버튼 금지) */}
            <div className="flex items-center gap-1 pr-4">
              <CollapsibleTrigger className="hover:bg-accent/50 flex flex-1 items-center gap-2 rounded-xl p-4 text-left">
                <ChevronDown className="text-muted-foreground size-4" />
                <span className="font-semibold">고정 지출</span>
                <span className="ml-auto tabular-nums">{money(s.fixed)}</span>
                <span className="text-muted-foreground text-caption">자동</span>
              </CollapsibleTrigger>
              <InfoTip label="고정 지출">고정 지출에 등록한 금액이 자동으로 더해져요. 해지 예정은 마지막 이용일까지의 결제만 들어가요.</InfoTip>
            </div>
            <CollapsibleContent>
              {view.fixed.length ? (
                <ul className="border-t px-4 py-2 text-sm">
                  {view.fixed.map((f) => (
                    <li key={f.id + f.date} className="flex gap-3 py-1">
                      <span className="text-muted-foreground w-12 tabular-nums">{md(f.date)}</span>
                      <span className="flex-1 truncate">{f.name}</span>
                      <span className="tabular-nums">{money(f.amount)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground border-t px-4 py-3 text-sm">이번 달에 결제일이 있는 고정 지출이 없어요</p>
              )}
            </CollapsibleContent>
          </Collapsible>

          <section className="space-y-2">
            <h2 className="text-subtitle flex items-center gap-1 font-semibold">
              {m}월 큰 지출 <InfoTip label="큰 지출">여행·경조사처럼 이번 달에만 크게 나가는 돈이에요. 따로 적어 두면 분류별 예산이 흔들리지 않아요. 지출을 적을 때 큰 지출에 연결하면 사용 금액이 잡혀요.</InfoTip>
            </h2>
            {s.planned.length ? (
              <ul className="divide-y rounded-xl border">
                {s.planned.map((p) => {
                  const row = view.planned.find((x) => x.id === p.id)!;
                  return (
                    <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
                      <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                      <span className="tabular-nums">
                        {money(p.used)} <span className="text-muted-foreground">/ {money(p.amount)}</span>
                      </span>
                      {/* 다 안 쓴 동안은 아래 체크가 상태를 말해 줘서, 글자는 다 썼거나 넘었을 때만 */}
                      {p.used >= p.amount && (
                        <span className={cn("tabular-nums", p.state === "over" ? "text-destructive-text" : "text-muted-foreground")}>
                          {p.state === "over" ? `${money(p.used - p.amount)} 초과` : "다 썼어요"}
                        </span>
                      )}
                      {p.used < p.amount && (
                        <label className="text-muted-foreground flex min-h-11 w-full items-center justify-end gap-1.5 text-caption sm:w-auto md:min-h-0">
                          <Checkbox
                            checked={row.manuallyDone}
                            onCheckedChange={async (c) => {
                              const r = await markPlannedDone(p.id, row.version, c === true);
                              if (!r.ok) toast(r.error.message);
                              router.refresh();
                            }}
                          />
                          다 썼어요
                        </label>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-muted-foreground text-sm">이번 달 큰 지출 계획이 없어요</p>
            )}
          </section>

          <section className="space-y-2">
            <h2 className="text-subtitle flex items-center gap-1 font-semibold">
              분류별 예산 <InfoTip label="분류별 예산">식비·교통처럼 매달 비슷하게 쓰는 돈의 한도예요. 큰 지출에 연결한 지출은 여기서 빠져요.</InfoTip>
            </h2>
            {s.categories.length ? (
              <ul className="divide-y rounded-xl border">
                {s.categories.map((c) => {
                  const txs = view.txs.filter((t) => t.categoryId === c.categoryId && !(t.plannedExpenseId && view.planned.some((p) => p.id === t.plannedExpenseId)));
                  return (
                    <li key={c.categoryId}>
                      <Collapsible>
                        <CollapsibleTrigger className="hover:bg-accent/50 w-full space-y-1.5 px-4 py-3 text-left">
                          <span className="flex items-baseline gap-2 text-sm">
                            <span className="font-medium">{name(c.categoryId)}</span>
                            <span className="text-muted-foreground tabular-nums">
                              {money(c.used)} / {money(c.budget)}
                            </span>
                            <span className={cn("ml-auto tabular-nums", c.status === "over" ? "text-destructive-text" : c.status === "warn" ? "text-warning-text" : "text-muted-foreground")}>
                              {c.left >= 0 ? `${money(c.left)} 남음` : `${money(-c.left)} 초과`}
                            </span>
                          </span>
                          <BudgetBar used={c.used} budget={c.budget} label={`${name(c.categoryId)} 예산 사용`} compact />
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          {txs.length ? (
                            <ul className="text-muted-foreground px-4 pb-3 text-sm">
                              {txs.slice(0, 5).map((t) => (
                                <li key={t.id} className="flex gap-3 py-0.5">
                                  <span className="w-16">{dayLabel(t.date, fromYmd(today))}</span>
                                  <span className="flex-1 truncate">{t.title || name(t.categoryId)}</span>
                                  <span className="tabular-nums">{money(t.amount)}</span>
                                </li>
                              ))}
                              {txs.length > 5 && <li className="pt-1">그 밖에 {txs.length - 5}건</li>}
                            </ul>
                          ) : (
                            <p className="text-muted-foreground px-4 pb-3 text-sm">아직 쓴 돈이 없어요</p>
                          )}
                        </CollapsibleContent>
                      </Collapsible>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-muted-foreground text-sm">분류별 예산이 없어요</p>
            )}
            {s.noBudget.length > 0 && (
              <p className="text-muted-foreground text-sm">
                예산 없는 분류 · {s.noBudget.map((n) => `${name(n.categoryId)} ${money(n.used)}`).join(", ")}
              </p>
            )}
          </section>
        </>
      )}

      {editing && <BudgetEditor view={view} categories={categories} lastActual={lastActual} today={today} close={() => setEditing(false)} done={() => router.refresh()} />}
    </div>
  );
}

function BudgetEditor({ view, categories, lastActual, today, close, done }: { view: View; categories: Opt[]; lastActual: Record<string, number>; today: string; close: () => void; done: () => void }) {
  const [lines, setLines] = useState<Record<string, number>>(view.budget?.lines ?? {});
  const [planned, setPlanned] = useState<{ id?: string; key: string; name: string; amount: number | null }[]>(view.planned.map((p) => ({ id: p.id, key: p.id, name: p.name, amount: p.amount })));
  const [copyNext, setCopyNext] = useState(view.budget?.copyNext ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const past = view.month < today.slice(0, 7);
  const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
  const plannedSum = planned.reduce((a, p) => a + (p.amount ?? 0), 0);
  const total = view.summary.fixed + plannedSum + sum(lines);
  const setLine = (id: string, v: number | null) =>
    setLines((l) => {
      const next = { ...l };
      if (v) next[id] = v;
      else delete next[id];
      return next;
    });

  async function save() {
    const bad = planned.find((p) => !p.name.trim() || !p.amount);
    if (bad) return setError("큰 지출의 이름과 금액을 채워 주세요");
    setBusy(true);
    const r = await saveMonthBudget(view.month, view.budget?.version ?? null, {
      lines,
      planned: planned.map((p) => ({ id: p.id, name: p.name, amount: p.amount! })),
      copyNext,
    });
    setBusy(false);
    if (!r.ok) return setError(r.error.code === "VERSION_CONFLICT" ? "다른 기기에서 먼저 저장했어요. 닫고 다시 열어 주세요" : (r.error.fields?.[0]?.message ?? r.error.message));
    toast("예산을 저장했어요");
    done();
    close();
  }

  return (
    <ResponsiveModal
      open
      onOpenChange={(o) => !o && close()}
      size="lg"
      title={`${Number(view.month.slice(5))}월 예산`}
      footer={
        <div className="w-full space-y-2">
          <p className="text-muted-foreground text-caption tabular-nums">
            고정 {money(view.summary.fixed)} + 큰 지출 {money(plannedSum)} + 분류별 {money(sum(lines))} = <span className="text-foreground font-semibold">{money(total)}</span>
          </p>
          <Button className="w-full" disabled={busy} onClick={save}>
            {busy && <Spinner />} 예산 저장
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {past && (
          <Alert>
            <AlertDescription>지난 달 예산을 고치고 있어요</AlertDescription>
          </Alert>
        )}
        <section className="space-y-2">
          <h3 className="font-semibold">큰 지출</h3>
          {planned.map((p, i) => (
            <div key={p.key} className="flex items-center gap-2">
              <Input
                aria-label="큰 지출 이름"
                placeholder="예: 여행"
                maxLength={30}
                className="h-11 min-w-0 flex-1 text-base md:h-9 md:text-sm"
                value={p.name}
                onChange={(e) => setPlanned((l) => l.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
              />
              <div className="w-36 shrink-0">
                <AmountInput value={p.amount} onChange={(a) => setPlanned((l) => l.map((x, j) => (j === i ? { ...x, amount: a } : x)))} />
              </div>
              <Button variant="ghost" size="icon" aria-label={`${p.name || "큰 지출"} 빼기`} onClick={() => setPlanned((l) => l.filter((_, j) => j !== i))}>
                <Trash2 />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setPlanned((l) => [...l, { key: crypto.randomUUID(), name: "", amount: null }])}>
            <Plus /> 큰 지출 추가
          </Button>
        </section>

        <section className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="mr-auto font-semibold">분류별 예산</h3>
            {view.prevLines && (
              <Button variant="outline" size="sm" onClick={() => setLines(view.prevLines!)}>
                지난달 예산 복사
              </Button>
            )}
            {Object.keys(lastActual).length > 0 && (
              <Button variant="outline" size="sm" onClick={() => setLines(lastActual)}>
                지난달 실제 지출로 채우기
              </Button>
            )}
          </div>
          <p className="text-muted-foreground text-caption">빈칸은 예산 없음이에요</p>
          <ul className="space-y-2">
            {categories.map((c) => (
              <li key={c.id} className="flex items-center gap-3">
                <label htmlFor={`bl-${c.id}`} className="flex-1 truncate text-sm">
                  {c.name}
                  {lastActual[c.id] !== undefined && <span className="text-muted-foreground text-caption"> · 지난달 {money(lastActual[c.id])}</span>}
                </label>
                <div className="w-36 shrink-0">
                  <AmountInput id={`bl-${c.id}`} value={lines[c.id] ?? null} onChange={(v) => setLine(c.id, v)} />
                </div>
              </li>
            ))}
          </ul>
        </section>

        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={copyNext} onCheckedChange={(c) => setCopyNext(c === true)} /> 다음 달에도 같은 분류별 예산 쓰기
        </label>
        {error && <p className="text-destructive-text text-sm">{error}</p>}
      </div>
    </ResponsiveModal>
  );
}

