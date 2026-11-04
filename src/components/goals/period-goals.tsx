"use client";

// 기간 목표(D-072): 일정 화면의 "{기간} 목표" 카드(PeriodGoals)와 목표 > 기간별 > 월별·주간·일간 목록(PeriodGoalList)
// 체크(달성↔진행 중)는 바로 화면에 반영(낙관적)하고 저장 뒤 새로 고침. 달성한 목표는 아래로, 흐리게
import { Ellipsis, Plus } from "lucide-react";
import { GoalCheck } from "@/components/goals/goal-list";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";
import { addPeriodGoal, changeGoalStatus, deleteGoal, restoreGoal } from "@/app/actions/goals";
import { toastUndo } from "@/components/app/states";
import { type Goal, GoalDialog } from "@/components/goals/goal-list";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { periodLabel, type PeriodScope } from "@/lib/period";
import { cn } from "@/lib/utils";

export type PeriodGoal = Pick<Goal, "id" | "version" | "title" | "status">;
const HREF: Record<PeriodScope, string> = { year: "/goals/year", month: "/goals/month", week: "/goals/week", day: "/goals/day" };
const NOW: Record<PeriodScope, string> = { year: "올해", month: "이번 달", week: "이번 주", day: "오늘" };
const doneLast = <G extends PeriodGoal>(list: G[]) => [...list].sort((a, b) => Number(a.status === "done") - Number(b.status === "done"));

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
    toastUndo("휴지통으로 옮겼어요", async () => {
      await restoreGoal(g.id);
      router.refresh();
    });
  }
  return { list, toggle, remove, refresh: () => router.refresh() };
}

function Row<G extends PeriodGoal>({ g, toggle, remove, edit, className }: { g: G; toggle: (g: G) => void; remove: (g: G) => void; edit?: (g: G) => void; className?: string }) {
  const done = g.status === "done";
  const title = <span className={cn("break-words", done && "text-muted-foreground line-through")}>{g.title}</span>;
  return (
    <li className={cn("flex min-h-11 items-center gap-1", className)}>
      <button
        type="button"
        aria-label={done ? `${g.title} 달성 취소` : `${g.title} 달성`}
        aria-pressed={done}
        onClick={() => toggle(g)}
        className="group -my-1 -ml-2 flex size-10 shrink-0 items-center justify-center rounded-md"
      >
        <GoalCheck done={done} />
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
          <Button variant="ghost" size="icon" className="max-md:size-11" aria-label={`${g.title} 더 보기`}>
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {edit && <DropdownMenuItem onSelect={() => edit(g)}>수정</DropdownMenuItem>}
          <DropdownMenuItem className="text-destructive-text" onSelect={() => remove(g)}>
            삭제
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

/** "+ 목표 추가" → 입력 칸. Enter로 추가하고 칸은 열어 둠(여러 개 연달아), Esc로 닫기 */
function QuickAdd({ scope, periodKey, label, added }: { scope: PeriodScope; periodKey: string; label: string; added: () => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    const title = text.trim();
    if (!title || busy) return;
    setBusy(true);
    const r = await addPeriodGoal(scope, periodKey, title);
    setBusy(false);
    if (!r.ok) return toast.error(r.error.fields?.[0]?.message ?? r.error.message);
    setText("");
    added();
  }

  if (!open)
    return (
      <Button variant="ghost" size="sm" className="text-muted-foreground -ml-2 max-md:h-10" onClick={() => setOpen(true)}>
        <Plus /> 목표 추가
      </Button>
    );
  return (
    <Input
      autoFocus
      aria-label={`${label} 목표 추가`}
      placeholder="목표를 적고 Enter"
      maxLength={60}
      readOnly={busy}
      className="h-11 text-base md:h-9 md:text-sm"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return; // 한글 조합 중 Enter는 글자 확정
        if (e.key === "Enter") add();
        if (e.key === "Escape") {
          setText("");
          setOpen(false);
        }
      }}
      onBlur={() => !text.trim() && setOpen(false)}
    />
  );
}

/** 일정 화면용 카드. year는 그 해가 든 연 목표, 추가하면 그 해 한 해짜리 단기 목표 */
export function PeriodGoals({ scope, periodKey, label, goals }: { scope: PeriodScope; periodKey: string; label: string; goals: PeriodGoal[] }) {
  const { list, toggle, remove, refresh } = useGoals(goals);
  return (
    <section className="bg-card space-y-1 rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold">{label} 목표</h2>
        <Link href={`${HREF[scope]}#${scope === "year" ? "y" : "p"}${periodKey}`} className="text-muted-foreground hover:text-foreground ml-auto text-caption">
          목표에서 보기
        </Link>
      </div>
      {list.length > 0 && (
        <ul>
          {doneLast(list).map((g) => (
            <Row key={g.id} g={g} toggle={toggle} remove={remove} />
          ))}
        </ul>
      )}
      <QuickAdd scope={scope} periodKey={periodKey} label={label} added={refresh} />
    </section>
  );
}

/** 목표 > 기간별 > 월별·주간·일간: 이번 기간 + 목표가 있는 기간을 최근(앞으로 올 기간)부터 이어서. 처음엔 이번 기간으로 스크롤 */
export function PeriodGoalList({
  scope,
  goals,
  current,
  thisYear,
  categories,
}: {
  scope: "month" | "week" | "day";
  goals: Goal[];
  current: string;
  thisYear: number;
  categories: { id: string; name: string }[];
}) {
  const { list, toggle, remove, refresh } = useGoals(goals);
  const [editing, setEditing] = useState<Goal | null>(null);
  const keys = [...new Set([current, ...goals.flatMap((g) => (g.periodKey ? [g.periodKey] : []))])].sort().reverse();

  // 주소에 #p기간이 있으면(일정 화면에서 옴) 그 기간, 아니면 이번 기간이 맨 위에
  useEffect(() => {
    const el = (location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)))) || (keys[0] !== current ? document.getElementById(`p${current}`) : null);
    el?.scrollIntoView({ block: "start" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 처음 열 때 한 번만
  }, []);

  return (
    <div className="space-y-5">
      {keys.map((k) => {
        const label = periodLabel(scope, k, thisYear);
        const items = doneLast(list.filter((g) => g.periodKey === k));
        return (
          <section key={k} id={`p${k}`} className="scroll-mt-14 space-y-2">
            <h2 className="bg-background/95 sticky top-14 z-[1] py-1.5 font-semibold backdrop-blur">
              {label}
              {k === current && <span className="text-muted-foreground ml-2 text-sm font-normal">{NOW[scope]}</span>}
            </h2>
            {items.length > 0 && (
              <ul className="divide-y rounded-lg border">
                {items.map((g) => (
                  <Row key={g.id} g={g} toggle={toggle} remove={remove} edit={setEditing} className="px-3 py-1.5" />
                ))}
              </ul>
            )}
            <QuickAdd scope={scope} periodKey={k} label={label} added={refresh} />
          </section>
        );
      })}
      {editing && <GoalDialog goal={editing} preset="" defaultYear={thisYear} categories={categories} close={() => setEditing(null)} done={refresh} />}
    </div>
  );
}
