"use client";

// 지출 내역 검색·필터 (SCR-FIN-02): 검색창(최근 검색), 기간·종류, 필터 시트, 고른 조건 칩. 조건은 모두 주소(?q=&period=&cat=…)에
import { ChevronDown, Clock, ListFilter, Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { AmountInput } from "@/components/app/money";
import { ResponsiveModal } from "@/components/app/responsive";
import { AddExpenseButton, MonthNav } from "@/components/money/controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { money } from "@/lib/format";
import { filterCount, type Period, type TxFilter, type TxType } from "@/lib/tx-search";

type Opt = { id: string; name: string };
export type FilterOptions = { categories: (Opt & { kind: "expense" | "income" })[]; payments: Opt[]; tags: string[] };
type Patch = Record<string, string | string[] | null>;

/** 주소 조건 바꾸기(빈 값·null은 지움). 더 보기(show)는 처음으로 */
export function useFilterNav() {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  return (patch: Patch) => {
    const next = new URLSearchParams(sp);
    next.delete("show");
    for (const [k, v] of Object.entries(patch)) {
      next.delete(k);
      for (const x of [v ?? []].flat().filter(Boolean)) next.append(k, x);
    }
    router.push(`${path}?${next}`, { scroll: false });
  };
}

const md = (d: string, thisYear: string) => `${d.slice(0, 4) === thisYear ? "" : `${d.slice(2, 4)}.`}${+d.slice(5, 7)}.${+d.slice(8)}`;
export function periodLabel(f: TxFilter, today: string) {
  if (f.period === "3m") return "최근 3개월";
  if (f.period === "year") return `${today.slice(0, 4)}년`;
  if (f.period === "all") return "전체 기간";
  if (f.period === "range") return f.from === f.to ? md(f.from!, today.slice(0, 4)) : `${md(f.from!, today.slice(0, 4))} ~ ${md(f.to!, today.slice(0, 4))}`;
  return f.month;
}

export function TxSearch({ f, options, today }: { f: TxFilter; options: FilterOptions; today: string }) {
  const nav = useFilterNav();
  const [open, setOpen] = useState(false);
  const n = filterCount(f);
  const name = (list: Opt[], id: string) => list.find((x) => x.id === id)?.name ?? "지운 항목";
  const amountLabel = f.min !== undefined && f.max !== undefined ? `${money(f.min)} ~ ${money(f.max)}` : f.min !== undefined ? `${money(f.min)} 이상` : `${money(f.max ?? 0)} 이하`;
  const chips: { label: string; clear: Patch }[] = [
    ...f.cats.map((id) => ({ label: name(options.categories, id), clear: { cat: f.cats.filter((x) => x !== id) } })),
    ...f.pms.map((id) => ({ label: name(options.payments, id), clear: { pm: f.pms.filter((x) => x !== id) } })),
    ...f.tags.map((t) => ({ label: `#${t}`, clear: { tag: f.tags.filter((x) => x !== t) } })),
    ...(f.min !== undefined || f.max !== undefined ? [{ label: amountLabel, clear: { min: null, max: null } }] : []),
    ...(f.restraint ? [{ label: "갚기 체크만", clear: { restraint: null } }] : []),
  ];

  return (
    <div className="space-y-3">
      {/* 모바일: 검색·필터 / 기간·종류 두 줄. PC: 한 줄(검색 · 기간 · 종류 · 필터 · 지출 추가) */}
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={f.q} inMonth={f.period === "month"} />
        <Button variant="outline" className="h-11 md:order-3 md:h-9" onClick={() => setOpen(true)}>
          <ListFilter /> 필터
          {n > 0 && <Badge className="h-5 min-w-5 rounded-full px-1.5 tabular-nums">{n}</Badge>}
        </Button>
        <span className="basis-full md:hidden" />
        <span className="md:order-1">
          {f.period === "month" ? (
            <MonthNav month={f.month} />
          ) : (
            <Button variant="outline" className="max-md:h-11" onClick={() => setOpen(true)}>
              {periodLabel(f, today)} <ChevronDown />
            </Button>
          )}
        </span>
        <span className="max-md:w-full md:order-2">
          <TypeFilter value={f.type} />
        </span>
        <span className="ml-auto max-md:hidden md:order-4">
          <AddExpenseButton />
        </span>
      </div>
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((c) => (
            <Button key={c.label} variant="secondary" size="sm" className="h-9 rounded-full md:h-8" aria-label={`${c.label} 조건 빼기`} onClick={() => nav(c.clear)}>
              {c.label} <X />
            </Button>
          ))}
          <Button variant="link" size="sm" onClick={() => nav({ cat: null, pm: null, tag: null, min: null, max: null, restraint: null })}>
            모두 지우기
          </Button>
        </div>
      )}
      <FilterSheet open={open} onOpenChange={setOpen} f={f} options={options} />
    </div>
  );
}

function TypeFilter({ value }: { value: TxType }) {
  const nav = useFilterNav();
  return (
    <ToggleGroup type="single" variant="outline" spacing={0} className="max-md:w-full" value={value} onValueChange={(v) => v && nav({ type: v === "all" ? null : v })} aria-label="종류">
      {(
        [
          ["all", "모두"],
          ["expense", "지출"],
          ["refund", "환불"],
          ["income", "수입"],
        ] as const
      ).map(([v, label]) => (
        <ToggleGroupItem key={v} value={v} className="px-2.5 max-md:h-11 max-md:flex-1">
          {label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

// 최근 검색: 이 기기에만(localStorage)
const KEY = "oona.txSearch.recent";
const loadRecent = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
};
const saveRecent = (list: string[]) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {}
};

function SearchBox({ value, inMonth }: { value: string; inMonth: boolean }) {
  const nav = useFilterNav();
  const [text, setText] = useState(value);
  const [prev, setPrev] = useState(value);
  // 주소가 바뀌면 칸도 맞춤
  if (prev !== value) {
    setPrev(value);
    setText(value);
  }
  const [recent, setRecent] = useState<string[] | null>(null); // null = 닫힘

  function go(q: string) {
    q = q.trim();
    setRecent(null);
    if (q) saveRecent([q, ...loadRecent().filter((x) => x !== q)].slice(0, 8));
    // 달별로 보다가 검색하면 전체 기간에서 찾음(기간은 필터에서 바꿈)
    nav({ q: q || null, ...(q && inMonth ? { period: "all" } : {}) });
    (document.activeElement as HTMLElement | null)?.blur(); // 휴대폰 키보드 내림
  }

  return (
    <form role="search" className="relative min-w-0 flex-1 md:w-72 md:flex-none" onSubmit={(e) => (e.preventDefault(), go(text))}>
      <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
      <Input
        aria-label="내역 검색"
        placeholder="내용·메모·태그 검색"
        enterKeyHint="search"
        maxLength={60}
        className="h-11 pr-10 pl-9 text-base md:h-9 md:text-sm"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={() => setRecent(loadRecent())}
        onBlur={() => setRecent(null)}
      />
      {text && (
        <button type="button" aria-label="검색어 지우기" className="text-muted-foreground absolute top-1/2 right-1 -translate-y-1/2 p-2.5 md:p-1.5" onClick={() => (value ? go("") : setText(""))}>
          <X className="size-4" />
        </button>
      )}
      {!text && !!recent?.length && (
        // 누를 때 칸이 포커스를 잃지 않게(onMouseDown) → 목록이 닫히기 전에 클릭이 들어감
        <div className="bg-popover absolute inset-x-0 top-full z-20 mt-1 rounded-md border p-1 shadow-md" onMouseDown={(e) => e.preventDefault()}>
          <p className="text-muted-foreground flex items-center justify-between px-2 py-1 text-caption">
            최근 검색
            <button type="button" className="hover:text-foreground p-1" onClick={() => (saveRecent([]), setRecent([]))}>
              모두 지우기
            </button>
          </p>
          {recent.map((r) => (
            <div key={r} className="flex items-center">
              <button type="button" className="hover:bg-accent flex min-h-11 flex-1 items-center gap-2 rounded px-2 text-left text-sm md:min-h-9" onClick={() => (setText(r), go(r))}>
                <Clock className="text-muted-foreground size-3.5" /> {r}
              </button>
              <button
                type="button"
                aria-label={`${r} 지우기`}
                className="text-muted-foreground p-2.5 md:p-1.5"
                onClick={() => {
                  const l = recent.filter((x) => x !== r);
                  saveRecent(l);
                  setRecent(l);
                }}
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </form>
  );
}

const PERIODS: [Period, string][] = [
  ["month", "달별"],
  ["3m", "최근 3개월"],
  ["year", "올해"],
  ["all", "전체"],
  ["range", "직접"],
];

function FilterSheet({ open, onOpenChange, f, options }: { open: boolean; onOpenChange: (o: boolean) => void; f: TxFilter; options: FilterOptions }) {
  const nav = useFilterNav();
  const init = () => ({ period: f.period, from: f.from ?? "", to: f.to ?? "", cats: f.cats, pms: f.pms, tags: f.tags, min: f.min ?? null, max: f.max ?? null, restraint: f.restraint });
  const [v, setV] = useState(init);
  const [wasOpen, setWasOpen] = useState(open);
  // 열 때마다 지금 조건으로
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) setV(init());
  }
  const [allCats, setAllCats] = useState(false);
  const toggle = (k: "cats" | "pms" | "tags", x: string) => setV((s) => ({ ...s, [k]: s[k].includes(x) ? s[k].filter((y) => y !== x) : [...s[k], x] }));
  const rangeOk = v.period !== "range" || (!!v.from && !!v.to);

  function apply(clear = false) {
    const p: Patch = clear
      ? { period: null, from: null, to: null, cat: null, pm: null, tag: null, min: null, max: null, restraint: null }
      : {
          period: v.period === "month" ? null : v.period,
          from: v.period === "range" ? v.from : null,
          to: v.period === "range" ? v.to : null,
          cat: v.cats,
          pm: v.pms,
          tag: v.tags,
          min: v.min === null ? null : String(v.min),
          max: v.max === null ? null : String(v.max),
          restraint: v.restraint ? "1" : null,
        };
    // 창이 닫히며 쌓은 기록 칸을 되돌린(뒤로가기) 다음에 주소를 바꿈 — 먼저 바꾸면 그 뒤로가기에 새 주소가 지워짐
    let done = false;
    const run = () => !done && ((done = true), nav(p));
    addEventListener("popstate", () => setTimeout(run), { once: true });
    setTimeout(run, 400);
    onOpenChange(false);
  }

  const chip = "h-10 rounded-full px-3.5 md:h-8";
  const chips = (k: "cats" | "pms" | "tags", items: { id: string; label: string }[]) => (
    <div className="flex flex-wrap gap-1.5">
      {items.map((x) => (
        <Button key={x.id} type="button" variant={v[k].includes(x.id) ? "default" : "outline"} aria-pressed={v[k].includes(x.id)} className={chip} onClick={() => toggle(k, x.id)}>
          {x.label}
        </Button>
      ))}
    </div>
  );
  const cats = [...options.categories.filter((c) => c.kind === "expense"), ...options.categories.filter((c) => c.kind === "income")];
  const shownCats = allCats ? cats : cats.filter((c, i) => i < 8 || v.cats.includes(c.id));

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="필터"
      footer={
        <>
          <Button variant="ghost" onClick={() => apply(true)}>
            초기화
          </Button>
          <Button size="lg" className="h-12 md:h-9 md:flex-none max-md:w-full" disabled={!rangeOk} onClick={() => apply()}>
            적용
          </Button>
        </>
      }
    >
      <div className="space-y-5 pb-2">
        <Field>
          <FieldLabel>기간</FieldLabel>
          <div className="flex flex-wrap gap-1.5">
            {PERIODS.map(([p, label]) => (
              <Button key={p} type="button" variant={v.period === p ? "default" : "outline"} aria-pressed={v.period === p} className={chip} onClick={() => setV((s) => ({ ...s, period: p }))}>
                {label}
              </Button>
            ))}
          </div>
          {v.period === "range" && (
            <div className="flex items-center gap-2">
              <Input type="date" aria-label="시작일" className="h-11 flex-1 md:h-9" value={v.from} onChange={(e) => setV((s) => ({ ...s, from: e.target.value }))} />~
              <Input type="date" aria-label="끝일" className="h-11 flex-1 md:h-9" value={v.to} onChange={(e) => setV((s) => ({ ...s, to: e.target.value }))} />
            </div>
          )}
        </Field>
        <Field>
          <FieldLabel>
            분류 <span className="text-muted-foreground font-normal">· 여러 개 고를 수 있어요</span>
          </FieldLabel>
          {chips("cats", shownCats.map((c) => ({ id: c.id, label: c.kind === "income" ? `${c.name}(수입)` : c.name })))}
          {!allCats && cats.length > shownCats.length && (
            <Button type="button" variant="ghost" size="sm" className="-ml-2 self-start" onClick={() => setAllCats(true)}>
              더 보기 <ChevronDown />
            </Button>
          )}
        </Field>
        {options.payments.length > 0 && (
          <Field>
            <FieldLabel>결제수단</FieldLabel>
            {chips("pms", options.payments.map((p) => ({ id: p.id, label: p.name })))}
          </Field>
        )}
        <Field>
          <FieldLabel>태그</FieldLabel>
          {options.tags.length ? (
            chips("tags", options.tags.slice(0, 40).map((t) => ({ id: t, label: `#${t}` })))
          ) : (
            <p className="text-muted-foreground text-sm">지출을 기록할 때 태그를 달면 여기서 골라 볼 수 있어요</p>
          )}
        </Field>
        <Field>
          <FieldLabel>금액</FieldLabel>
          <div className="flex items-center gap-2 [&_input]:text-base [&>div]:min-w-0 [&>div]:flex-1">
            <label htmlFor="f-min" className="sr-only">
              최소 금액
            </label>
            <AmountInput id="f-min" placeholder="최소" value={v.min} onChange={(min) => setV((s) => ({ ...s, min }))} />~
            <label htmlFor="f-max" className="sr-only">
              최대 금액
            </label>
            <AmountInput id="f-max" placeholder="최대" value={v.max} onChange={(max) => setV((s) => ({ ...s, max }))} />
          </div>
        </Field>
        <label className="flex cursor-pointer items-center gap-2.5 text-sm max-md:py-1">
          <Checkbox className="max-md:size-5" checked={v.restraint} onCheckedChange={(c) => setV((s) => ({ ...s, restraint: c === true }))} />
          참아서 갚기 체크한 것만
        </label>
      </div>
    </ResponsiveModal>
  );
}
