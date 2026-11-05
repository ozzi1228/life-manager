"use client";

// 일기 쓰기·고치기 (SCR-JRN-03, 08 §2): 날짜·주제·제목·본문·사진 10장. 전체 화면
// 쓰는 중 5초마다 이 기기에 임시 저장(08 §2.5) → 다시 열면 이어 쓰기
// ponytail: 본문은 마크다운 글자 그대로(Textarea). 서식 도구가 필요해지면 에디터 라이브러리(Q-070)
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { addEntry, editEntry, removeEntry } from "@/app/actions/journal";
import { PhotoPicker, type Photo } from "@/components/app/photo-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { fromYmd, ymd } from "@/lib/format";

export type Entry = { id: string; version: number; date: string; topicId: string | null; title: string | null; bodyMd: string; photos: Photo[] };
type Topic = { id: string; name: string; colorHex: string };
type Draft = { date: string; topicId: string | null; title: string; body: string; photos: Photo[]; at: number };

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
  const [date, setDate] = useState(entry?.date ?? today);
  const [topicId, setTopicId] = useState<string | null>(entry?.topicId ?? null);
  const [title, setTitle] = useState(entry?.title ?? "");
  const [body, setBody] = useState(entry?.bodyMd ?? "");
  const [photos, setPhotos] = useState<Photo[]>(entry?.photos ?? []);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dateOpen, setDateOpen] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const key = useRef(crypto.randomUUID());

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
      if (!s.title && !s.body && !s.photos.length) return;
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
    setError("");
    const input = { date, topicId, title: title.trim() || null, bodyMd: body, photoIds: photos.map((p) => p.id) };
    // 연결이 끊기면 요청 자체가 실패함 → 아래 실패 처리로(임시 저장 + 안내)
    const r = await (entry ? editEntry(entry.id, entry.version, input) : addEntry(key.current, input)).catch(() => ({ ok: false as const, error: { code: "OFFLINE", message: "연결이 끊겨 저장하지 못했어요. 쓴 내용은 이 기기에 임시 저장돼 있어요. 연결되면 다시 눌러 주세요", fields: undefined } }));
    setBusy(false);
    if (!r.ok) {
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
    router.push(`/records?month=${date.slice(0, 7)}`);
    router.refresh();
  }

  async function remove() {
    if (!entry) return;
    await removeEntry(entry.id);
    localStorage.removeItem(draftKey(entry.id));
    // 이동만(목록은 이동하며 새로 불러옴). 바로 refresh하면 지운 일기 주소를 다시 불러와 404가 뜸
    router.replace(`/records?month=${entry.date.slice(0, 7)}`);
  }

  const empty = !title.trim() && !body.trim() && !photos.length;
  const listHref = `/records?month=${(entry?.date ?? today).slice(0, 7)}`;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-4 md:px-8 md:py-6">
      <Link href={listHref} className="text-muted-foreground hover:text-foreground -ml-2 inline-flex h-10 items-center gap-1 px-2 text-sm">
        <ChevronLeft className="size-4" />
        일기
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
            <Button variant="outline" className="tabular-nums">{date}</Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={fromYmd(date)} onSelect={(d) => (d && setDate(ymd(d)), setDateOpen(false))} />
          </PopoverContent>
        </Popover>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="주제">
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
        </div>
      </div>

      <Input aria-label="제목" placeholder="제목 (선택)" maxLength={100} className="focus-visible:border-primary h-12 rounded-none border-0 border-b px-0 text-title font-semibold shadow-none placeholder:font-normal focus-visible:ring-0" value={title} onChange={(e) => setTitle(e.target.value)} />
      <Textarea
        aria-label="본문"
        placeholder="오늘 있었던 일을 적어 보세요"
        maxLength={50_000}
        className="min-h-[28vh] resize-none md:min-h-[40vh] border-0 px-0 text-base leading-7 shadow-none focus-visible:ring-0 md:text-body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />

      <PhotoPicker value={photos} onChange={setPhotos} onBusy={setUploading} purpose="journal_photo" />

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
