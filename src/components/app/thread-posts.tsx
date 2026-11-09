"use client";

// 이어 다는 글 목록 + 쓰기 칸: 일기 댓글(글 보기 아래)·리뷰 후기(글타래 안). 언제 썼는지 날짜·시간을 늘 함께 보여 줌
// 저장·지우기는 부르는 쪽이 서버 동작으로 넘김(예: addCommentAction.bind(null, 일기 id))
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

import type { ActionResult } from "@/server/api";

export type Post = { id: string; body: string; when: string; after?: string | null };

export function ThreadPosts({
  posts: comments,
  add: save,
  remove: drop,
  title,
  placeholder,
  button,
}: {
  posts: Post[];
  add: (body: string) => Promise<ActionResult<unknown>>;
  remove: (id: string) => Promise<ActionResult<unknown>>;
  title: string;
  placeholder: string;
  button: string;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!text.trim() || busy) return;
    setBusy(true);
    const r = await save(text).catch(() => null);
    setBusy(false);
    if (!r) return toast.error("연결이 끊겨 남기지 못했어요. 다시 눌러 주세요");
    if (!r.ok) return toast.error(r.error.fields?.[0]?.message ?? r.error.message);
    setText("");
    router.refresh();
  }
  async function remove(id: string) {
    const r = await drop(id).catch(() => null);
    if (!r?.ok) return toast.error("지우지 못했어요. 다시 눌러 주세요");
    router.refresh();
  }

  return (
    <section aria-label={title} className="space-y-3 border-t pt-5">
      <h2 className="font-semibold">
        {title}
        {comments.length > 0 && <span className="text-muted-foreground ml-1.5 text-sm font-normal tabular-nums">{comments.length}</span>}
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
                <Button variant="ghost" size="icon" className="text-muted-foreground -my-1 size-8 max-md:size-9" aria-label={`${title} 지우기`} onClick={() => remove(c.id)}>
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
          aria-label={title}
          placeholder={placeholder}
          maxLength={5000}
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
            {busy && <Spinner />} {button}
          </Button>
        </div>
      </div>
    </section>
  );
}
