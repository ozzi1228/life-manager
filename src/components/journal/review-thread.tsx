"use client";

// 리뷰 글타래 만들기·고치기 창, 글타래 머리(제목·설명 + ⋯ 수정·삭제)
import { Ellipsis, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { addThreadAction, editThreadAction, removeThreadAction } from "@/app/actions/reviews";
import { ResponsiveModal } from "@/components/app/responsive";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

type Thread = { id: string; version: number; title: string; memo: string | null };

function ThreadDialog({ thread, close }: { thread?: Thread; close: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState(thread?.title ?? "");
  const [memo, setMemo] = useState(thread?.memo ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    const input = { title, memo: memo.trim() || null };
    const r = await (thread ? editThreadAction(thread.id, thread.version, input) : addThreadAction(input)).catch(() => null);
    setBusy(false);
    if (!r) return setError("연결이 끊겨 저장하지 못했어요. 다시 눌러 주세요");
    if (!r.ok) return setError(r.error.code === "VERSION_CONFLICT" ? "다른 기기에서 먼저 고쳤어요. 새로 고침해 주세요" : (r.error.fields?.[0]?.message ?? r.error.message));
    close();
    if (thread) router.refresh();
    else router.push(`/records/reviews/${(r.data as { id: string }).id}`);
  }

  return (
    <ResponsiveModal
      open
      onOpenChange={(o) => !o && close()}
      title={thread ? "글타래 고치기" : "새 리뷰 글타래"}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={close}>
            취소
          </Button>
          <Button disabled={!title.trim() || busy} onClick={save}>
            {busy && <Spinner />} {thread ? "저장" : "만들기"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field data-invalid={!!error || undefined}>
          <FieldLabel htmlFor="thread-title">제목</FieldLabel>
          <Input id="thread-title" autoFocus maxLength={100} placeholder="예: 동네 카페, 올해 읽은 책" className="h-11 text-base md:h-9 md:text-sm" value={title} onChange={(e) => setTitle(e.target.value)} />
          {error ? <FieldError>{error}</FieldError> : <FieldDescription>이 주제로 후기를 계속 이어서 달아요</FieldDescription>}
        </Field>
        <Field>
          <FieldLabel htmlFor="thread-memo">설명 (선택)</FieldLabel>
          <Input id="thread-memo" maxLength={200} className="h-11 text-base md:h-9 md:text-sm" value={memo} onChange={(e) => setMemo(e.target.value)} />
        </Field>
      </div>
    </ResponsiveModal>
  );
}

export function NewThreadButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus /> 새 글타래
      </Button>
      {open && <ThreadDialog close={() => setOpen(false)} />}
    </>
  );
}

export function ThreadHeader({ thread, count }: { thread: Thread; count: number }) {
  const [editing, setEditing] = useState(false);
  const [asking, setAsking] = useState(false);
  async function remove() {
    const r = await removeThreadAction(thread.id).catch(() => null);
    if (r?.ok) location.replace("/records/reviews"); // 지운 글타래 주소를 다시 부르지 않게 페이지째 이동
  }
  return (
    <header className="flex items-start gap-2">
      <div className="min-w-0 flex-1 space-y-1">
        <h1 className="text-title font-bold break-words">{thread.title}</h1>
        {thread.memo && <p className="text-muted-foreground text-sm break-words">{thread.memo}</p>}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="max-md:size-11" aria-label="글타래 더 보기">
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditing(true)}>제목·설명 고치기</DropdownMenuItem>
          <DropdownMenuItem className="text-destructive-text" onSelect={() => setAsking(true)}>
            글타래 지우기
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {editing && <ThreadDialog thread={thread} close={() => setEditing(false)} />}
      <AlertDialog open={asking} onOpenChange={setAsking}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>‘{thread.title}’ 글타래를 지울까요?</AlertDialogTitle>
            <AlertDialogDescription>{count ? `후기 ${count}개도 함께 휴지통으로 가요. ` : ""}휴지통에서 되살릴 수 있어요.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={remove}>
              지우기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  );
}
