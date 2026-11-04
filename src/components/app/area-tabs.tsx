"use client";

// 영역 안 탭(02 §6): 주소마다 탭 하나. 모바일은 가로 스크롤. match: 이 탭으로 칠 주소 앞부분(여러 개 가능)
// 탭은 끌어서 순서를 바꿈(PC는 마우스로 끌기, 휴대폰은 길게 누른 뒤 끌기) — 묶음의 첫 주소를 열쇠로 저장
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useNavOrder } from "@/components/app/nav-order";
import { cn } from "@/lib/utils";

type Tab = { href: string; label: string; match?: string | string[] };
const isOn = (path: string, t: Tab) => (t.match ? [t.match].flat().some((m) => path.startsWith(m)) : path === t.href);

export function AreaTabs({ label, tabs }: { label: string; tabs: Tab[] }) {
  const path = usePathname();
  const sort = useNavOrder(tabs[0].href, tabs, "x");
  return (
    <nav aria-label={label} className="-mx-4 flex gap-1 overflow-x-auto border-b px-4 md:mx-0 md:px-0">
      {sort.items.map((t) => {
        const on = isOn(path, t);
        return (
          <Link
            key={t.href}
            href={t.href}
            ref={sort.rowRef(t.href)}
            {...sort.item(t.href)}
            aria-current={on ? "page" : undefined}
            className={cn(
              "border-b-2 px-3 py-2 text-sm whitespace-nowrap select-none max-md:py-3",
              on ? "border-primary text-foreground font-semibold" : "text-muted-foreground border-transparent",
              sort.dragging === t.href && "bg-accent rounded-t-md",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** 탭 안의 작은 하위 탭(알약 모양). 예: 지출 > 내역 / 고정 지출 */
export function SubTabs({ label, tabs }: { label: string; tabs: Tab[] }) {
  const path = usePathname();
  const sort = useNavOrder(tabs[0].href, tabs, "x");
  return (
    <nav aria-label={label} className="flex gap-1.5">
      {sort.items.map((t) => {
        const on = isOn(path, t);
        return (
          <Link
            key={t.href}
            href={t.href}
            ref={sort.rowRef(t.href)}
            {...sort.item(t.href)}
            aria-current={on ? "page" : undefined}
            className={cn(
              "flex items-center rounded-full border px-3 py-1 text-sm select-none max-md:h-10",
              on ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent",
              sort.dragging === t.href && "ring-primary ring-2",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
