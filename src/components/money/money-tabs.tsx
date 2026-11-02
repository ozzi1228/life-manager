// 자산 영역 탭(02 §6)
import { AreaTabs, SubTabs } from "@/components/app/area-tabs";

export const MoneyTabs = () => (
  <AreaTabs
    label="자산"
    tabs={[
      { href: "/money", label: "한눈에" },
      { href: "/money/expenses", label: "지출", match: ["/money/expenses", "/money/fixed"] },
      { href: "/money/budget", label: "예산" },
      { href: "/money/cards", label: "카드" },
      { href: "/money/restraint", label: "참은 소비" },
    ]}
  />
);

/** 지출 탭 안: 지출 내역 / 고정 지출 */
export const ExpenseTabs = () => (
  <SubTabs
    label="지출"
    tabs={[
      { href: "/money/expenses", label: "지출 내역" },
      { href: "/money/fixed", label: "고정 지출" },
    ]}
  />
);
