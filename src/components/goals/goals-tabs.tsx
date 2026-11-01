// 목표 영역 탭(04 §5.0): 월간 · 전체 목표 · 연도별
import { AreaTabs } from "@/components/app/area-tabs";

export const GoalsTabs = () => (
  <AreaTabs
    label="목표"
    tabs={[
      { href: "/goals", label: "월간" },
      { href: "/goals/list", label: "전체 목표" },
      { href: "/goals/year", label: "연도별", match: "/goals/year" },
    ]}
  />
);
