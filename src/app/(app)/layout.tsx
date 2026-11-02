// 로그인한 사람의 앱 화면 공통 틀. 세션·설정은 요청마다 읽으므로 Suspense 안에서(Cache Components)
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AppFrame } from "@/components/app/app-frame";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/db";
import { userSettings } from "@/db/schema";
import { auth } from "@/lib/auth";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<ShellFallback />}>
      <Gate>{children}</Gate>
    </Suspense>
  );
}

async function Gate({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  const [settings] = await db.select().from(userSettings).where(eq(userSettings.userId, session.user.id));
  if (!settings?.onboardedAt) redirect("/onboarding");
  const user = session.user as { name: string; username?: string | null };
  return (
    <AppFrame name={user.name || user.username || "나"} seenHints={settings.seenHints} navOrder={settings.navOrder}>
      {children}
    </AppFrame>
  );
}

function ShellFallback() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="h-14 border-b" />
      <div className="mx-auto w-full max-w-5xl space-y-4 p-4 md:p-8">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    </div>
  );
}
