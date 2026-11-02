"use client";

// 분류 편집 창(지출 분류·경험 분류 공용): 순서 바꾸기(손잡이 끌기)·이름 바꾸기·지우기·추가, 고를 수 있으면 색과 줄마다 덧붙는 설정
// 바꿀 때마다 바로 저장하고 화면을 새로 읽음. 버튼은 분류 칩 줄 맨 끝에 칩 모양으로 붙음
import { GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ResponsiveModal } from "@/components/app/responsive";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDragSort } from "@/hooks/use-drag-sort";
import { GOAL_PALETTE } from "@/lib/palette";
import { cn } from "@/lib/utils";

type Result = { ok: true } | { ok: false; error: { message: string; fields?: { message: string }[] } };
export type CategoryItem = { key: string; name: string; color?: string | null };

export function CategoryEditor({
  title = "분류 편집",
  items,
  onAdd,
  onRename,
  onRemove,
  onReorder,
  onColor,
  extra,
  removeNote,
  className,
}: {
  title?: string;
  items: CategoryItem[];
  onAdd: (name: string) => Promise<Result>;
  onRename: (item: CategoryItem, name: string) => Promise<Result>;
  onRemove: (item: CategoryItem) => Promise<Result>;
  onReorder: (keys: string[]) => Promise<Result>;
  /** 주면 줄마다 색 점(누르면 팔레트) */
  onColor?: (item: CategoryItem, hex: string | null) => Promise<Result>;
  /** 줄 아래에 덧붙는 설정(예: 경험 분류의 보일 칸) */
  extra?: (item: CategoryItem) => ReactNode;
  /** 지우기 확인 때 덧붙일 말(예: 지난 지출은 이름 그대로 남아요) */
  removeNote: string;
  /** 여는 버튼 모양(칩 줄에 맞춤) */
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState("");
  const [busy, setBusy] = useState(false);
  const sort = useDragSort(
    items.map((i) => i.key),
    (keys) => void run(onReorder(keys), "순서를 바꿨어요"),
  );
  const byKey = new Map(items.map((i) => [i.key, i]));

  async function run(p: Promise<Result>, done: string) {
    setBusy(true);
    const r = await p;
    setBusy(false);
    if (!r.ok) return void toast.error(r.error.fields?.[0]?.message ?? r.error.message);
    toast(done);
    router.refresh();
    return true;
  }
  async function rename(item: CategoryItem, el: HTMLInputElement) {
    const name = el.value.trim();
    if (!name || name === item.name) return;
    await run(onRename(item, name), "이름을 바꿨어요");
  }
  async function add() {
    const name = adding.trim();
    if (name && (await run(onAdd(name), "분류를 추가했어요"))) setAdding("");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn("text-muted-foreground hover:bg-accent flex items-center gap-1 rounded-full border border-dashed px-3 py-1 text-sm max-md:min-h-10", className)}
      >
        <Pencil className="size-3.5" /> 분류 편집
      </button>
      <ResponsiveModal
        open={open}
        onOpenChange={(o) => (setOpen(o), setConfirm(null))}
        title={title}
        description="손잡이를 끌면 순서가 바뀌고, 이름을 누르면 고칠 수 있어요"
        footer={
          <Button variant="outline" onClick={() => setOpen(false)}>
            닫기
          </Button>
        }
      >
        <form
          className="mb-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <Input aria-label="새 분류 이름" placeholder="새 분류 이름" maxLength={20} value={adding} onChange={(e) => setAdding(e.target.value)} />
          <Button type="submit" variant="outline" disabled={!adding.trim() || busy}>
            <Plus /> 추가
          </Button>
        </form>
        <ul className="divide-y rounded-lg border">
          {sort.order.map((key) => {
            const it = byKey.get(key);
            if (!it) return null;
            return (
              <li key={key} ref={sort.rowRef(key)} className={cn("px-1 py-1", sort.dragging === key && "bg-accent")}>
                {confirm === key ? (
                  <div className="flex items-center gap-1 px-1">
                    <p className="min-w-0 flex-1 py-1.5 text-sm">
                      <b>{it.name}</b> 분류를 지울까요? <span className="text-muted-foreground">{removeNote}</span>
                    </p>
                    <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>
                      취소
                    </Button>
                    <Button size="sm" variant="destructive" disabled={busy} onClick={async () => (await run(onRemove(it), "분류를 지웠어요")) && setConfirm(null)}>
                      지우기
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    {/* data-vaul-no-drag: 모바일 아래 창이 끌려 내려가지 않게 */}
                    <button type="button" data-vaul-no-drag {...sort.handle(key)} className="text-muted-foreground flex size-9 shrink-0 cursor-grab items-center justify-center active:cursor-grabbing">
                      <GripVertical className="size-4" />
                    </button>
                    {onColor && <ColorDot item={it} onPick={(hex) => run(onColor(it, hex), "색을 바꿨어요")} />}
                    {editing === key ? (
                      <Input
                        autoFocus
                        aria-label={`${it.name} 새 이름`}
                        defaultValue={it.name}
                        maxLength={20}
                        className="flex-1"
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
                      <button type="button" className="hover:bg-accent min-h-10 min-w-0 flex-1 truncate rounded-md px-2 text-left text-sm" onClick={() => setEditing(key)}>
                        {it.name}
                      </button>
                    )}
                    <Button size="icon" variant="ghost" aria-label={`${it.name} 지우기`} className="text-muted-foreground hover:text-destructive-text" onClick={() => setConfirm(key)}>
                      <Trash2 />
                    </Button>
                  </div>
                )}
                {extra && confirm !== key && <div className="pb-1 pl-10">{extra(it)}</div>}
              </li>
            );
          })}
        </ul>
      </ResponsiveModal>
    </>
  );
}

/** 색 점: 누르면 팔레트(색 없음 포함) */
function ColorDot({ item, onPick }: { item: CategoryItem; onPick: (hex: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const pick = (hex: string | null) => (setOpen(false), onPick(hex));
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-label={`${item.name} 색 고르기`} className="hover:bg-accent flex size-9 shrink-0 items-center justify-center rounded-md">
          <span className={cn("size-4 rounded-full", !item.color && "border-muted-foreground border border-dashed")} style={item.color ? { background: item.color } : undefined} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start">
        <div className="grid grid-cols-6 gap-2" role="radiogroup" aria-label={`${item.name} 색`}>
          {GOAL_PALETTE.map((c) => (
            <button
              key={c.hex}
              type="button"
              role="radio"
              aria-checked={item.color?.toUpperCase() === c.hex}
              aria-label={c.name}
              onClick={() => pick(c.hex)}
              className={cn("size-8 rounded-md", item.color?.toUpperCase() === c.hex && "ring-foreground ring-2 ring-offset-2")}
              style={{ background: c.hex }}
            />
          ))}
        </div>
        <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => pick(null)}>
          색 없음
        </Button>
      </PopoverContent>
    </Popover>
  );
}
