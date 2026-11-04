"use client";

// 모바일 홈: 대시보드 대신 인사 카드(펫) + 메뉴 바로 가기. 순서는 사이드바에서 끌어 바꾼 순서를 따름
import { ChevronRight, PawPrint, Settings } from "lucide-react";
import Link from "next/link";
import { MAIN_NAV } from "@/components/app/nav";
import { useNavOrder } from "@/components/app/nav-order";
import { petSrc } from "@/components/pet/pet-layer";
import { usePetPrefs } from "@/components/pet/use-pet-prefs";

const DESC: Record<string, string> = {
  "/calendar": "캘린더·오늘 할 일",
  "/goals": "습관·목표",
  "/money": "지출·예산·고정 지출",
  "/records": "일기·건강",
  "/wish": "쇼핑·작품",
  "/career": "경험·이력",
};

export function HomeMenu({ date, greet }: { date: string; greet: string }) {
  const { items } = useNavOrder("main", MAIN_NAV, "y");
  const { prefs, loaded } = usePetPrefs();
  return (
    <div className="space-y-5">
      <section className="bg-card flex items-center gap-3 rounded-2xl border p-5 shadow-sm">
        <div className="min-w-0 flex-1">
          <p className="text-muted-foreground text-sm">{date}</p>
          <h1 className="text-title-lg mt-1 font-semibold break-keep">{greet}</h1>
        </div>
        {loaded && (
          // eslint-disable-next-line @next/next/no-img-element -- 작은 장식 그림(정적 파일·올린 펫)
          <img src={petSrc(prefs.petId, "happy")} alt="" width={76} height={76} className="size-[76px] shrink-0 object-contain" />
        )}
      </section>

      <nav aria-label="메뉴 바로 가기" className="space-y-2.5">
        <p className="text-muted-foreground px-1 text-sm">어디로 갈까요?</p>
        <ul className="grid grid-cols-2 gap-2.5">
          {items
            .filter((n) => n.href !== "/")
            .map((n) => (
              <li key={n.href}>
                <Link href={n.href} className="bg-card active:bg-accent/40 flex min-h-28 flex-col justify-between rounded-2xl border p-4 shadow-sm transition-colors">
                  <span className="flex items-start justify-between">
                    <span className="bg-accent text-accent-foreground flex size-10 items-center justify-center rounded-xl">
                      <n.icon className="size-5" />
                    </span>
                    <ChevronRight className="text-muted-foreground/60 size-4" />
                  </span>
                  <span>
                    <span className="block font-semibold">{n.label}</span>
                    <span className="text-muted-foreground block truncate text-caption">{DESC[n.href]}</span>
                  </span>
                </Link>
              </li>
            ))}
        </ul>
      </nav>

      <div className="text-muted-foreground flex justify-center gap-2 text-sm">
        <Link href="/settings#pet" className="flex min-h-11 items-center gap-1.5 px-3">
          <PawPrint className="size-4" /> 펫
        </Link>
        <Link href="/settings" className="flex min-h-11 items-center gap-1.5 px-3">
          <Settings className="size-4" /> 설정
        </Link>
      </div>
    </div>
  );
}
