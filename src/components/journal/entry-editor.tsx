"use client";

// 일기 쓰기·고치기 (SCR-JRN-03, 08 §2): 날짜(없어도 됨)·주제·제목·본문·사진 10장. 전체 화면
// 쓰는 중 5초마다 이 기기에 임시 저장(08 §2.5) → 다시 열면 이어 쓰기
// 본문은 글 사이에 사진이 놓이는 편집 칸(JournalBody). 저장은 글자 + 사진 줄(src/lib/journal-body.ts)
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { addEntry, addTopicAction, colorTopicAction, editEntry, removeEntry, removeTopicAction, renameTopicAction, reorderTopicsAction } from "@/app/actions/journal";
import { CategoryEditor } from "@/components/app/category-editor";
import type { Photo } from "@/components/app/photo-picker";
import { JournalBody } from "@/components/journal/journal-body";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { fromYmd, ymd } from "@/lib/format";
import { cn } from "@/lib/utils";

export type Entry = { id: string; version: number; date: string | null; topicId: string | null; title: string | null; bodyMd: string; photos: Photo[] };
type Topic = { id: string; name: string; colorHex: string };
type Draft = { date: string | null; topicId: string | null; title: string; body: string; photos: Photo[]; at: number };

const draftKey = (id?: string) => `oona.journal-draft:${id ?? "new"}`;
const readDraft = (id?: string): Draft | null => {
  try {
    return JSON.parse(localStorage.getItem(draftKey(id)) ?? "null");
  } catch {
    return null;
  }
};

export function EntryEditor({ entry, topics, today }: { entry?: Entry; topics: Topic[]; today: string }) {
  const router = useRouter();
  const [date, setDate] = useState<string | null>(entry ? entry.date : today); // null = 날짜 없는 글
  const [topicId, setTopicId] = useState<string | null>(entry?.topicId ?? null);
  const [title, setTitle] = useState(entry?.title ?? "");
  const [body, setBody] = useState(entry?.bodyMd ?? "");
  const [photos, setPhotos] = useState<Photo[]>(entry?.photos ?? []);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dateOpen, setDateOpen] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [bodyKey, setBodyKey] = useState(0); // 이어 쓰기로 본문을 바꾸면 편집 칸을 새로 그림
  const key = useRef(crypto.randomUUID());
  const saved = useRef(false); // 저장되면 임시 저장을 멈춤(저장 중·뒤에 다시 써서 "쓰다 만 글"이 남던 문제)

  // 다시 열었을 때 이 기기에 남은 임시 저장이 있으면 이어 쓰기 제안
  useEffect(() => {
    const d = readDraft(entry?.id);
    if (d && (d.body !== (entry?.bodyMd ?? "") || d.title !== (entry?.title ?? "") || d.photos.length !== (entry?.photos.length ?? 0))) queueMicrotask(() => setDraft(d));
  }, [entry]);

  // 5초마다 임시 저장(바뀐 게 있을 때만)
  const state = { date, topicId, title, body, photos };
  const latest = useRef(state);
  useEffect(() => {
    latest.current = state;
  });
  useEffect(() => {
    const t = setInterval(() => {
      const s = latest.current;
      if (saved.current || (!s.title && !s.body && !s.photos.length)) return;
      try {
        localStorage.setItem(draftKey(entry?.id), JSON.stringify({ ...s, at: Date.now() }));
      } catch {
        // 저장 공간을 쓸 수 없으면 임시 저장만 건너뜀
      }
    }, 5000);
    return () => clearInterval(t);
  }, [entry?.id]);

  async function save() {
    setBusy(true);
    saved.current = true; // 보내는 동안 임시 저장 멈춤(실패하면 아래에서 다시 켜고 바로 임시 저장)
    setError("");
    const input = { date, topicId, title: title.trim() || null, bodyMd: body, photoIds: photos.map((p) => p.id) };
    // 연결이 끊기면 요청 자체가 실패함 → 아래 실패 처리로(임시 저장 + 안내)
    const r = await (entry ? editEntry(entry.id, entry.version, input) : addEntry(key.current, input)).catch(() => ({ ok: false as const, error: { code: "OFFLINE", message: "연결이 끊겨 저장하지 못했어요. 쓴 내용은 이 기기에 임시 저장돼 있어요. 연결되면 다시 눌러 주세요", fields: undefined } }));
    setBusy(false);
    if (!r.ok) {
      saved.current = false;
      // 5초마다 하는 임시 저장을 기다리지 않고 지금 쓴 내용을 바로 남김(아래 안내가 "임시 저장돼 있어요"라고 말하므로)
      try {
        localStorage.setItem(draftKey(entry?.id), JSON.stringify({ ...latest.current, at: Date.now() }));
      } catch {
        // 저장 공간을 쓸 수 없으면 건너뜀
      }
      return setError(
        r.error.code === "VERSION_CONFLICT"
          ? "다른 기기에서 먼저 수정했어요. 지금 쓴 내용은 이 기기에 임시 저장돼 있어요"
          : r.error.code === "NOT_FOUND" && entry
            ? "다른 기기에서 지운 일기예요. 휴지통에서 되살린 뒤 다시 저장해 주세요. 지금 쓴 내용은 이 기기에 임시 저장돼 있어요"
            : (r.error.fields?.[0]?.message ?? r.error.message),
      );
    }
    localStorage.removeItem(draftKey(entry?.id));
    // 고친 글은 그 글 보기로, 새 글은 목록으로(날짜 없는 글은 목록 맨 위 — 어느 달에서나)
    router.push(entry ? `/records/journal/${entry.id}` : date ? `/records?month=${date.slice(0, 7)}` : "/records");
    router.refresh();
  }

  async function remove() {
    if (!entry) return;
    await removeEntry(entry.id);
    localStorage.removeItem(draftKey(entry.id));
    // 목록을 새로 받아 오도록 페이지째 이동(router.replace는 예전 목록을 보여 줌, refresh는 지운 일기 주소를 다시 불러와 404)
    location.replace(entry.date ? `/records?month=${entry.date.slice(0, 7)}` : "/records");
  }

  const empty = !title.trim() && !body.trim() && !photos.length;
  /** 분류 편집 뒤 목록 새로 불러오기 */
  const done = <R extends { ok: boolean }>(r: R) => (r.ok && router.refresh(), r);
  // 취소·뒤로: 고치던 글은 그 글 보기로, 새 글은 목록으로
  const listHref = entry ? `/records/journal/${entry.id}` : `/records?month=${today.slice(0, 7)}`;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-4 md:px-8 md:py-6">
      <Link href={listHref} className="text-muted-foreground hover:text-foreground -ml-2 inline-flex h-10 items-center gap-1 px-2 text-sm">
        <ChevronLeft className="size-4" />
        {entry ? "글 보기" : "일기"}
      </Link>
      {draft && (
        <div role="status" className="bg-accent flex flex-wrap items-center gap-2 rounded-lg p-3 text-sm">
          이 기기에 쓰다 만 글이 있어요.
          <Button
            size="sm"
            onClick={() => {
              setDate(draft.date);
              setTopicId(draft.topicId);
              setTitle(draft.title);
              setBody(draft.body);
              setPhotos(draft.photos);
              setBodyKey((k) => k + 1);
              setDraft(null);
            }}
          >
            이어 쓰기
          </Button>
          <Button size="sm" variant="ghost" onClick={() => (localStorage.removeItem(draftKey(entry?.id)), setDraft(null))}>
            버리기
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Popover open={dateOpen} onOpenChange={setDateOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className={cn("tabular-nums", !date && "text-muted-foreground")}>{date ?? "날짜 없음"}</Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={date ? fromYmd(date) : undefined} defaultMonth={fromYmd(date ?? today)} onSelect={(d) => (d && setDate(ymd(d)), setDateOpen(false))} />
            <div className="border-t p-2">
              <Button variant="ghost" size="sm" className="w-full" disabled={!date} onClick={() => (setDate(null), setDateOpen(false))}>
                날짜 없이 쓰기
              </Button>
            </div>
          </PopoverContent>
        </Popover>
        <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="분류">
          {topics.map((t) => (
            <Button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={topicId === t.id}
              size="sm"
              variant={topicId === t.id ? "outline" : "ghost"}
              className={topicId === t.id ? "border-primary bg-primary/10 rounded-full max-md:min-h-10" : "rounded-full max-md:min-h-10"}
              onClick={() => setTopicId(topicId === t.id ? null : t.id)}
            >
              <span className="size-2 rounded-full" style={{ background: t.colorHex }} />
              {t.name}
            </Button>
          ))}
          {/* 분류 편집: 이름·색·순서·지우기(바로 저장, 목록은 새로 불러옴) */}
          <CategoryEditor
            title="일기 분류 편집"
            description="이름과 색을 마음대로 정해요. 이 순서대로 보여요"
            items={topics.map((t) => ({ key: t.id, name: t.name, color: t.colorHex }))}
            onAdd={async (name) => done(await addTopicAction(name))}
            onRename={async (it, name) => done(await renameTopicAction(it.key, name))}
            onColor={async (it, hex) => done(hex ? await colorTopicAction(it.key, hex) : { ok: true as const })}
            onRemove={async (it) => {
              const r = await removeTopicAction(it.key);
              if (r.ok && topicId === it.key) setTopicId(null);
              return done(r);
            }}
            onReorder={async (ids) => done(await reorderTopicsAction(ids))}
            removeNote="이 분류의 일기는 분류 없음으로 남아요"
            countLabel="편"
            className="h-9 max-md:h-10"
          />
        </div>
      </div>

      <Input aria-label="제목" placeholder="제목 (선택)" maxLength={100} className="focus-visible:border-primary h-12 rounded-none border-0 border-b px-0 text-title font-semibold shadow-none placeholder:font-normal focus-visible:ring-0" value={title} onChange={(e) => setTitle(e.target.value)} />
      <JournalBody key={bodyKey} initial={body} photos={photos} placeholder="오늘 있었던 일을 적어 보세요" onBusy={setUploading} onChange={(v) => (setBody(v.body), setPhotos(v.photos))} />

      {error && <p className="text-destructive-text text-sm">{error}</p>}

      <div data-pet-avoid className="bg-background/95 sticky bottom-0 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex gap-2 border-t py-3 backdrop-blur">
        {entry && (
          <Button variant="ghost" className="text-destructive-text" onClick={remove}>
            삭제
          </Button>
        )}
        <Button variant="outline" className="ml-auto" asChild>
          <Link href={listHref}>취소</Link>
        </Button>
        <Button disabled={empty || busy || uploading} onClick={save}>
          {busy && <Spinner />} 저장
        </Button>
      </div>
    </div>
  );
}
