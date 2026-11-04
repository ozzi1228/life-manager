"use client";

// 로그인 (SCR-AUTH-01) + 간편 로그인 처음 온 사람 처리 (SCR-AUTH-03, 04 §2.3)
// 카카오·네이버 인증 뒤 연결된 계정이 없으면 ?social=<사>&error=signup_disabled 로 돌아옴 → "처음 오셨나요?"
import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";
import { PROVIDER_NAME, SocialButton, type Provider } from "../social-buttons";

/** 로그인 뒤 갈 곳: 우리 앱 안 경로만(다른 사이트로 보내는 주소는 무시) */
const safeNext = (n: string | null) => (n && n.startsWith("/") && !n.startsWith("//") ? n : "/");

export function LoginForm({ providers }: { providers: Provider[] }) {
  const router = useRouter();
  const q = useSearchParams();
  const next = safeNext(q.get("next"));
  const social = (["kakao", "naver"] as const).find((p) => p === q.get("social")) ?? null;
  const error = q.get("error");
  const firstTime = !!social && error === "signup_disabled";

  const [linking, setLinking] = useState(false); // "기존 계정에 연결하기"를 고름
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(
    social && error && !firstTime && error !== "access_denied" && !/state|restart/i.test(error) ? `${PROVIDER_NAME[social]} 로그인을 완료하지 못했어요. 다시 시도해 주세요` : "",
  );

  // 이미 로그인돼 있으면 바로 앱으로(안드로이드에서 콜백이 두 번 들어와 확인값 오류로 온 경우 포함, 21 V-03)
  useEffect(() => {
    if (firstTime) return;
    authClient.getSession().then(({ data }) => data && router.replace(next));
  }, [firstTime, next, router]);

  const startSocial = (p: Provider, requestSignUp = false) => {
    setBusy(true);
    authClient.signIn.social({
      provider: p,
      requestSignUp,
      callbackURL: requestSignUp ? "/onboarding" : next,
      newUserCallbackURL: "/onboarding",
      errorCallbackURL: `/login?social=${p}${next !== "/" ? `&next=${encodeURIComponent(next)}` : ""}`,
    });
  };

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const { error } = await authClient.signIn.username({ username: id.trim().toLowerCase(), password: pw, rememberMe: remember });
    if (error) {
      setBusy(false);
      // 아이디·비밀번호 중 무엇이 틀렸는지 구분하지 않음(13 §3.3)
      // 401만 "맞지 않아요". 서버·연결 문제(403·5xx 등)를 비밀번호 탓으로 안내하지 않음(22 §5)
      setMsg(error.status === 401 ? "아이디 또는 비밀번호가 맞지 않아요" : error.status === 429 ? "잠시 후 다시 시도해 주세요" : "지금은 로그인할 수 없어요. 잠시 후 다시 시도해 주세요");
      return;
    }
    if (linking && social) {
      // 로그인한 계정에 이 간편 로그인을 연결(이미 동의한 상태라 바로 돌아옴)
      await authClient.linkSocial({ provider: social, callbackURL: next, errorCallbackURL: "/settings" });
      return;
    }
    router.replace(next);
  }

  if (firstTime && social && !linking)
    return (
      <div className="space-y-6 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- 장식 그림 */}
        <img src="/pets/meongi/happy.png" alt="" width={96} height={96} className="mx-auto" />
        <div className="space-y-1">
          <h1 className="text-title font-bold">처음 오셨나요?</h1>
          <p className="text-muted-foreground text-sm">{PROVIDER_NAME[social]} 계정으로 우나를 처음 쓰시는 것 같아요</p>
        </div>
        <div className="space-y-2">
          <Button size="lg" className="h-12 w-full" disabled={busy} onClick={() => startSocial(social, true)}>
            {busy && <Spinner />} 새로 시작하기
          </Button>
          <Button size="lg" variant="outline" className="h-12 w-full" onClick={() => setLinking(true)}>
            기존 계정에 연결하기
          </Button>
          <p className="text-muted-foreground text-sm">이미 아이디로 가입했다면 연결해 주세요</p>
        </div>
      </div>
    );

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- 로고 */}
        <img src="/icons/192.png" alt="" width={72} height={72} className="mx-auto rounded-2xl" />
        <h1 className="text-title font-bold">{linking && social ? `${PROVIDER_NAME[social]} 계정 연결하기` : "우나"}</h1>
        {linking && social && <p className="text-muted-foreground text-sm">연결할 계정의 아이디로 로그인해 주세요</p>}
      </div>

      {!linking && providers.length > 0 && (
        <>
          <div className="space-y-2">
            {providers.map((p) => (
              <SocialButton key={p} provider={p} disabled={busy} onClick={() => startSocial(p)} />
            ))}
          </div>
          <div className="text-muted-foreground flex items-center gap-3 text-xs">
            <span className="h-px flex-1 bg-border" />
            또는
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      )}

      <form onSubmit={signIn} className="space-y-4">
        {msg && (
          <Alert variant="destructive">
            <AlertDescription>{msg}</AlertDescription>
          </Alert>
        )}
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="id">아이디</FieldLabel>
            <Input id="id" autoComplete="username" autoCapitalize="none" className="h-11 text-base md:h-9 md:text-sm" value={id} onChange={(e) => setId(e.target.value)} required />
          </Field>
          <Field>
            <FieldLabel htmlFor="pw">비밀번호</FieldLabel>
            <InputGroup className="h-11 md:h-9">
              <InputGroupInput id="pw" type={show ? "text" : "password"} autoComplete="current-password" className="text-base md:text-sm" value={pw} onChange={(e) => setPw(e.target.value)} required />
              <InputGroupAddon align="inline-end">
                <InputGroupButton size="icon-xs" aria-label={show ? "비밀번호 숨기기" : "비밀번호 보기"} onClick={() => setShow(!show)}>
                  {show ? <EyeOff /> : <Eye />}
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          </Field>
          <Field orientation="horizontal">
            <Checkbox id="remember" checked={remember} onCheckedChange={(v) => setRemember(v === true)} />
            <FieldLabel htmlFor="remember" className="font-normal">
              로그인 유지
            </FieldLabel>
          </Field>
        </FieldGroup>
        <Button type="submit" size="lg" className="h-12 w-full" disabled={busy}>
          {busy && <Spinner />} {linking ? "로그인하고 연결하기" : "로그인"}
        </Button>
      </form>

      {linking ? (
        <Button variant="link" className="w-full" onClick={() => setLinking(false)}>
          돌아가기
        </Button>
      ) : (
        <FieldDescription className="text-center">
          처음이신가요? <Link href={next !== "/" ? `/signup?next=${encodeURIComponent(next)}` : "/signup"}>회원가입</Link>
        </FieldDescription>
      )}
    </div>
  );
}
