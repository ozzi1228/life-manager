"use client";

// 일기 쓰기·고치기 (SCR-JRN-03, 08 §2): 날짜·주제·제목·본문·사진 10장. 전체 화면
// 쓰는 중 5초마다 이 기기에 임시 저장(08 §2.5) → 다시 열면 이어 쓰기
// ponytail: 본문은 마크다운 글자 그대로(Textarea). 서식 도구가 필요해지면 에디터 라이브러리(Q-070)
import { ImagePlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { addEntry, editEntry, removeEntry, restoreEntry } from "@/app/actions/journal";
import { toastUndo } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { dateLabel, fromYmd, ymd } from "@/lib/format";

type Photo = { id: string; width: number; height: number };
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
  const [uploading, setUploading] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dateOpen, setDateOpen] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const key = useRef(crypto.randomUUID());
  const file = useRef<HTMLInputElement>(null);

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

  async function upload(files: FileList | null) {
    const list = [...(files ?? [])].slice(0, 10 - photos.length);
    if (files && files.length > list.length) toast("사진은 10장까지 넣을 수 있어요");
    setUploading((n) => n + list.length);
    for (const f of list) {
      const form = new FormData();
      form.set("file", f);
      try {
        const r = await fetch("/api/v1/uploads", { method: "POST", body: form, headers: { "idempotency-key": crypto.randomUUID() } });
        const j = await r.json();
        if (!r.ok) toast(j.error?.message ?? "사진을 올리지 못했어요");
        else setPhotos((p) => [...p, j.data]);
      } catch {
        toast("사진을 올리지 못했어요. 연결을 확인해 주세요");
      }
      setUploading((n) => n - 1);
    }
  }

  async function save() {
    setBusy(true);
    setError("");
    const input = { date, topicId, title: title.trim() || null, bodyMd: body, photoIds: photos.map((p) => p.id) };
    const r = entry ? await editEntry(entry.id, entry.version, input) : await addEntry(key.current, input);
    setBusy(false);
    if (!r.ok) return setError(r.error.code === "VERSION_CONFLICT" ? "다른 기기에서 먼저 수정했어요. 지금 쓴 내용은 이 기기에 임시 저장돼 있어요" : (r.error.fields?.[0]?.message ?? r.error.message));
    localStorage.removeItem(draftKey(entry?.id));
    toast(entry ? "고쳤어요" : "기록했어요");
    router.push(`/records?month=${date.slice(0, 7)}`);
    router.refresh();
  }

  async function remove() {
    if (!entry) return;
    await removeEntry(entry.id);
    localStorage.removeItem(draftKey(entry.id));
    router.push(`/records?month=${entry.date.slice(0, 7)}`);
    router.refresh();
    toastUndo("휴지통으로 옮겼어요", async () => {
      await restoreEntry(entry.id);
      router.refresh();
    });
  }

  const empty = !title.trim() && !body.trim() && !photos.length;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-4 md:px-8 md:py-6">
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
            <Button variant="outline">{dateLabel(date, fromYmd(today))}</Button>
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
              variant={topicId === t.id ? "secondary" : "ghost"}
              className={topicId === t.id ? "ring-primary rounded-full ring-2" : "rounded-full"}
              onClick={() => setTopicId(topicId === t.id ? null : t.id)}
            >
              <span className="size-2 rounded-full" style={{ background: t.colorHex }} />
              {t.name}
            </Button>
          ))}
        </div>
      </div>

      <Input aria-label="제목" placeholder="제목 (선택)" maxLength={100} className="h-12 border-0 px-0 text-title font-semibold shadow-none focus-visible:ring-0" value={title} onChange={(e) => setTitle(e.target.value)} />
      <Textarea
        aria-label="본문"
        placeholder="오늘 있었던 일을 적어 보세요"
        maxLength={50_000}
        className="min-h-[40vh] resize-none border-0 px-0 text-base leading-7 shadow-none focus-visible:ring-0 md:text-body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />

      <div className="flex flex-wrap gap-2">
        {photos.map((p) => (
          <div key={p.id} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element -- 로그인한 본인만 보는 사진(이 서버가 직접 보냄) */}
            <img src={`/api/v1/attachments/${p.id}?v=thumb`} alt="" className="size-24 rounded-lg object-cover" />
            <button
              type="button"
              aria-label="사진 빼기"
              className="bg-foreground/70 text-background absolute top-1 right-1 flex size-6 items-center justify-center rounded-full"
              onClick={() => setPhotos((list) => list.filter((x) => x.id !== p.id))}
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
        {Array.from({ length: uploading }, (_, i) => (
          <div key={i} className="bg-muted flex size-24 items-center justify-center rounded-lg">
            <Spinner />
          </div>
        ))}
        {photos.length + uploading < 10 && (
          <button type="button" onClick={() => file.current?.click()} className="text-muted-foreground hover:bg-accent flex size-24 flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-caption">
            <ImagePlus className="size-6" /> 사진 {photos.length}/10
          </button>
        )}
        <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => (upload(e.target.files), (e.target.value = ""))} />
      </div>

      {error && <p className="text-destructive-text text-sm">{error}</p>}

      <div className="bg-background/95 sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] flex gap-2 border-t py-3 backdrop-blur md:bottom-0">
        {entry && (
          <Button variant="ghost" className="text-destructive-text" onClick={remove}>
            삭제
          </Button>
        )}
        <Button variant="outline" className="ml-auto" onClick={() => router.back()}>
          취소
        </Button>
        <Button disabled={empty || busy || uploading > 0} onClick={save}>
          {busy && <Spinner />} 저장
        </Button>
      </div>
    </div>
  );
}
