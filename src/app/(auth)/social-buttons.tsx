"use client";

// 카카오·네이버 버튼: 각 사 디자인 가이드 색·심볼(테마 색을 쓰지 않음, 04 §2.1)
import { Button } from "@/components/ui/button";

export type Provider = "kakao" | "naver";
export const PROVIDER_NAME: Record<Provider, string> = { kakao: "카카오", naver: "네이버" };

const KakaoMark = () => (
  <svg viewBox="0 0 24 24" aria-hidden className="size-5">
    <path fill="currentColor" d="M12 3C6.48 3 2 6.58 2 11c0 2.85 1.86 5.35 4.66 6.77l-.95 3.48c-.08.3.26.54.52.37l4.1-2.72c.55.07 1.11.1 1.67.1 5.52 0 10-3.58 10-8S17.52 3 12 3z" />
  </svg>
);
const NaverMark = () => (
  <svg viewBox="0 0 24 24" aria-hidden className="size-4">
    <path fill="currentColor" d="M15.6 3.5v8.6L8.4 3.5H3.5v17h4.9v-8.6l7.2 8.6h4.9v-17z" />
  </svg>
);

export function SocialButton({ provider, onClick, disabled, children }: { provider: Provider; onClick: () => void; disabled?: boolean; children?: React.ReactNode }) {
  const kakao = provider === "kakao";
  return (
    <Button
      type="button"
      size="lg"
      disabled={disabled}
      onClick={onClick}
      className={
        kakao
          ? "h-12 w-full bg-[#FEE500] text-[rgb(0_0_0/0.85)] hover:bg-[#FEE500]/90"
          : "h-12 w-full bg-[#03C75A] text-white hover:bg-[#03C75A]/90"
      }
    >
      {kakao ? <KakaoMark /> : <NaverMark />}
      {children ?? `${PROVIDER_NAME[provider]}로 시작하기`}
    </Button>
  );
}
