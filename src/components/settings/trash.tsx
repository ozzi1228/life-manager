"use client";

// 휴지통 (SCR-SET-09, 04 §8.7): 영역 필터, 묶음 한 줄(남은 날), 고르기 → 복구·영구 삭제, 비우기
import { Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { emptyTrash, purgeTrash, restoreTrash } from "@/app/actions/trash";
import { EmptyState } from "@/components/app/states";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { TrashItem } from "@/server/trash";

const deletedLabel = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 삭제`;
};

export function TrashList({ items }: { items: TrashItem[] }) {
  const router = useRouter();
  const [area, setArea] = useState("all");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<{ ids: string[] } | "all" | null>(null);
  const [busy, setBusy] = useState(false);
  const areas = [...new Set(items.map((i) => i.area))];
  const shown = items.filter((i) => area === "all" || i.area === area);
  const toggle = (id: string, on: boolean) =>
    setPicked((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });

  async function restore(list: TrashItem[]) {
    setBusy(true);
    for (const i of list) await restoreTrash(i.entity, i.id);
    setBusy(false);
    setPicked(new Set());
    router.refresh();
  }
  async function purgeNow() {
    if (!confirm) return;
    setBusy(true);
    const r = confirm === "all" ? await emptyTrash() : await purgeTrash(confirm.ids);
    setBusy(false);
    setConfirm(null);
    setPicked(new Set());
    if (!r.ok) return toast(r.error.message);
    router.refresh();
  }

  if (!items.length) return <EmptyState pet="meongi" title="휴지통이 비어 있어요" description="지운 항목은 90일 동안 여기서 되살릴 수 있어요." />;
  const sel = shown.filter((i) => picked.has(i.batchId));
  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">휴지통 항목은 90일 뒤 자동으로 영구 삭제돼요.</p>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={area} onValueChange={setArea}>
          <SelectTrigger size="sm" aria-label="영역" className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            {areas.map((a) => (
              <SelectItem key={a} value={a}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {sel.length > 0 && (
          <>
            <span className="text-muted-foreground text-sm">{sel.length}개 고름</span>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => restore(sel)}>
              복구
            </Button>
            <Button size="sm" variant="outline" className="text-destructive-text" disabled={busy} onClick={() => setConfirm({ ids: sel.map((i) => i.batchId) })}>
              영구 삭제
            </Button>
          </>
        )}
      </div>
      <ul className="divide-y rounded-lg border">
        {shown.map((i) => (
          <li key={i.batchId} className="flex items-center gap-3 px-3 py-2">
            <Checkbox aria-label={`${i.name} 고르기`} checked={picked.has(i.batchId)} onCheckedChange={(on) => toggle(i.batchId, on === true)} />
            <span className="min-w-0 flex-1">
              <span className="block truncate">
                {i.name}
                {i.others > 0 && <span className="text-muted-foreground text-sm"> 외 {i.others}개</span>}
              </span>
              <span className="text-muted-foreground text-caption">
                {i.area} · {deletedLabel(i.deletedAt)} · <span className={cn(i.daysLeft <= 7 && "text-warning-text")}>{i.daysLeft}일 남음</span>
              </span>
            </span>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => restore([i])}>
              <Undo2 /> 복구
            </Button>
          </li>
        ))}
      </ul>
      <Button variant="link" className="text-destructive-text px-0" onClick={() => setConfirm("all")}>
        휴지통 비우기
      </Button>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === "all" ? "휴지통을 비울까요?" : "영구 삭제할까요?"}</AlertDialogTitle>
            <AlertDialogDescription>삭제하면 되돌릴 수 없어요. 변경 기록과 붙어 있던 사진도 함께 지워져요.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={busy} onClick={(e) => (e.preventDefault(), purgeNow())}>
              영구 삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
