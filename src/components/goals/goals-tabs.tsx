// 목표 영역 탭(04 §5.0): 전체 목표 · 연도별 · 달성 · 습관 트래커(D-069)
import { AreaTabs } from "@/components/app/area-tabs";

export const GoalsTabs = () => (
  <AreaTabs
    label="목표"
    tabs={[
      { href: "/goals", label: "전체 목표" },
      { href: "/goals/year", label: "연도별" },
      { href: "/goals/done", label: "달성" },
      { href: "/goals/habits", label: "습관 트래커" },
    ]}
  />
);
