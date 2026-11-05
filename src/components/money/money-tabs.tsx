// 금융 영역 탭(02 §6, D-076)
import { AreaTabs, SubTabs } from "@/components/app/area-tabs";

export const MoneyTabs = () => (
  <AreaTabs
    label="금융"
    tabs={[
      { href: "/money", label: "한눈에" },
      { href: "/money/expenses", label: "가계부", match: ["/money/expenses", "/money/fixed"] },
      { href: "/money/budget", label: "예산" },
      { href: "/money/accounts", label: "자산", match: ["/money/accounts", "/money/cards", "/money/pays"] },
      { href: "/money/restraint", label: "참은 소비" },
    ]}
  />
);

/** 가계부 탭 안: 내역(수입·지출) / 고정(수입·지출) */
export const ExpenseTabs = () => (
  <SubTabs
    label="가계부"
    tabs={[
      { href: "/money/expenses", label: "내역" },
      { href: "/money/fixed", label: "고정 수입·지출" },
    ]}
  />
);

/** 자산 탭 안: 계좌 / 카드 / 페이 */
export const PaymentTabs = () => (
  <SubTabs
    label="자산"
    tabs={[
      { href: "/money/accounts", label: "계좌" },
      { href: "/money/cards", label: "카드" },
      { href: "/money/pays", label: "페이" },
    ]}
  />
);
