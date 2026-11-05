"use client";

// 위시: 갖고 싶은 물건·보고 싶은 작품을 한 목록에 (SCR-WISH-01~04, 09). 분류는 이름만(드라마·영화·옷…)
// 담아둠 → 했어요(가격이 있으면 지출 기록도 함께, 없이도) / 그만둠(가격이 있으면 참은 소비로 기록할 수 있음) → 다시 담기
// ponytail: 링크 미리보기·같은 링크 경고는 P1
import { Check, ChevronDown, ExternalLink, Link2, MoreHorizontal, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useContext, useRef, useState } from "react";
import { toast } from "sonner";
import { addWish, buyWish, deleteWish, dropWishAction, editWish, reopenWishAction } from "@/app/actions/wish";
import { MoneyInput, moneyWithForeign } from "@/components/app/money";
import { PhotoPicker, type Photo } from "@/components/app/photo-picker";
import { ResponsiveModal } from "@/components/app/responsive";
import { EmptyState } from "@/components/app/states";
import { CategoryChips } from "@/components/wish/category-chips";
import { useExpenseDialog } from "@/components/money/expense-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useIsMobile } from "@/hooks/use-mobile";
import { dateLabel, fromYmd, money, monthLabel, ymd, type Currency } from "@/lib/format";
import type { ItemCategory } from "@/server/item-categories";
import type { WishInput, WishItem } from "@/server/wish";

const domain = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
};

// 분류 이름(위시 화면이 넣어 줌). 지운 분류·분류 없음은 이름 없음
const CatNames = createContext(new Map<string, string>());
function CatBadge({ w }: { w: WishItem }) {
  const name = useContext(CatNames).get(w.categoryId ?? "");
  return name ? <Badge variant="secondary">{name}</Badge> : null;
}

/** 했어요: 가격이 있으면 지출 입력을 열고(지출 없이도 가능), 없으면 바로 */
function useDone(refresh: () => void) {
  const openExpense = useExpenseDialog();
  return async (w: WishItem, today: string) => {
    if (w.price) {
      const notice = w.restrained?.status === "counted" ? `${monthLabel(w.restrained.month, fromYmd(today))}에 참은 물건이에요. 사면 이번 달 참아야 할 금액에 ${money(w.price)}이 더해져요.` : undefined;
      return openExpense(undefined, { id: w.id, version: w.version, name: w.name, price: w.price, currency: w.currency, foreignAmount: w.foreignAmount, notice, done: refresh });
    }
    const r = await buyWish(crypto.randomUUID(), w.id, w.version, null);
    if (!r.ok) return toast(r.error.message);
    refresh();
  };
}

type Draft = { name: string; categoryId: string | null; price: number | null; currency: Currency; foreignAmount: number | null; seenWhere: string; links: string[]; photos: Photo[] };

function WishForm({ edit, categories, initialCat, close, done }: { edit?: WishItem; categories: ItemCategory[]; initialCat?: string; close: () => void; done: () => void }) {
  const [v, setV] = useState<Draft>({
    name: edit?.name ?? "",
    categoryId: edit ? edit.categoryId : (initialCat ?? null),
    price: edit?.price ?? null,
    currency: edit?.currency ?? "KRW",
    foreignAmount: edit?.foreignAmount ?? null,
    seenWhere: edit?.seenWhere ?? "",
    links: edit?.links.length ? edit.links : [""],
    photos: edit?.photos ?? [],
  });
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field?: string; message: string } | null>(null);
  const key = useRef(crypto.randomUUID());
  const set = <K extends keyof Draft>(k: K, val: Draft[K]) => setV((s) => ({ ...s, [k]: val }));

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
    done();
  }

  const err = (f: string) => error?.field === f && <FieldError>{error.message}</FieldError>;
  return (
    <ResponsiveModal
      open
      onOpenChange={(o) => !o && close()}
      title={edit ? "위시 수정" : "위시 담기"}
      footer={
        <Button className="w-full md:ml-auto md:w-auto" disabled={!v.name.trim() || busy || uploading} onClick={save}>
          {busy && <Spinner />} {edit ? "저장" : "담기"}
        </Button>
      }
    >
      <FieldGroup className="gap-5">
        <Field>
          <FieldLabel htmlFor="wi-name">이름</FieldLabel>
          <Input id="wi-name" autoFocus={!edit} maxLength={100} placeholder="갖고 싶은 것, 보고 싶은 것" className="h-11 text-base md:h-9 md:text-sm" value={v.name} onChange={(e) => set("name", e.target.value)} />
          {err("name")}
        </Field>
        {categories.length > 0 && (
          <Field>
            <FieldLabel>분류</FieldLabel>
            {/* 다시 누르면 분류 없음 */}
            <ToggleGroup type="single" variant="outline" size="sm" value={v.categoryId ?? ""} onValueChange={(id) => set("categoryId", id || null)} aria-label="분류" className="flex-wrap justify-start">
              {categories.map((c) => (
                <ToggleGroupItem key={c.id} value={c.id} className="max-md:h-10">
                  {c.name}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>
        )}
        <Field data-invalid={error?.field === "price" || undefined}>
          <FieldLabel htmlFor="wi-price">가격 (선택)</FieldLabel>
          <MoneyInput
            id="wi-price"
            placeholder="없으면 비워 두세요"
            value={{ amount: v.price, currency: v.currency, foreignAmount: v.foreignAmount }}
            onChange={(m) => setV((s) => ({ ...s, price: m.amount, currency: m.currency, foreignAmount: m.foreignAmount }))}
            invalid={error?.field === "price" || error?.field === "foreignAmount"}
          />
          {err("price")}
          {err("foreignAmount")}
        </Field>
        <Field>
          <FieldLabel>사진</FieldLabel>
          <PhotoPicker value={v.photos} onChange={(fn) => setV((s) => ({ ...s, photos: fn(s.photos) }))} onBusy={setUploading} max={10} purpose="wish_image" label="사진" />
        </Field>
        <Field>
          <FieldLabel htmlFor="wi-link-0">링크</FieldLabel>
          {v.links.map((l, i) => (
            <div key={i} className="flex gap-1">
              <Input id={`wi-link-${i}`} type="url" inputMode="url" placeholder="판매처·소개 글 주소" value={l} onChange={(e) => set("links", v.links.map((x, j) => (j === i ? e.target.value : x)))} />
              {v.links.length > 1 && (
                <Button type="button" variant="ghost" size="icon" aria-label="링크 빼기" onClick={() => set("links", v.links.filter((_, j) => j !== i))}>
                  <X />
                </Button>
              )}
            </div>
          ))}
          {v.links.length < 10 && (
            <div>
              <Button type="button" variant="ghost" size="sm" className="-ml-2" onClick={() => set("links", [...v.links, ""])}>
                <Plus /> 링크 추가
              </Button>
            </div>
          )}
          {err("links")}
        </Field>
        <Field>
          <FieldLabel htmlFor="wi-memo">메모</FieldLabel>
          <Textarea id="wi-memo" maxLength={1000} placeholder="어디서 봤는지, 누가 추천했는지" value={v.seenWhere} onChange={(e) => set("seenWhere", e.target.value)} />
        </Field>
        {error && !["name", "price", "foreignAmount", "links"].includes(error.field ?? "") && <FieldError>{error.message}</FieldError>}
      </FieldGroup>
    </ResponsiveModal>
  );
}

function Detail({ w, today, close, edit, refresh }: { w: WishItem; today: string; close: () => void; edit: () => void; refresh: () => void }) {
  const markDone = useDone(refresh);
  const [dropping, setDropping] = useState(false);
  const [reason, setReason] = useState("");
  const [record, setRecord] = useState(!w.restrained);
  const [askTx, setAskTx] = useState(false);
  const [busy, setBusy] = useState(false);

  async function run(p: Promise<{ ok: boolean; error?: { message: string } }>) {
    setBusy(true);
    const r = await p;
    setBusy(false);
    if (!r.ok) return toast(r.error?.message ?? "잠시 후 다시 시도해 주세요");
    close();
    refresh();
  }
  const remove = () => run(deleteWish(w.id));
  const reopen = (removeTx: boolean) => run(reopenWishAction(w.id, w.version, removeTx));

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
            <Button className="ml-auto" disabled={busy} onClick={() => run(dropWishAction(w.id, w.version, reason.trim() || null, record && !w.restrained && !!w.price))}>
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
          <Button className="ml-auto" disabled={busy} onClick={() => (close(), markDone(w, today))}>
            <Check /> 했어요
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
        <Button className="ml-auto" variant="outline" disabled={busy} onClick={() => (w.hasTx && !w.txGone ? setAskTx(true) : reopen(false))}>
          다시 담기
        </Button>
      </div>
    );

  return (
    <ResponsiveModal open onOpenChange={(o) => !o && close()} title={w.name} footer={footer}>
      <div className="space-y-4 pb-2">
        {w.photos.length > 0 && (
          <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4">
            {w.photos.map((p) => (
              <a key={p.id} href={`/api/v1/attachments/${p.id}?v=body`} target="_blank" rel="noreferrer" className="shrink-0 snap-start">
                {/* eslint-disable-next-line @next/next/no-img-element -- 로그인한 본인만 보는 사진(이 서버가 직접 보냄) */}
                <img src={`/api/v1/attachments/${p.id}?v=body`} alt="" className="h-48 w-auto rounded-lg object-cover" />
              </a>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <CatBadge w={w} />
          {w.status === "bought" && <Badge variant="outline">했어요</Badge>}
          {w.status === "dropped" && <Badge variant="outline">그만둠</Badge>}
          {w.price && <span className="ml-auto font-semibold tabular-nums">{moneyWithForeign({ ...w, amount: w.price })}</span>}
        </div>
        <p className="text-muted-foreground text-sm">
          {dateLabel(ymd(new Date(w.createdAt)), fromYmd(today))}에 담음
          {w.status === "bought" && w.doneAt && ` · ${dateLabel(w.doneAt, fromYmd(today))}에 했어요`}
          {w.status === "dropped" && w.doneAt && ` · ${dateLabel(w.doneAt, fromYmd(today))}에 그만둠`}
        </p>
        {w.restrained && (
          <p className="text-success-text text-sm">
            {monthLabel(w.restrained.month, fromYmd(today))}에 참음{w.restrained.status === "later_bought" && " · 나중에 샀어요"}
          </p>
        )}
        {w.txGone && <p className="bg-warning/15 rounded-md p-2 text-sm">연결된 지출이 삭제됐어요</p>}
        {w.droppedReason && <p className="text-sm">그만둔 이유: {w.droppedReason}</p>}
        {w.seenWhere && <p className="text-sm whitespace-pre-wrap">{w.seenWhere}</p>}
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
    </ResponsiveModal>
  );
}

/** 목록 한 줄: 사진(있으면) · 이름 / 분류·메모 첫 줄 · 가격 · 했어요 체크 */
function Row({ w, today, open, done }: { w: WishItem; today: string; open: () => void; done: (w: WishItem) => void }) {
  const photo = w.photos[0];
  const name = useContext(CatNames).get(w.categoryId ?? "");
  const saved = w.status === "saved";
  return (
    <li className="flex items-center gap-2 pr-2">
      <button type="button" onClick={open} className="hover:bg-accent/50 flex min-h-14 min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left">
        {photo && (
          // eslint-disable-next-line @next/next/no-img-element -- 로그인한 본인만 보는 사진(이 서버가 직접 보냄)
          <img src={`/api/v1/attachments/${photo.id}?v=thumb`} alt="" className="size-10 shrink-0 rounded-md object-cover" />
        )}
        <span className="min-w-0 flex-1">
          <span className={saved ? "block truncate" : "text-muted-foreground block truncate"}>{w.name}</span>
          <span className="text-muted-foreground block truncate text-caption">
            {[
              name,
              saved ? (w.seenWhere?.split("\n")[0] ?? (w.links[0] && domain(w.links[0]))) : w.doneAt && dateLabel(w.doneAt, fromYmd(today)),
              !saved && w.droppedReason,
              w.restrained && `${monthLabel(w.restrained.month, fromYmd(today))}에 참음`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
        {w.price && (
          <span className="shrink-0 text-right text-sm tabular-nums">
            {money(w.price)}
            {w.foreignAmount && <span className="text-muted-foreground block text-caption">{money(w.foreignAmount, { currency: w.currency })}</span>}
          </span>
        )}
      </button>
      {saved && (
        <Button variant="outline" size="icon" className="size-9 shrink-0 rounded-full max-md:size-10" aria-label={`${w.name} 했어요`} title="했어요" onClick={() => done(w)}>
          <Check />
        </Button>
      )}
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
        <ul className="bg-card divide-y rounded-lg border">{children}</ul>
      </CollapsibleContent>
    </Collapsible>
  );
}

type Sort = "new" | "old" | "price";

export function WishView({ items, categories, today }: { items: WishItem[]; categories: ItemCategory[]; today: string }) {
  const router = useRouter();
  const mobile = useIsMobile();
  const refresh = () => router.refresh();
  const markDone = useDone(refresh);
  const [form, setForm] = useState<{ edit?: WishItem } | null>(null);
  const [detail, setDetail] = useState<WishItem | null>(null);
  const [sort, setSort] = useState<Sort>("new");
  const [cat, setCat] = useState("all");
  const names = new Map(categories.map((c) => [c.id, c.name]));
  const inCat = items.filter((w) => cat === "all" || w.categoryId === cat);
  const saved = inCat
    .filter((w) => w.status === "saved")
    .sort((a, b) => (sort === "old" ? a.createdAt.localeCompare(b.createdAt) : sort === "price" ? (b.price ?? 0) - (a.price ?? 0) : b.createdAt.localeCompare(a.createdAt)));
  const done = inCat.filter((w) => w.status === "bought");
  const dropped = inCat.filter((w) => w.status === "dropped");
  const sum = saved.reduce((a, w) => a + (w.price ?? 0), 0);
  const row = (w: WishItem) => <Row key={w.id} w={w} today={today} open={() => setDetail(w)} done={(x) => markDone(x, today)} />;
  const add = (
    <Button variant={mobile ? "outline" : "default"} onClick={() => setForm({})}>
      <Plus /> 담기
    </Button>
  );

  return (
    <CatNames value={names}>
      <div className="space-y-4">
        {/* 분류 칩은 한 줄 통째로(휴대폰에서 옆으로 밀어 봄), 그 아래 개수 · 정렬 · 담기 */}
        <CategoryChips categories={categories} value={cat} onChange={setCat} />
        <div className="flex items-center gap-2">
          <p className="text-muted-foreground mr-auto min-w-0 truncate text-sm tabular-nums">
            {saved.length > 0 && `${saved.length}개${sum > 0 ? ` · ${money(sum)}` : ""}`}
          </p>
          {items.length > 0 && (
            <Select value={sort} onValueChange={(x) => setSort(x as Sort)}>
              <SelectTrigger size="sm" aria-label="정렬" className="shrink-0 max-md:min-h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="new">최근 담은 순</SelectItem>
                <SelectItem value="old">오래 담아둔 순</SelectItem>
                <SelectItem value="price">가격 높은 순</SelectItem>
              </SelectContent>
            </Select>
          )}
          {add}
        </div>
        {!items.length ? (
          <EmptyState pet="pomong" title="갖고 싶은 것, 보고 싶은 것을 담아 두세요" description="물건이든 드라마·영화·공연이든 분류를 만들어 한곳에 모아요." />
        ) : saved.length ? (
          <ul className="bg-card divide-y rounded-lg border">{saved.map(row)}</ul>
        ) : (
          <p className="text-muted-foreground py-8 text-center text-sm">{cat === "all" ? "지금 담아 둔 위시가 없어요" : `‘${names.get(cat)}’에 담아 둔 위시가 없어요`}</p>
        )}
        <Folded label="했어요" count={done.length}>
          {done.map(row)}
        </Folded>
        <Folded label="그만둠" count={dropped.length}>
          {dropped.map(row)}
        </Folded>
        {detail && <Detail key={detail.id + detail.version} w={detail} today={today} close={() => setDetail(null)} edit={() => (setForm({ edit: detail }), setDetail(null))} refresh={refresh} />}
        {form && (
          <WishForm
            key={form.edit?.id ?? "new"}
            edit={form.edit}
            categories={categories}
            initialCat={cat === "all" ? undefined : cat}
            close={() => setForm(null)}
            done={() => {
              setForm(null);
              refresh();
            }}
          />
        )}
      </div>
    </CatNames>
  );
}
