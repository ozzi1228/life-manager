// 없는 주소(앱 밖 포함): 한국어 안내 + 홈으로
import Link from "next/link";
import { EmptyState } from "@/components/app/states";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <EmptyState
        pet="hoya"
        title="없는 주소예요"
        description="주소가 바뀌었거나 잘못 들어온 것 같아요."
        action={
          <Button asChild>
            <Link href="/">홈으로</Link>
          </Button>
        }
      />
    </main>
  );
}
