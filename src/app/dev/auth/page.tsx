"use client";

// 0단계 V-11: 아이디 가입·로그인(이메일 없이), 세션, 로그아웃, 간편 로그인 버튼 시험
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

const INTERNAL = "@users.oona.invalid"; // src/lib/auth.ts와 같은 값(이메일 없는 계정의 내부 주소)
const PROVIDER = { kakao: "카카오", naver: "네이버" } as const;
type Provider = keyof typeof PROVIDER;

// 간편 로그인에서 돌아왔을 때 주소의 ?via=&error= 를 사람 말로
function socialResult(q: URLSearchParams) {
  const via = PROVIDER[q.get("via") as Provider];
  const error = q.get("error");
  if (!via || !error) return "";
  if (error === "signup_disabled") return `${via}: 인증은 성공했어요. 처음 온 계정이라 자동 가입을 막아 둔 상태예요(정상, 13 §2.3)`;
  if (/state/i.test(error)) return `${via}: 로그인 확인값(state)이 맞지 않아요(${error}). 같은 로그인이 두 번 들어왔거나 10분이 지났어요`;
  return `${via}: 오류 ${error}`;
}

export default function AuthTest() {
  const { data: session, isPending, refetch } = authClient.useSession();
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [avail, setAvail] = useState("");
  const [social, setSocial] = useState("");

  useEffect(() => {
    queueMicrotask(() => setSocial(socialResult(new URLSearchParams(location.search))));
  }, []);

  const startSocial = (provider: Provider) =>
    authClient.signIn.social({ provider, callbackURL: "/dev/auth", errorCallbackURL: `/dev/auth?via=${provider}` });

  const username = id.trim().toLowerCase();

  async function check() {
    const { data, error } = await authClient.isUsernameAvailable({ username });
    setAvail(error ? "형식을 확인해 주세요" : data?.available ? "사용할 수 있어요" : "이미 쓰는 아이디예요");
  }

  async function signUp() {
    const { error } = await authClient.signUp.email({
      username,
      password: pw,
      name: username,
      email: email.trim() || `id.${username}${INTERNAL}`, // 이메일은 선택
    });
    setMsg(error ? `가입하지 못했어요: ${error.message}` : "가입하고 로그인했어요");
    refetch();
  }

  async function signIn() {
    const { error } = await authClient.signIn.username({ username, password: pw });
    // 아이디·비밀번호 중 무엇이 틀렸는지 구분하지 않음(13 §3.3)
    setMsg(error ? "아이디 또는 비밀번호가 맞지 않아요" : "로그인했어요");
    refetch();
  }

  async function signOut() {
    await authClient.signOut();
    setMsg("로그아웃했어요");
    refetch();
  }

  const u = session?.user as { username?: string; email: string } | undefined;

  return (
    <main className="mx-auto w-full max-w-md space-y-6 p-6">
      <h1 className="text-2xl font-bold">로그인 시험</h1>

      <section className="bg-card space-y-1 rounded-xl border p-4 text-sm">
        <p className="font-semibold">지금 상태</p>
        {isPending ? (
          <p>확인 중…</p>
        ) : u ? (
          <>
            <p>로그인됨: {u.username}</p>
            <p className="text-muted-foreground">이메일: {u.email.endsWith(INTERNAL) ? "없음" : u.email}</p>
            <Button variant="outline" size="sm" onClick={signOut}>
              로그아웃
            </Button>
          </>
        ) : (
          <p>로그인 안 됨</p>
        )}
      </section>

      <section className="space-y-3">
        <label className="block space-y-1 text-sm">
          <span>아이디</span>
          <div className="flex gap-2">
            <input className="w-full rounded-md border px-3 py-2" value={id} onChange={(e) => setId(e.target.value)} autoComplete="username" />
            <Button variant="outline" onClick={check}>
              중복 확인
            </Button>
          </div>
          <span className="text-muted-foreground">4~20자, 영문 소문자로 시작, 소문자·숫자·_·. {avail && `· ${avail}`}</span>
        </label>
        <label className="block space-y-1 text-sm">
          <span>비밀번호</span>
          <input type="password" className="w-full rounded-md border px-3 py-2" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
        </label>
        <label className="block space-y-1 text-sm">
          <span>이메일 (선택)</span>
          <input type="email" className="w-full rounded-md border px-3 py-2" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <div className="flex gap-2">
          <Button onClick={signIn}>로그인</Button>
          <Button variant="secondary" onClick={signUp}>
            가입하기
          </Button>
        </div>
        {msg && <p className="text-sm">{msg}</p>}
      </section>

      <section className="space-y-2 text-sm">
        <p className="font-semibold">간편 로그인</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => startSocial("kakao")}>
            카카오로 시작하기
          </Button>
          <Button variant="outline" onClick={() => startSocial("naver")}>
            네이버로 시작하기
          </Button>
        </div>
        {social && <p className="rounded-md border p-3">{social}</p>}
        <p className="text-muted-foreground">카카오·네이버 개발자 앱을 등록하고 키를 넣은 뒤에 동작해요(V-03).</p>
      </section>
    </main>
  );
}
