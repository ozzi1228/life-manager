"use client";

// 전체 목표 (SCR-GOAL-05) · 연도별 (SCR-GOAL-08) · 목표 추가·수정 (SCR-GOAL-07)
// 연도별은 따로 저장하지 않고, 기간에 그 해가 든 목표를 모아 봄(05 §3.2)
import { ChevronDown, ChevronLeft, ChevronRight, Circle, CircleCheck, Ellipsis, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
};
type Category = { id: string; name: string };
const HORIZON = { short: "단기", mid: "중기", long: "장기" } as const;
const STATUS = { paused: "보류", dropped: "포기", done: "달성", active: "진행 중" } as const;

const period = (g: Goal) => (g.startYear === null ? "언젠가" : g.startYear === g.endYear ? `${g.startYear}` : `${g.startYear}~${g.endYear}`);

export function GoalList({ goals, categories, year, thisYear }: { goals: Goal[]; categories: Category[]; year?: number; thisYear: number }) {
  const router = useRouter();
  const [horizon, setHorizon] = useState<"all" | Goal["horizon"]>("all");
  const [category, setCategory] = useState("all");
  const [editing, setEditing] = useState<Goal | "new" | null>(null);
  const [preset, setPreset] = useState("");
  const catName = (id: string | null) => categories.find((c) => c.id === id)?.name;

  const inYear = (g: Goal) => year === undefined || (g.startYear !== null && g.startYear <= year && year <= (g.endYear as number));
  const filtered = goals.filter((g) => inYear(g) && (horizon === "all" || g.horizon === horizon) && (category === "all" || g.categoryId === category));
  const active = filtered.filter((g) => g.status === "active");
  const done = filtered.filter((g) => g.status === "done");
  const stopped = filtered.filter((g) => g.status === "paused" || g.status === "dropped");

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

  const row = (g: Goal) => (
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
        <span className={g.status === "done" ? "text-muted-foreground line-through" : undefined}>{g.title}</span>
        <span className="text-muted-foreground block text-caption">
          {[catName(g.categoryId), period(g), year !== undefined ? HORIZON[g.horizon] : null].filter(Boolean).join(" · ")}
        </span>
      </button>
      {(g.status === "paused" || g.status === "dropped") && <Badge variant="secondary">{STATUS[g.status]}</Badge>}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`${g.title} 더 보기`}>
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

  const fold = (title: string, list: Goal[]) =>
    list.length > 0 && (
      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="-ml-2">
            <ChevronDown /> {title} {list.length}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ul className="divide-y rounded-lg border">{list.map(row)}</ul>
        </CollapsibleContent>
      </Collapsible>
    );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {year !== undefined ? (
          <div className="flex items-center gap-1">
            <Button asChild variant="outline" size="icon" aria-label="이전 해">
              <Link href={`/goals/year?y=${year - 1}`}>
                <ChevronLeft />
              </Link>
            </Button>
            <span className="min-w-20 text-center font-semibold tabular-nums">{year}년</span>
            <Button asChild variant="outline" size="icon" aria-label="다음 해">
              <Link href={`/goals/year?y=${year + 1}`}>
                <ChevronRight />
              </Link>
            </Button>
          </div>
        ) : (
          <>
            <ToggleGroup type="single" variant="outline" size="sm" value={horizon} onValueChange={(v) => v && setHorizon(v as typeof horizon)} aria-label="기간 구분">
              <ToggleGroupItem value="all">전체</ToggleGroupItem>
              <ToggleGroupItem value="short">단기</ToggleGroupItem>
              <ToggleGroupItem value="mid">중기</ToggleGroupItem>
              <ToggleGroupItem value="long">장기</ToggleGroupItem>
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
        <Button className="ml-auto" onClick={() => setEditing("new")}>
          <Plus /> 목표 추가
        </Button>
      </div>

      {active.length + done.length + stopped.length === 0 ? (
        <EmptyState
          pet="komong"
          title={year !== undefined ? `${year}년 목표를 적어 보세요` : "이루고 싶은 목표를 적어 보세요"}
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
      ) : year !== undefined ? (
        <>
          {active.length + done.length > 0 && <ul className="divide-y rounded-lg border">{[...active, ...done].map(row)}</ul>}
          {fold("보류·포기", stopped)}
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
                  <ul className="divide-y rounded-lg border">{list.map(row)}</ul>
                </section>
              )
            );
          })}
          {fold("달성한 목표", done)}
          {fold("보류·포기", stopped)}
        </>
      )}

      {editing && (
        <GoalDialog
          goal={editing === "new" ? null : editing}
          preset={preset}
          defaultYear={year ?? thisYear}
          categories={categories}
          close={() => (setEditing(null), setPreset(""))}
          done={() => router.refresh()}
        />
      )}
    </div>
  );
}

function GoalDialog({ goal, preset, defaultYear, categories, close, done }: { goal: Goal | null; preset: string; defaultYear: number; categories: Category[]; close: () => void; done: () => void }) {
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

  async function save() {
    setBusy(true);
    const input = {
      title,
      horizon,
      startYear: kind === "none" ? null : start,
      endYear: kind === "none" ? null : kind === "one" ? start : end,
      categoryId: categoryId === "none" ? null : categoryId,
      memo: memo.trim() || null,
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
        <Button disabled={!title.trim() || busy} onClick={save}>
          {busy && <Spinner />} {goal ? "저장" : "목표 추가"}
        </Button>
      }
    >
      <div className="space-y-5">
        <Field data-invalid={!!error || undefined}>
          <FieldLabel htmlFor="goal-title">목표</FieldLabel>
          <Input id="goal-title" autoFocus={!goal} maxLength={60} placeholder="예: 연간 독서 24권" className="h-11 text-base md:h-9 md:text-sm" value={title} onChange={(e) => setTitle(e.target.value)} />
          {error && <FieldError>{error}</FieldError>}
        </Field>
        <Field>
          <FieldLabel>기간 구분</FieldLabel>
          <ToggleGroup type="single" variant="outline" value={horizon} onValueChange={(v) => v && setHorizon(v as Goal["horizon"])}>
            <ToggleGroupItem value="short">단기</ToggleGroupItem>
            <ToggleGroupItem value="mid">중기</ToggleGroupItem>
            <ToggleGroupItem value="long">장기</ToggleGroupItem>
          </ToggleGroup>
        </Field>
        <Field>
          <FieldLabel>기간</FieldLabel>
          <ToggleGroup type="single" variant="outline" value={kind} onValueChange={(v) => v && setKind(v as typeof kind)}>
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
        <Field>
          <FieldLabel>카테고리</FieldLabel>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger className="w-40">
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
