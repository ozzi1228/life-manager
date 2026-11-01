// 메뉴 구성 (docs/planning/02 §2·§3): 최상위 5개 = 모바일 하단 탭 5개
import { CalendarDays, House, NotebookPen, Target, Wallet, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

export const MAIN_NAV: NavItem[] = [
  { href: "/", label: "홈", icon: House },
  { href: "/calendar", label: "일정", icon: CalendarDays },
  { href: "/goals", label: "목표", icon: Target },
  { href: "/money", label: "자산", icon: Wallet },
  { href: "/records", label: "기록", icon: NotebookPen },
];

// 빠른 추가: 어디서든 한 번에(02 §1). 각 영역 화면이 ?new= 로 추가 창을 엶
export const QUICK_ADD = [
  { href: "/money?new=expense", label: "지출 추가" },
  { href: "/goals?check=today", label: "목표 체크" },
  { href: "/calendar?new=1", label: "일정 추가" },
  { href: "/records?new=journal", label: "기록 쓰기" },
];

const TITLES: [string, string][] = [
  ["/settings", "설정"],
  ["/calendar", "일정"],
  ["/goals", "목표"],
  ["/money", "자산"],
  ["/records", "기록"],
];

/** 현재 주소의 메뉴(하단 탭·사이드바 강조, 상단바 제목) */
export const activeNav = (path: string) => (path === "/" ? MAIN_NAV[0] : MAIN_NAV.slice(1).find((n) => path.startsWith(n.href)));
export const titleFor = (path: string) => (path === "/" ? "홈" : (TITLES.find(([p]) => path.startsWith(p))?.[1] ?? "우나"));
