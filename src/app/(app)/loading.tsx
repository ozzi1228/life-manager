// 앱 화면을 옮겨 다닐 때 내용이 오기 전 보이는 자리(각 화면이 요청마다 데이터를 읽음)
import { Page } from "@/components/app/page-shell";
import { Delayed } from "@/components/app/states";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <Page>
      <Delayed>
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-40 w-full" />
      </Delayed>
    </Page>
  );
}
