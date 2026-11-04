// 위시 영역 탭: 위시(쇼핑·보고 싶은 작품)·작품 기록
import { AreaTabs } from "@/components/app/area-tabs";

export const WishTabs = () => (
  <AreaTabs
    label="위시"
    tabs={[
      { href: "/wish", label: "위시" },
      { href: "/wish/media", label: "작품", match: "/wish/media" },
    ]}
  />
);
