"use client";

// 달 이동·최근 칩 (docs/planning/03 §11)
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { addMonths, ymd } from "@/lib/format";
import { cn } from "@/lib/utils";

/** "YYYY-MM" 값. 가운데를 누르면 연도·달 고르기 */
export function MonthSwitcher({ value, onChange }: { value: string; onChange: (ym: string) => void }) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(Number(value.slice(0, 4)));
  // 오늘 날짜는 렌더 중이 아니라 열 때 읽음(미리 그려 둔 화면에 날짜가 굳지 않게)
  const [thisMonth, setThisMonth] = useState("");
  const pick = (ym: string) => {
    onChange(ym);
    setOpen(false);
  };
  return (
    <ButtonGroup>
      <Button variant="outline" size="icon" className="max-md:size-11" aria-label="이전 달" onClick={() => onChange(addMonths(value, -1))}>
        <ChevronLeft />
      </Button>
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (o) {
            setYear(Number(value.slice(0, 4)));
            setThisMonth(ymd(new Date()).slice(0, 7));
          }
        }}
      >
        <PopoverTrigger asChild>
          <Button variant="outline" className="min-w-24 tabular-nums max-md:h-11">
            {Number(value.slice(0, 4))}년 {Number(value.slice(5, 7))}월
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64">
          <div className="mb-2 flex items-center justify-between">
            <Button variant="ghost" size="icon-sm" aria-label="이전 해" onClick={() => setYear(year - 1)}>
              <ChevronLeft />
            </Button>
            <span className="font-semibold tabular-nums">{year}년</span>
            <Button variant="ghost" size="icon-sm" aria-label="다음 해" onClick={() => setYear(year + 1)}>
              <ChevronRight />
            </Button>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {Array.from({ length: 12 }, (_, i) => {
              const ym = `${year}-${String(i + 1).padStart(2, "0")}`;
              return (
                <Button
                  key={ym}
                  size="sm"
                  variant={ym === value ? "default" : "ghost"}
                  className={cn("max-md:h-11", ym === thisMonth && ym !== value && "ring-primary ring-1")}
                  aria-current={ym === thisMonth ? "date" : undefined}
                  onClick={() => pick(ym)}
                >
                  {i + 1}월
                </Button>
              );
            })}
          </div>
          {thisMonth && value !== thisMonth && (
            <Button variant="link" size="sm" className="mt-1 w-full" onClick={() => pick(thisMonth)}>
              이번 달로
            </Button>
          )}
        </PopoverContent>
      </Popover>
      <Button variant="outline" size="icon" className="max-md:size-11" aria-label="다음 달" onClick={() => onChange(addMonths(value, 1))}>
        <ChevronRight />
      </Button>
    </ButtonGroup>
  );
}

/** 최근 쓴 항목 칩(최대 6개) + 더 보기 */
export function QuickChips({
  options,
  value,
  onChange,
  onMore,
  label,
}: {
  options: { id: string; label: string }[];
  value: string | null;
  onChange: (id: string | null) => void;
  onMore?: () => void;
  label: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ToggleGroup type="single" aria-label={label} value={value ?? ""} onValueChange={(v) => onChange(v || null)} className="flex flex-wrap gap-2">
        {options.slice(0, 6).map((o) => (
          <ToggleGroupItem key={o.id} value={o.id} variant="outline" className="h-9 rounded-full px-3 max-md:h-11">
            {o.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {onMore && (
        <Button variant="ghost" size="sm" onClick={onMore}>
          더 보기
        </Button>
      )}
    </div>
  );
}
