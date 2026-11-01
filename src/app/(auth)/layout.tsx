// 로그인·가입·온보딩 공통 틀: 모바일 전체 화면, PC 가운데 카드 (04 §2)
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex flex-1 items-start justify-center px-4 py-10 md:items-center md:bg-muted/40">
      <div className="w-full max-w-[440px] md:rounded-xl md:border md:bg-card md:p-8 md:shadow-sm">{children}</div>
    </main>
  );
}
