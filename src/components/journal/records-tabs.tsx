// 기록 영역 탭(02 §6): 지금은 일기. 작품·위시·건강은 다음 묶음에서
import { AreaTabs } from "@/components/app/area-tabs";

export const RecordsTabs = () => <AreaTabs label="기록" tabs={[{ href: "/records", label: "일기" }]} />;
