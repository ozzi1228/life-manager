"use client";

// 목표·트래커 색 고르기 (03 §3.1.4, 04 §5.2): 12색 팔레트 + 직접 고르기(브라우저 기본 색 선택기) + 미리보기
import { Check } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { GOAL_PALETTE, textOn } from "@/lib/palette";
import { cn } from "@/lib/utils";

export function ColorPalettePicker({ value, onChange, used = [] }: { value: string; onChange: (hex: string) => void; used?: string[] }) {
  const v = value.toUpperCase();
  const usedSet = new Set(used.map((u) => u.toUpperCase()));
  const custom = !GOAL_PALETTE.some((c) => c.hex === v);
  return (
    <div className="space-y-3">
      <div className="grid w-fit grid-cols-6 gap-2" role="radiogroup" aria-label="색">
        {GOAL_PALETTE.map((c) => (
          <Tooltip key={c.hex}>
            <TooltipTrigger asChild>
              <button
                type="button"
                role="radio"
                aria-checked={v === c.hex}
                aria-label={c.name + (usedSet.has(c.hex) ? ", 이번 달에 쓰는 색" : "")}
                onClick={() => onChange(c.hex)}
                className={cn("relative flex size-10 items-center justify-center rounded-md md:size-8", v === c.hex && "ring-foreground ring-2 ring-offset-2")}
                style={{ background: c.hex, color: textOn(c.hex) }}
              >
                {v === c.hex && <Check className="size-4" />}
                {usedSet.has(c.hex) && v !== c.hex && <span className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-current opacity-70" />}
              </button>
            </TooltipTrigger>
            <TooltipContent>{c.name}</TooltipContent>
          </Tooltip>
        ))}
      </div>
      {GOAL_PALETTE.some((c) => usedSet.has(c.hex) && c.hex !== v) && <p className="text-muted-foreground text-caption">점이 있는 색은 이번 달에 쓰고 있어요</p>}
      <div className="flex items-center gap-3 text-sm">
        <label className="text-link inline-flex cursor-pointer items-center gap-2">
          <input type="color" value={v} onChange={(e) => onChange(e.target.value.toUpperCase())} className="size-8 cursor-pointer rounded border-0 bg-transparent p-0" aria-label="직접 고르기" />
          직접 고르기{custom && ` (${v})`}
        </label>
        <span className="text-muted-foreground ml-auto">미리보기</span>
        <span className="text-micro flex h-9 w-10 items-center justify-center rounded-sm" style={{ background: v, color: textOn(v) }}>
          30분
        </span>
        <span className="flex h-9 w-10 items-center justify-center rounded-sm" style={{ background: v, color: textOn(v) }}>
          <Check className="size-3.5" />
        </span>
      </div>
    </div>
  );
}
