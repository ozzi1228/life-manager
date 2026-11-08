"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";
import { passwordProblem } from "@/lib/password";

export function ResetForm() {
  const q = useSearchParams();
  const token = q.get("token");
  const [pw, setPw] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [msg, setMsg] = useState("");
  const problem = pw ? passwordProblem(pw) : null;
  const mismatch = !!again && pw !== again;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    setMsg("");
    const { error } = await authClient.resetPassword({ newPassword: pw, token });
    setBusy(false);
    if (error) return setMsg(error.code === "INVALID_TOKEN" ? "링크가 만료됐거나 이미 썼어요. 비밀번호 찾기를 다시 해 주세요" : (error.message ?? "바꾸지 못했어요. 잠시 후 다시 시도해 주세요"));
    setDone(true);
  }

  const bad = !token || q.get("error");
  return (
    <div className="space-y-6">
      <h1 className="text-title text-center font-bold">새 비밀번호</h1>
      {bad ? (
        <Alert variant="destructive">
          <AlertDescription>링크가 만료됐거나 잘못됐어요. 비밀번호 찾기를 다시 해 주세요.</AlertDescription>
        </Alert>
      ) : done ? (
        <Alert>
          <AlertDescription>비밀번호를 바꿨어요. 새 비밀번호로 로그인해 주세요. 다른 기기는 모두 로그아웃됐어요.</AlertDescription>
        </Alert>
      ) : (
        <form onSubmit={save} className="space-y-4">
          {msg && (
            <Alert variant="destructive">
              <AlertDescription>{msg}</AlertDescription>
            </Alert>
          )}
          <FieldGroup>
            <Field data-invalid={!!problem || undefined}>
              <FieldLabel htmlFor="pw">새 비밀번호</FieldLabel>
              <Input id="pw" type="password" autoComplete="new-password" className="h-11 text-base md:h-9 md:text-sm" value={pw} onChange={(e) => setPw(e.target.value)} required />
              {problem ? <FieldError>{problem}</FieldError> : <FieldDescription>8자 이상, 영문과 숫자를 모두 넣어 주세요</FieldDescription>}
            </Field>
            <Field data-invalid={mismatch || undefined}>
              <FieldLabel htmlFor="pw-again">새 비밀번호 확인</FieldLabel>
              <Input id="pw-again" type="password" autoComplete="new-password" className="h-11 text-base md:h-9 md:text-sm" value={again} onChange={(e) => setAgain(e.target.value)} required />
              {mismatch && <FieldError>비밀번호가 서로 달라요</FieldError>}
            </Field>
          </FieldGroup>
          <Button type="submit" size="lg" className="h-12 w-full" disabled={busy || !pw || !!problem || pw !== again}>
            {busy && <Spinner />} 비밀번호 바꾸기
          </Button>
        </form>
      )}
      <FieldDescription className="text-center">
        <Link href={bad ? "/forgot-password" : "/login"}>{bad ? "비밀번호 찾기" : "로그인으로"}</Link>
      </FieldDescription>
    </div>
  );
}
