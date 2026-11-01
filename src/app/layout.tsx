import type { Metadata } from "next";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "우나",
  description: "우리의 나날들",
  // iOS 홈 화면 아이콘·전체 화면 실행
  icons: { apple: "/icons/180" },
  appleWebApp: { capable: true, title: "우나", statusBarStyle: "default" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
