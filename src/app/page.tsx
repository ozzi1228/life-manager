import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-4 p-6">
      <h1 className="text-3xl font-bold">우나</h1>
      <p className="text-muted-foreground">우리의 나날들 · 개발 0단계</p>
      {/* 설치한 앱에는 주소창이 없어서 시험 화면으로 가는 길을 둠 */}
      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link href="/dev/auth">로그인 시험</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/dev/push">푸시 알림 시험</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/dev/pet">펫 시험</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/dev/pet-upload">펫 업로드 시험</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/dev/theme">테마 점검</Link>
        </Button>
      </div>
    </main>
  );
}
