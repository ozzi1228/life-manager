"use client";

// 기간 목표(D-072): 일정 화면의 "{기간} 목표" 카드(PeriodGoals)와 목표 > 기간별 > 월별·주간·일간 목록(PeriodGoalList)
// 체크(달성↔진행 중)는 바로 화면에 반영(낙관적)하고 저장 뒤 새로 고침. 달성한 목표는 아래로, 흐리게
import { ChevronLeft, ChevronRight, Ellipsis, Plus } from "lucide-react";
import { GoalCheck } from "@/components/goals/goal-list";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOptimistic, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { addPeriodGoal, changeGoalStatus, deleteGoal, renameGoalAction } from "@/app/actions/goals";
import { type Goal, GoalDialog } from "@/components/goals/goal-list";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { periodLabel, stepPeriodKey, type PeriodScope } from "@/lib/period";
import { cn } from "@/lib/utils";

export type PeriodGoal = Pick<Goal, "id" | "version" | "title" | "status">;
const HREF: Record<PeriodScope, string> = { year: "/goals/year", month: "/goals/month", week: "/goals/week", day: "/goals/day" };
const NOW: Record<PeriodScope, string> = { year: "올해", month: "이번 달", week: "이번 주", day: "오늘" };
const doneLast =<G extends PeriodGoal>(list: G[]) => [...list].sort((a, b) => Number(a.status === "done") - Number(b.status === "done"));

function useGoals<G extends PeriodGoal>(goals: G[]) {
  const router = useRouter();
  const [list, setOptimistic] = useOptimistic(goals, (cur, { id, status }: { id: string; status: G["status"] }) => cur.map((g) => (g.id === id ? { ...g, status } : g)));
  const [, start] = useTransition();
  const toggle = (g: G) =>
    start(async () => {
      const status = g.status === "done" ? "active" : "done";
      setOptimistic({ id: g.id, status });
      const r = await changeGoalStatus(g.id, g.version, status);
      if (!r.ok) toast.error(r.error.code === "VERSION_CONFLICT" ? "다른 기기에서 먼저 고쳤어요. 새로 고침해 주세요" : r.error.message);
      router.refresh();
    });
  async function remove(g: G) {
    const r = await deleteGoal(g.id);
    if (!r.ok) return toast.error(r.error.message);
    router.refresh();
  }
  /** 이름 고치기. 실패하면 false(입력 칸을 그대로 둠) */
  async function rename(g: G, title: string) {
    // 연결이 끊기면 요청 자체가 실패함 → 입력 칸을 그대로 두고 안내(멈춘 채로 두지 않게)
    const r = await renameGoalAction(g.id, g.version, title).catch(() => null);
    if (!r) return toast.error("연결이 끊겨 저장하지 못했어요. 다시 눌러 주세요"), false;
    if (!r.ok) return toast.error(r.error.code === "VERSION_CONFLICT" ? "다른 기기에서 먼저 고쳤어요. 새로 고침해 주세요" : (r.error.fields?.[0]?.message ?? r.error.message)), false;
    router.refresh();
    return true;
  }
  return { list, toggle, remove, rename, refresh: () => router.refresh() };
}

/** compact: 일정 화면 카드용 — 작은 글자·체크, 좁은 줄. rename이 있으면 글자를 두 번 눌러(또는 ⋯ > 수정) 그 자리에서 고침 */
function Row<G extends PeriodGoal>({ g, toggle, remove, edit, rename, className, compact }: { g: G; toggle: (g: G) => void; remove: (g: G) => void; edit?: (g: G) => void; rename?: (g: G, title: string) => Promise<boolean>; className?: string; compact?: boolean }) {
  const done = g.status === "done";
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(g.title);
  const [saving, setSaving] = useState(false);
  const start = () => (setText(g.title), setEditing(true));
  async function save() {
    const t = text.trim();
    if (!t || t === g.title) return setEditing(false); // 비우거나 그대로면 원래대로
    setSaving(true);
    const ok = await rename!(g, t);
    setSaving(false);
    if (ok) setEditing(false);
  }
  const title = editing ? (
    <Input
      autoFocus
      aria-label="목표 이름"
      maxLength={60}
      readOnly={saving}
      className={cn("h-8 px-2 text-base md:text-sm", compact && "md:h-7")}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onFocus={(e) => e.target.select()}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return; // 한글 조합 중 Enter는 글자 확정
        if (e.key === "Enter") save();
        if (e.key === "Escape") setEditing(false);
      }}
      onBlur={save}
    />
  ) : (
    <span className={cn("break-words", compact && "text-sm", done && "text-muted-foreground line-through")} onDoubleClick={rename ? start : undefined} title={rename ? "두 번 눌러 고치기" : undefined}>
      {g.title}
    </span>
  );
  return (
    <li className={cn("flex items-center", compact ? "min-h-9 gap-0.5 md:min-h-8" : "min-h-11 gap-1", className)}>
      <button
        type="button"
        aria-label={done ? `${g.title} 달성 취소` : `${g.title} 달성`}
        aria-pressed={done}
        onClick={() => toggle(g)}
        className={cn("group flex shrink-0 items-center justify-center rounded-md", compact ? "-ml-2 size-9 md:size-8" : "-my-1 -ml-2 size-10")}
      >
        <GoalCheck done={done} small={compact} />
      </button>
      {edit ? (
        <button type="button" onClick={() => edit(g)} className="min-w-0 flex-1 text-left">
          {title}
        </button>
      ) : (
        <span className="min-w-0 flex-1">{title}</span>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className={compact ? "text-muted-foreground size-9 md:size-7" : "max-md:size-11"} aria-label={`${g.title} 더 보기`}>
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {edit ? <DropdownMenuItem onSelect={() => edit(g)}>수정</DropdownMenuItem> : rename && <DropdownMenuItem onSelect={start}>수정</DropdownMenuItem>}
          <DropdownMenuItem className="text-destructive-text" onSelect={() => remove(g)}>
            삭제
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

/** "+ 목표 추가" → 입력 칸. Enter로 추가하고 칸은 열어 둠(여러 개 연달아), Esc로 닫기 */
function QuickAdd({ scope, periodKey, label, added, compact }: { scope: PeriodScope; periodKey: string; label: string; added: () => void; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const sending = useRef(false); // Enter와 칸 밖 누르기가 겹쳐도 한 번만

  /** close: 칸 밖을 눌렀을 때 — 적은 글은 저장하고 칸을 닫음 */
  async function add(close = false) {
    const title = text.trim();
    if (!title) return close && setOpen(false);
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    const r = await addPeriodGoal(scope, periodKey, title).catch(() => null);
    sending.current = false;
    setBusy(false);
    if (!r) return toast.error("연결이 끊겨 저장하지 못했어요. 다시 눌러 주세요");
    if (!r.ok) return toast.error(r.error.fields?.[0]?.message ?? r.error.message);
    setText("");
    if (close) setOpen(false);
    added();
  }

  if (!open)
    return (
      <Button variant="ghost" size="sm" className={cn("text-muted-foreground -ml-2", compact ? "h-8 text-caption max-md:h-9" : "max-md:h-10")} onClick={() => setOpen(true)}>
        <Plus /> 목표 추가
      </Button>
    );
  // form 제출로 Enter를 받음: 휴대폰 한글 키보드는 Enter가 '조합 중'(keyCode 229)으로 와서 keydown으로는 놓침
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        add();
      }}
    >
      <Input
        autoFocus
        aria-label={`${label} 목표 추가`}
        placeholder="목표를 적고 Enter"
        maxLength={60}
        enterKeyHint="done"
        readOnly={busy}
        className={compact ? "h-9 text-base md:h-8 md:text-sm" : "h-11 text-base md:h-9 md:text-sm"}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setText("");
            setOpen(false);
          }
        }}
        onBlur={() => add(true)}
      />
    </form>
  );
}

/** 홈 "오늘" 카드: 이번 주·오늘 목표를 한 목록으로(체크만). 오늘 목표는 "오늘" 표시 */
export function HomeGoals({ week, day }: { week: PeriodGoal[]; day: PeriodGoal[] }) {
  const { list, toggle } = useGoals([...day, ...week]);
  const isDay = new Set(day.map((g) => g.id));
  return (
    <ul>
      {doneLast(list).map((g) => {
        const done = g.status === "done";
        return (
          <li key={g.id} className="flex min-h-9 items-center gap-1 md:min-h-8">
            <button type="button" aria-label={done ? `${g.title} 달성 취소` : `${g.title} 달성`} aria-pressed={done} onClick={() => toggle(g)} className="group -ml-2 flex size-9 shrink-0 items-center justify-center rounded-md md:size-8">
              <GoalCheck done={done} small />
            </button>
            <span className={cn("min-w-0 flex-1 truncate text-sm", done && "text-muted-foreground line-through")}>{g.title}</span>
            <span className="text-muted-foreground shrink-0 text-caption">{isDay.has(g.id) ? "오늘" : "이번 주"}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** 일정 화면용 카드. year는 그 해가 든 연 목표, 추가하면 그 해 한 해짜리 단기 목표 */
export function PeriodGoals({ scope, periodKey, label, goals }: { scope: PeriodScope; periodKey: string; label: string; goals: PeriodGoal[] }) {
  const { list, toggle, remove, rename, refresh } = useGoals(goals);
  return (
    <section className="bg-card space-y-1 rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold">{label} 목표</h2>
        <Link href={scope === "year" ? `${HREF.year}#y${periodKey}` : `${HREF[scope]}?p=${periodKey}`} className="text-muted-foreground hover:text-foreground ml-auto text-caption">
          목표에서 보기
        </Link>
      </div>
      {list.length > 0 && (
        <ul>
          {doneLast(list).map((g) => (
            <Row key={g.id} g={g} toggle={toggle} remove={remove} rename={rename} compact />
          ))}
        </ul>
      )}
      <QuickAdd scope={scope} periodKey={periodKey} label={label} added={refresh} compact />
    </section>
  );
}

/** 목표 > 기간별 > 월별·주간·일간: 한 기간씩, 화살표로 앞뒤 기간을 넘김(지난 기간에도 추가). 주소 ?p=기간(일정 화면에서 옴)이 있으면 그 기간부터 */
export function PeriodGoalList({
  scope,
  goals,
  current,
  start,
  thisYear,
  categories,
}: {
  scope: "month" | "week" | "day";
  goals: Goal[];
  current: string;
  start: string;
  thisYear: number;
  categories: { id: string; name: string }[];
}) {
  const { list, toggle, remove, refresh } = useGoals(goals);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [k, setK] = useState(start);
  const go = (next: string) => {
    setK(next);
    history.replaceState(null, "", next === current ? location.pathname : `?p=${next}`); // 새로 고쳐도 그 기간
  };

  const label = periodLabel(scope, k, thisYear);
  const items = doneLast(list.filter((g) => g.periodKey === k));
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" className="max-md:size-11" aria-label="이전" onClick={() => go(stepPeriodKey(scope, k, -1))}>
          <ChevronLeft />
        </Button>
        <h2 className="min-w-0 text-center font-semibold tabular-nums">{label}</h2>
        <Button variant="outline" size="icon" className="max-md:size-11" aria-label="다음" onClick={() => go(stepPeriodKey(scope, k, 1))}>
          <ChevronRight />
        </Button>
        {k === current ? (
          <span className="text-muted-foreground text-sm">{NOW[scope]}</span>
        ) : (
          <Button variant="outline" size="sm" className="max-md:h-11" onClick={() => go(current)}>
            {NOW[scope]}
          </Button>
        )}
      </div>
      {items.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {items.map((g) => (
            <Row key={g.id} g={g} toggle={toggle} remove={remove} edit={setEditing} className="px-3 py-1.5" />
          ))}
        </ul>
      )}
      <QuickAdd key={k} scope={scope} periodKey={k} label={label} added={refresh} />
      {editing && <GoalDialog goal={editing} preset="" defaultYear={thisYear} categories={categories} close={() => setEditing(null)} done={refresh} />}
    </section>
  );
}
