"use client";

// 위시: 쇼핑(필요·갖고 싶음·관심, 가격 필수, 목록에서 구매 체크) · 작품(완료 → 작품 기록·감상) (SCR-WISH-01~04, 04 §7.6~7.8, 09)
// 참은 소비 연결(20): 그만둘 때 기록(기본 켬), "○월에 참음"·월말 후보 표시, 참은 물건을 살 때 안내
// ponytail: 링크 미리보기·같은 링크 경고·구분 변경 이력 표시(P1)
import { Check, ChevronDown, CircleAlert, ExternalLink, Eye, Heart, Link2, MoreHorizontal, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { addWish, deleteWish, dropWishAction, editWish, reopenWishAction, restoreWish } from "@/app/actions/wish";
import { InfoTip } from "@/components/app/help";
import { AmountInput } from "@/components/app/money";
import { PhotoPicker, type Photo } from "@/components/app/photo-picker";
import { ResponsiveDetail, ResponsiveModal } from "@/components/app/responsive";
import { EmptyState, toastUndo } from "@/components/app/states";
import { Cover, MediaForm } from "@/components/media/media";
import { useExpenseDialog } from "@/components/money/expense-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useIsMobile } from "@/hooks/use-mobile";
import { dateLabel, fromYmd, money, monthLabel, ymd } from "@/lib/format";
import { FINISH_LABEL, KIND_LABEL, START_LABEL, type MediaKind } from "@/lib/media";
import { cn } from "@/lib/utils";
import type { WishInput, WishItem } from "@/server/wish";

type Level = "need" | "want" | "like";
// 정렬 순서 = 필요 → 갖고 싶음 → 관심(09 §3)
const LEVELS: { value: Level; label: string; icon: typeof Eye; hint: string }[] = [
  { value: "need", label: "필요", icon: CircleAlert, hint: "생활이나 일에 꼭 필요해서 사야 해요." },
  { value: "want", label: "갖고 싶음", icon: Heart, hint: "사고 싶지만 없어도 생활에 지장은 없어요." },
  { value: "like", label: "관심", icon: Eye, hint: "눈여겨보는 중이에요. 당장 살 생각은 없어요." },
];
const levelOf = (l: string | null) => LEVELS.find((x) => x.value === l) ?? LEVELS[2];
const LevelTip = () => (
  <InfoTip label="구분" title="필요 · 갖고 싶음 · 관심">
    {LEVELS.map((l) => (
      <p key={l.value}>
        <b className="text-foreground">{l.label}</b>: {l.hint}
      </p>
    ))}
  </InfoTip>
);

const domain = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
};
const daysSince = (iso: string, today: string) => Math.max(0, Math.round((fromYmd(today).getTime() - fromYmd(ymd(new Date(iso))).getTime()) / 86_400_000));

/** 위시 → 구매 기록 열기. 참았던 물건이면 안내(20 §5.3) */
const buyOf = (w: WishItem, today: string, done: () => void) => ({
  id: w.id,
  version: w.version,
  name: w.name,
  price: w.price,
  done,
  notice: w.restrained?.status === "counted" && w.price ? `${monthLabel(w.restrained.month, fromYmd(today))}에 참은 물건이에요. 사면 이번 달 참아야 할 금액에 ${money(w.price)}이 더해져요.` : undefined,
});

/** 카드·상세 작은 글: "10월에 참음" / 월말 후보 */
function RestraintNote({ w, today }: { w: WishItem; today: string }) {
  if (w.restrained) return <span className="text-success-text block text-caption">{monthLabel(w.restrained.month, fromYmd(today))}에 참음{w.restrained.status === "later_bought" && " · 나중에 샀어요"}</span>;
  if (w.candidate) return <span className="text-muted-foreground block text-caption">이번 달에 안 사면 참은 소비로 들어가요</span>;
  return null;
}

function LevelBadge({ level }: { level: string | null }) {
  const l = levelOf(level);
  const Icon = l.icon;
  return (
    <Badge variant={l.value === "need" ? "default" : "secondary"} className="gap-1">
      <Icon className="size-3" /> {l.label}
    </Badge>
  );
}

type Draft = { kind: "shopping" | "media"; mediaKind: MediaKind | null; name: string; level: Level; price: number | null; seenWhere: string; links: string[]; photos: Photo[] };

function WishForm({ kind, edit, close, done }: { kind: "shopping" | "media"; edit?: WishItem; close: () => void; done: () => void }) {
  const [v, setV] = useState<Draft>({
    kind,
    mediaKind: (edit?.mediaKind as MediaKind | null) ?? (kind === "media" ? "movie" : null),
    name: edit?.name ?? "",
    level: (edit?.level as Level | null) ?? "like",
    price: edit?.price ?? null,
    seenWhere: edit?.seenWhere ?? "",
    links: edit?.links.length ? edit.links : [""],
    photos: edit?.photos ?? [],
  });
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field?: string; message: string } | null>(null);
  const key = useRef(crypto.randomUUID());
  const set = <K extends keyof Draft>(k: K, val: Draft[K]) => setV((s) => ({ ...s, [k]: val }));
  const shop = kind === "shopping";

  async function save() {
    setBusy(true);
    setError(null);
    const input: WishInput = { ...v, seenWhere: v.seenWhere.trim() || null, links: v.links.map((l) => l.trim()).filter(Boolean), photoIds: v.photos.map((p) => p.id) };
    const r = edit ? await editWish(edit.id, edit.version, input) : await addWish(key.current, input);
    setBusy(false);
    if (!r.ok) {
      if (r.error.code === "VERSION_CONFLICT") return setError({ message: "다른 기기에서 먼저 수정했어요. 닫고 다시 열어 주세요" });
      const f = r.error.fields?.[0];
      return setError({ field: f?.path.split(".")[0], message: f?.message ?? r.error.message });
    }
    toast(edit ? "고쳤어요" : "위시에 담았어요");
    done();
  }

  const err = (f: string) => error?.field === f && <FieldError>{error.message}</FieldError>;
  const linkInputs = (
    <Field>
      <FieldLabel htmlFor="wi-link-0">링크</FieldLabel>
      {(shop ? v.links : v.links.slice(0, 1)).map((l, i) => (
        <div key={i} className="flex gap-1">
          <Input id={`wi-link-${i}`} type="url" inputMode="url" placeholder={shop ? "판매처·원본 게시물 주소" : "소개 글·예고편 주소"} value={l} onChange={(e) => set("links", v.links.map((x, j) => (j === i ? e.target.value : x)))} />
          {v.links.length > 1 && (
            <Button type="button" variant="ghost" size="icon" aria-label="링크 빼기" onClick={() => set("links", v.links.filter((_, j) => j !== i))}>
              <X />
            </Button>
          )}
        </div>
      ))}
      {shop && v.links.length < 10 && (
        <div>
          <Button type="button" variant="ghost" size="sm" className="-ml-2" onClick={() => set("links", [...v.links, ""])}>
            <Plus /> 링크 추가
          </Button>
        </div>
      )}
      {err("links")}
    </Field>
  );

  return (
    <ResponsiveModal
      open
      onOpenChange={(o) => !o && close()}
      title={edit ? "위시 수정" : shop ? "쇼핑 위시 담기" : "작품 위시 담기"}
      footer={
        <Button className="w-full md:ml-auto md:w-auto" disabled={!v.name.trim() || (shop && !v.price) || busy || uploading} onClick={save}>
          {busy && <Spinner />} {edit ? "저장" : "담기"}
        </Button>
      }
    >
      <FieldGroup className="gap-5">
        {!shop && (
          <ToggleGroup type="single" variant="outline" value={v.mediaKind ?? ""} onValueChange={(k) => k && set("mediaKind", k as MediaKind)} aria-label="종류" className="w-full">
            {(["book", "movie", "drama"] as const).map((k) => (
              <ToggleGroupItem key={k} value={k} className="flex-1">
                {KIND_LABEL[k]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
        {shop && linkInputs}
        <Field>
          <FieldLabel htmlFor="wi-name">{shop ? "이름" : "제목"}</FieldLabel>
          <Input id="wi-name" autoFocus={!edit} maxLength={100} className="h-11 text-base md:h-9 md:text-sm" value={v.name} onChange={(e) => set("name", e.target.value)} />
          {err("name")}
        </Field>
        {shop && (
          <>
            <Field>
              <FieldLabel>
                구분 <LevelTip />
              </FieldLabel>
              <ToggleGroup type="single" variant="outline" value={v.level} onValueChange={(l) => l && set("level", l as Level)} aria-label="구분" className="w-full">
                {LEVELS.map((l) => (
                  <ToggleGroupItem key={l.value} value={l.value} className="flex-1">
                    <l.icon /> {l.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>
            <Field data-invalid={error?.field === "price" || undefined}>
              <FieldLabel htmlFor="wi-price">가격</FieldLabel>
              <AmountInput id="wi-price" value={v.price} onChange={(p) => set("price", p)} invalid={error?.field === "price"} />
              <FieldDescription>대략적인 금액도 괜찮아요</FieldDescription>
              {err("price")}
            </Field>
          </>
        )}
        <Field>
          <FieldLabel>{shop ? "사진" : "포스터·표지"}</FieldLabel>
          <PhotoPicker value={v.photos} onChange={(fn) => setV((s) => ({ ...s, photos: fn(s.photos) }))} onBusy={setUploading} max={shop ? 10 : 1} purpose="wish_image" label={shop ? "사진" : "이미지"} tall={!shop} />
        </Field>
        <Field>
          <FieldLabel htmlFor="wi-seen">{shop ? "어디서 봤는지" : "메모"}</FieldLabel>
          <Textarea id="wi-seen" maxLength={1000} placeholder={shop ? "예: 인스타 릴스 ○○ 계정" : "예: 친구가 추천해 줌"} value={v.seenWhere} onChange={(e) => set("seenWhere", e.target.value)} />
        </Field>
        {!shop && linkInputs}
        {error && !["name", "price", "links"].includes(error.field ?? "") && <FieldError>{error.message}</FieldError>}
      </FieldGroup>
    </ResponsiveModal>
  );
}

function ShopDetail({ w, today, close, edit, refresh }: { w: WishItem; today: string; close: () => void; edit: () => void; refresh: () => void }) {
  const openExpense = useExpenseDialog();
  const [dropping, setDropping] = useState(false);
  const [reason, setReason] = useState("");
  const [record, setRecord] = useState(!w.restrained);
  const [askTx, setAskTx] = useState(false);
  const [busy, setBusy] = useState(false);

  async function run(p: Promise<{ ok: boolean; error?: { message: string } }>, message: string) {
    setBusy(true);
    const r = await p;
    setBusy(false);
    if (!r.ok) return toast(r.error?.message ?? "잠시 후 다시 시도해 주세요");
    toast(message);
    close();
    refresh();
  }
  async function remove() {
    const r = await deleteWish(w.id);
    if (!r.ok) return toast(r.error.message);
    close();
    refresh();
    toastUndo("휴지통으로 옮겼어요", async () => {
      await restoreWish(w.id);
      refresh();
    });
  }
  const reopen = (removeTx: boolean) => run(reopenWishAction(w.id, w.version, removeTx), removeTx ? "담아둠으로 되돌리고 지출은 휴지통으로 옮겼어요" : "담아둠으로 되돌렸어요");

  const footer =
    w.status === "saved" ? (
      dropping ? (
        <div className="w-full space-y-2">
          <Input autoFocus aria-label="그만두는 이유" placeholder="이유 한 줄 (선택)" maxLength={100} value={reason} onChange={(e) => setReason(e.target.value)} />
          {!w.restrained && w.price && (
            <label className="flex items-start gap-2 text-sm">
              <Checkbox className="mt-0.5" checked={record} onCheckedChange={(c) => setRecord(c === true)} />
              <span>
                참은 소비로 기록하기
                <span className="text-muted-foreground block text-caption">{money(w.price)}이 이번 달 참은 금액에 더해져요</span>
              </span>
            </label>
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setDropping(false)}>
              취소
            </Button>
            <Button className="ml-auto" disabled={busy} onClick={() => run(dropWishAction(w.id, w.version, reason.trim() || null, record && !w.restrained), record && !w.restrained ? "그만두고 참은 소비로 기록했어요" : "그만둠으로 옮겼어요")}>
              그만두기
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex w-full flex-wrap gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="더 보기">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onSelect={edit}>수정</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setDropping(true)}>그만둠</DropdownMenuItem>
              <DropdownMenuItem className="text-destructive-text" onSelect={remove}>
                삭제
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button className="ml-auto" onClick={() => (close(), openExpense(undefined, buyOf(w, today, refresh)))}>
            <Check /> 구매함
          </Button>
        </div>
      )
    ) : askTx ? (
      <div className="w-full space-y-2">
        <p className="text-sm">연결된 지출은 어떻게 할까요?</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={busy} onClick={() => reopen(false)}>
            지출은 남기기
          </Button>
          <Button className="ml-auto" disabled={busy} onClick={() => reopen(true)}>
            지출도 휴지통으로
          </Button>
        </div>
      </div>
    ) : (
      <div className="flex w-full gap-2">
        <Button variant="ghost" className="text-destructive-text" onClick={remove}>
          삭제
        </Button>
        <Button className="ml-auto" variant="outline" disabled={busy} onClick={() => (w.status === "bought" && w.hasTx && !w.txGone ? setAskTx(true) : reopen(false))}>
          {w.status === "bought" ? "담아둠으로 되돌리기" : "다시 담기"}
        </Button>
      </div>
    );

  return (
    <ResponsiveDetail open onOpenChange={(o) => !o && close()} title={w.name} wide footer={footer}>
      <div className="space-y-4 pb-2">
        {w.photos.length > 0 && (
          <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4">
            {w.photos.map((p) => (
              <a key={p.id} href={`/api/v1/attachments/${p.id}?v=body`} target="_blank" rel="noreferrer" className="shrink-0 snap-start">
                {/* eslint-disable-next-line @next/next/no-img-element -- 로그인한 본인만 보는 사진(이 서버가 직접 보냄) */}
                <img src={`/api/v1/attachments/${p.id}?v=body`} alt="" className="h-56 w-auto rounded-lg object-cover" />
              </a>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <LevelBadge level={w.level} />
          {w.status === "bought" && <Badge variant="outline">구매함</Badge>}
          {w.status === "dropped" && <Badge variant="outline">그만둠</Badge>}
          <span className="ml-auto text-title font-semibold tabular-nums">{w.price ? money(w.price) : "가격 없음"}</span>
        </div>
        <p className="text-muted-foreground text-sm">
          {dateLabel(ymd(new Date(w.createdAt)), fromYmd(today))}에 담음
          {w.status === "saved" && daysSince(w.createdAt, today) > 0 && ` · ${daysSince(w.createdAt, today)}일째`}
          {w.status === "bought" && w.doneAt && ` · ${dateLabel(w.doneAt, fromYmd(today))}에 구매함`}
          {w.status === "dropped" && w.doneAt && ` · ${dateLabel(w.doneAt, fromYmd(today))}에 그만둠`}
        </p>
        <RestraintNote w={w} today={today} />
        {w.txGone && <p className="bg-warning/15 rounded-md p-2 text-sm">연결된 지출이 삭제됐어요</p>}
        {w.droppedReason && <p className="text-sm">그만둔 이유: {w.droppedReason}</p>}
        {w.seenWhere && (
          <div>
            <p className="text-muted-foreground text-caption">어디서 봤는지</p>
            <p className="text-sm whitespace-pre-wrap">{w.seenWhere}</p>
          </div>
        )}
        {w.links.length > 0 && (
          <ul className="divide-y rounded-lg border">
            {w.links.map((l) => (
              <li key={l}>
                <a href={l} target="_blank" rel="noreferrer noopener" className="hover:bg-accent/50 flex items-center gap-2 px-3 py-2.5 text-sm">
                  <Link2 className="text-muted-foreground size-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{domain(l)}</span>
                  <ExternalLink className="text-muted-foreground size-4 shrink-0" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </ResponsiveDetail>
  );
}

function ShopCard({ w, today, open }: { w: WishItem; today: string; open: () => void }) {
  const openExpense = useExpenseDialog();
  const router = useRouter();
  const photo = w.photos[0];
  return (
    <li className="bg-card relative overflow-hidden rounded-lg border">
      <button type="button" onClick={open} className="block w-full text-left">
        <span className="bg-muted flex aspect-square items-center justify-center">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element -- 로그인한 본인만 보는 사진(이 서버가 직접 보냄)
            <img src={`/api/v1/attachments/${photo.id}?v=thumb`} alt="" className="size-full object-cover" />
          ) : (
            <span className="text-muted-foreground flex flex-col items-center gap-1 p-3 text-center text-caption">
              <Link2 className="size-6" />
              {w.links[0] ? domain(w.links[0]) : w.name}
            </span>
          )}
        </span>
        <span className="block space-y-1 p-2.5">
          <LevelBadge level={w.level} />
          <span className="line-clamp-2 block text-sm">{w.name}</span>
          <span className="block font-semibold tabular-nums">{w.price ? money(w.price) : <span className="text-warning-text">가격 없음</span>}</span>
          <span className="text-muted-foreground flex items-center gap-1 text-caption">
            {daysSince(w.createdAt, today) ? `${daysSince(w.createdAt, today)}일째` : "오늘 담음"} {w.links.length > 0 && <Link2 className="size-3.5" aria-label="링크 있음" />}
          </span>
          <RestraintNote w={w} today={today} />
        </span>
      </button>
      <button
        type="button"
        aria-label="구매했어요"
        title="구매했어요"
        onClick={() => openExpense(undefined, buyOf(w, today, () => router.refresh()))}
        className="bg-background/90 hover:bg-primary hover:text-primary-foreground absolute top-1.5 right-1.5 flex size-11 items-center justify-center rounded-full border shadow-sm"
      >
        <Check className="size-5" />
      </button>
    </li>
  );
}

function DoneRow({ w, today, open }: { w: WishItem; today: string; open: () => void }) {
  return (
    <li>
      <button type="button" onClick={open} className="hover:bg-accent/50 flex w-full items-center gap-3 px-3 py-2 text-left">
        <span className="min-w-0 flex-1">
          <span className="text-muted-foreground block truncate">{w.name}</span>
          <span className="text-muted-foreground block truncate text-caption">
            {w.doneAt ? dateLabel(w.doneAt, fromYmd(today)) : ""}
            {w.droppedReason && ` · ${w.droppedReason}`}
            {w.txGone && " · 연결된 지출이 삭제됐어요"}
            {w.restrained && ` · ${monthLabel(w.restrained.month, fromYmd(today))}에 참음`}
          </span>
        </span>
        <span className="text-muted-foreground shrink-0 tabular-nums">{w.price ? money(w.price) : ""}</span>
      </button>
    </li>
  );
}

function Folded({ label, children, count }: { label: string; count: number; children: React.ReactNode }) {
  if (!count) return null;
  return (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="-ml-2">
          <ChevronDown /> {label} {count}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="divide-y rounded-lg border">{children}</ul>
      </CollapsibleContent>
    </Collapsible>
  );
}

type Sort = "new" | "old" | "price" | "level";
function Shopping({ items, today, add, edit, sort }: { items: WishItem[]; today: string; add: React.ReactNode; edit: (w: WishItem) => void; sort: Sort }) {
  const router = useRouter();
  const [level, setLevel] = useState<"all" | Level>("all");
  const [detail, setDetail] = useState<WishItem | null>(null);
  const order = (l: string | null) => LEVELS.findIndex((x) => x.value === l);
  const saved = items
    .filter((w) => w.status === "saved" && (level === "all" || w.level === level))
    .sort((a, b) => (sort === "old" ? a.createdAt.localeCompare(b.createdAt) : sort === "price" ? (b.price ?? 0) - (a.price ?? 0) : sort === "level" ? order(a.level) - order(b.level) : b.createdAt.localeCompare(a.createdAt)));
  const bought = items.filter((w) => w.status === "bought");
  const dropped = items.filter((w) => w.status === "dropped");
  const sum = saved.reduce((a, w) => a + (w.price ?? 0), 0);

  if (!items.length) return <EmptyState pet="pomong" title="사고 싶은 걸 담아 두세요" description="무엇을 보고 담았는지 링크·사진과 함께 남겨요. 산 뒤에는 목록에서 바로 체크해요." action={add} />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="-mx-4 flex items-center gap-1 overflow-x-auto px-4 md:mx-0 md:px-0">
          <ToggleGroup type="single" variant="outline" size="sm" value={level} onValueChange={(x) => x && setLevel(x as typeof level)} aria-label="구분">
            <ToggleGroupItem value="all">전체</ToggleGroupItem>
            {LEVELS.map((l) => (
              <ToggleGroupItem key={l.value} value={l.value} className="whitespace-nowrap">
                {l.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <LevelTip />
        </div>
      </div>
      {saved.length > 0 ? (
        <>
          <p className="text-muted-foreground text-sm tabular-nums">
            {saved.length}개 · 모두 사면 {money(sum)}
          </p>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {saved.map((w) => (
              <ShopCard key={w.id} w={w} today={today} open={() => setDetail(w)} />
            ))}
          </ul>
        </>
      ) : level === "all" ? (
        // 담기 버튼은 위 줄에 있어 빈 상태엔 안 둠
        <EmptyState pet="pomong" title="지금 담아 둔 위시가 없어요" description="산 것·그만둔 것은 아래에 모여 있어요." />
      ) : (
        <p className="text-muted-foreground py-8 text-center text-sm">{levelOf(level).label}으로 담은 위시가 없어요</p>
      )}
      <Folded label="구매함" count={bought.length}>
        {bought.map((w) => (
          <DoneRow key={w.id} w={w} today={today} open={() => setDetail(w)} />
        ))}
      </Folded>
      <Folded label="그만둠" count={dropped.length}>
        {dropped.map((w) => (
          <DoneRow key={w.id} w={w} today={today} open={() => setDetail(w)} />
        ))}
      </Folded>
      {detail && <ShopDetail key={detail.id + detail.version} w={detail} today={today} close={() => setDetail(null)} edit={() => (edit(detail), setDetail(null))} refresh={() => router.refresh()} />}
    </div>
  );
}

function MediaWishes({ items, today, add, edit }: { items: WishItem[]; today: string; add: React.ReactNode; edit: (w: WishItem) => void }) {
  const router = useRouter();
  const [form, setForm] = useState<{ w: WishItem; start: boolean } | null>(null);
  const saved = items.filter((w) => w.status === "saved");
  const started = items.filter((w) => w.status === "started");
  const finished = items.filter((w) => w.status === "finished");

  async function remove(w: WishItem) {
    const r = await deleteWish(w.id);
    if (!r.ok) return toast(r.error.message);
    router.refresh();
    toastUndo("휴지통으로 옮겼어요", async () => {
      await restoreWish(w.id);
      router.refresh();
    });
  }
  async function reopen(w: WishItem) {
    const r = await reopenWishAction(w.id, w.version, false);
    if (!r.ok) return toast(r.error.message);
    toast("위시로 되돌렸어요. 작품 기록은 그대로 있어요");
    router.refresh();
  }

  if (!items.length) return <EmptyState pet="hoya" title="보고 싶은 작품을 담아 두세요" description="다 보면 버튼 하나로 작품 기록과 감상으로 옮겨요." action={add} />;
  const row = (w: WishItem) => {
    const k = (w.mediaKind ?? "movie") as MediaKind;
    const start = START_LABEL[k];
    return (
      <li key={w.id} className="flex items-center gap-3 px-3 py-2">
        <button type="button" onClick={() => (w.status === "saved" ? edit(w) : router.push("/wish/media"))} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <Cover coverId={w.photos[0]?.id ?? null} kind={k} className="w-10" />
          <span className="min-w-0 flex-1">
            <span className={cn("block truncate", w.status !== "saved" && "text-muted-foreground")}>{w.name}</span>
            <span className="text-muted-foreground block truncate text-caption">{[KIND_LABEL[k], w.seenWhere].filter(Boolean).join(" · ")}</span>
          </span>
        </button>
        {w.status === "saved" && (
          <>
            <Button variant="outline" size="sm" className="max-md:hidden" onClick={() => setForm({ w, start: false })}>
              <Check /> {FINISH_LABEL[k]}
            </Button>
            <Button variant="outline" size="icon" className="size-11 md:hidden" aria-label={FINISH_LABEL[k]} onClick={() => setForm({ w, start: false })}>
              <Check />
            </Button>
          </>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="더 보기" className="max-md:size-11">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {w.status === "saved" ? (
              <>
                {start && <DropdownMenuItem onSelect={() => setForm({ w, start: true })}>{start}</DropdownMenuItem>}
                <DropdownMenuItem onSelect={() => edit(w)}>수정</DropdownMenuItem>
              </>
            ) : (
              <DropdownMenuItem onSelect={() => reopen(w)}>위시로 되돌리기</DropdownMenuItem>
            )}
            <DropdownMenuItem className="text-destructive-text" onSelect={() => remove(w)}>
              삭제
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </li>
    );
  };
  return (
    <div className="space-y-4">
      {saved.length > 0 ? <ul className="divide-y rounded-lg border">{saved.map(row)}</ul> : <p className="text-muted-foreground py-8 text-center text-sm">담아 둔 작품을 모두 봤어요</p>}
      <Folded label="시작함" count={started.length}>
        {started.map(row)}
      </Folded>
      <Folded label="다 봄" count={finished.length}>
        {finished.map(row)}
      </Folded>
      {form && (
        <MediaForm
          today={today}
          fromWish={{ id: form.w.id, version: form.w.version }}
          focusReview={!form.start}
          preset={{
            kind: (form.w.mediaKind ?? "movie") as MediaKind,
            title: form.w.name,
            coverId: form.w.photos[0]?.id ?? null,
            ...(form.start ? { status: "ongoing", startDate: today, endDate: null } : { status: "done", endDate: today }),
          }}
          close={() => setForm(null)}
          done={() => {
            setForm(null);
            router.refresh();
            toast("작품 기록으로 옮겼어요", { action: { label: form.start ? "기록 보기" : "감상 보기", onClick: () => router.push("/wish/media") } });
          }}
        />
      )}
    </div>
  );
}

export function WishView({ items, today, initialTab }: { items: WishItem[]; today: string; initialTab: "shopping" | "media" }) {
  const router = useRouter();
  const mobile = useIsMobile();
  const [tab, setTab] = useState(initialTab);
  const [form, setForm] = useState<{ edit?: WishItem } | null>(null);
  const [sort, setSort] = useState<Sort>("new");
  const mine = items.filter((w) => w.kind === tab);
  const add = (
    <Button variant={mobile ? "outline" : "default"} onClick={() => setForm({})}>
      <Plus /> 담기
    </Button>
  );
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {/* 쇼핑/작품 전환은 아래 필터와 구분되게 알약 모양(SubTabs와 같은 모양) */}
        <div role="group" aria-label="위시 종류" className="flex gap-1.5">
          {(
            [
              ["shopping", "쇼핑"],
              ["media", "작품"],
            ] as const
          ).map(([x, label]) => (
            <button
              key={x}
              type="button"
              aria-pressed={tab === x}
              onClick={() => {
                setTab(x);
                router.replace(x === "media" ? "/wish?tab=media" : "/wish", { scroll: false });
              }}
              className={cn("rounded-full border px-3 py-1 text-sm max-md:min-h-10", tab === x ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === "shopping" && mine.length > 0 && (
          <Select value={sort} onValueChange={(x) => setSort(x as Sort)}>
            <SelectTrigger size="sm" aria-label="정렬" className="ml-auto max-md:min-h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="new">담은 날</SelectItem>
              <SelectItem value="old">오래 담아둔 순</SelectItem>
              <SelectItem value="price">가격 높은 순</SelectItem>
              <SelectItem value="level">구분 순</SelectItem>
            </SelectContent>
          </Select>
        )}
        {mine.length > 0 && <span className={cn(tab !== "shopping" && "ml-auto")}>{add}</span>}
      </div>
      {tab === "shopping" ? <Shopping items={mine} today={today} add={add} edit={(w) => setForm({ edit: w })} sort={sort} /> : <MediaWishes items={mine} today={today} add={add} edit={(w) => setForm({ edit: w })} />}
      {form && (
        <WishForm
          key={form.edit?.id ?? tab}
          kind={form.edit?.kind ?? tab}
          edit={form.edit}
          close={() => setForm(null)}
          done={() => {
            setForm(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
