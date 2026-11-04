"use client";

// 캘린더 목록(일정 화면 왼쪽, 좁은 화면은 "캘린더" 창): 체크로 보이기, 내 캘린더 추가·고치기, 구글 캘린더 연동(07 §4 G1)
import { Pencil, Plus, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { addCalendar, editCalendar, removeCalendar, restoreCalendar, syncGoogleNow, unlinkGoogle } from "@/app/actions/calendar";
import { ColorPalettePicker } from "@/components/app/color-picker";
import { ResponsiveModal } from "@/components/app/responsive";
import { toastUndo } from "@/components/app/states";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldError, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { textOn } from "@/lib/palette";
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

function Item({ c, on, toggle, edit }: { c: CalendarItem; on: boolean; toggle: (on: boolean) => void; edit: () => void }) {
  return (
    <li className="group hover:bg-accent/50 flex items-center gap-1 rounded-md pr-1">
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 px-2 py-1.5 text-sm max-md:py-2.5">
        <Checkbox
          checked={on}
          onCheckedChange={(v) => toggle(v === true)}
          className="data-[state=checked]:border-(--c) data-[state=checked]:bg-(--c) data-[state=checked]:text-(--t) border-(--c)"
          style={{ "--c": c.colorHex, "--t": textOn(c.colorHex) } as React.CSSProperties}
        />
        <span className="truncate">{c.name}</span>
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
  const mine = calendars.filter((c) => !c.google);
  const gcals = calendars.filter((c) => c.google);
  const link = google.link;

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
          {mine.map((c) => (
            <Item key={c.id} c={c} on={!hidden.has(c.id)} toggle={(on) => toggle(c, on)} edit={() => setEdit({ ...c })} />
          ))}
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
        </div>
        {!link ? (
          <div className="space-y-2 px-2 pt-1">
            <p className="text-muted-foreground text-caption">구글 일정을 가져와 여기서 함께 볼 수 있어요. 안 해도 이 앱 캘린더는 그대로 써요.</p>
            {google.enabled ? (
              <Button variant="outline" size="sm" className="w-full max-md:h-11" asChild>
                <a href="/api/v1/google/connect">
                  <GoogleMark /> 구글 캘린더 연동하기
                </a>
              </Button>
            ) : (
              <p className="text-muted-foreground bg-muted/50 rounded-md p-2 text-caption">서버에 구글 앱 키(GOOGLE_CLIENT_ID)를 넣으면 연동할 수 있어요 · docs/operations.md</p>
            )}
          </div>
        ) : (
          <>
            {link.status === "broken" && (
              <div className="bg-destructive/10 mx-2 space-y-2 rounded-md p-2 text-caption">
                <p>구글 캘린더 연결이 끊겼어요.</p>
                <Button variant="outline" size="sm" className="w-full" asChild>
                  <a href="/api/v1/google/connect">다시 연결</a>
                </Button>
              </div>
            )}
            <ul>
              {gcals.map((c) => (
                <Item key={c.id} c={c} on={!hidden.has(c.id)} toggle={(on) => toggle(c, on)} edit={() => setEdit({ ...c })} />
              ))}
            </ul>
            <div className="text-muted-foreground flex items-center gap-2 px-2 text-caption">
              <span className="min-w-0 truncate" title={link.account ?? undefined}>
                {link.account}
                {link.syncedAt && ` · ${ago(link.syncedAt)} 가져옴`}
              </span>
              <button type="button" className="hover:text-foreground ml-auto shrink-0 underline-offset-2 hover:underline" onClick={() => setUnlink(true)}>
                연동 해제
              </button>
            </div>
          </>
        )}
      </section>

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
