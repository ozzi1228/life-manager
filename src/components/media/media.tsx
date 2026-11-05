"use client";

// 작품 기록: 포스터 캘린더·목록·상세·추가/수정 (SCR-MED-01~03, 04 §7.4·7.5, 08 §3)
// ponytail: 작품 정보 검색(C-09)은 아직 — 직접 입력. 검색이 붙으면 폼 앞에 검색 단계
import { BookOpen, ChevronDown, Film, Plus, Star, StarHalf, Tv } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { addMedia, deleteMedia, editMedia } from "@/app/actions/media";
import { PhotoPicker } from "@/components/app/photo-picker";
import { MonthSwitcher } from "@/components/app/pickers";
import { ResponsiveDetail, ResponsiveModal } from "@/components/app/responsive";
import { EmptyState, toastDone } from "@/components/app/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CategoryChips } from "@/components/wish/category-chips";
import { useIsMobile } from "@/hooks/use-mobile";
import { fromYmd, ymd } from "@/lib/format";
import { calendarDay, KIND_LABEL, monthSummary, STATUS_OPTIONS, statusLabel, type MediaKind, type MediaStatus } from "@/lib/media";
import { cn } from "@/lib/utils";
import type { ItemCategory } from "@/server/item-categories";
import type { MediaInput, MediaItem } from "@/server/media";

// 분류 이름(작품 화면이 넣어 줌). 분류가 없으면(지웠거나 위시에서 옮김) 종류 이름
const CatNames = createContext(new Map<string, string>());
const useCatName = (i: { kind: MediaKind; categoryId: string | null }) => useContext(CatNames).get(i.categoryId ?? "") ?? KIND_LABEL[i.kind];

const KIND_ICON = { book: BookOpen, movie: Film, drama: Tv } as const;
const WHERE: Record<MediaKind, string[]> = {
  book: ["종이책", "전자책", "오디오북", "도서관"],
  movie: ["영화관", "넷플릭스", "왓챠", "디즈니+", "쿠팡플레이"],
  drama: ["넷플릭스", "티빙", "디즈니+", "쿠팡플레이", "웨이브", "TV"],
};
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const TINT: Record<MediaKind, string> = { book: "bg-chart-1/20", movie: "bg-chart-2/20", drama: "bg-chart-4/20" }; // 표지 없을 때 종류별 색

/** 표지: 올린 사진, 없거나 깨지면 종류 아이콘 + 제목(04 §7.4). 제목이 옆에 따로 있는 작은 표지는 title 없이 아이콘만 */
export function Cover({ coverId, kind, title, className, faint }: { coverId: string | null; kind: MediaKind; title?: string; className?: string; faint?: boolean }) {
  const [broken, setBroken] = useState(false);
  const Icon = KIND_ICON[kind];
  return (
    <span className={cn("text-foreground/80 relative block aspect-[2/3] shrink-0 overflow-hidden rounded-md", TINT[kind], faint && "opacity-50", className)}>
      {coverId && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element -- 로그인한 본인만 보는 사진(이 서버가 직접 보냄)
        <img src={`/api/v1/attachments/${coverId}?v=thumb`} alt="" className="size-full object-cover" onError={() => setBroken(true)} />
      ) : (
        <span className="flex size-full flex-col items-center justify-center gap-1 p-1 text-center">
          <Icon className="size-4 shrink-0 opacity-60" />
          {title && (
            <span data-slot="cover-title" className="line-clamp-3 text-[10px] leading-tight break-keep">
              {title}
            </span>
          )}
        </span>
      )}
    </span>
  );
}

export function Stars({ value, className }: { value: number | null; className?: string }) {
  if (!value) return null;
  return (
    <span className={cn("text-warning inline-flex items-center", className)} aria-label={`별점 ${value}`}>
      {Array.from({ length: 5 }, (_, i) =>
        value >= i + 1 ? <Star key={i} className="size-3.5 fill-current" /> : value >= i + 0.5 ? <StarHalf key={i} className="size-3.5 fill-current" /> : <Star key={i} className="text-muted-foreground/40 size-3.5" />,
      )}
    </span>
  );
}

/** 별점 고르기: 같은 별을 다시 누르면 반 개, 한 번 더 누르면 다시 한 개(첫 별은 지움) */
function StarsInput({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  const tap = (n: number) => onChange(value === n ? n - 0.5 || null : value === n - 0.5 && n === 1 ? null : n);
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }, (_, i) => {
        const n = i + 1;
        const full = (value ?? 0) >= n;
        const half = !full && (value ?? 0) >= n - 0.5;
        const Icon = half ? StarHalf : Star;
        return (
          <button key={n} type="button" aria-label={`별 ${n}개`} className="text-warning flex size-10 items-center justify-center rounded-md hover:bg-accent" onClick={() => tap(n)}>
            <Icon className={cn("size-6", full || half ? "fill-current" : "text-muted-foreground/40")} />
          </button>
        );
      })}
      <span className="text-muted-foreground ml-1 w-8 text-sm tabular-nums">{value ?? ""}</span>
      {value && (
        <Button type="button" size="sm" variant="ghost" onClick={() => onChange(null)}>
          지우기
        </Button>
      )}
    </div>
  );
}

function DateField({ id, value, onChange, optional }: { id: string; value: string | null; onChange: (v: string | null) => void; optional?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" className={cn("w-full justify-start", !value && "text-muted-foreground")}>
          {value ?? "날짜 고르기"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={value ? fromYmd(value) : undefined} defaultMonth={value ? fromYmd(value) : undefined} onSelect={(d) => (onChange(d ? ymd(d) : null), setOpen(false))} />
        {optional && value && (
          <div className="border-t p-2">
            <Button size="sm" variant="ghost" onClick={() => (onChange(null), setOpen(false))}>
              날짜 지우기
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

type Draft = { kind: MediaKind; categoryId: string | null; title: string; creator: string; coverId: string | null; status: MediaStatus; startDate: string | null; endDate: string | null; rating: number | null; oneLiner: string; review: string; whereText: string };

/** 작품 추가·수정. fromWish: 위시에서 시작·완료 처리(09 §7) — focusReview면 감상 칸에 바로 */
export function MediaForm({
  edit,
  categories,
  initialCat,
  preset,
  fromWish,
  focusReview,
  today,
  close,
  done,
}: {
  edit?: MediaItem;
  /** 주면 분류로 고름(종류는 분류를 따름). 없으면(위시에서 옮길 때) 종류로 고르고 서버가 같은 종류의 첫 분류에 넣음 */
  categories?: ItemCategory[];
  initialCat?: ItemCategory;
  preset?: Partial<Draft>;
  fromWish?: { id: string; version: number };
  focusReview?: boolean;
  today: string;
  close: () => void;
  done: (id: string) => void;
}) {
  const startCat = initialCat ?? categories?.[0];
  const [v, setV] = useState<Draft>(() => ({
    kind: edit?.kind ?? (startCat?.type as MediaKind | undefined) ?? "book",
    categoryId: edit ? edit.categoryId : (startCat?.id ?? null),
    title: edit?.title ?? "",
    creator: edit?.creator ?? "",
    coverId: edit?.coverId ?? null,
    status: edit?.status ?? "done",
    startDate: edit?.startDate ?? null,
    endDate: edit ? edit.endDate : today,
    rating: edit?.rating ?? null,
    oneLiner: edit?.oneLiner ?? "",
    review: edit?.review ?? "",
    whereText: edit?.whereText ?? "",
    ...preset,
  }));
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field?: string; message: string } | null>(null);
  const key = useRef(crypto.randomUUID());
  const review = useRef<HTMLTextAreaElement>(null);
  const set = <K extends keyof Draft>(k: K, val: Draft[K]) => setV((s) => ({ ...s, [k]: val }));

  useEffect(() => {
    if (focusReview) setTimeout(() => review.current?.focus(), 300);
  }, [focusReview]);

  function setKind(kind: MediaKind) {
    setV((s) => ({ ...s, kind, status: STATUS_OPTIONS[kind].some((o) => o.value === s.status) ? s.status : "done", endDate: s.endDate ?? today }));
  }
  function setStatus(status: MediaStatus) {
    setV((s) => ({ ...s, status, startDate: status === "ongoing" ? (s.startDate ?? today) : s.startDate, endDate: status === "ongoing" ? null : (s.endDate ?? today) }));
  }

  async function save() {
    setBusy(true);
    setError(null);
    const input: MediaInput = { ...v, creator: v.creator.trim() || null, oneLiner: v.oneLiner.trim() || null, review: v.review || null, whereText: v.whereText.trim() || null };
    const r = edit ? await editMedia(edit.id, edit.version, input) : await addMedia(key.current, input, fromWish);
    setBusy(false);
    if (!r.ok) {
      if (r.error.code === "VERSION_CONFLICT") return setError({ message: "다른 기기에서 먼저 수정했어요. 닫고 다시 열어 주세요" });
      const f = r.error.fields?.[0];
      return setError({ field: f?.path, message: f?.message ?? r.error.message });
    }
    done(edit ? edit.id : (r.data as { id: string }).id);
  }

  const movie = v.kind === "movie";
  const err = (f: string) => error?.field === f && <FieldError>{error.message}</FieldError>;
  return (
    <ResponsiveModal
      open
      onOpenChange={(o) => !o && close()}
      title={edit ? "작품 기록 수정" : "작품 기록"}
      footer={
        <Button className="w-full md:ml-auto md:w-auto" disabled={!v.title.trim() || busy || uploading} onClick={save}>
          {busy && <Spinner />} 기록 저장
        </Button>
      }
    >
      <FieldGroup className="gap-5">
        {categories ? (
          <ToggleGroup
            type="single"
            variant="outline"
            value={v.categoryId ?? ""}
            onValueChange={(id) => {
              const c = categories.find((x) => x.id === id);
              if (!c) return;
              setKind(c.type as MediaKind);
              set("categoryId", c.id);
            }}
            aria-label="분류"
            className="w-full flex-wrap"
          >
            {categories.map((c) => (
              <ToggleGroupItem key={c.id} value={c.id} className="min-w-0 flex-1">
                <span className="truncate">{c.name}</span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        ) : (
          <ToggleGroup type="single" variant="outline" value={v.kind} onValueChange={(k) => k && setKind(k as MediaKind)} aria-label="종류" className="w-full">
            {(["book", "movie", "drama"] as const).map((k) => (
              <ToggleGroupItem key={k} value={k} className="flex-1">
                {KIND_LABEL[k]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
        <div className="flex gap-3">
          <PhotoPicker value={v.coverId ? [{ id: v.coverId, width: 0, height: 0 }] : []} onChange={(fn) => set("coverId", fn(v.coverId ? [{ id: v.coverId, width: 0, height: 0 }] : [])[0]?.id ?? null)} onBusy={setUploading} max={1} purpose="media_cover" label={movie || v.kind === "drama" ? "포스터" : "표지"} tall />
          <div className="min-w-0 flex-1 space-y-3">
            <Field>
              <FieldLabel htmlFor="md-title">제목</FieldLabel>
              <Input id="md-title" autoFocus={!edit && !preset?.title} maxLength={100} className="h-11 text-base md:h-9 md:text-sm" value={v.title} onChange={(e) => set("title", e.target.value)} />
              {err("title")}
            </Field>
            <Field>
              <FieldLabel htmlFor="md-creator">{v.kind === "book" ? "저자" : "감독·출연"}</FieldLabel>
              <Input id="md-creator" maxLength={100} value={v.creator} onChange={(e) => set("creator", e.target.value)} />
            </Field>
          </div>
        </div>
        {!movie && (
          <Field>
            <FieldLabel>상태</FieldLabel>
            <ToggleGroup type="single" variant="outline" value={v.status} onValueChange={(s) => s && setStatus(s as MediaStatus)} aria-label="상태" className="w-full">
              {STATUS_OPTIONS[v.kind].map((o) => (
                <ToggleGroupItem key={o.value} value={o.value} className="flex-1">
                  {o.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>
        )}
        {movie ? (
          <Field>
            <FieldLabel htmlFor="md-end">본 날</FieldLabel>
            <DateField id="md-end" value={v.endDate} onChange={(d) => set("endDate", d)} />
            {err("endDate")}
          </Field>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="md-start">시작한 날</FieldLabel>
              <DateField id="md-start" value={v.startDate} onChange={(d) => set("startDate", d)} optional={v.status !== "ongoing"} />
              {err("startDate")}
            </Field>
            {v.status !== "ongoing" && (
              <Field>
                <FieldLabel htmlFor="md-end">끝난 날</FieldLabel>
                <DateField id="md-end" value={v.endDate} onChange={(d) => set("endDate", d)} />
                {err("endDate")}
              </Field>
            )}
          </div>
        )}
        <Field>
          <FieldLabel>별점</FieldLabel>
          <StarsInput value={v.rating} onChange={(r) => set("rating", r)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="md-one">한 줄 평</FieldLabel>
          <Input id="md-one" maxLength={100} value={v.oneLiner} onChange={(e) => set("oneLiner", e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="md-review">감상</FieldLabel>
          <Textarea id="md-review" ref={review} maxLength={50_000} className="min-h-32" placeholder="느낀 점을 자유롭게 남겨 보세요" value={v.review} onChange={(e) => set("review", e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="md-where">어디서</FieldLabel>
          <div className="flex flex-wrap gap-1.5">
            {WHERE[v.kind].map((w) => (
              <button
                key={w}
                type="button"
                aria-pressed={v.whereText === w}
                onClick={() => set("whereText", v.whereText === w ? "" : w)}
                className={cn("rounded-full border px-3 py-1 text-sm", v.whereText === w ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent")}
              >
                {w}
              </button>
            ))}
          </div>
          <Input id="md-where" maxLength={30} placeholder="직접 입력" value={v.whereText} onChange={(e) => set("whereText", e.target.value)} />
        </Field>
        {error && !["title", "startDate", "endDate"].includes(error.field ?? "") && <FieldError>{error.message}</FieldError>}
      </FieldGroup>
    </ResponsiveModal>
  );
}

const shortDate = (s: string, today: string) => {
  const d = fromYmd(s);
  return d.getFullYear() === fromYmd(today).getFullYear() ? `${d.getMonth() + 1}.${d.getDate()}` : `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
};
export function period(i: Pick<MediaItem, "kind" | "status" | "startDate" | "endDate">, today: string) {
  if (i.kind === "movie") return i.endDate ? `${shortDate(i.endDate, today)} 봄` : "";
  if (i.status === "ongoing") return i.startDate ? `${shortDate(i.startDate, today)}부터` : "";
  return [i.startDate && shortDate(i.startDate, today), i.endDate && shortDate(i.endDate, today)].filter(Boolean).join(" ~ ");
}

function Detail({ item, today, close, edit, removed }: { item: MediaItem; today: string; close: () => void; edit: () => void; removed: () => void }) {
  const catName = useCatName(item);
  return (
    <ResponsiveDetail
      open
      onOpenChange={(o) => !o && close()}
      title={item.title}
      wide
      footer={
        <div className="flex w-full gap-2">
          <Button variant="ghost" className="text-destructive-text" onClick={removed}>
            삭제
          </Button>
          <Button className="ml-auto" onClick={edit}>
            수정
          </Button>
        </div>
      }
    >
      <div className="space-y-4 pb-2">
        <div className="flex gap-4">
          <Cover coverId={item.coverId} kind={item.kind} title={item.title} className="w-28 md:w-36" />
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="secondary">{catName}</Badge>
              <Badge variant="outline">{statusLabel(item.kind, item.status)}</Badge>
            </div>
            {item.creator && <p className="text-muted-foreground text-sm">{item.creator}</p>}
            <p className="text-sm tabular-nums">{period(item, today)}</p>
            <Stars value={item.rating} />
            {item.whereText && <p className="text-muted-foreground text-caption">{item.whereText}</p>}
          </div>
        </div>
        {item.oneLiner && <p className="font-semibold">“{item.oneLiner}”</p>}
        {item.review ? (
          <p className="text-sm leading-6 whitespace-pre-wrap">{item.review}</p>
        ) : (
          <button type="button" onClick={edit} className="text-muted-foreground hover:bg-accent w-full rounded-lg border border-dashed p-4 text-sm">
            감상을 남겨 보세요
          </button>
        )}
      </div>
    </ResponsiveDetail>
  );
}

function Row({ i, today, open }: { i: MediaItem; today: string; open: () => void }) {
  const catName = useCatName(i);
  return (
    <li>
      <button type="button" onClick={open} className="hover:bg-accent/50 flex w-full items-center gap-3 px-3 py-2 text-left">
        <Cover coverId={i.coverId} kind={i.kind} className="w-10" />
        <span className="min-w-0 flex-1">
          <span className="block truncate">{i.title}</span>
          <span className="text-muted-foreground block truncate text-caption">{[catName, i.creator, period(i, today)].filter(Boolean).join(" · ")}</span>
          {i.oneLiner && <span className="text-muted-foreground block truncate text-caption">“{i.oneLiner}”</span>}
        </span>
        <Stars value={i.rating} className="shrink-0" />
      </button>
    </li>
  );
}

function MonthGrid({ month, items, today, open }: { month: string; items: MediaItem[]; today: string; open: (i: MediaItem) => void }) {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(y, m - 1, 1).getDay();
  const days = new Date(y, m, 0).getDate();
  const byDay = new Map<number, { item: MediaItem; faint: boolean }[]>();
  for (const i of items) {
    const at = calendarDay(i.kind, i);
    if (!at?.date.startsWith(month)) continue;
    const d = Number(at.date.slice(8));
    byDay.set(d, [...(byDay.get(d) ?? []), { item: i, faint: at.faint }]);
  }
  return (
    <div className="rounded-lg border">
      <div className="grid grid-cols-7 border-b text-center text-caption">
        {WEEK.map((w, i) => (
          <span key={w} className={cn("py-1.5", i === 0 ? "text-destructive-text" : "text-muted-foreground")}>
            {w}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {Array.from({ length: first }, (_, i) => (
          <span key={`e${i}`} className="border-b border-r" />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const d = i + 1;
          const list = (byDay.get(d) ?? []).sort((x, y) => Number(x.faint) - Number(y.faint)); // 끝낸 것 먼저, 보는 중(흐림)은 뒤로
          const isToday = `${month}-${String(d).padStart(2, "0")}` === today;
          // 둘 다 표지 사진일 때만 겹쳐 보임(글자 표지는 겹치면 안 읽힘). 나머지는 +N
          const n = list.length > 1 && list[0].item.coverId && list[1].item.coverId ? 2 : 1;
          return (
            <div key={d} className="min-h-20 border-r border-b p-1 md:min-h-28">
              <span className={cn("text-caption tabular-nums", isToday ? "bg-primary text-primary-foreground rounded-full px-1.5" : "text-muted-foreground")}>{d}</span>
              {list.length > 0 && (
                <div className="relative mt-0.5 flex">
                  {list.slice(0, n).map(({ item, faint }, k) => (
                    <button
                      key={item.id}
                      type="button"
                      title={[item.title, item.rating ? `★${item.rating}` : null, item.oneLiner].filter(Boolean).join(" · ")}
                      aria-label={`${item.title} 보기`}
                      onClick={() => open(item)}
                      className={cn("relative w-full max-w-12 md:w-3/5", k === 1 && "-ml-[30%] mt-1.5 max-md:hidden")}
                    >
                      {/* 모바일 칸은 좁아 제목이 글자 중간에서 끊김 → 아이콘만(제목은 aria-label·title로) */}
                      <Cover coverId={item.coverId} kind={item.kind} title={item.title} faint={faint} className="shadow-sm ring-1 ring-background max-md:[&_[data-slot=cover-title]]:hidden" />
                      {/* +N은 마지막으로 보이는 표지 모서리에 붙임(모바일은 한 장, PC는 n장) */}
                      {k === 0 && list.length > 1 && <span className="bg-foreground/75 text-background absolute -right-1 -bottom-1 rounded-full px-1 text-[10px] md:hidden">+{list.length - 1}</span>}
                      {k === n - 1 && list.length > n && <span className="bg-foreground/75 text-background absolute -right-1 -bottom-1 rounded-full px-1 text-[10px] max-md:hidden">+{list.length - n}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const GROUPS: { status: MediaStatus; label: string }[] = [
  { status: "ongoing", label: "읽는 중·보는 중" },
  { status: "done", label: "다 봄" },
  { status: "dropped", label: "중도 포기" },
];

export function MediaView({ items, categories, today }: { items: MediaItem[]; categories: ItemCategory[]; today: string }) {
  const router = useRouter();
  const mobile = useIsMobile();
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [cat, setCat] = useState("all");
  const picked = categories.find((c) => c.id === cat);
  const kind = (picked?.type ?? "all") as "all" | MediaKind; // 읽는 중·보는 중 같은 말은 분류의 기록 방식으로
  const [month, setMonth] = useState(today.slice(0, 7));
  const [detail, setDetail] = useState<MediaItem | null>(null);
  const [form, setForm] = useState<{ edit?: MediaItem } | null>(null);
  const shown = items.filter((i) => cat === "all" || i.categoryId === cat);
  const ongoing = shown.filter((i) => i.status === "ongoing");
  const inMonth = shown.filter((i) => calendarDay(i.kind, i)?.date.startsWith(month)).sort((a, b) => (calendarDay(b.kind, b)!.date > calendarDay(a.kind, a)!.date ? 1 : -1));
  const summary = monthSummary(shown, month);

  async function remove(i: MediaItem) {
    const r = await deleteMedia(i.id);
    if (!r.ok) return toast(r.error.message);
    setDetail(null);
    router.refresh();
    toastDone("휴지통으로 옮겼어요");
  }

  const add = (
    <Button variant={mobile ? "outline" : "default"} onClick={() => setForm({})}>
      <Plus /> 기록하기
    </Button>
  );
  return (
    <CatNames value={new Map(categories.map((c) => [c.id, c.name]))}>
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <CategoryChips scope="media" categories={categories} value={cat} onChange={setCat} />
        <span className="ml-auto">{add}</span>
      </div>

      {items.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {view === "calendar" && <MonthSwitcher value={month} onChange={setMonth} />}
          <ToggleGroup type="single" variant="outline" size="sm" value={view} onValueChange={(x) => x && setView(x as typeof view)} aria-label="보기" className="ml-auto">
            <ToggleGroupItem value="calendar">캘린더</ToggleGroupItem>
            <ToggleGroupItem value="list">목록</ToggleGroupItem>
          </ToggleGroup>
        </div>
      )}
      {items.length === 0 ? (
        <EmptyState pet="hoya" title="읽은 책, 본 영화·드라마를 남겨 보세요" description="다 본 날짜에 포스터가 캘린더에 모여요." action={add} />
      ) : view === "calendar" ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {ongoing.length > 0 && (
              <Button variant="secondary" size="sm" className="rounded-full" onClick={() => setView("list")}>
                {kind === "book" ? "읽는 중" : kind === "all" ? "읽는 중·보는 중" : "보는 중"} {ongoing.length}
              </Button>
            )}
            <span className="text-muted-foreground ml-auto text-sm">{summary ? `이번 달 ${summary}` : "이번 달 끝낸 작품이 없어요"}</span>
          </div>
          <MonthGrid month={month} items={shown} today={today} open={setDetail} />
          {inMonth.length > 0 && (
            <ul className="divide-y rounded-lg border">
              {inMonth.map((i) => (
                <Row key={i.id} i={i} today={today} open={() => setDetail(i)} />
              ))}
            </ul>
          )}
        </>
      ) : (
        <div className="space-y-4">
          {GROUPS.map((g) => {
            const list = shown.filter((i) => i.status === g.status);
            if (!list.length) return null;
            const body = (
              <ul className="divide-y rounded-lg border">
                {list.map((i) => (
                  <Row key={i.id} i={i} today={today} open={() => setDetail(i)} />
                ))}
              </ul>
            );
            if (g.status !== "dropped")
              return (
                <section key={g.status} className="space-y-2">
                  <h2 className="text-sm font-semibold">
                    {g.label} <span className="text-muted-foreground font-normal">{list.length}</span>
                  </h2>
                  {body}
                </section>
              );
            return (
              <Collapsible key={g.status}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="-ml-2">
                    <ChevronDown /> {g.label} {list.length}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>{body}</CollapsibleContent>
              </Collapsible>
            );
          })}
          {!shown.length && <p className="text-muted-foreground py-8 text-center text-sm">이 종류의 기록이 없어요</p>}
        </div>
      )}

      {detail && <Detail key={detail.id + detail.version} item={detail} today={today} close={() => setDetail(null)} edit={() => (setForm({ edit: detail }), setDetail(null))} removed={() => remove(detail)} />}
      {form && (
        <MediaForm
          edit={form.edit}
          categories={categories}
          initialCat={picked}
          today={today}
          close={() => setForm(null)}
          done={() => {
            toast(form.edit ? "고쳤어요" : "기록했어요");
            setForm(null);
            router.refresh();
          }}
        />
      )}
    </div>
    </CatNames>
  );
}
