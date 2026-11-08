"use client";

// 비밀번호 찾기: 가입·설정에서 등록한 이메일로 새 비밀번호를 정하는 링크를 보냄
// 이메일이 있는지는 알려 주지 않음(누구 계정인지 드러나지 않게) — 항상 같은 안내
import Link from "next/link";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [msg, setMsg] = useState("");

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const { error } = await authClient.requestPasswordReset({ email: email.trim().toLowerCase(), redirectTo: `${location.origin}/reset-password` });
    setBusy(false);
    if (error) return setMsg(error.status === 429 ? "잠시 후 다시 시도해 주세요" : "지금은 보낼 수 없어요. 잠시 후 다시 시도해 주세요");
    setSent(true);
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-title font-bold">비밀번호 찾기</h1>
        <p className="text-muted-foreground text-sm">등록한 이메일로 새 비밀번호를 정하는 링크를 보내 드려요</p>
      </div>
      {sent ? (
        <Alert>
          <AlertDescription>
            {email} 로 등록된 계정이 있으면 메일을 보냈어요. 링크는 1시간 동안 쓸 수 있어요. 메일이 안 보이면 스팸함도 확인해 주세요.
          </AlertDescription>
        </Alert>
      ) : (
        <form onSubmit={send} className="space-y-4">
          {msg && (
            <Alert variant="destructive">
              <AlertDescription>{msg}</AlertDescription>
            </Alert>
          )}
          <Field>
            <FieldLabel htmlFor="email">이메일</FieldLabel>
            <Input id="email" type="email" autoComplete="email" autoCapitalize="none" className="h-11 text-base md:h-9 md:text-sm" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <FieldDescription>이메일을 등록하지 않았다면 운영자에게 물어봐 주세요</FieldDescription>
          </Field>
          <Button type="submit" size="lg" className="h-12 w-full" disabled={busy || !email.trim()}>
            {busy && <Spinner />} 링크 보내기
          </Button>
        </form>
      )}
      <FieldDescription className="text-center">
        <Link href="/login">로그인으로 돌아가기</Link>
      </FieldDescription>
    </div>
  );
}
