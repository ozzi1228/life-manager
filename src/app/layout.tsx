import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "next-themes";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import { PwaUpdate } from "@/components/app/pwa";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

export const metadata: Metadata = {
  title: "우나",
  description: "우리의 나날들",
  // iOS 전체 화면 실행(아이콘은 app/apple-icon.png 파일 규칙)
  appleWebApp: { capable: true, title: "우나", statusBarStyle: "default" },
};

// 휴대폰 하단 안전 영역(env(safe-area-inset-bottom))을 쓰려면 cover
export const viewport: Viewport = { viewportFit: "cover" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // next-themes가 html의 class를 바꿈(시스템 따라가기·밝게·어둡게, 03 §13)
    <html lang="ko" className="h-full antialiased" suppressHydrationWarning>
      <body className="flex min-h-full flex-col">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <TooltipProvider>{children}</TooltipProvider>
          {/* 알림은 오른쪽 아래(위 가운데는 화면 요소를 가림). 휴대폰은 빠른 추가(+) 위로 */}
          <Toaster position="bottom-right" mobileOffset={{ bottom: "calc(5.5rem + env(safe-area-inset-bottom))" }} />
          <PwaUpdate />
        </ThemeProvider>
      </body>
    </html>
  );
}
