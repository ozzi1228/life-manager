"use client";

// 분류 편집 창(지출 분류·경험 분류 공용): 이름 바꾸기·지우기·추가. 바꿀 때마다 바로 저장하고 화면을 새로 읽음
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ResponsiveModal } from "@/components/app/responsive";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Result = { ok: true } | { ok: false; error: { message: string; fields?: { message: string }[] } };
type Item = { key: string; name: string };

export function CategoryEditor({
  title = "분류 편집",
  items,
  onAdd,
  onRename,
  onRemove,
  removeNote,
}: {
  title?: string;
  items: Item[];
  onAdd: (name: string) => Promise<Result>;
  onRename: (item: Item, name: string) => Promise<Result>;
  onRemove: (item: Item) => Promise<Result>;
  /** 지우기 확인 때 덧붙일 말(예: 지난 지출은 이름 그대로 남아요) */
  removeNote: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(p: Promise<Result>, done: string) {
    setBusy(true);
    const r = await p;
    setBusy(false);
    if (!r.ok) return void toast.error(r.error.fields?.[0]?.message ?? r.error.message);
    toast(done);
    router.refresh();
    return true;
  }
  async function rename(item: Item, el: HTMLInputElement) {
    const name = el.value.trim();
    if (!name || name === item.name) return void (el.value = item.name);
    if (!(await run(onRename(item, name), "이름을 바꿨어요"))) el.value = item.name;
  }
  async function add() {
    const name = adding.trim();
    if (name && (await run(onAdd(name), "분류를 추가했어요"))) setAdding("");
  }

  return (
    <>
      <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setOpen(true)}>
        <Pencil /> 분류 편집
      </Button>
      <ResponsiveModal
        open={open}
        onOpenChange={(o) => (setOpen(o), setConfirm(null))}
        title={title}
        description="이름을 누르면 고칠 수 있어요"
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
          {items.map((it) => (
            <li key={it.key} className="flex items-center gap-1 px-2 py-1">
              {confirm === it.key ? (
                <>
                  <p className="min-w-0 flex-1 px-1 py-1.5 text-sm">
                    <b>{it.name}</b> 분류를 지울까요? <span className="text-muted-foreground">{removeNote}</span>
                  </p>
                  <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>
                    취소
                  </Button>
                  <Button size="sm" variant="destructive" disabled={busy} onClick={async () => (await run(onRemove(it), "분류를 지웠어요")) && setConfirm(null)}>
                    지우기
                  </Button>
                </>
              ) : (
                <>
                  {editing === it.key ? (
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
                    <button type="button" className="hover:bg-accent min-h-10 flex-1 rounded-md px-3 text-left text-sm" onClick={() => setEditing(it.key)}>
                      {it.name}
                    </button>
                  )}
                  <Button size="icon" variant="ghost" aria-label={`${it.name} 지우기`} className="text-muted-foreground hover:text-destructive-text" onClick={() => setConfirm(it.key)}>
                    <Trash2 />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      </ResponsiveModal>
    </>
  );
}
