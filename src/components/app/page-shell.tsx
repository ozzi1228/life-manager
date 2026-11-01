// 영역 화면의 공통 여백·폭 (03 §3.3·§3.5) + 아직 만들지 않은 화면 자리
import type { ReactNode } from "react";
import { EmptyState } from "@/components/app/states";
import { cn } from "@/lib/utils";

export function Page({ children, narrow, className }: { children: ReactNode; narrow?: boolean; className?: string }) {
  return <div className={cn("mx-auto w-full space-y-6 px-4 py-6 md:space-y-8 md:px-8", narrow ? "max-w-3xl" : "max-w-6xl", className)}>{children}</div>;
}

export function ComingSoon({ title, description, pet }: { title: string; description: string; pet?: string }) {
  return (
    <Page>
      <EmptyState title={title} description={description} pet={pet} />
    </Page>
  );
}
