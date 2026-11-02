// 목표 영역 탭(04 §5.0): 전체 목표 · 기간별 · 달성 · 습관 트래커(D-069, D-072)
import { AreaTabs, SubTabs } from "@/components/app/area-tabs";

export const GoalsTabs = () => (
  <AreaTabs
    label="목표"
    tabs={[
      { href: "/goals", label: "전체 목표" },
      { href: "/goals/year", label: "기간별", match: ["/goals/year", "/goals/month", "/goals/week", "/goals/day"] },
      { href: "/goals/done", label: "달성" },
      { href: "/goals/habits", label: "습관 트래커" },
    ]}
  />
);

/** 기간별 탭 안: 연도별 / 월별 / 주간 / 일간 */
export const GoalPeriodTabs = () => (
  <SubTabs
    label="기간"
    tabs={[
      { href: "/goals/year", label: "연도별" },
      { href: "/goals/month", label: "월별" },
      { href: "/goals/week", label: "주간" },
      { href: "/goals/day", label: "일간" },
    ]}
  />
);
