// 기록 영역 탭(02 §6): 일기·리뷰·메모·건강 (작품·위시는 위시 메뉴로)
import { AreaTabs } from "@/components/app/area-tabs";

export const RecordsTabs = () => (
  <AreaTabs
    label="기록"
    tabs={[
      { href: "/records", label: "일기" },
      { href: "/records/reviews", label: "리뷰", match: "/records/reviews" },
      { href: "/records/memos", label: "메모", match: "/records/memos" },
      { href: "/records/health", label: "건강", match: "/records/health" },
    ]}
  />
);
