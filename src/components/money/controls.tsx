"use client";

// 자산 화면의 작은 조작: 달 이동(주소 ?month=), 종류 필터, 지출 추가 버튼
import { Plus } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MonthSwitcher } from "@/components/app/pickers";
import { useExpenseDialog } from "@/components/money/expense-dialog";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

function useQuery() {
  const router = useRouter();
  const path = usePathname();
  const q = useSearchParams();
  return (key: string, value: string | null) => {
    const next = new URLSearchParams(q);
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`${path}?${next}`);
  };
}

export function MonthNav({ month }: { month: string }) {
  const set = useQuery();
  return <MonthSwitcher value={month} onChange={(m) => set("month", m)} />;
}

export function TypeFilter({ value }: { value: "all" | "expense" | "income" }) {
  const set = useQuery();
  return (
    <ToggleGroup type="single" variant="outline" value={value} onValueChange={(v) => v && set("type", v === "all" ? null : v)} aria-label="종류">
      <ToggleGroupItem value="all" className="max-md:h-11">
        모두
      </ToggleGroupItem>
      <ToggleGroupItem value="expense" className="max-md:h-11">
        지출
      </ToggleGroupItem>
      <ToggleGroupItem value="income" className="max-md:h-11">
        수입
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

export function AddExpenseButton({ variant = "default" }: { variant?: "default" | "outline" }) {
  const open = useExpenseDialog();
  return (
    <Button variant={variant} onClick={() => open()}>
      <Plus /> 지출 추가
    </Button>
  );
}
