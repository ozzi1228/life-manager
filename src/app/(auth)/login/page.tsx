import { Suspense } from "react";
import { enabledSocialProviders } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata = { title: "로그인 · 우나" };

export default function LoginPage() {
  // 주소의 ?next=·?social=·?error= 를 읽는 화면이라 Suspense 안에서
  return (
    <Suspense>
      <LoginForm providers={enabledSocialProviders as ("kakao" | "naver")[]} />
    </Suspense>
  );
}
