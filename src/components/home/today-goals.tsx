"use client";

// 홈 · 오늘의 습관 (04 §3.1): 트래커 항목마다 오늘 칸 하나. 누르면 바로 색이 채워지고 저장(트래커와 같은 칸)
import { Check } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { saveCell } from "@/app/actions/goals";
import { textOn } from "@/lib/palette";
import { cn } from "@/lib/utils";

type Item = { id: string; name: string; colorHex: string };

export function TodayGoals({ items, done, memos, today }: { items: Item[]; done: string[]; memos: Record<string, string | null>; today: string }) {
  const [on, setOn] = useState(() => new Set(done));
  async function toggle(i: Item) {
    const next = !on.has(i.id);
    const flip = (v: boolean) =>
      setOn((s) => {
        const n = new Set(s);
        if (v) n.add(i.id);
        else n.delete(i.id);
        return n;
      });
    flip(next);
    navigator.vibrate?.(10);
    const r = await saveCell({ itemId: i.id, date: today, done: next, memo: memos[i.id] ?? null });
    if (!r.ok) {
      flip(!next);
      toast("저장하지 못했어요", { action: { label: "다시 시도", onClick: () => toggle(i) } });
    }
  }
  return (
    <>
      <p className="text-muted-foreground text-sm tabular-nums" aria-live="polite">
        {on.size}/{items.length} 완료{on.size === items.length && " · 오늘 다 했어요"}
      </p>
      <ul className="space-y-1">
        {items.map((i) => {
          const checked = on.has(i.id);
          return (
            <li key={i.id}>
              <button type="button" role="checkbox" aria-checked={checked} onClick={() => toggle(i)} className="hover:bg-accent/50 flex min-h-11 w-full items-center gap-3 rounded-md px-1 text-left">
                <span className="min-w-0 flex-1 truncate">{i.name}</span>
                <span
                  className={cn("flex size-8 shrink-0 items-center justify-center rounded-sm transition-colors duration-[120ms]", !checked && "bg-muted")}
                  style={checked ? { background: i.colorHex, color: textOn(i.colorHex) } : undefined}
                >
                  {checked && <Check className="size-4" aria-hidden />}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
