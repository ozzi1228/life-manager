// 리뷰 글타래 하나: 제목·설명, 후기(오래된 것부터, 쓴 날짜·시간), 맨 아래 후기 쓰기
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { addPostAction, removePostAction } from "@/app/actions/reviews";
import { ThreadPosts } from "@/components/app/thread-posts";
import { ThreadHeader } from "@/components/journal/review-thread";
import { seoulWhen } from "@/lib/format";
import { threadWithPosts } from "@/server/reviews";
import { pageCtx } from "@/server/session";

export default async function ReviewThreadPage({ params }: PageProps<"/records/reviews/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const ctx = await pageCtx();
  const t = await threadWithPosts(ctx, id).catch(() => null);
  if (!t) notFound();
  return (
    <article className="mx-auto w-full max-w-3xl space-y-4 px-4 py-4 md:px-8 md:py-6">
      <Link href="/records/reviews" className="text-muted-foreground hover:text-foreground -ml-2 inline-flex h-10 items-center gap-1 px-2 text-sm">
        <ChevronLeft className="size-4" />
        리뷰
      </Link>
      <ThreadHeader thread={{ id: t.id, version: t.version, title: t.title, memo: t.memo }} count={t.posts.length} />
      <ThreadPosts
        title="후기"
        placeholder="후기를 이어서 남겨 보세요"
        button="후기 남기기"
        add={addPostAction.bind(null, t.id)}
        remove={removePostAction}
        posts={t.posts.map((p) => ({ id: p.id, body: p.body, when: seoulWhen(p.createdAt) }))}
      />
    </article>
  );
}
