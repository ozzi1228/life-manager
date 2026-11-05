"use client";

// 금융 화면의 작은 조작: 달 이동(주소 ?month=), 기록 추가 버튼
import { Plus } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MonthSwitcher } from "@/components/app/pickers";
import { useExpenseDialog } from "@/components/money/expense-dialog";
import { Button } from "@/components/ui/button";

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

export function AddExpenseButton({ variant = "default" }: { variant?: "default" | "outline" }) {
  const open = useExpenseDialog();
  return (
    <Button variant={variant} onClick={() => open()}>
      <Plus /> 기록 추가
    </Button>
  );
}
