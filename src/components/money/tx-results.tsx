"use client";

// 지출 내역 결과 (SCR-FIN-02): 요약 + 목록 / 통계. 모바일은 목록·통계를 탭으로, PC는 목록 오른쪽에 통계
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { useExpenseDialog } from "@/components/money/expense-dialog";
import { TxList, type TxRow } from "@/components/money/tx-list";
import { useFilterNav } from "@/components/money/tx-search";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { dayLabel, fromYmd, money } from "@/lib/format";
import type { Part, STx, TxStats } from "@/lib/tx-search";
import { cn } from "@/lib/utils";

type Names = Record<string, string>;
type Stats = TxStats<TxRow & STx>;
const card = "bg-card space-y-3 rounded-xl border p-4";

export function TxResults({ rows, stats, categories, payments, today, capped }: { rows: TxRow[]; stats: Stats; categories: Names; payments: Names; today: string; capped: boolean }) {
  const nav = useFilterNav();
  const [view, setView] = useState<"list" | "stats">("list");
  const summary = <Summary s={stats} capped={capped} />;
  return (
    <div className="md:grid md:grid-cols-[minmax(0,1fr)_340px] md:items-start md:gap-6">
      <div className="space-y-3 md:hidden">
        {summary}
        <ToggleGroup type="single" variant="outline" value={view} onValueChange={(v) => v && setView(v as typeof view)} className="w-full" aria-label="보기">
          <ToggleGroupItem value="list" className="h-11 flex-1">
            목록
          </ToggleGroupItem>
          <ToggleGroupItem value="stats" className="h-11 flex-1">
            통계
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className={cn("space-y-4 max-md:mt-4", view !== "list" && "max-md:hidden")}>
        <TxList rows={rows} categories={categories} payments={payments} today={today} />
        {stats.count > rows.length && (
          <Button variant="outline" className="h-11 w-full md:h-9" onClick={() => nav({ show: String(rows.length + 200) })}>
            더 보기 <span className="text-muted-foreground">· {stats.count - rows.length}건 남음</span>
          </Button>
        )}
      </div>
      <aside className={cn("space-y-3 max-md:mt-4", view !== "stats" && "max-md:hidden")} aria-label="통계">
        <div className="max-md:hidden">{summary}</div>
        <Trend s={stats} today={today} />
        <Breakdown s={stats} categories={categories} payments={payments} />
        <Top s={stats} today={today} categories={categories} />
      </aside>
    </div>
  );
}

function Summary({ s, capped }: { s: Stats; capped: boolean }) {
  const extra = [s.kind === "expense" && s.income > 0 && `수입 ${money(s.income)}`, s.refund > 0 && `환불 ${money(s.refund)}`, s.restraint !== 0 && `갚기 체크 ${money(s.restraint)}`].filter(Boolean);
  return (
    <section className={card} aria-label="요약">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-muted-foreground text-sm">{s.kind === "income" ? "수입 합계" : "지출 합계"}</span>
        <span className="text-title font-bold tabular-nums">{money(s.total)}</span>
      </div>
      <dl className="grid grid-cols-3 gap-2 text-sm">
        {(
          [
            ["건수", `${s.count.toLocaleString("ko-KR")}건`],
            ["평균", money(s.avg)],
            ["가장 큰", money(s.top[0]?.amount ?? 0)],
          ] as const
        ).map(([k, v]) => (
          <div key={k}>
            <dt className="text-muted-foreground text-caption">{k}</dt>
            <dd className="font-semibold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      {extra.length > 0 && <p className="text-muted-foreground text-caption tabular-nums">{extra.join(" · ")}</p>}
      {capped && <p className="text-caption">최근 5,000건까지만 셌어요. 기간을 좁혀 보세요</p>}
    </section>
  );
}

/** 흐름: 날짜별(62일 이하)·달별 막대. 막대를 누르면 그날·그달만 */
function Trend({ s, today }: { s: Stats; today: string }) {
  const nav = useFilterNav();
  const pts = s.trend.points;
  if (pts.length < 2) return null;
  const peak = Math.max(...pts.map((p) => p.amount), 1);
  const month = s.trend.unit === "month";
  const label = (k: string) => (month ? (k.slice(0, 4) === today.slice(0, 4) ? `${+k.slice(5)}월` : `${k.slice(2, 4)}년 ${+k.slice(5)}월`) : `${+k.slice(5, 7)}/${+k.slice(8)}`);
  const pick = (k: string) => nav(month ? { period: null, from: null, to: null, month: k } : { period: "range", from: k, to: k });
  return (
    <section className={card}>
      <h3 className="font-semibold">
        흐름 <span className="text-muted-foreground text-sm font-normal">· {month ? "달별" : "날짜별"} {s.kind === "income" ? "수입" : "지출"}</span>
      </h3>
      <div className="flex h-28 items-end gap-0.5 border-b">
        {pts.map((p) => (
          <button
            key={p.key}
            type="button"
            title={`${label(p.key)} ${money(p.amount)}`}
            aria-label={`${month ? label(p.key) : dayLabel(p.key, fromYmd(today))} ${money(p.amount)}${p.count ? ` · ${p.count}건` : ""}`}
            className="group flex h-full min-w-0 flex-1 items-end"
            onClick={() => pick(p.key)}
          >
            <span className={cn("w-full rounded-t-[4px] group-hover:bg-primary", p.amount === peak ? "bg-primary" : "bg-primary/55")} style={{ height: `${(Math.max(0, p.amount) / peak) * 100}%` }} />
          </button>
        ))}
      </div>
      <div className="text-muted-foreground flex justify-between text-caption">
        <span>{label(pts[0].key)}</span>
        <span>가장 많은 {month ? "달" : "날"} {money(peak)}</span>
        <span>{label(pts.at(-1)!.key)}</span>
      </div>
    </section>
  );
}

/** 분류·태그·결제수단별. 모바일은 셋을 차례로, PC는 하나씩 골라 봄. 항목을 누르면 그 조건으로 거름 */
function Breakdown({ s, categories, payments }: { s: Stats; categories: Names; payments: Names }) {
  const nav = useFilterNav();
  const [tab, setTab] = useState<"cat" | "tag" | "pm">("cat");
  const sections = [
    { k: "cat", title: "분류별", parts: s.byCategory, name: (id: string) => categories[id] ?? "지운 분류", share: true, pick: (id: string) => nav({ cat: [id] }) },
    { k: "tag", title: "태그별", parts: s.byTag, name: (t: string) => (t ? `#${t}` : "태그 없음"), share: false, pick: (t: string) => t && nav({ tag: [t] }) },
    { k: "pm", title: "결제수단별", parts: s.byPayment, name: (id: string) => (id ? (payments[id] ?? "지운 결제수단") : "결제수단 없음"), share: true, pick: (id: string) => id && nav({ pm: [id] }) },
  ] as const;
  if (!s.count) return null;
  return (
    <div className="space-y-3 md:bg-card md:rounded-xl md:border md:p-4">
      <ToggleGroup type="single" variant="outline" size="sm" value={tab} onValueChange={(v) => v && setTab(v as typeof tab)} className="w-full max-md:hidden" aria-label="나눠 보기">
        {sections.map((x) => (
          <ToggleGroupItem key={x.k} value={x.k} className="flex-1">
            {x.title.replace("별", "")}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {sections.map((x) => (
        <section key={x.k} className={cn(card, "md:space-y-2 md:rounded-none md:border-0 md:bg-transparent md:p-0", tab !== x.k && "md:hidden")}>
          <h3 className="font-semibold md:sr-only">
            {x.title} {x.k === "tag" && <span className="text-muted-foreground text-sm font-normal">· 태그마다 따로 더해요</span>}
          </h3>
          <Parts parts={x.parts} total={s.total} name={x.name} share={x.share} pick={x.pick} />
        </section>
      ))}
    </div>
  );
}

function Parts({ parts, total, name, share, pick }: { parts: readonly Part[]; total: number; name: (k: string) => string; share: boolean; pick: (k: string) => unknown }) {
  const [all, setAll] = useState(false);
  const shown = all ? parts : parts.slice(0, 6);
  return (
    <ul className="-mx-2">
      {shown.map((p) => {
        const pct = total > 0 ? Math.max(0, Math.round((p.amount / total) * 100)) : 0;
        return (
          <li key={p.key}>
            <button type="button" className="hover:bg-accent/50 w-full space-y-1 rounded-md px-2 py-2 text-left" onClick={() => pick(p.key)}>
              <span className="flex justify-between gap-2 text-sm">
                <span className={cn("truncate", !p.key && "text-muted-foreground")}>{name(p.key)}</span>
                <span className="shrink-0 tabular-nums">
                  {money(p.amount)} <span className="text-muted-foreground">{share ? `${pct}%` : `${p.count}건`}</span>
                </span>
              </span>
              {share && (
                <span className="bg-muted block h-1.5 rounded-full">
                  <span className="bg-primary block h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                </span>
              )}
            </button>
          </li>
        );
      })}
      {!all && parts.length > shown.length && (
        <li>
          <Button variant="ghost" size="sm" className="ml-1" onClick={() => setAll(true)}>
            그 외 {parts.length - shown.length}개 <ChevronDown />
          </Button>
        </li>
      )}
    </ul>
  );
}

function Top({ s, today, categories }: { s: Stats; today: string; categories: Names }) {
  const open = useExpenseDialog();
  if (s.top.length < 2) return null;
  return (
    <section className={card}>
      <h3 className="font-semibold">큰 {s.kind === "income" ? "수입" : "지출"} TOP {s.top.length}</h3>
      <ul className="-mx-2">
        {s.top.map((r) => (
          <li key={r.id}>
            <button type="button" className="hover:bg-accent/50 flex min-h-11 w-full items-center justify-between gap-2 rounded-md px-2 text-left text-sm md:min-h-9" onClick={() => open(r)}>
              <span className="truncate">
                {r.title || categories[r.categoryId] || "분류 없음"} <span className="text-muted-foreground">· {dayLabel(r.date, fromYmd(today))}</span>
              </span>
              <span className="shrink-0 tabular-nums">{money(r.amount)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
