"use client";

// 홈 · 오늘의 습관 (04 §3.1): 트래커 항목마다 오늘 칸 하나. 누르면 바로 색이 채워지고 저장(트래커와 같은 칸)
import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { saveCell } from "@/app/actions/goals";
import { textOn } from "@/lib/palette";
import { cn } from "@/lib/utils";

type Item = { id: string; name: string; colorHex: string };

export function TodayGoals({ items, done, memos, today }: { items: Item[]; done: string[]; memos: Record<string, string | null>; today: string }) {
  const router = useRouter();
  const [on, setOn] = useState(() => new Set(done));
  async function toggle(i: Item) {
    // 화면을 연 채로 자정이 지나면 어제 칸에 체크되지 않게 새로 불러옴(한국 시간 기준, 서버 todayIn과 같게)
    if (new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }) !== today) {
      toast("날짜가 바뀌어서 오늘 칸으로 새로 불러왔어요");
      return router.refresh();
    }
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
      <div className="space-y-1.5">
        <p className="text-muted-foreground text-sm tabular-nums" aria-live="polite">
          {on.size}/{items.length} 완료{on.size === items.length && " · 오늘 다 했어요"}
        </p>
        <div className="bg-muted h-1.5 overflow-hidden rounded-full" aria-hidden>
          <div className="bg-primary h-full rounded-full transition-[width] duration-300" style={{ width: `${(on.size / items.length) * 100}%` }} />
        </div>
      </div>
      <ul className="-mx-1">
        {items.map((i) => {
          const checked = on.has(i.id);
          return (
            <li key={i.id}>
              <button type="button" role="checkbox" aria-checked={checked} onClick={() => toggle(i)} className="hover:bg-accent/50 flex min-h-11 w-full items-center gap-2.5 rounded-md px-1 text-left text-sm">
                <span
                  className={cn("flex size-5 shrink-0 items-center justify-center rounded-[5px] border-2 transition-colors duration-[120ms]", !checked && "border-input")}
                  style={checked ? { background: i.colorHex, borderColor: i.colorHex, color: textOn(i.colorHex) } : undefined}
                >
                  {checked && <Check className="size-3.5" strokeWidth={3} aria-hidden />}
                </span>
                <span className={cn("min-w-0 flex-1 truncate", checked && "text-muted-foreground line-through")}>{i.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
