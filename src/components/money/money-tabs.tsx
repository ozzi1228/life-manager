// 자산 영역 탭(02 §6)
import { AreaTabs } from "@/components/app/area-tabs";

export const MoneyTabs = () => (
  <AreaTabs
    label="자산"
    tabs={[
      { href: "/money", label: "한눈에" },
      { href: "/money/expenses", label: "지출" },
      { href: "/money/budget", label: "예산" },
      { href: "/money/fixed", label: "고정 지출" },
      { href: "/money/cards", label: "카드" },
      { href: "/money/restraint", label: "참은 소비" },
    ]}
  />
);
