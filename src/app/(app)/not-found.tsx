// 앱 안에서 못 찾은 항목(지운 일기·남의 항목·옛 주소): 메뉴는 그대로 두고 안내 + 돌아갈 곳
import Link from "next/link";
import { Page } from "@/components/app/page-shell";
import { EmptyState } from "@/components/app/states";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <Page>
      <EmptyState
        pet="hoya"
        title="찾을 수 없어요"
        description="지웠거나 주소가 바뀐 것 같아요. 지운 항목은 휴지통에서 되살릴 수 있어요."
        action={
          <div className="flex gap-2">
            <Button asChild>
              <Link href="/">홈으로</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/settings/trash">휴지통</Link>
            </Button>
          </div>
        }
      />
    </Page>
  );
}
