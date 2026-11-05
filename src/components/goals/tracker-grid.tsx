"use client";

// 습관 트래커 (SCR-GOAL-02, 04 §5.1): 항목 × 날짜 색 칸. 누르면 색이 채워지고, 메모는 칸 안 글자로
// PC: 한 달 전체 · 모바일: 7일 창. 칸 메모는 PC 두 번 클릭(또는 Enter), 모바일 길게 누르기
import { Check, GripVertical, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  addTrackerItem,
  deleteTrackerItem,
  editTrackerItem,
  hideTrackerItem,
  nextColor,
  reorderTrackerItems,
  saveCell,
  startTrackerMonth,
} from "@/app/actions/goals";
import { ColorPalettePicker } from "@/components/app/color-picker";
import { HowToTip } from "@/components/app/help";
import { ResponsiveModal } from "@/components/app/responsive";
import { EmptyState, toastDone } from "@/components/app/states";
import { MonthNav } from "@/components/money/controls";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useDragSort } from "@/hooks/use-drag-sort";
import { useIsMobile } from "@/hooks/use-mobile";
import { fromYmd } from "@/lib/format";
import { textOn } from "@/lib/palette";
import { cn } from "@/lib/utils";

type Item = { id: string; version: number; name: string; colorHex: string; goalId: string | null };
type Cell = { itemId: string; date: string; done: boolean; memo: string | null };
type Data = { month: string; days: number; today: string; items: Item[]; cells: Cell[]; previous: Item[] };

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const k = (itemId: string, date: string) => `${itemId}|${date}`;
const HOW = ["칸을 누르면 색이 채워져요", "PC는 두 번 클릭, 휴대폰은 길게 눌러 메모를 남겨요", "항목 이름을 누르면 이름·색을 바꾸고, 왼쪽 손잡이를 끌면 순서를 바꿔요"];

export function TrackerGrid({ data }: { data: Data }) {
  const router = useRouter();
  const mobile = useIsMobile();
  const { month, days, today, items } = data;

  // 칸은 화면에서 먼저 바꾸고 저장(낙관적). 서버 값이 새로 오면 다시 맞춤
  const fromProps = () => new Map(data.cells.map((c) => [k(c.itemId, c.date), c]));
  const [cells, setCells] = useState(fromProps);
  const [seen, setSeen] = useState(data.cells);
  if (seen !== data.cells) {
    setSeen(data.cells);
    setCells(fromProps());
  }

  const dates = Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
  const thisMonth = today.slice(0, 7) === month;
  const elapsed = month < today.slice(0, 7) ? days : thisMonth ? Number(today.slice(8)) : 0;

  // 모바일 7일 창: 오늘이 든 주(이번 달), 아니면 첫 주
  const weeks = Array.from({ length: Math.ceil(days / 7) }, (_, i) => [i * 7 + 1, Math.min(days, i * 7 + 7)] as const);
  const [week, setWeek] = useState(thisMonth ? Math.floor((Number(today.slice(8)) - 1) / 7) : 0);
  const shown = mobile ? dates.slice(weeks[week][0] - 1, weeks[week][1]) : dates;

  // 항목 순서: 손잡이로 끌면 화면에서 먼저 바꾸고 저장
  const sort = useDragSort(
    items.map((i) => i.id),
    async (ids) => {
      const r = await reorderTrackerItems(month, ids);
      if (!r.ok) toast("순서를 저장하지 못했어요");
      router.refresh();
    },
  );
  const rowsInOrder = sort.order.flatMap((id) => items.filter((i) => i.id === id));

  const [editCell, setEditCell] = useState<{ item: Item; date: string } | null>(null);
  const [editItem, setEditItem] = useState<Item | "new" | null>(null);
  const [preset, setPreset] = useState("");

  async function write(c: Cell) {
    const before = cells.get(k(c.itemId, c.date));
    setCells((m) => new Map(m).set(k(c.itemId, c.date), c));
    const r = await saveCell(c);
    if (!r.ok) {
      setCells((m) => {
        const n = new Map(m);
        if (before) n.set(k(c.itemId, c.date), before);
        else n.delete(k(c.itemId, c.date));
        return n;
      });
      toast(r.error.message === "앞으로 올 날은 체크할 수 없어요" ? r.error.message : "저장하지 못했어요", {
        action: { label: "다시 시도", onClick: () => write(c) },
      });
    }
  }
  const toggle = (item: Item, date: string) => {
    if (date > today) return;
    const cur = cells.get(k(item.id, date));
    write({ itemId: item.id, date, done: !cur?.done, memo: cur?.memo ?? null });
  };

  // 모바일 길게 누르기(400ms) = 메모
  const press = useRef<{ t: ReturnType<typeof setTimeout>; long: boolean } | null>(null);
  const cellHandlers = (item: Item, date: string) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === "mouse") return;
      const p = { long: false, t: setTimeout(() => ((p.long = true), date <= today && setEditCell({ item, date })), 400) };
      press.current = p;
    },
    onPointerUp: () => press.current && clearTimeout(press.current.t),
    onPointerLeave: () => press.current && clearTimeout(press.current.t),
    onClick: () => {
      if (press.current?.long) return void (press.current = null);
      toggle(item, date);
    },
    onDoubleClick: () => date <= today && setEditCell({ item, date }),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && date <= today) {
        e.preventDefault();
        setEditCell({ item, date });
      }
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <MonthNav month={month} />
      <div className="flex items-center gap-1">
        <HowToTip label="트래커" steps={HOW} />
        {items.length > 0 && (
          <Button className="max-md:hidden" onClick={() => setEditItem("new")}>
            <Plus /> 항목 추가
          </Button>
        )}
      </div>
    </div>
  );

  const modals = (
    <>
      {editItem && (
        <ItemEditor
          month={month}
          item={editItem === "new" ? null : editItem}
          preset={preset}
          used={items.map((i) => i.colorHex)}
          close={() => (setEditItem(null), setPreset(""))}
          done={() => router.refresh()}
        />
      )}
      {editCell && (
        <CellEditor
          key={k(editCell.item.id, editCell.date)}
          item={editCell.item}
          date={editCell.date}
          cell={cells.get(k(editCell.item.id, editCell.date))}
          close={() => setEditCell(null)}
          save={(c) => write(c)}
        />
      )}
    </>
  );

  if (!items.length)
    return (
      <div className="space-y-6">
        {header}
        {data.previous.length ? (
          <StartFromPrevious month={month} previous={data.previous} onNew={() => setEditItem("new")} done={() => router.refresh()} />
        ) : (
          <EmptyState
            pet="piyo"
            title="매일 체크할 일을 추가해 보세요"
            action={
              <div className="flex flex-wrap justify-center gap-2">
                {["독서", "운동", "물 마시기"].map((n) => (
                  <Button key={n} variant="outline" className="rounded-full" onClick={() => (setPreset(n), setEditItem("new"))}>
                    {n}
                  </Button>
                ))}
                <Button onClick={() => setEditItem("new")}>
                  <Plus /> 항목 추가
                </Button>
              </div>
            }
          />
        )}
        {modals}
      </div>
    );

  const doneCount = (item: Item) => dates.filter((d) => d <= today && cells.get(k(item.id, d))?.done).length;
  // PC는 사이드바를 펼친 1280px 화면에서도 한 달이 한눈에 들어오게(칸이 좁으면 메모는 앞 글자만)
  const cols = mobile ? `72px repeat(${shown.length}, minmax(36px, 1fr))` : `128px repeat(${shown.length}, minmax(24px, 1fr)) 48px`;

  return (
    <div className="space-y-4">
      {header}
      {mobile && (
        <div className="grid auto-cols-fr grid-flow-col gap-1.5" role="tablist" aria-label="주">
          {weeks.map(([a, b], i) => (
            <Button key={a} role="tab" aria-selected={week === i} variant={week === i ? "default" : "outline"} className="h-10 min-w-0 rounded-full px-0 text-[13px]" onClick={() => setWeek(i)}>
              {a}~{b}
            </Button>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <div role="grid" aria-label={`${Number(month.slice(5))}월 트래커`} className="grid min-w-fit text-sm" style={{ gridTemplateColumns: cols }}>
          <div role="row" className="contents">
            <div role="columnheader" className="bg-card sticky left-0 z-[1] border-b" />
            {shown.map((d) => {
              const dow = fromYmd(d).getDay();
              const isToday = d === today;
              return (
                <div
                  key={d}
                  role="columnheader"
                  aria-current={isToday ? "date" : undefined}
                  className={cn("border-b py-1 text-center leading-tight", isToday ? "text-link font-bold" : dow === 0 ? "text-destructive-text" : "text-muted-foreground")}
                >
                  <div className="tabular-nums">{Number(d.slice(8))}</div>
                  <div className="text-micro">{WEEK[dow]}</div>
                </div>
              );
            })}
            {!mobile && <div role="columnheader" className="text-muted-foreground border-b py-1 text-center text-caption">완료</div>}
          </div>

          {rowsInOrder.map((item) => (
            <div key={item.id} role="row" className="contents">
              <div role="rowheader" ref={sort.rowRef(item.id)} className={cn("bg-card sticky left-0 z-[1] flex min-h-11 items-stretch border-b", sort.dragging === item.id && "bg-accent")}>
                {items.length > 1 && (
                  <button type="button" {...sort.handle(item.id)} className="text-muted-foreground hover:text-foreground flex w-5 shrink-0 cursor-grab items-center justify-center active:cursor-grabbing">
                    <GripVertical className="size-3.5" />
                  </button>
                )}
                <button type="button" onClick={() => setEditItem(item)} title={item.name} className={cn("hover:bg-accent/50 flex min-w-0 flex-1 items-center gap-1.5 pr-2 text-left", items.length > 1 ? "pl-0.5" : "pl-2")}>
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: item.colorHex }} />
                  <span className="truncate">{item.name}</span>
                </button>
              </div>
              {shown.map((d) => {
                const c = cells.get(k(item.id, d));
                const future = d > today;
                const label = `${item.name}, ${Number(d.slice(5, 7))}월 ${Number(d.slice(8))}일, ${c?.done ? "완료" : "미완료"}${c?.memo ? `, 메모: ${c.memo}` : ""}`;
                return (
                  <button
                    key={d}
                    type="button"
                    role="gridcell"
                    aria-label={label}
                    aria-disabled={future || undefined}
                    title={c?.memo ?? undefined}
                    {...cellHandlers(item, d)}
                    className={cn(
                      "relative m-px flex min-h-11 items-center justify-center overflow-hidden rounded-sm px-0.5 text-micro leading-tight transition-colors duration-[120ms] select-none",
                      !c?.done && (future ? "bg-muted/50 cursor-default" : "bg-muted hover:bg-accent"),
                      d === today && "ring-link ring-1",
                    )}
                    style={c?.done ? { background: item.colorHex, color: textOn(item.colorHex) } : undefined}
                  >
                    {c?.memo ? <span className="line-clamp-2 break-all">{c.memo}</span> : c?.done ? <Check className="size-3.5" aria-hidden /> : null}
                  </button>
                );
              })}
              {!mobile && <div className="text-muted-foreground flex items-center justify-center border-b text-caption tabular-nums">{doneCount(item)}/{elapsed}</div>}
            </div>
          ))}
        </div>
      </div>

      {mobile && (
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-sm tabular-nums">
            이번 달 완료 {items.reduce((a, i) => a + doneCount(i), 0)}/{items.length * elapsed}
          </p>
          <Button variant="outline" onClick={() => setEditItem("new")}>
            <Plus /> 항목 추가
          </Button>
        </div>
      )}
      {modals}
    </div>
  );
}

/** 칸 메모·완료 편집 */
function CellEditor({ item, date, cell, close, save }: { item: Item; date: string; cell?: Cell; close: () => void; save: (c: Cell) => void }) {
  const [memo, setMemo] = useState(cell?.memo ?? "");
  const [done, setDone] = useState(cell?.done ?? false);
  const commit = (c: Cell) => (save(c), close());
  return (
    <ResponsiveModal
      open
      onOpenChange={(o) => !o && close()}
      title={`${item.name} · ${Number(date.slice(5, 7))}월 ${Number(date.slice(8))}일`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" className="text-destructive-text md:mr-auto" onClick={() => commit({ itemId: item.id, date, done: false, memo: null })}>
            지우기
          </Button>
          <Button onClick={() => commit({ itemId: item.id, date, done, memo: memo.trim() || null })}>저장</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input
          autoFocus
          aria-label="메모"
          maxLength={40}
          placeholder="메모를 입력하세요"
          className="h-11 text-base md:h-9 md:text-sm"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && commit({ itemId: item.id, date, done, memo: memo.trim() || null })}
        />
        <Button type="button" variant={done ? "default" : "outline"} className="w-full" style={done ? { background: item.colorHex, color: textOn(item.colorHex) } : undefined} onClick={() => setDone(!done)}>
          {done ? <Check /> : null} {done ? "완료" : "미완료"}
        </Button>
      </div>
    </ResponsiveModal>
  );
}

/** 항목 추가·수정: 이름, 색, 이번 달에서 빼기, 삭제 */
function ItemEditor({ month, item, preset, used, close, done }: { month: string; item: Item | null; preset: string; used: string[]; close: () => void; done: () => void }) {
  const [name, setName] = useState(item?.name ?? preset);
  const [color, setColor] = useState(item?.colorHex ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // 새 항목: 아직 안 쓴 색을 서버에서 받아 옴
  useEffect(() => {
    if (!item) nextColor(month).then((r) => setColor((c) => c || (r.ok ? r.data : "#6FB7E9")));
  }, [item, month]);

  async function save() {
    setBusy(true);
    const input = { name, colorHex: color };
    const r = item ? await editTrackerItem(item.id, item.version, input) : await addTrackerItem(month, input);
    setBusy(false);
    if (!r.ok) return setError(r.error.fields?.[0]?.message ?? r.error.message);
    done();
    close();
  }
  async function hide() {
    if (!item) return;
    await hideTrackerItem(item.id, month);
    done();
    close();
    toast(`${item.name}을(를) 이번 달에서 뺐어요`);
  }
  async function remove() {
    if (!item) return;
    await deleteTrackerItem(item.id);
    done();
    close();
    toastDone("휴지통으로 옮겼어요");
  }

  return (
    <ResponsiveModal
      open
      onOpenChange={(o) => !o && close()}
      title={item ? "항목 수정" : "항목 추가"}
      size="md"
      footer={
        <>
          {item && (
            <Button variant="ghost" className="text-destructive-text md:mr-auto" onClick={remove}>
              삭제
            </Button>
          )}
          <Button variant="outline" onClick={close}>
            취소
          </Button>
          <Button disabled={!name.trim() || !color || busy} onClick={save}>
            {busy && <Spinner />} {item ? "저장" : "항목 추가"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field data-invalid={!!error || undefined}>
          <FieldLabel htmlFor="item-name">이름</FieldLabel>
          <Input id="item-name" autoFocus={!item} maxLength={60} placeholder="습관 이름을 입력하세요" className="h-11 text-base md:h-9 md:text-sm" value={name} onChange={(e) => setName(e.target.value)} />
          {error && <FieldError>{error}</FieldError>}
        </Field>
        <Field>
          <FieldLabel>색</FieldLabel>
          {color ? <ColorPalettePicker value={color} onChange={setColor} used={used.filter((u) => u !== item?.colorHex)} /> : <Spinner />}
        </Field>
        {item && (
          <div className="space-y-1">
            <Button variant="outline" onClick={hide}>
              이번 달에서 빼기
            </Button>
            <p className="text-muted-foreground text-caption">이번 달 트래커에서만 빠져요. 지난 달 기록은 그대로 남아요.</p>
            <p className="text-muted-foreground text-caption">아래 삭제는 모든 달에서 지우고 휴지통으로 옮겨요.</p>
          </div>
        )}
      </div>
    </ResponsiveModal>
  );
}

/** 새 달: 지난달 항목으로 시작할지 고름(자동으로 하지 않음, 04 §5.1) */
function StartFromPrevious({ month, previous, onNew, done }: { month: string; previous: Item[]; onNew: () => void; done: () => void }) {
  const [picked, setPicked] = useState(() => new Set(previous.map((p) => p.id)));
  const [busy, setBusy] = useState(false);
  return (
    <section className="bg-card mx-auto max-w-md space-y-4 rounded-xl border p-5">
      <h2 className="text-subtitle font-semibold">지난달 항목으로 시작할까요?</h2>
      <ul className="space-y-2">
        {previous.map((p) => (
          <li key={p.id}>
            <label className="flex items-center gap-3">
              <Checkbox
                checked={picked.has(p.id)}
                onCheckedChange={(v) =>
                  setPicked((s) => {
                    const n = new Set(s);
                    if (v) n.add(p.id);
                    else n.delete(p.id);
                    return n;
                  })
                }
              />
              <span className="size-2.5 rounded-full" style={{ background: p.colorHex }} />
              {p.name}
            </label>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Button
          className="flex-1"
          disabled={!picked.size || busy}
          onClick={async () => {
            setBusy(true);
            await startTrackerMonth(month, [...picked]);
            done();
          }}
        >
          {busy && <Spinner />} 이대로 시작
        </Button>
        <Button variant="outline" onClick={onNew}>
          새로 만들기
        </Button>
      </div>
    </section>
  );
}
