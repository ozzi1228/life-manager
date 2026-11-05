// 메뉴 구성 (docs/planning/02 §2·§3): 최상위 7개(커리어·위시 추가). 모바일은 상단바 메뉴 버튼으로 펼침
import { BriefcaseBusiness, CalendarDays, Heart, House, NotebookPen, Target, Wallet, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

export const MAIN_NAV: NavItem[] = [
  { href: "/", label: "홈", icon: House },
  { href: "/calendar", label: "일정", icon: CalendarDays },
  { href: "/goals", label: "목표", icon: Target },
  { href: "/money", label: "금융", icon: Wallet },
  { href: "/records", label: "기록", icon: NotebookPen },
  { href: "/wish", label: "위시", icon: Heart },
  { href: "/career", label: "커리어", icon: BriefcaseBusiness },
];

// 빠른 추가: 어디서든 한 번에(02 §1). 지출은 그 자리에서 입력 창, 나머지는 각 영역 화면이 ?new= 로 추가 창을 엶
export const QUICK_ADD: { label: string; href: string; icon: LucideIcon; dialog?: "expense" }[] = [
  { href: "/money", label: "지출 추가", icon: Wallet, dialog: "expense" },
  { href: "/goals/habits?check=today", label: "습관 체크", icon: Target },
  { href: "/calendar?new=1", label: "일정 추가", icon: CalendarDays },
  { href: "/records/journal/new", label: "기록 쓰기", icon: NotebookPen },
];

const TITLES: [string, string][] = [
  ["/settings", "설정"],
  ["/activity", "작업 기록"],
  ["/calendar", "일정"],
  ["/goals", "목표"],
  ["/money", "금융"],
  ["/records", "기록"],
  ["/wish", "위시"],
  ["/career", "커리어"],
];

/** 현재 주소의 메뉴(사이드바 강조, 상단바 제목) */
export const activeNav = (path: string) => (path === "/" ? MAIN_NAV[0] : MAIN_NAV.slice(1).find((n) => path.startsWith(n.href)));
export const titleFor = (path: string) => (path === "/" ? "홈" : (TITLES.find(([p]) => path.startsWith(p))?.[1] ?? "우나"));
