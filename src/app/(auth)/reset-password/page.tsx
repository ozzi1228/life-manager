// 새 비밀번호 정하기: 메일 링크 → Better Auth가 ?token= (만료·잘못된 링크면 ?error=INVALID_TOKEN)으로 보내 줌
import { Suspense } from "react";
import { ResetForm } from "./reset-form";

export const metadata = { title: "새 비밀번호 · 우나" };

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
