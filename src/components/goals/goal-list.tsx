"use client";

// 전체 목표 (SCR-GOAL-05) · 연도별 (SCR-GOAL-08) · 달성 모아 보기 · 목표 추가·수정 (SCR-GOAL-07)
// 목표는 두 층: 큰 목표(여러 해) / 한 해 목표(+ 월·주·일은 기간별 탭). 단기·중기·장기는 고르지 않음(서버가 연도로 정함)
// 연도별: 맨 위 '진행 중인 큰 목표'에 한 번만, 각 해 아래엔 그 해 한 해짜리만 + 그 해에 끝나는 큰 목표(마감). 모든 해를 이어 붙이고 올해로 스크롤(D-069)
import { Check, ChevronDown, Ellipsis, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { addGoal, changeGoalStatus, deleteGoal, editGoal } from "@/app/actions/goals";
import { InfoTip } from "@/components/app/help";
import { ResponsiveModal } from "@/components/app/responsive";
import { EmptyState } from "@/components/app/states";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useIsMobile } from "@/hooks/use-mobile";
import { periodLabel } from "@/lib/period";
import { cn } from "@/lib/utils";

export type Goal = {
  id: string;
  version: number;
  title: string;
  horizon: "short" | "mid" | "long"; // 예전 칸(화면에선 안 씀)
  startYear: number | null;
  endYear: number | null;
  categoryId: string | null;
  status: "active" | "done" | "paused" | "dropped";
  achievedAt: string | null;
  memo: string | null;
  periodScope: "month" | "week" | "day" | null;
  periodKey: string | null;
};
type Category = { id: string; name: string };
const STATUS = { paused: "보류", dropped: "포기", done: "달성", active: "진행 중" } as const;

/** 여러 해에 걸친 큰 목표인지 */
const isBig = (g: Goal) => g.startYear !== null && g.endYear !== null && g.startYear !== g.endYear;
/** 기간 글자. 큰 목표는 "2026~2030 · 5년 중 1년째"(시작 전이면 "2028년부터") */
const period = (g: Goal, thisYear: number) => {
  if (g.periodScope && g.periodKey) return periodLabel(g.periodScope, g.periodKey, thisYear);
  if (g.startYear === null) return "언젠가";
  if (!isBig(g)) return `${g.startYear}`;
  const n = g.endYear! - g.startYear + 1;
  const now = thisYear < g.startYear ? `${g.startYear}년부터` : thisYear <= g.endYear! ? `${n}년 중 ${thisYear - g.startYear + 1}년째` : `${n}년`;
  return `${g.startYear}~${g.endYear} · ${now}`;
};

/** view: 없으면 전체 목표, years = 연도별(모든 해를 위에서 아래로), done = 달성한 목표를 달성한 해별로 */
/** 달성 체크(홈 습관 체크와 같은 모양): 20px 네모, 달성하면 채우고 ✓. 누르는 칸은 감싼 버튼(40px) */
export function GoalCheck({ done, small }: { done: boolean; small?: boolean }) {
  return (
    <span className={cn("flex items-center justify-center transition-colors duration-[120ms]", small ? "size-4 rounded-[4px] border-[1.5px]" : "size-5 rounded-[5px] border-2", done ? "border-success bg-success text-success-foreground" : "border-input group-hover:border-muted-foreground")}>
      {done && <Check className={small ? "size-3" : "size-3.5"} strokeWidth={3} aria-hidden />}
    </span>
  );
}

export function GoalList({ goals, categories, view, thisYear }: { goals: Goal[]; categories: Category[]; view?: "years" | "done"; thisYear: number }) {
  const router = useRouter();
  const mobile = useIsMobile();
  const [category, setCategory] = useState("all");
  const [editing, setEditing] = useState<Goal | "new" | null>(null);
  const [preset, setPreset] = useState("");
  const catName = (id: string | null) => categories.find((c) => c.id === id)?.name;

  const filtered = view ? goals : goals.filter((g) => category === "all" || g.categoryId === category);
  const active = filtered.filter((g) => g.status === "active");
  const done = filtered.filter((g) => g.status === "done");
  const stopped = filtered.filter((g) => g.status === "paused" || g.status === "dropped");
  // 연도별: 한 해 목표가 있는 해 + 큰 목표가 끝나는 해 + 올해, 최근 해가 위
  const years = [...new Set([thisYear, ...goals.flatMap((g) => (g.endYear === null ? [] : [g.endYear]))])].sort((a, b) => b - a);
  // 연도별의 그 해 목록: 그 해 한 해짜리 + 그 해에 끝나는 큰 목표
  const ofYear = (g: Goal, y: number) => (isBig(g) ? g.endYear === y : g.startYear === y);

  // 연도별은 올해 칸이 맨 위에 오게(앞으로의 해가 위에 있을 때만 스크롤)
  useEffect(() => {
    // 일정 화면에서 #y2026처럼 해를 짚어 오면 그 해로
    const target = view === "years" && location.hash && document.getElementById(location.hash.slice(1));
    if (target) target.scrollIntoView({ block: "start" });
    else if (view === "years" && years[0] !== thisYear) document.getElementById(`y${thisYear}`)?.scrollIntoView({ block: "start" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 처음 열 때 한 번만
  }, []);

  async function setStatus(g: Goal, status: Goal["status"]) {
    const r = await changeGoalStatus(g.id, g.version, status);
    if (!r.ok) return toast(r.error.message);
    router.refresh();
  }
  async function remove(g: Goal) {
    await deleteGoal(g.id);
    router.refresh();
  }

  // y: 연도별 화면에서 이 줄이 놓인 해
  const row = (g: Goal, y?: number) => (
    <li key={g.id} className="flex min-h-14 items-center gap-2 px-3 py-2 md:min-h-11">
      <button
        type="button"
        aria-label={g.status === "done" ? `${g.title} 달성 취소` : `${g.title} 달성`}
        aria-pressed={g.status === "done"}
        onClick={() => setStatus(g, g.status === "done" ? "active" : "done")}
        className="group -m-1 flex size-10 shrink-0 items-center justify-center rounded-md"
      >
        <GoalCheck done={g.status === "done"} />
      </button>
      <button type="button" onClick={() => setEditing(g)} className="min-w-0 flex-1 text-left">
        <span className={g.status === "done" && view !== "done" ? "text-muted-foreground line-through" : undefined}>{g.title}</span>
        <span className="text-muted-foreground block text-caption">
          {/* 연도별 화면에서 그 해 한 해짜리면 연도는 이미 보이니 뺌 */}
          {[catName(g.categoryId), y !== undefined && !isBig(g) ? null : period(g, thisYear)].filter(Boolean).join(" · ")}
        </span>
      </button>
      {y !== undefined && isBig(g) && g.endYear === y && <Badge variant="outline">마감</Badge>}
      {view === "done" && g.achievedAt && <span className="text-muted-foreground shrink-0 text-sm tabular-nums">{`${+g.achievedAt.slice(5, 7)}월 ${+g.achievedAt.slice(8, 10)}일`}</span>}
      {(g.status === "paused" || g.status === "dropped") && <Badge variant="secondary">{STATUS[g.status]}</Badge>}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="max-md:size-11" aria-label={`${g.title} 더 보기`}>
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditing(g)}>수정</DropdownMenuItem>
          {g.status !== "active" && <DropdownMenuItem onSelect={() => setStatus(g, "active")}>진행 중으로</DropdownMenuItem>}
          {g.status !== "paused" && <DropdownMenuItem onSelect={() => setStatus(g, "paused")}>보류</DropdownMenuItem>}
          {g.status !== "dropped" && <DropdownMenuItem onSelect={() => setStatus(g, "dropped")}>포기</DropdownMenuItem>}
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive-text" onSelect={() => remove(g)}>
            삭제
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );

  const fold = (title: string, list: Goal[], y?: number, extra?: ReactNode) =>
    list.length > 0 && (
      <Collapsible>
        <div className="flex items-center justify-between gap-2">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="-ml-2 [&>svg]:transition-transform [&[data-state=closed]>svg]:-rotate-90">
              <ChevronDown /> {title} {list.length}
            </Button>
          </CollapsibleTrigger>
          {extra}
        </div>
        <CollapsibleContent>
          <ul className="divide-y rounded-lg border">{list.map((g) => row(g, y))}</ul>
        </CollapsibleContent>
      </Collapsible>
    );

  const heading = (text: string) => <h2 className="bg-background/95 sticky top-14 z-[1] py-1.5 font-semibold backdrop-blur">{text}</h2>;
  // 달성: 달성한 해별로, 최근 것이 위
  const doneSorted = [...done].sort((a, b) => (b.achievedAt ?? "").localeCompare(a.achievedAt ?? ""));
  const doneYears = [...new Set(doneSorted.flatMap((g) => (g.achievedAt ? [g.achievedAt.slice(0, 4)] : [])))];
  const noYear = filtered.filter((g) => g.startYear === null);

  return (
    <div className="space-y-5">
      {view !== "done" && (
        <div className="flex flex-wrap items-center gap-2">
          {!view && (
            <>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger size="sm" className="w-32" aria-label="카테고리">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">모든 카테고리</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
          {/* 모바일은 빠른 추가(+)가 이미 채움 버튼이라 여기는 테두리만(primary 한 화면 1개, 03 §4.4) */}
          <Button className="ml-auto" variant={mobile ? "outline" : "default"} onClick={() => setEditing("new")}>
            <Plus /> 목표 추가
          </Button>
        </div>
      )}

      {view === "done" ? (
        done.length === 0 ? (
          <EmptyState pet="komong" title="아직 달성한 목표가 없어요" description="목표 앞 동그라미를 누르면 달성한 날과 함께 여기 모여요" />
        ) : (
          <>
            {doneYears.map((y) => (
              <section key={y} className="space-y-2">
                {heading(`${y}년`)}
                <ul className="divide-y rounded-lg border">{doneSorted.filter((g) => g.achievedAt?.startsWith(y)).map((g) => row(g))}</ul>
              </section>
            ))}
            {doneSorted.some((g) => !g.achievedAt) && (
              <section className="space-y-2">
                {heading("달성 날짜 없음")}
                <ul className="divide-y rounded-lg border">{doneSorted.filter((g) => !g.achievedAt).map((g) => row(g))}</ul>
              </section>
            )}
          </>
        )
      ) : active.length + done.length + stopped.length === 0 ? (
        <EmptyState
          pet="komong"
          title={view === "years" ? `${thisYear}년 목표를 적어 보세요` : "이루고 싶은 목표를 적어 보세요"}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {["책 24권 읽기", "비상금 300만원"].map((t) => (
                <Button key={t} variant="outline" className="rounded-full" onClick={() => (setPreset(t), setEditing("new"))}>
                  {t}
                </Button>
              ))}
            </div>
          }
        />
      ) : view === "years" ? (
        <>
          {/* 진행 중인 큰 목표: 해마다 되풀이하지 않고 여기 한 번만 */}
          {(() => {
            const big = active.filter((g) => isBig(g) && (g.endYear as number) >= thisYear);
            return (
              big.length > 0 && (
                <Collapsible defaultOpen className="bg-card rounded-lg border">
                  <div className="flex items-center pr-2">
                    <CollapsibleTrigger className="flex min-h-11 flex-1 items-center gap-1.5 px-3 text-left text-sm font-semibold md:min-h-9 [&>svg]:transition-transform [&[data-state=closed]>svg]:-rotate-90">
                      <ChevronDown className="size-4" /> 진행 중인 큰 목표 <span className="text-muted-foreground font-normal tabular-nums">{big.length}</span>
                    </CollapsibleTrigger>
                    <InfoTip label="큰 목표">여러 해에 걸친 목표예요. 해마다 되풀이하지 않고 여기 한 번, 끝나는 해에 한 번 보여요.</InfoTip>
                  </div>
                  <CollapsibleContent>
                    <ul className="divide-y border-t">{big.map((g) => row(g))}</ul>
                  </CollapsibleContent>
                </Collapsible>
              )
            );
          })()}
          {years.map((y) => {
            const on = [...active, ...done].filter((g) => ofYear(g, y));
            const off = stopped.filter((g) => ofYear(g, y));
            return (
              <section key={y} id={`y${y}`} className="scroll-mt-14 space-y-2">
                {heading(`${y}년`)}
                {on.length > 0 && <ul className="divide-y rounded-lg border">{on.map((g) => row(g, y))}</ul>}
                {on.length + off.length === 0 && (
                  <div className="text-muted-foreground flex items-center justify-between gap-2 rounded-lg border border-dashed py-1 pr-1 pl-3 text-sm">
                    {y}년 목표가 아직 없어요
                    <Button variant="ghost" size="sm" onClick={() => setEditing("new")}>
                      <Plus /> 목표 추가
                    </Button>
                  </div>
                )}
                {fold("보류·포기", off, y)}
              </section>
            );
          })}
          {noYear.length > 0 && (
            <section className="space-y-2">
              {heading("연도 미정")}
              <ul className="divide-y rounded-lg border">{noYear.map((g) => row(g))}</ul>
            </section>
          )}
        </>
      ) : (
        <>
          {active.length === 0 && <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">진행 중인 목표가 없어요. 새 목표를 적어 보세요</p>}
          {/* 큰 목표(여러 해) / 올해 / 다른 해(가까운 해부터) / 연도 미정 */}
          {(
            [
              ["큰 목표", active.filter(isBig).sort((a, b) => (a.endYear as number) - (b.endYear as number))],
              [`올해 목표 · ${thisYear}`, active.filter((g) => !isBig(g) && g.startYear === thisYear)],
              ["다른 해 목표", active.filter((g) => !isBig(g) && g.startYear !== null && g.startYear !== thisYear).sort((a, b) => Math.abs((a.startYear as number) - thisYear) - Math.abs((b.startYear as number) - thisYear) || (b.startYear as number) - (a.startYear as number))],
              ["연도 미정", active.filter((g) => g.startYear === null)],
            ] as const
          ).map(
            ([label, list]) =>
              list.length > 0 && (
                <section key={label} className="space-y-2">
                  <h2 className="text-muted-foreground text-sm font-semibold">{label}</h2>
                  <ul className="divide-y rounded-lg border">{list.map((g) => row(g, label.startsWith("올해") ? thisYear : undefined))}</ul>
                </section>
              ),
          )}
          {fold(
            "달성한 목표",
            done,
            undefined,
            <Button asChild variant="link" size="sm">
              <Link href="/goals/done">달성 모아 보기</Link>
            </Button>,
          )}
          {fold("보류·포기", stopped)}
        </>
      )}

      {editing && (
        <GoalDialog
          goal={editing === "new" ? null : editing}
          preset={preset}
          defaultYear={thisYear}
          categories={categories}
          close={() => (setEditing(null), setPreset(""))}
          done={() => router.refresh()}
        />
      )}
    </div>
  );
}

/** 목표 추가·수정 창. 월·주·일 목표는 기간이 정해져 있어 연도·기간 구분을 묻지 않음 */
export function GoalDialog({ goal, preset, defaultYear, categories, close, done }: { goal: Goal | null; preset: string; defaultYear: number; categories: Category[]; close: () => void; done: () => void }) {
  const [title, setTitle] = useState(goal?.title ?? preset);
  const [kind, setKind] = useState<"none" | "one" | "range">(goal ? (goal.startYear === null ? "none" : goal.startYear === goal.endYear ? "one" : "range") : "one");
  const [start, setStart] = useState(goal?.startYear ?? defaultYear);
  const [end, setEnd] = useState(goal?.endYear ?? defaultYear + 2);
  const [categoryId, setCategoryId] = useState(goal?.categoryId ?? "none");
  const [memo, setMemo] = useState(goal?.memo ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const years = Array.from({ length: 16 }, (_, i) => defaultYear - 5 + i);
  const fixed = !!goal?.periodScope; // 월·주·일 목표

  async function save() {
    setBusy(true);
    const input = {
      title,
      startYear: kind === "none" ? null : start,
      endYear: kind === "none" ? null : kind === "one" ? start : end,
      categoryId: categoryId === "none" ? null : categoryId,
      memo: memo.trim() || null,
      periodScope: goal?.periodScope ?? null,
      periodKey: goal?.periodKey ?? null,
    };
    const r = goal ? await editGoal(goal.id, goal.version, input) : await addGoal(input);
    setBusy(false);
    if (!r.ok) return setError(r.error.code === "VERSION_CONFLICT" ? "다른 기기에서 먼저 수정했어요. 닫고 다시 열어 주세요" : (r.error.fields?.[0]?.message ?? r.error.message));
    done();
    close();
  }

  const yearSelect = (value: number, set: (n: number) => void, label: string) => (
    <Select value={String(value)} onValueChange={(v) => set(Number(v))}>
      <SelectTrigger className="w-28" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {years.map((y) => (
          <SelectItem key={y} value={String(y)}>
            {y}년
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <ResponsiveModal
      open
      onOpenChange={(o) => !o && close()}
      title={goal ? "목표 수정" : "목표 추가"}
      footer={
        <>
          <Button variant="outline" onClick={close}>
            취소
          </Button>
          <Button disabled={!title.trim() || busy} onClick={save}>
            {busy && <Spinner />} {goal ? "저장" : "목표 추가"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field data-invalid={!!error || undefined}>
          <FieldLabel htmlFor="goal-title">목표</FieldLabel>
          <Input id="goal-title" autoFocus={!goal} maxLength={60} placeholder="목표를 입력하세요" className="h-11 text-base md:h-9 md:text-sm" value={title} onChange={(e) => setTitle(e.target.value)} />
          {error && <FieldError>{error}</FieldError>}
        </Field>
        {!fixed && (
          <>
            <Field>
              <FieldLabel>기간</FieldLabel>
              <ToggleGroup type="single" variant="outline" aria-label="기간" value={kind} onValueChange={(v) => v && setKind(v as typeof kind)}>
                <ToggleGroupItem value="one">한 해</ToggleGroupItem>
                <ToggleGroupItem value="range">여러 해 (큰 목표)</ToggleGroupItem>
                <ToggleGroupItem value="none">정하지 않음</ToggleGroupItem>
              </ToggleGroup>
              {kind !== "none" && (
                <div className="flex items-center gap-2">
                  {yearSelect(start, (n) => (setStart(n), n > end && setEnd(n)), "시작 연도")}
                  {kind === "range" && (
                    <>
                      ~ {yearSelect(end, (n) => (setEnd(n), n < start && setStart(n)), "끝 연도")}
                    </>
                  )}
                </div>
              )}
              {kind === "range" && <p className="text-muted-foreground text-caption">{end - start + 1}년짜리 큰 목표예요. 연도별 화면에선 맨 위와 끝나는 해에만 보여요</p>}
            </Field>
          </>
        )}
        <Field>
          <FieldLabel htmlFor="goal-category">카테고리</FieldLabel>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger id="goal-category" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">분류 없음</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="goal-memo">메모</FieldLabel>
          <Textarea id="goal-memo" maxLength={1000} value={memo} onChange={(e) => setMemo(e.target.value)} />
        </Field>
      </div>
    </ResponsiveModal>
  );
}
