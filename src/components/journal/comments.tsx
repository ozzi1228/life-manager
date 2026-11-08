"use client";

// 일기 댓글(글 보기 아래): 나중의 내가 다는 한마디. 언제 달았는지 날짜·시간을 늘 함께 보여 줌
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { addCommentAction, removeCommentAction } from "@/app/actions/journal";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

export type Comment = { id: string; body: string; when: string; after: string | null };

export function Comments({ entryId, comments }: { entryId: string; comments: Comment[] }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!text.trim() || busy) return;
    setBusy(true);
    const r = await addCommentAction(entryId, text).catch(() => null);
    setBusy(false);
    if (!r) return toast.error("연결이 끊겨 남기지 못했어요. 다시 눌러 주세요");
    if (!r.ok) return toast.error(r.error.fields?.[0]?.message ?? r.error.message);
    setText("");
    router.refresh();
  }
  async function remove(id: string) {
    const r = await removeCommentAction(id).catch(() => null);
    if (!r?.ok) return toast.error("지우지 못했어요. 다시 눌러 주세요");
    router.refresh();
  }

  return (
    <section aria-label="댓글" className="space-y-3 border-t pt-5">
      <h2 className="font-semibold">
        댓글{comments.length > 0 && <span className="text-muted-foreground ml-1.5 text-sm font-normal tabular-nums">{comments.length}</span>}
      </h2>
      {comments.length > 0 && (
        <ul className="space-y-2">
          {comments.map((c) => (
            <li key={c.id} className="bg-muted/50 group rounded-lg px-3 py-2.5">
              <div className="flex items-center gap-2">
                <p className="text-muted-foreground min-w-0 flex-1 text-caption tabular-nums">
                  {c.when}
                  {c.after && <span className="text-link ml-1.5">· {c.after}</span>}
                </p>
                <Button variant="ghost" size="icon" className="text-muted-foreground -my-1 size-8 max-md:size-9" aria-label="댓글 지우기" onClick={() => remove(c.id)}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <p className="text-sm break-words whitespace-pre-wrap">{c.body}</p>
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-2">
        <Textarea
          aria-label="댓글"
          placeholder="지금의 내가 이 일기에 한마디"
          maxLength={2000}
          rows={2}
          className="text-base md:text-sm"
          value={text}
          readOnly={busy}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) add(); // Ctrl+Enter로 바로 남기기
          }}
        />
        <div className="flex justify-end">
          <Button disabled={!text.trim() || busy} onClick={add}>
            {busy && <Spinner />} 댓글 남기기
          </Button>
        </div>
      </div>
    </section>
  );
}
