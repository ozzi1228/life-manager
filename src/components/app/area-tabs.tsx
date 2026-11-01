"use client";

// 영역 안 탭(02 §6): 주소마다 탭 하나. 모바일은 가로 스크롤
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function AreaTabs({ label, tabs }: { label: string; tabs: { href: string; label: string; match?: string }[] }) {
  const path = usePathname();
  return (
    <nav aria-label={label} className="-mx-4 flex gap-1 overflow-x-auto border-b px-4 md:mx-0 md:px-0">
      {tabs.map((t) => {
        const on = t.match ? path.startsWith(t.match) : path === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={on ? "page" : undefined}
            className={cn("border-b-2 px-3 py-2 text-sm whitespace-nowrap", on ? "border-primary text-foreground font-semibold" : "text-muted-foreground border-transparent")}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
