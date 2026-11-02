// 기록 영역 탭(02 §6): 일기·작품·위시. 건강은 다음 묶음에서
import { AreaTabs } from "@/components/app/area-tabs";

export const RecordsTabs = () => (
  <AreaTabs
    label="기록"
    tabs={[
      { href: "/records", label: "일기" },
      { href: "/records/media", label: "작품", match: "/records/media" },
      { href: "/records/wish", label: "위시", match: "/records/wish" },
    ]}
  />
);
