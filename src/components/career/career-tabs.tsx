// 커리어 영역 탭: 경험 정리 · 문서(이력서·자소서·포트폴리오)
import { AreaTabs } from "@/components/app/area-tabs";

export const CareerTabs = () => (
  <AreaTabs
    label="커리어"
    tabs={[
      { href: "/career", label: "경험 정리" },
      { href: "/career/docs", label: "문서" },
    ]}
  />
);
