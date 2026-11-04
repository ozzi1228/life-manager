"use client";

// 캘린더 목록(일정 화면 왼쪽, 좁은 화면은 "캘린더" 창): 체크로 보이기, 내 캘린더 추가·고치기, 구글 캘린더 연동(07 §4 G1)
// 내 캘린더는 끌어 순서 바꾸기(휴대폰은 길게 누른 뒤 끌기). 맨 위가 기본 캘린더 — 우클릭(길게 누르고 있기) "기본 캘린더로 지정"은 맨 위로 올림
// 구글: 제목 옆 + → 연결 창(앱 키 만드는 법 → 키 넣고 연결 테스트 → 구글 계정 연결)
import { Check, Copy, Ellipsis, ExternalLink, Pencil, Plus, RefreshCw, Star, Unlink } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { addCalendar, checkGoogleKeys, editCalendar, removeCalendar, reorderCalendar, restoreCalendar, setGoogleKeys, syncGoogleNow, unlinkGoogle } from "@/app/actions/calendar";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useDragSort } from "@/hooks/use-drag-sort";
import { ColorPalettePicker } from "@/components/app/color-picker";
import { ResponsiveModal } from "@/components/app/responsive";
import { toastUndo } from "@/components/app/states";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { textOn } from "@/lib/palette";
import { cn } from "@/lib/utils";
import type { CalendarItem } from "@/server/calendar";
import type { GoogleStatus } from "@/server/google-calendar";

type Edit = { id?: string; version?: number; name: string; colorHex: string; google?: boolean };

function CalendarEditor({ edit, calendars, close }: { edit: Edit; calendars: CalendarItem[]; close: () => void }) {
  const router = useRouter();
  const [v, setV] = useState(edit);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const mine = calendars.filter((c) => !c.google);

  async function save() {
    setBusy(true);
    const input = { name: v.name, colorHex: v.colorHex };
    const r = v.id ? await editCalendar(v.id, v.version!, input) : await addCalendar(input);
    setBusy(false);
    if (!r.ok) return setError(r.error.fields?.[0]?.message ?? r.error.message);
    close();
    router.refresh();
  }
  async function remove() {
    const r = await removeCalendar(v.id!);
    if (!r.ok) return toast(r.error.message);
    close();
    router.refresh();
    toastUndo(`${v.name} 캘린더와 일정을 휴지통으로 옮겼어요`, async () => {
      await restoreCalendar(v.id!);
      router.refresh();
    });
  }

  return (
    <ResponsiveModal
      open
      onOpenChange={(o) => !o && close()}
      title={v.id ? "캘린더 수정" : "새 캘린더"}
      description={v.google ? "구글 캘린더의 이름·색은 이 앱에서만 바뀌어요" : undefined}
      size="sm"
      footer={
        <div className="flex w-full gap-2">
          {v.id && !v.google && mine.length > 1 && (
            <Button variant="ghost" className="text-destructive-text" onClick={remove}>
              삭제
            </Button>
          )}
          <Button className="ml-auto" disabled={!v.name.trim() || busy} onClick={save}>
            {busy && <Spinner />} 저장
          </Button>
        </div>
      }
    >
      <FieldGroup className="gap-4">
        <Input autoFocus aria-label="캘린더 이름" placeholder="예: 업무, 취미, 가족" maxLength={20} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} onKeyDown={(e) => e.key === "Enter" && v.name.trim() && save()} />
        <ColorPalettePicker value={v.colorHex} onChange={(colorHex) => setV({ ...v, colorHex })} used={calendars.filter((c) => c.id !== v.id).map((c) => c.colorHex)} />
        {error && <FieldError>{error}</FieldError>}
      </FieldGroup>
    </ResponsiveModal>
  );
}

function Item({ c, on, toggle, edit, isDefault, ...rest }: { c: CalendarItem; on: boolean; toggle: (on: boolean) => void; edit: () => void; isDefault?: boolean } & React.ComponentProps<"li">) {
  return (
    <li {...rest} className="group hover:bg-accent/50 data-[dragging=true]:bg-card flex items-center gap-1 rounded-md pr-1 data-[dragging=true]:shadow-md">
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 px-2 py-1.5 text-sm max-md:py-2.5">
        <Checkbox
          checked={on}
          onCheckedChange={(v) => toggle(v === true)}
          className="data-[state=checked]:border-(--c) data-[state=checked]:bg-(--c) data-[state=checked]:text-(--t) border-(--c)"
          style={{ "--c": c.colorHex, "--t": textOn(c.colorHex) } as React.CSSProperties}
        />
        <span className="truncate">{c.name}</span>
        {isDefault && <span className="text-muted-foreground shrink-0 text-caption">기본</span>}
      </label>
      <Button variant="ghost" size="icon" className="size-7 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 max-md:size-9 max-md:opacity-100" aria-label={`${c.name} 캘린더 수정`} onClick={edit}>
        <Pencil className="size-3.5" />
      </Button>
    </li>
  );
}

const GoogleMark = () => (
  <svg viewBox="0 0 24 24" aria-hidden className="size-4">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.6 10.6 0 0 0 12 1 11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
  </svg>
);

const GUIDE = [
  { t: "구글 클라우드 콘솔에서 프로젝트를 만들어요", href: "https://console.cloud.google.com/projectcreate" },
  { t: "Google Calendar API를 사용 설정해요", href: "https://console.cloud.google.com/apis/library/calendar-json.googleapis.com" },
  { t: "OAuth 동의 화면: 외부 사용자로 만들고, 게시 상태를 '프로덕션'으로 바꿔요(테스트 상태면 7일마다 연결이 끊겨요)", href: "https://console.cloud.google.com/auth/overview" },
  { t: "클라이언트 만들기: 유형은 '웹 애플리케이션', 승인된 리디렉션 URI에 아래 주소를 넣어요", href: "https://console.cloud.google.com/auth/clients/create" },
  { t: "만든 클라이언트의 ID와 보안 비밀번호를 아래에 붙여 넣어요" },
];

/** 구글 캘린더 연결 창: 앱 키가 이미 있으면 바로 "구글 계정 연결", 없으면(또는 바꾸기) 만드는 법 + 입력 + 연결 테스트 */
function GoogleConnect({ google, close }: { google: GoogleStatus; close: () => void }) {
  const [form, setForm] = useState(!google.keys);
  const [id, setId] = useState(google.clientId ?? "");
  const [secret, setSecret] = useState("");
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState<"test" | "save" | null>(null);
  const [copied, setCopied] = useState(false);
  // API가 구글 동의 화면으로 보내므로 페이지 이동이 아니라 전체 이동
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  const go = () => (window.location.href = "/api/v1/google/connect");

  async function check() {
    setBusy("test");
    const r = await checkGoogleKeys(id, secret);
    setBusy(null);
    setTest(r.ok ? r.data : { ok: false, message: r.error.message });
  }
  async function connect() {
    setBusy("save");
    const r = await setGoogleKeys(id, secret);
    if (!r.ok) {
      setBusy(null);
      return setTest({ ok: false, message: r.error.message });
    }
    go(); // 구글 동의 화면 → 돌아오면 "연동했어요"
  }
  const copy = async () => {
    await navigator.clipboard.writeText(google.redirectUri).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (!form)
    return (
      <ResponsiveModal
        open
        onOpenChange={(o) => !o && close()}
        title="구글 캘린더 연결"
        size="sm"
        footer={
          <Button className="w-full" onClick={go}>
            <GoogleMark /> 구글 계정 연결
          </Button>
        }
      >
        <div className="space-y-3 text-sm">
          <p>구글 계정을 고르면 그 계정의 캘린더를 가져와요. 구글 일정은 여기서 읽기만 하고, 고치기는 구글에서 해요.</p>
          {google.keys === "user" && (
            <p className="text-muted-foreground text-caption">
              앱 키: <span className="font-mono">{google.clientId?.slice(0, 18)}…</span>{" "}
              <button type="button" className="text-link underline-offset-2 hover:underline" onClick={() => setForm(true)}>
                바꾸기
              </button>
            </p>
          )}
        </div>
      </ResponsiveModal>
    );

  return (
    <ResponsiveModal
      open
      onOpenChange={(o) => !o && close()}
      title="구글 캘린더 연결"
      description="처음 한 번, 내 구글 앱 키를 만들어 넣어요(5분쯤)"
      footer={
        <div className="flex w-full gap-2">
          <Button variant="outline" disabled={!id.trim() || !secret.trim() || !!busy} onClick={check}>
            {busy === "test" && <Spinner />} 연결 테스트
          </Button>
          <Button className="flex-1" disabled={!test?.ok || !!busy} onClick={connect}>
            {busy === "save" ? <Spinner /> : <GoogleMark />} 구글 계정 연결
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <ol className="space-y-2 text-sm">
          {GUIDE.map((g, i) => (
            <li key={i} className="flex gap-2">
              <span className="bg-muted flex size-5 shrink-0 items-center justify-center rounded-full text-caption tabular-nums">{i + 1}</span>
              <span className="min-w-0">
                {g.t}
                {g.href && (
                  <a href={g.href} target="_blank" rel="noreferrer" className="text-link ml-1 inline-flex items-center gap-0.5 whitespace-nowrap underline-offset-2 hover:underline">
                    열기 <ExternalLink className="size-3" />
                  </a>
                )}
                {i === 3 && (
                  <span className="bg-muted mt-1.5 flex items-center gap-1 rounded-md py-1 pr-1 pl-2">
                    <code className="min-w-0 flex-1 truncate text-caption">{google.redirectUri}</code>
                    <Button type="button" variant="ghost" size="icon" className="size-7 shrink-0" aria-label="리디렉션 URI 복사" onClick={copy}>
                      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                    </Button>
                  </span>
                )}
              </span>
            </li>
          ))}
        </ol>
        <FieldGroup className="gap-3">
          <Field>
            <FieldLabel htmlFor="g-id">클라이언트 ID</FieldLabel>
            <Input id="g-id" autoComplete="off" spellCheck={false} placeholder="1234-abcd.apps.googleusercontent.com" value={id} onChange={(e) => (setId(e.target.value), setTest(null))} />
          </Field>
          <Field>
            <FieldLabel htmlFor="g-secret">클라이언트 보안 비밀번호</FieldLabel>
            <Input id="g-secret" type="password" autoComplete="off" placeholder="GOCSPX-…" value={secret} onChange={(e) => (setSecret(e.target.value), setTest(null))} />
          </Field>
          {test && (
            <p role="status" className={test.ok ? "text-success-text flex items-center gap-1 text-sm" : "text-destructive-text text-sm"}>
              {test.ok && <Check className="size-4" />} {test.message}
            </p>
          )}
        </FieldGroup>
      </div>
    </ResponsiveModal>
  );
}

const ago = (iso: string) => {
  const m = Math.floor((Date.now() - Date.parse(iso)) / 60_000);
  return m < 1 ? "방금" : m < 60 ? `${m}분 전` : m < 1440 ? `${Math.floor(m / 60)}시간 전` : `${Math.floor(m / 1440)}일 전`;
};
const STALE = 15 * 60_000;

export function CalendarList({ calendars, hidden, toggle, google }: { calendars: CalendarItem[]; hidden: Set<string>; toggle: (c: CalendarItem, on: boolean) => void; google: GoogleStatus }) {
  const router = useRouter();
  const [edit, setEdit] = useState<Edit | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [unlink, setUnlink] = useState(false);
  const [connect, setConnect] = useState(false);
  const mine = calendars.filter((c) => !c.google);
  const gcals = calendars.filter((c) => c.google);
  const link = google.link;
  const saveOrder = async (ids: string[]) => {
    const r = await reorderCalendar(ids);
    if (!r.ok) toast(r.error.message);
    router.refresh();
  };
  const drag = useDragSort(
    mine.map((c) => c.id),
    saveOrder,
  );
  // 새 일정의 기본 캘린더 = 보이는 내 캘린더 중 맨 위(calendar.tsx defaultCal과 같은 규칙)
  const defaultId = drag.order.find((id) => !hidden.has(id)) ?? drag.order[0];
  function makeDefault(c: CalendarItem) {
    if (hidden.has(c.id)) toggle(c, true);
    saveOrder([c.id, ...drag.order.filter((id) => id !== c.id)]);
    toast(`기본 캘린더: ${c.name}`);
  }

  async function sync(quiet = false) {
    setSyncing(true);
    const r = await syncGoogleNow();
    setSyncing(false);
    if (!r.ok) return quiet || toast(r.error.message);
    router.refresh();
    if (!quiet) toast("구글 일정을 새로 가져왔어요");
  }
  // 화면을 열 때 15분 넘게 지났으면 조용히 가져오기(한 번만)
  const auto = useRef(false);
  useEffect(() => {
    if (auto.current || !link || link.status !== "ok" || (link.syncedAt && Date.now() - Date.parse(link.syncedAt) < STALE)) return;
    auto.current = true;
    sync(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [link]);

  async function doUnlink() {
    setUnlink(false);
    const r = await unlinkGoogle();
    if (!r.ok) return toast(r.error.message);
    toast("구글 캘린더 연동을 해제했어요");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <section className="space-y-1">
        <div className="flex items-center justify-between pl-2">
          <h2 className="text-sm font-semibold">내 캘린더</h2>
          <Button variant="ghost" size="icon" className="size-7 max-md:size-9" aria-label="새 캘린더" onClick={() => setEdit({ name: "", colorHex: "#5B8DEF" })}>
            <Plus className="size-4" />
          </Button>
        </div>
        <ul>
          {drag.order.map((id) => {
            const c = mine.find((m) => m.id === id);
            if (!c) return null;
            return (
              <ContextMenu key={id} modal={false}>
                <ContextMenuTrigger asChild>
                  <Item ref={drag.rowRef(id)} {...drag.item(id)} data-dragging={drag.dragging === id} c={c} on={!hidden.has(id)} toggle={(on) => toggle(c, on)} edit={() => setEdit({ ...c })} isDefault={id === defaultId} />
                </ContextMenuTrigger>
                <ContextMenuContent className="w-48">
                  <ContextMenuItem disabled={id === defaultId} onSelect={() => makeDefault(c)}>
                    <Star /> 기본 캘린더로 지정
                  </ContextMenuItem>
                  <ContextMenuItem onSelect={() => setEdit({ ...c })}>
                    <Pencil /> 수정
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            );
          })}
        </ul>
      </section>

      <section className="space-y-1">
        <div className="flex items-center gap-1.5 pl-2">
          <GoogleMark />
          <h2 className="text-sm font-semibold">구글 캘린더</h2>
          {link?.status === "ok" && (
            <Button variant="ghost" size="icon" className="ml-auto size-7 max-md:size-9" aria-label="지금 가져오기" title="지금 가져오기" disabled={syncing} onClick={() => sync()}>
              <RefreshCw className={syncing ? "size-3.5 animate-spin" : "size-3.5"} />
            </Button>
          )}
          {/* 연동 해제는 자주 안 쓰니 ⋯ 메뉴 안에(목록 아래에 늘 보이면 거슬려서) */}
          {link ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className={cn("text-muted-foreground size-7 max-md:size-9", link.status !== "ok" && "ml-auto")} aria-label="구글 캘린더 더 보기">
                  <Ellipsis className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {link.account && <DropdownMenuLabel className="text-muted-foreground truncate font-normal">{link.account}</DropdownMenuLabel>}
                {link.account && <DropdownMenuSeparator />}
                <DropdownMenuItem variant="destructive" onSelect={() => setUnlink(true)}>
                  <Unlink /> 연동 해제
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button variant="ghost" size="icon" className="ml-auto size-7 max-md:size-9" aria-label="구글 캘린더 연결" title="구글 캘린더 연결" onClick={() => setConnect(true)}>
              <Plus className="size-4" />
            </Button>
          )}
        </div>
        {!link ? (
          <p className="text-muted-foreground px-2 text-caption">연결 안 됨</p>
        ) : (
          <>
            {link.status === "broken" && (
              <div className="bg-destructive/10 mx-2 space-y-2 rounded-md p-2 text-caption">
                <p>구글 캘린더 연결이 끊겼어요.</p>
                <Button variant="outline" size="sm" className="w-full" onClick={() => setConnect(true)}>
                  다시 연결
                </Button>
              </div>
            )}
            <ul>
              {gcals.map((c) => (
                <Item key={c.id} c={c} on={!hidden.has(c.id)} toggle={(on) => toggle(c, on)} edit={() => setEdit({ ...c })} />
              ))}
            </ul>
            {link.syncedAt && (
              <p className="text-muted-foreground px-2 text-caption" title={link.account ?? undefined}>
                {ago(link.syncedAt)} 가져옴
              </p>
            )}
          </>
        )}
      </section>

      {connect && <GoogleConnect google={google} close={() => setConnect(false)} />}
      {edit && <CalendarEditor edit={edit} calendars={calendars} close={() => setEdit(null)} />}
      <AlertDialog open={unlink} onOpenChange={setUnlink}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>구글 캘린더 연동을 해제할까요?</AlertDialogTitle>
            <AlertDialogDescription>가져온 구글 일정이 이 앱에서 사라져요. 구글 캘린더의 원본은 그대로예요.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={doUnlink}>해제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
