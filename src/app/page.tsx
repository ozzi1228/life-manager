import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-4 p-6">
      <h1 className="text-3xl font-bold">우나</h1>
      <p className="text-muted-foreground">우리의 나날들 · 개발 0단계</p>
      <div className="flex gap-2">
        <Button asChild>
          <Link href="/dev/push">푸시 알림 시험</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/dev/theme">테마 점검</Link>
        </Button>
      </div>
    </main>
  );
}
