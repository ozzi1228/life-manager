"use client";

// 일기 목록 무한 스크롤: 처음 한 쪽은 서버가 그려 주고, 맨 아래가 보이면 다음 쪽을 이어 붙임
import { useEffect, useRef, useState } from "react";
import { moreEntries } from "@/app/actions/journal";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { Entry } from "./entry-editor";
import { EntryList } from "./entry-list";

type Topic = { id: string; name: string; colorHex: string };

export function JournalFeed({ first, more: firstMore, q, topic, range, topics, today }: { first: Entry[]; more: boolean; q: string; topic: string | null; range: { from: string; to: string } | null; topics: Topic[]; today: string }) {
  const [items, setItems] = useState(first);
  const [more, setMore] = useState(firstMore);
  // 서버가 새 목록을 보내면(글 저장·삭제 뒤 새로 고침) 그걸로 다시 시작. 이 화면은 Next가 상태째 보관하므로
  // 처음 값만 쓰면 저장한 글이 목록에 안 보였음
  const [seen, setSeen] = useState(first);
  if (seen !== first) {
    setSeen(first);
    setItems(first);
    setMore(firstMore);
  }
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const loading = useRef(false);

  async function load() {
    if (loading.current) return;
    loading.current = true;
    setBusy(true);
    setFailed(false);
    const r = await moreEntries(q, topic, items.length, range?.from, range?.to).catch(() => null);
    loading.current = false;
    setBusy(false);
    if (!r?.ok) return setFailed(true);
    setItems((cur) => [...cur, ...r.data.items.filter((e) => !cur.some((c) => c.id === e.id))]);
    setMore(r.data.more);
  }

  // 맨 아래가 화면 가까이(400px) 오면 다음 쪽
  useEffect(() => {
    if (!more || failed || !end.current) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && load(), { rootMargin: "400px" });
    io.observe(end.current);
    return () => io.disconnect();
  });

  return (
    <div className="space-y-6">
      <EntryList entries={items} topics={topics} today={today} />
      <div ref={end} className="flex min-h-10 justify-center">
        {busy ? (
          <Spinner />
        ) : failed ? (
          <Button variant="outline" onClick={load}>
            다시 불러오기
          </Button>
        ) : (
          !more && items.length > 10 && <p className="text-muted-foreground text-sm">맨 처음 일기까지 다 봤어요</p>
        )}
      </div>
    </div>
  );
}
