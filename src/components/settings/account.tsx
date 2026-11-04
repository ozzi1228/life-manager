"use client";

// 설정 > 계정 (SCR-SET-02, 04 §8.2): 표시 이름, 아이디, 비밀번호 변경, 로그인된 기기
// ponytail: 카카오·네이버 연결·해제, 이메일, 탈퇴는 C-14
import { ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";
import { timeLabel } from "@/lib/format";

type Session = { token: string; userAgent?: string | null; updatedAt: Date | string; createdAt: Date | string };

const device = (ua?: string | null) => {
  if (!ua) return "알 수 없는 기기";
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac/.test(ua) ? "Mac" : "기타";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : /Firefox\//.test(ua) ? "Firefox" : "브라우저";
  return `${os} · ${browser}`;
};
const when = (d: Date | string) => {
  const x = new Date(d);
  const today = new Date();
  return x.toDateString() === today.toDateString() ? `오늘 ${timeLabel(x)}` : `${x.getMonth() + 1}월 ${x.getDate()}일`;
};

function Password() {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const mismatch = !!again && next !== again;

  async function save() {
    setBusy(true);
    setError("");
    const { error: e } = await authClient.changePassword({ currentPassword: cur, newPassword: next, revokeOtherSessions: true });
    setBusy(false);
    if (e) return setError(e.code === "INVALID_PASSWORD" ? "지금 비밀번호가 맞지 않아요" : e.code === "CREDENTIAL_ACCOUNT_NOT_FOUND" ? "간편 로그인으로만 가입해 비밀번호가 없어요" : (e.message ?? "바꾸지 못했어요"));
    setCur("");
    setNext("");
    setAgain("");
    toast("비밀번호를 바꿨어요. 다른 기기는 로그아웃됐어요");
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <input type="text" name="username" autoComplete="username" hidden readOnly />
      <Field>
        <FieldLabel htmlFor="pw-cur">지금 비밀번호</FieldLabel>
        <Input id="pw-cur" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />
      </Field>
      <Field>
        <FieldLabel htmlFor="pw-new">새 비밀번호</FieldLabel>
        <Input id="pw-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        <FieldDescription>바꾸면 다른 기기는 모두 로그아웃돼요</FieldDescription>
      </Field>
      <Field data-invalid={mismatch || undefined}>
        <FieldLabel htmlFor="pw-again">새 비밀번호 확인</FieldLabel>
        <Input id="pw-again" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
        {mismatch && <FieldError>새 비밀번호가 서로 달라요</FieldError>}
      </Field>
      {error && <FieldError>{error}</FieldError>}
      <Button type="submit" variant="outline" disabled={!cur || !next || next !== again || busy}>
        {busy && <Spinner />} 비밀번호 바꾸기
      </Button>
    </form>
  );
}

function Devices({ current }: { current?: string }) {
  const [list, setList] = useState<Session[] | null>(null);
  const load = () => authClient.listSessions().then((r) => setList((r.data as Session[] | null) ?? []));
  useEffect(() => {
    load();
  }, []);
  async function out(token: string) {
    await authClient.revokeSession({ token });
    load();
    toast("그 기기에서 로그아웃했어요");
  }
  async function outOthers() {
    await authClient.revokeOtherSessions();
    load();
    toast("다른 기기에서 모두 로그아웃했어요");
  }
  if (!list) return <Spinner />;
  const sorted = [...list].sort((a, b) => (a.token === current ? -1 : b.token === current ? 1 : +new Date(b.updatedAt) - +new Date(a.updatedAt)));
  return (
    <div className="space-y-2">
      <ul className="divide-y rounded-lg border">
        {sorted.map((s) => (
          <li key={s.token} className="flex items-center gap-3 px-3 py-2.5 text-sm">
            <span className="min-w-0 flex-1">
              <span className="block">
                {device(s.userAgent)} {s.token === current && <span className="text-link text-caption">이 기기</span>}
              </span>
              <span className="text-muted-foreground text-caption">마지막 사용 {when(s.updatedAt)}</span>
            </span>
            {s.token !== current && (
              <Button variant="ghost" size="sm" onClick={() => out(s.token)}>
                로그아웃
              </Button>
            )}
          </li>
        ))}
      </ul>
      {list.length > 1 && (
        <Button variant="outline" size="sm" onClick={outOthers}>
          다른 기기 모두 로그아웃
        </Button>
      )}
    </div>
  );
}

export function AccountSection() {
  const { data } = authClient.useSession();
  const user = data?.user as { name?: string; username?: string } | undefined;
  const [name, setName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const shown = name ?? user?.name ?? "";

  async function saveName() {
    setBusy(true);
    const { error } = await authClient.updateUser({ name: shown.trim() });
    setBusy(false);
    if (error) return toast(error.message ?? "바꾸지 못했어요");
    setName(null);
    toast("이름을 바꿨어요");
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="acc-name">표시 이름</FieldLabel>
          <div className="flex gap-2">
            <Input id="acc-name" maxLength={20} value={shown} onChange={(e) => setName(e.target.value)} />
            <Button variant="outline" disabled={name === null || !shown.trim() || busy} onClick={saveName}>
              저장
            </Button>
          </div>
        </Field>
        <Field>
          <FieldLabel>아이디</FieldLabel>
          <p className="text-muted-foreground flex h-9 items-center text-sm">{user ? (user.username ?? "간편 로그인") : ""}</p>
        </Field>
      </div>
      <div className="space-y-2">
        <h3 className="font-medium">로그인된 기기</h3>
        <Devices current={data?.session.token} />
      </div>
      <details className="group rounded-lg border">
        <summary className="flex cursor-pointer list-none items-center justify-between p-4 font-medium [&::-webkit-details-marker]:hidden">
          비밀번호 바꾸기
          <ChevronRight className="text-muted-foreground size-4 transition-transform group-open:rotate-90" />
        </summary>
        <div className="px-4 pb-4">
          <Password />
        </div>
      </details>
    </div>
  );
}
