"use client";

// 분류 편집 창(지출 분류·경험 분류 공용). 표 모양: [손잡이][색][이름·개수][칸별 체크…][⋯]
// - 손잡이로 끌면 순서(화면에 보이는 순서), 이름을 누르면 고치기, ⋯에서 지우기, 목록 끝 "분류 추가" 줄에서 그 자리에 추가
// - 색·체크 칸은 주는 쪽만(경험 분류: 색 + 양식에 보일 칸). 바꿀 때마다 바로 저장하고 화면을 새로 읽음
// 여는 버튼은 분류 칩 줄 맨 끝에 글자 버튼으로 붙음(칩과 구분)
import { GripVertical, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ResponsiveModal } from "@/components/app/responsive";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDragSort } from "@/hooks/use-drag-sort";
import { GOAL_PALETTE } from "@/lib/palette";
import { cn } from "@/lib/utils";

type Result = { ok: true } | { ok: false; error: { message: string; fields?: { message: string }[] } };
export type CategoryItem = { key: string; name: string; color?: string | null; count?: number };
type Column = { key: string; label: string };

export function CategoryEditor({
  title = "분류 편집",
  description = "바꾸면 바로 저장돼요. 이 순서대로 화면에 보여요",
  items,
  onAdd,
  onRename,
  onRemove,
  onReorder,
  onColor,
  columns = [],
  isOn,
  onToggle,
  countLabel = "개",
  removeNote,
  className,
}: {
  title?: string;
  description?: string;
  items: CategoryItem[];
  onAdd: (name: string) => Promise<Result>;
  onRename: (item: CategoryItem, name: string) => Promise<Result>;
  onRemove: (item: CategoryItem) => Promise<Result>;
  onReorder: (keys: string[]) => Promise<Result>;
  /** 주면 줄마다 색 견본(누르면 팔레트) */
  onColor?: (item: CategoryItem, hex: string | null) => Promise<Result>;
  /** 줄마다 체크하는 칸(예: 경험 양식에 보일 칸) */
  columns?: Column[];
  isOn?: (item: CategoryItem, col: string) => boolean;
  onToggle?: (item: CategoryItem, col: string, on: boolean) => Promise<Result>;
  /** 개수 뒤에 붙는 말(예: 경험 3개) */
  countLabel?: string;
  /** 지우기 확인 때 덧붙일 말(예: 지난 지출은 이름 그대로 남아요) */
  removeNote: string;
  /** 여는 버튼 모양(칩 줄에 맞춤) */
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null); // null = "분류 추가" 줄, 글자 = 입력 중
  const [busy, setBusy] = useState(false);
  // 체크는 누르는 즉시 보이게(저장·새로 읽기 전까지 덮어 둠). 목록이 새로 오면 비움
  const [flip, setFlip] = useState<Record<string, boolean>>({});
  const [seen, setSeen] = useState(items);
  if (seen !== items) {
    setSeen(items);
    setFlip({});
  }
  const sort = useDragSort(
    items.map((i) => i.key),
    (keys) => void run(onReorder(keys), "순서를 바꿨어요"),
  );
  const byKey = new Map(items.map((i) => [i.key, i]));
  // 표 칸 너비: 손잡이 · (색) · 이름 · 체크 칸들 · ⋯ (휴대폰은 --hw·--cw를 줄여 이름 칸을 남김)
  const grid = ["var(--hw)", ...(onColor ? ["var(--hw)"] : []), "minmax(0,1fr)", ...columns.map(() => "var(--cw)"), "var(--hw)"].join(" ");

  async function run(p: Promise<Result>, done?: string) {
    setBusy(true);
    const r = await p;
    setBusy(false);
    if (!r.ok) return void toast.error(r.error.fields?.[0]?.message ?? r.error.message);
    if (done) toast(done);
    router.refresh();
    return true;
  }
  async function rename(item: CategoryItem, el: HTMLInputElement) {
    const name = el.value.trim();
    if (!name || name === item.name) return;
    await run(onRename(item, name), "이름을 바꿨어요");
  }
  async function add() {
    const name = adding?.trim();
    if (name && (await run(onAdd(name), "분류를 추가했어요"))) setAdding(""); // 이어서 더 넣을 수 있게 칸은 열어 둠
  }
  async function toggle(item: CategoryItem, col: string, on: boolean) {
    const k = `${item.key}:${col}`;
    setFlip((f) => ({ ...f, [k]: on }));
    if (!(await run(onToggle!(item, col, on)))) setFlip((f) => ({ ...f, [k]: !on }));
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn("text-muted-foreground hover:text-foreground flex items-center gap-1 px-1.5 text-sm underline-offset-4 hover:underline max-md:min-h-10", className)}
      >
        <Pencil className="size-3.5" /> 분류 편집
      </button>
      <ResponsiveModal
        open={open}
        onOpenChange={(o) => (setOpen(o), setConfirm(null), setAdding(null))}
        title={title}
        description={description}
        footer={
          <Button variant="outline" onClick={() => setOpen(false)}>
            닫기
          </Button>
        }
      >
        <div className="rounded-lg border [--cw:3rem] [--hw:2.25rem] max-md:[--cw:2.25rem] max-md:[--hw:2rem]">
          {columns.length > 0 && (
            <div className="bg-background text-muted-foreground sticky top-0 z-[1] grid items-end gap-x-1 max-md:gap-x-0 rounded-t-lg border-b px-1 pt-2 pb-1.5 text-caption" style={{ gridTemplateColumns: grid }}>
              <span className={cn("pl-2", onColor ? "col-span-3" : "col-span-2")}>분류</span>
              {columns.map((c) => (
                <span key={c.key} className="text-center">
                  {c.label}
                </span>
              ))}
              <span />
            </div>
          )}
          <ul className="divide-y">
            {sort.order.map((key) => {
              const it = byKey.get(key);
              if (!it) return null;
              if (confirm === key)
                return (
                  <li key={key} className="bg-destructive/5 flex items-center gap-1 px-3 py-1.5">
                    <p className="min-w-0 flex-1 text-sm">
                      <b>{it.name}</b> 분류를 지울까요? <span className="text-muted-foreground">{removeNote}</span>
                    </p>
                    <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>
                      취소
                    </Button>
                    <Button size="sm" variant="destructive" disabled={busy} onClick={async () => (await run(onRemove(it), "분류를 지웠어요")) && setConfirm(null)}>
                      지우기
                    </Button>
                  </li>
                );
              return (
                <li key={key} ref={sort.rowRef(key)} className={cn("grid items-center gap-x-1 max-md:gap-x-0 px-1 py-0.5", sort.dragging === key && "bg-accent")} style={{ gridTemplateColumns: grid }}>
                  {/* data-vaul-no-drag: 모바일 아래 창이 끌려 내려가지 않게 */}
                  <button type="button" data-vaul-no-drag {...sort.handle(key)} className="text-muted-foreground hover:text-foreground flex h-9 w-full cursor-grab items-center justify-center active:cursor-grabbing">
                    <GripVertical className="size-4" />
                  </button>
                  {onColor && <Swatch item={it} onPick={(hex) => run(onColor(it, hex))} />}
                  {editing === key ? (
                    <Input
                      autoFocus
                      aria-label={`${it.name} 새 이름`}
                      defaultValue={it.name}
                      maxLength={20}
                      onFocus={(e) => e.currentTarget.select()}
                      onBlur={(e) => (setEditing(null), rename(it, e.currentTarget))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                        if (e.key !== "Escape") return;
                        e.stopPropagation(); // 창은 닫지 않고 고치기만 취소
                        e.currentTarget.value = it.name;
                        e.currentTarget.blur();
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      title="이름 고치기"
                      className="group hover:ring-input flex min-h-10 min-w-0 items-center gap-1.5 rounded-md px-2 text-left text-sm hover:ring-1"
                      onClick={() => setEditing(key)}
                    >
                      <span className="truncate">{it.name}</span>
                      {it.count !== undefined && <span className="text-muted-foreground text-caption shrink-0 tabular-nums max-md:hidden">{it.count ? `${it.count}${countLabel}` : ""}</span>}
                      <Pencil className="text-muted-foreground ml-auto size-3.5 shrink-0 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 max-md:hidden" />
                    </button>
                  )}
                  {columns.map((c) => (
                    <label key={c.key} className="flex h-10 cursor-pointer items-center justify-center">
                      <Checkbox
                        aria-label={`${it.name}: ${c.label}`}
                        checked={flip[`${key}:${c.key}`] ?? isOn?.(it, c.key) ?? false}
                        onCheckedChange={(v) => toggle(it, c.key, v === true)}
                      />
                    </label>
                  ))}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="ghost" aria-label={`${it.name} 더 보기`} className="text-muted-foreground h-9 w-full max-md:h-10 max-md:w-full">
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setEditing(key)}>
                        <Pencil /> 이름 고치기
                      </DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onSelect={() => setConfirm(key)}>
                        <Trash2 /> 지우기
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              );
            })}
            {/* 목록 끝에서 추가: 새 분류가 바로 이 위에 생겨 눈으로 이어짐 */}
            <li className="px-1 py-1">
              {adding === null ? (
                <button type="button" onClick={() => setAdding("")} className="text-link hover:bg-accent flex min-h-10 w-full items-center gap-1.5 rounded-md px-2 text-sm">
                  <Plus className="size-4" /> 분류 추가
                </button>
              ) : (
                <form
                  className="flex gap-2 p-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    add();
                  }}
                >
                  <Input
                    autoFocus
                    aria-label="새 분류 이름"
                    placeholder="새 분류 이름"
                    maxLength={20}
                    value={adding}
                    onChange={(e) => setAdding(e.target.value)}
                    onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), setAdding(null))}
                    onBlur={() => !adding.trim() && setAdding(null)}
                  />
                  <Button type="submit" variant="outline" disabled={!adding.trim() || busy}>
                    추가
                  </Button>
                </form>
              )}
            </li>
          </ul>
        </div>
      </ResponsiveModal>
    </>
  );
}

/** 색 견본: 색이 있으면 칠한 네모, 없으면 회색 네모에 +. 누르면 팔레트(색 없음 포함) */
function Swatch({ item, onPick }: { item: CategoryItem; onPick: (hex: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const pick = (hex: string | null) => (setOpen(false), onPick(hex));
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" title="색" aria-label={`${item.name} 색 고르기`} className="hover:bg-accent flex h-9 w-full items-center justify-center rounded-md">
          <span className={cn("flex size-5 items-center justify-center rounded", !item.color && "bg-muted text-muted-foreground")} style={item.color ? { background: item.color } : undefined}>
            {!item.color && <Plus className="size-3" />}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start">
        <p className="text-muted-foreground text-caption mb-2">{item.name} 색</p>
        <div className="grid grid-cols-6 gap-2" role="radiogroup" aria-label={`${item.name} 색`}>
          {GOAL_PALETTE.map((c) => (
            <button
              key={c.hex}
              type="button"
              role="radio"
              aria-checked={item.color?.toUpperCase() === c.hex}
              aria-label={c.name}
              title={c.name}
              onClick={() => pick(c.hex)}
              className={cn("size-8 rounded-md", item.color?.toUpperCase() === c.hex && "ring-foreground ring-2 ring-offset-2")}
              style={{ background: c.hex }}
            />
          ))}
        </div>
        {item.color && (
          <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => pick(null)}>
            색 빼기
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
