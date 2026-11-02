// 설정 하위 화면 머리: ← 설정 + 제목
import { ChevronLeft } from "lucide-react";
import Link from "next/link";

export const SettingsBack = ({ title }: { title: string }) => (
  <div className="flex items-center gap-1">
    <Link href="/settings" aria-label="설정으로" className="text-muted-foreground hover:text-foreground -ml-2 flex size-9 items-center justify-center rounded-md">
      <ChevronLeft className="size-5" />
    </Link>
    <h1 className="text-title font-semibold">{title}</h1>
  </div>
);
