"use client";

// 작업 기록 목록 (D-077): 날짜별 묶음 · 줄 = 영역·이름·무엇을 했는지 · [되돌리기]. 되돌린 줄은 흐리게 "되돌림"
import { Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { undoAction } from "@/app/actions/activity";
import { EmptyState } from "@/components/app/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { dayLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ActivityItem } from "@/server/activity";

// 서버와 휴대폰의 시간대·언어 설정이 달라도 같게 보이도록 서울 시각(UTC+9, 서머타임 없음)을 직접 계산
const seoul = (iso: string) => new Date(Date.parse(iso) + 9 * 3_600_000);
const time = (iso: string) => {
  const d = seoul(iso);
  const h = d.getUTCHours();
  return `${h < 12 ? "오전" : "오후"} ${h % 12 || 12}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};
const dayOf = (iso: string) => seoul(iso).toISOString().slice(0, 10);

export function ActivityList({ items }: { items: ActivityItem[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  if (!items.length) return <EmptyState pet="meongi" title="아직 작업 기록이 없어요" description="추가·수정·삭제한 일이 여기 쌓이고, 원하는 작업을 되돌릴 수 있어요" />;

  async function undo(i: ActivityItem) {
    setBusy(i.key);
    const r = await undoAction(i.key).catch(() => null);
    setBusy(null);
    if (!r) return toast("연결이 끊겨 되돌리지 못했어요. 연결되면 다시 눌러 주세요");
    if (!r.ok) return toast(r.error.message);
      router.refresh();
  }

  const days = new Map<string, ActivityItem[]>();
  for (const i of items) {
    const d = dayOf(i.at);
    days.set(d, [...(days.get(d) ?? []), i]);
  }
  return (
    <div className="space-y-5">
      <p className="text-muted-foreground text-sm">최근 90일 동안 한 일이에요. 같은 항목은 가장 최근 작업부터 되돌릴 수 있어요.</p>
      {[...days].map(([day, list]) => (
        <section key={day} aria-label={dayLabel(day)}>
          <h2 className="text-muted-foreground py-1.5 text-sm">{dayLabel(day)}</h2>
          <ul className="divide-y rounded-lg border">
            {list.map((i) => (
              <li key={i.key} className={cn("flex items-center gap-3 px-3 py-2", i.undoneAt && "opacity-60")}>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <Badge variant={i.verb === "삭제" ? "outline" : "secondary"} className="shrink-0">
                      {i.verb}
                    </Badge>
                    <span className="truncate">
                      {i.name}
                      {i.others > 0 && <span className="text-muted-foreground text-sm"> 외 {i.others}개</span>}
                    </span>
                  </span>
                  {i.changes.length > 0 && (
                    <span className="text-muted-foreground block truncate text-caption">{i.changes.map((c) => `${c.label} ${c.before} → ${c.after}`).join(" · ")}</span>
                  )}
                  <span className="text-muted-foreground block text-caption">
                    {i.area} · {time(i.at)}
                    {i.undoneAt && ` · ${time(i.undoneAt)}에 되돌림`}
                  </span>
                </span>
                {!i.undoneAt && (
                  <Button size="sm" variant="ghost" disabled={!i.canUndo || busy !== null} title={i.canUndo ? undefined : "더 최근 작업부터 되돌려 주세요"} onClick={() => undo(i)} className="shrink-0 max-md:h-10">
                    <Undo2 /> 되돌리기
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
