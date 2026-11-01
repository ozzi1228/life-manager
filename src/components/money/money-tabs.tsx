// 자산 영역 탭(02 §6): 지금 만든 것만. 예산·고정 지출·카드·참은 소비는 3묶음에서 추가
import { AreaTabs } from "@/components/app/area-tabs";

export const MoneyTabs = () => (
  <AreaTabs
    label="자산"
    tabs={[
      { href: "/money", label: "한눈에" },
      { href: "/money/expenses", label: "지출" },
    ]}
  />
);
