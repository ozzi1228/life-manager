// 기록 · 메모: 제목 + 내용 메모 목록(최근에 고친 순). 누르면 쓰고 고침
import { Plus } from "lucide-react";
import Link from "next/link";
import { Page } from "@/components/app/page-shell";
import { EmptyState } from "@/components/app/states";
import { RecordsTabs } from "@/components/journal/records-tabs";
import { Button } from "@/components/ui/button";
import { seoulWhen } from "@/lib/format";
import { memoList } from "@/server/memos";
import { pageCtx } from "@/server/session";

export const metadata = { title: "메모 · 우나" };

const NewMemo = () => (
  <Button asChild>
    <Link href="/records/memos/new">
      <Plus /> 새 메모
    </Link>
  </Button>
);

export default async function MemosPage() {
  const ctx = await pageCtx();
  const memos = await memoList(ctx);
  return (
    <Page>
      <RecordsTabs />
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">제목 달고 편하게 적어 두는 메모</p>
        <NewMemo />
      </div>
      {memos.length ? (
        <ul className="bg-card divide-y rounded-xl border">
          {memos.map((m) => (
            <li key={m.id}>
              <Link href={`/records/memos/${m.id}`} className="hover:bg-accent/40 block space-y-1 p-4">
                <span className="block truncate font-semibold">{m.title || m.body.trim().split("\n")[0].slice(0, 60) || "제목 없음"}</span>
                {m.title && m.body.trim() && <span className="text-muted-foreground line-clamp-2 block text-sm">{m.body.slice(0, 200)}</span>}
                <span className="text-muted-foreground block text-caption tabular-nums">{seoulWhen(m.updatedAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState pet="hoya" title="아직 메모가 없어요" description="떠오른 생각이나 적어 둘 것들을 제목 달아 남겨 보세요." action={<NewMemo />} />
      )}
    </Page>
  );
}
