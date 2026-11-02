"use client";

// 회원가입 (SCR-AUTH-02, 04 §2.2): 아이디·비밀번호만으로, 이메일은 선택
import { Check, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";
import { PASSWORD_RULES, passwordProblem } from "@/lib/password";
import { cn } from "@/lib/utils";

const ID_RULE = /^[a-z][a-z0-9_.]{3,19}$/;
const INTERNAL = "@users.oona.invalid"; // src/lib/auth.ts와 같은 값(이메일 없는 계정의 내부 주소)
const input = "h-11 text-base md:h-9 md:text-sm";

export default function SignupPage() {
  const router = useRouter();
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [idState, setIdState] = useState<"" | "checking" | "ok" | "taken" | "invalid">("");
  const [touched, setTouched] = useState({ pw2: false });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const username = id.trim().toLowerCase();
  // 입력을 멈추고 0.4초 뒤 중복 확인
  useEffect(() => {
    if (!username) return;
    const t = setTimeout(async () => {
      if (!ID_RULE.test(username) || /[._]{2}/.test(username)) return setIdState("invalid");
      setIdState("checking");
      const { data, error } = await authClient.isUsernameAvailable({ username });
      setIdState(error ? "invalid" : data?.available ? "ok" : "taken");
    }, 400);
    return () => clearTimeout(t);
  }, [username]);

  const pwProblem = pw ? passwordProblem(pw, username) : null;
  const mismatch = touched.pw2 && pw2 !== pw;
  const ready = idState === "ok" && !pwProblem && pw && pw2 === pw && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setMsg("");
    const { error } = await authClient.signUp.email({
      username,
      password: pw,
      name: name.trim() || username,
      email: email.trim() || `id.${username}${INTERNAL}`,
    });
    if (error) {
      setBusy(false);
      // 입력값은 그대로 두고(비밀번호 제외) 위에 알림
      setPw("");
      setPw2("");
      setMsg(error.code === "WEAK_PASSWORD" ? (error.message ?? "") : error.status === 429 ? "잠시 후 다시 시도해 주세요" : "가입하지 못했어요. 입력을 확인해 주세요");
      return;
    }
    router.replace("/onboarding");
  }

  return (
    <form onSubmit={submit} className="space-y-6 pb-20 md:pb-0">
      <h1 className="text-title text-center font-bold">회원가입</h1>
      {msg && (
        <Alert variant="destructive">
          <AlertDescription>{msg}</AlertDescription>
        </Alert>
      )}
      <FieldGroup>
        <Field data-invalid={idState === "taken" || idState === "invalid" || undefined}>
          <FieldLabel htmlFor="id">아이디</FieldLabel>
          <Input
            id="id"
            className={input}
            autoComplete="username"
            autoCapitalize="none"
            value={id}
            onChange={(e) => {
              setId(e.target.value.toLowerCase());
              setIdState("");
            }}
            aria-invalid={idState === "taken" || idState === "invalid" || undefined}
            required
          />
          {idState === "ok" ? (
            <FieldDescription className="text-success-text">사용할 수 있어요</FieldDescription>
          ) : idState === "taken" ? (
            <FieldError>이미 쓰는 아이디예요</FieldError>
          ) : idState === "invalid" ? (
            <FieldError>영문 소문자로 시작하는 4~20자로 써 주세요. 소문자, 숫자, 밑줄(_), 마침표(.)만 쓸 수 있어요</FieldError>
          ) : (
            <FieldDescription>영문 소문자로 시작하는 4~20자예요. 소문자, 숫자, 밑줄(_), 마침표(.)를 쓸 수 있어요</FieldDescription>
          )}
        </Field>

        <Field data-invalid={(!!pwProblem && pw.length >= 8) || undefined}>
          <FieldLabel htmlFor="pw">비밀번호</FieldLabel>
          <InputGroup className="h-11 md:h-9">
            <InputGroupInput id="pw" type={show ? "text" : "password"} autoComplete="new-password" className="text-base md:text-sm" value={pw} onChange={(e) => setPw(e.target.value)} required />
            <InputGroupAddon align="inline-end">
              <InputGroupButton size="icon-xs" aria-label={show ? "비밀번호 숨기기" : "비밀번호 보기"} onClick={() => setShow(!show)}>
                {show ? <EyeOff /> : <Eye />}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
          <ul className="text-caption flex gap-3">
            {PASSWORD_RULES.map((r) => (
              <li key={r.id} className={cn("inline-flex items-center gap-1", r.ok(pw) ? "text-success-text" : "text-muted-foreground")}>
                <Check className="size-3.5" aria-hidden /> {r.label}
                <span className="sr-only">{r.ok(pw) ? "충족" : "아직"}</span>
              </li>
            ))}
          </ul>
          {pw.length >= 8 && pwProblem && PASSWORD_RULES.every((r) => r.ok(pw)) && <FieldError>{pwProblem}</FieldError>}
        </Field>

        <Field data-invalid={mismatch || undefined}>
          <FieldLabel htmlFor="pw2">비밀번호 확인</FieldLabel>
          <Input
            id="pw2"
            type={show ? "text" : "password"}
            autoComplete="new-password"
            className={input}
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            onBlur={() => setTouched({ pw2: true })}
            aria-invalid={mismatch || undefined}
            required
          />
          {mismatch && <FieldError>비밀번호가 같지 않아요</FieldError>}
        </Field>

        <Field>
          <FieldLabel htmlFor="name">표시 이름 (선택)</FieldLabel>
          <Input id="name" className={input} maxLength={20} value={name} onChange={(e) => setName(e.target.value)} placeholder={username || "비우면 아이디로 불러요"} />
        </Field>

        <Field>
          <FieldLabel htmlFor="email">이메일 (선택)</FieldLabel>
          <Input id="email" type="email" autoComplete="email" className={input} value={email} onChange={(e) => setEmail(e.target.value)} />
          <FieldDescription>비밀번호를 잊었을 때 찾을 수 있어요</FieldDescription>
        </Field>
      </FieldGroup>

      {/* 모바일은 아래 고정 버튼(04 §2.2) */}
      <div className="bg-background fixed inset-x-0 bottom-0 border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:static md:border-0 md:bg-transparent md:p-0">
        <Button type="submit" size="lg" className="h-12 w-full" disabled={!ready}>
          {busy && <Spinner />} 가입하기
        </Button>
      </div>
      <FieldDescription className="text-center">
        이미 계정이 있나요? <Link href="/login">로그인</Link>
      </FieldDescription>
    </form>
  );
}
