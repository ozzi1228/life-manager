"use client";

// 메모 쓰기·고치기: 제목 + 내용. 저장 버튼(또는 Ctrl+S), 고친 게 남아 있으면 창 닫을 때 물어봄
import { ChevronLeft, Ellipsis } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { addMemoAction, editMemoAction, removeMemoAction } from "@/app/actions/memos";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { MemoBody } from "./memo-body";

type Memo = { id: string; version: number; title: string; body: string };

export function MemoEditor({ memo, when }: { memo?: Memo; when?: string }) {
  const router = useRouter();
  const [saved, setSaved] = useState({ id: memo?.id, version: memo?.version ?? 0, title: memo?.title ?? "", body: memo?.body ?? "" });
  const [title, setTitle] = useState(saved.title);
  const [body, setBody] = useState(saved.body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [asking, setAsking] = useState(false);
  const dirty = title !== saved.title || body !== saved.body;
  const empty = !title.trim() && !body.trim();

  async function save() {
    if (!dirty || empty || busy) return;
    setBusy(true);
    setError("");
    const input = { title, body };
    const r = await (saved.id ? editMemoAction(saved.id, saved.version, input) : addMemoAction(input)).catch(() => null);
    setBusy(false);
    if (!r) return setError("연결이 끊겨 저장하지 못했어요. 다시 눌러 주세요");
    if (!r.ok) return setError(r.error.code === "VERSION_CONFLICT" ? "다른 기기에서 먼저 고쳤어요. 새로 고침해 주세요" : (r.error.fields?.[0]?.message ?? r.error.message));
    if (saved.id) setSaved({ ...saved, version: (r.data as { version: number }).version, title, body });
    else {
      const id = (r.data as { id: string }).id;
      setSaved({ id, version: 1, title, body });
      router.replace(`/records/memos/${id}`);
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        save();
      }
    };
    const onLeave = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    addEventListener("keydown", onKey);
    addEventListener("beforeunload", onLeave);
    return () => {
      removeEventListener("keydown", onKey);
      removeEventListener("beforeunload", onLeave);
    };
  });

  async function remove() {
    if (!saved.id) return;
    const r = await removeMemoAction(saved.id).catch(() => null);
    if (r?.ok) location.replace("/records/memos");
  }

  return (
    <article className="mx-auto w-full max-w-3xl space-y-3 px-4 py-4 md:px-8 md:py-6">
      <div className="flex items-center gap-2">
        <Link href="/records/memos" className="text-muted-foreground hover:text-foreground -ml-2 inline-flex h-10 items-center gap-1 px-2 text-sm">
          <ChevronLeft className="size-4" />
          메모
        </Link>
        <span className="flex-1" />
        {saved.id && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="max-md:size-11" aria-label="메모 더 보기">
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="text-destructive-text" onSelect={() => setAsking(true)}>
                메모 지우기
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <Button disabled={!dirty || empty || busy} onClick={save}>
          {busy && <Spinner />} 저장
        </Button>
      </div>
      {error && <p className="text-destructive-text text-sm">{error}</p>}
      <input
        aria-label="제목"
        maxLength={100}
        placeholder="제목"
        autoFocus={!memo}
        className="placeholder:text-muted-foreground text-title w-full bg-transparent font-bold outline-none"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      {when && <p className="text-muted-foreground text-caption tabular-nums">{when}</p>}
      <MemoBody initial={saved.body} onChange={setBody} />
      <AlertDialog open={asking} onOpenChange={setAsking}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>이 메모를 지울까요?</AlertDialogTitle>
            <AlertDialogDescription>휴지통에서 되살릴 수 있어요.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={remove}>
              지우기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
}
