"use client";

// 전체 목표 (SCR-GOAL-05) · 연도별 (SCR-GOAL-08) · 달성 모아 보기 · 목표 추가·수정 (SCR-GOAL-07)
// 연도별은 따로 저장하지 않고, 기간에 그 해가 든 목표를 모아 봄(05 §3.2). 모든 해를 한 줄로 이어 붙이고 올해로 스크롤(D-069)
import { ChevronDown, Circle, CircleCheck, Ellipsis, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { addGoal, changeGoalStatus, deleteGoal, editGoal, restoreGoal } from "@/app/actions/goals";
import { InfoTip } from "@/components/app/help";
import { ResponsiveModal } from "@/components/app/responsive";
import { EmptyState, toastUndo } from "@/components/app/states";
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

export type Goal = {
  id: string;
  version: number;
  title: string;
  horizon: "short" | "mid" | "long";
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
const HORIZON = { short: "단기", mid: "중기", long: "장기" } as const;
const STATUS = { paused: "보류", dropped: "포기", done: "달성", active: "진행 중" } as const;

const period = (g: Goal, thisYear: number) => (g.periodScope && g.periodKey ? periodLabel(g.periodScope, g.periodKey, thisYear) : g.startYear === null ? "언젠가" : g.startYear === g.endYear ? `${g.startYear}` : `${g.startYear}~${g.endYear}`);

/** view: 없으면 전체 목표, years = 연도별(모든 해를 위에서 아래로), done = 달성한 목표를 달성한 해별로 */
export function GoalList({ goals, categories, view, thisYear }: { goals: Goal[]; categories: Category[]; view?: "years" | "done"; thisYear: number }) {
  const router = useRouter();
  const mobile = useIsMobile();
  const [horizon, setHorizon] = useState<"all" | Goal["horizon"]>("all");
  const [category, setCategory] = useState("all");
  const [editing, setEditing] = useState<Goal | "new" | null>(null);
  const [preset, setPreset] = useState("");
  const catName = (id: string | null) => categories.find((c) => c.id === id)?.name;

  const inYear = (g: Goal, y: number) => g.startYear !== null && g.startYear <= y && y <= (g.endYear as number);
  const filtered = view ? goals : goals.filter((g) => (horizon === "all" || g.horizon === horizon) && (category === "all" || g.categoryId === category));
  const active = filtered.filter((g) => g.status === "active");
  const done = filtered.filter((g) => g.status === "done");
  const stopped = filtered.filter((g) => g.status === "paused" || g.status === "dropped");
  // 연도별: 목표가 걸친 모든 해 + 올해, 최근 해가 위
  const years = [...new Set([thisYear, ...goals.flatMap((g) => (g.startYear === null ? [] : Array.from({ length: (g.endYear as number) - g.startYear + 1 }, (_, i) => (g.startYear as number) + i)))])].sort((a, b) => b - a);

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
    if (!r.ok) return toastUndo(r.error.message, () => {});
    router.refresh();
    if (status === "done")
      toastUndo("목표를 달성했어요 🎉", async () => {
        await changeGoalStatus(g.id, r.data.version, "active");
        router.refresh();
      });
  }
  async function remove(g: Goal) {
    await deleteGoal(g.id);
    router.refresh();
    toastUndo("휴지통으로 옮겼어요", async () => {
      await restoreGoal(g.id);
      router.refresh();
    });
  }

  // y: 연도별 화면에서 이 줄이 놓인 해
  const row = (g: Goal, y?: number) => (
    <li key={g.id} className="flex min-h-14 items-center gap-2 px-3 py-2 md:min-h-11">
      <button
        type="button"
        aria-label={g.status === "done" ? `${g.title} 달성 취소` : `${g.title} 달성`}
        aria-pressed={g.status === "done"}
        onClick={() => setStatus(g, g.status === "done" ? "active" : "done")}
        className="text-muted-foreground hover:text-foreground -m-1 flex size-10 shrink-0 items-center justify-center rounded-full"
      >
        {g.status === "done" ? <CircleCheck className="text-success-text size-6" /> : <Circle className="size-6" />}
      </button>
      <button type="button" onClick={() => setEditing(g)} className="min-w-0 flex-1 text-left">
        <span className={g.status === "done" && view !== "done" ? "text-muted-foreground line-through" : undefined}>{g.title}</span>
        <span className="text-muted-foreground block text-caption">
          {/* 연도별 화면에서 그 해 한 해짜리면 연도는 이미 보이니 뺌 */}
          {[catName(g.categoryId), y !== undefined && g.startYear === g.endYear ? null : period(g, thisYear), view ? HORIZON[g.horizon] : null].filter(Boolean).join(" · ")}
        </span>
      </button>
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
              <ToggleGroup type="single" variant="outline" size="sm" value={horizon} onValueChange={(v) => v && setHorizon(v as typeof horizon)} aria-label="기간 구분">
                <ToggleGroupItem value="all" className="max-md:h-10 max-md:px-3.5">전체</ToggleGroupItem>
                <ToggleGroupItem value="short" className="max-md:h-10 max-md:px-3.5">단기</ToggleGroupItem>
                <ToggleGroupItem value="mid" className="max-md:h-10 max-md:px-3.5">중기</ToggleGroupItem>
                <ToggleGroupItem value="long" className="max-md:h-10 max-md:px-3.5">장기</ToggleGroupItem>
              </ToggleGroup>
              <InfoTip label="단기·중기·장기">기준은 직접 정해요. 예: 단기 1년 이내, 중기 1~3년, 장기 3년 이상</InfoTip>
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
          {years.map((y) => {
            const on = [...active, ...done].filter((g) => inYear(g, y));
            const off = stopped.filter((g) => inYear(g, y));
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
          {(["short", "mid", "long"] as const).map((h) => {
            const list = active.filter((g) => g.horizon === h);
            return (
              list.length > 0 && (
                <section key={h} className="space-y-2">
                  <h2 className="text-muted-foreground text-sm font-semibold">{HORIZON[h]}</h2>
                  <ul className="divide-y rounded-lg border">{list.map((g) => row(g))}</ul>
                </section>
              )
            );
          })}
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
  const [horizon, setHorizon] = useState<Goal["horizon"]>(goal?.horizon ?? "short");
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
      horizon,
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
          <Input id="goal-title" autoFocus={!goal} maxLength={60} placeholder="예: 연간 독서 24권" className="h-11 text-base md:h-9 md:text-sm" value={title} onChange={(e) => setTitle(e.target.value)} />
          {error && <FieldError>{error}</FieldError>}
        </Field>
        {!fixed && (
          <>
            <Field>
              <FieldLabel>기간 구분</FieldLabel>
              <ToggleGroup type="single" variant="outline" aria-label="기간 구분" value={horizon} onValueChange={(v) => v && setHorizon(v as Goal["horizon"])}>
                <ToggleGroupItem value="short">단기</ToggleGroupItem>
                <ToggleGroupItem value="mid">중기</ToggleGroupItem>
                <ToggleGroupItem value="long">장기</ToggleGroupItem>
              </ToggleGroup>
            </Field>
            <Field>
              <FieldLabel>연도</FieldLabel>
              <ToggleGroup type="single" variant="outline" aria-label="연도" value={kind} onValueChange={(v) => v && setKind(v as typeof kind)}>
                <ToggleGroupItem value="one">한 해</ToggleGroupItem>
                <ToggleGroupItem value="range">여러 해</ToggleGroupItem>
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
