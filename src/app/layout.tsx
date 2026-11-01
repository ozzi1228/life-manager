import type { Metadata } from "next";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "우나",
  description: "우리의 나날들",
  // iOS 전체 화면 실행(아이콘은 app/apple-icon.png 파일 규칙)
  appleWebApp: { capable: true, title: "우나", statusBarStyle: "default" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
