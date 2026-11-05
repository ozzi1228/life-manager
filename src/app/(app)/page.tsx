// 홈 (SCR-HOME, 04 §3.1): 인사 + 위젯(고정 구성) — 오늘 일정, 오늘의 습관(칸 체크), 이번 달 예산, 다가오는 결제, 최근 기록
// 내용 있는 위젯은 카드(같은 줄은 높이 맞춤), 비어 있는 위젯은 아래에 한 줄씩. 모바일은 대시보드 대신 메뉴 바로 가기(HomeMenu)
// ponytail: 모바일에서도 위젯 데이터를 불러옴(CSS로만 숨김) — 느려지면 기기별로 나눠 불러오기
// 건강 등 민감 정보는 홈에 내보내지 않음(10 §7)
// ponytail: 홈 편집(위젯 켜기·끄기·순서, P1)·위젯별 따로 불러오기는 아직 — 한 번에 불러옴
import { BookOpen, ChevronRight, Film, NotebookPen, StickyNote, Tv } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { BudgetBar } from "@/components/app/money";
import { Page } from "@/components/app/page-shell";
import { HomeMenu } from "@/components/home/home-menu";
import { TodayGoals } from "@/components/home/today-goals";
import { Button } from "@/components/ui/button";
import { dayLabel, fromYmd, money, soonLabel } from "@/lib/format";
import { statusLabel } from "@/lib/media";
import { budgetView } from "@/server/budget";
import { rangeView } from "@/server/calendar";
import { monthTransactions, totals } from "@/server/finance";
import { trackerMonth } from "@/server/goals";
import { recentEntries } from "@/server/journal";
import { mediaList } from "@/server/media";
import { upcoming } from "@/server/recurring";
import { pageUser } from "@/server/session";
import { todayIn } from "@/server/time";

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

function Widget({ title, href, extra, children }: { title: string; href: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <section className="bg-card group space-y-3 rounded-xl border p-4 shadow-sm">
      <Link href={href} className="hover:text-link -m-1 flex items-center gap-1 rounded-md p-1">
        <h2 className="font-semibold">{title}</h2>
        {extra}
        <ChevronRight className="text-muted-foreground ml-auto size-4 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100" />
      </Link>
      {children}
    </section>
  );
}

const hm = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${h < 12 ? "오전" : "오후"} ${h % 12 || 12}:${String(m).padStart(2, "0")}`;
};

export default async function Home() {
  const { ctx, name } = await pageUser();
  const today = todayIn();
  const month = today.slice(0, 7);
  const [cal, tracker, view, txs, soon, entries, media] = await Promise.all([
    rangeView(ctx, today, today),
    trackerMonth(ctx, month),
    budgetView(ctx, month),
    monthTransactions(ctx, month, "expense"),
    upcoming(ctx),
    recentEntries(ctx, 2),
    mediaList(ctx),
  ]);

  const hour = Number(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul", hour: "numeric", hourCycle: "h23" }));
  const greet = hour >= 5 && hour < 11 ? "좋은 아침이에요" : hour >= 11 && hour < 18 ? "좋은 하루 보내요" : "편안한 저녁 보내요";
  const d = fromYmd(today);
  const dateLabel = `${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEK[d.getDay()]}요일`;

  const hidden = new Set(cal.calendars.filter((c) => c.hiddenIn.includes("day")).map((c) => c.id)); // 홈 = 오늘, 일 보기와 같은 캘린더
  const events = cal.instances.filter((e) => !hidden.has(e.calendarId));
  const color = (id: string) => cal.calendars.find((c) => c.id === id)?.colorHex ?? "#888";

  const todayCells = tracker.cells.filter((c) => c.date === today);
  const s = view.summary;
  const hasBudget = !!view.budget || view.planned.length > 0;

  // 최근 기록: 일기·작품을 날짜 순으로 섞어 3개
  const recent = [
    ...entries.map((e) => ({ key: e.id, icon: NotebookPen, title: e.title || e.bodyMd.split("\n")[0].slice(0, 40) || "일기", sub: `일기 · ${dayLabel(e.date, d)}`, date: e.date, href: `/records/journal/${e.id}` })),
    ...media.slice(0, 3).map((m) => {
      const date = m.endDate ?? m.startDate ?? today;
      return { key: m.id, icon: { book: BookOpen, movie: Film, drama: Tv }[m.kind], title: m.title, sub: `${statusLabel(m.kind, m.status)} · ${dayLabel(date, d)}`, date, href: "/wish/media" };
    }),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3);

  // 위젯: 내용이 있으면 카드, 비어 있으면(empty) 아래 한 줄 목록으로
  type W = { title: string; href: string; body?: ReactNode; empty?: string; action?: { label: string; href: string } };
  const widgets: W[] = [
    events.length
      ? {
          title: "오늘 일정",
          href: `/calendar?view=day&date=${today}`,
          body: (
            <ul className="space-y-1.5">
              {events.slice(0, 3).map((e) => (
                <li key={e.id + e.occurrenceDate} className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground w-16 shrink-0 tabular-nums">{e.allDay || e.startDate !== today ? "종일" : hm(e.startTime!)}</span>
                  <span className="size-2 shrink-0 rounded-full" style={{ background: color(e.calendarId) }} />
                  <span className="truncate">{e.title}</span>
                </li>
              ))}
              {events.length > 3 && <li className="text-muted-foreground text-sm">+{events.length - 3}개 더</li>}
            </ul>
          ),
        }
      : { title: "오늘 일정", href: `/calendar?view=day&date=${today}`, empty: "오늘 일정이 없어요", action: { label: "일정 추가", href: "/calendar?new=1" } },
    tracker.items.length
      ? {
          title: "오늘의 습관",
          href: "/goals/habits",
          body: (
            <TodayGoals
              key={today} // 날짜가 바뀌어 새로 불러오면 체크 상태도 새로
              items={tracker.items.map((i) => ({ id: i.id, name: i.name, colorHex: i.colorHex }))}
              done={todayCells.filter((c) => c.done).map((c) => c.itemId)}
              memos={Object.fromEntries(todayCells.map((c) => [c.itemId, c.memo]))}
              today={today}
            />
          ),
        }
      : { title: "오늘의 습관", href: "/goals/habits", empty: "매일 할 일을 트래커에 추가해 보세요", action: { label: "항목 추가", href: "/goals/habits" } },
    {
      title: "이번 달 예산",
      href: "/money",
      body: hasBudget ? (
        <>
          <p className={s.left < 0 ? "text-destructive-text text-title font-semibold tabular-nums" : "text-title font-semibold tabular-nums"}>
            {s.left < 0 ? `${money(-s.left)} 초과` : `남은 예산 ${money(s.left)}`}
          </p>
          <p className="text-muted-foreground text-sm tabular-nums">
            {money(s.spent)} / {money(s.total)}
          </p>
          <BudgetBar used={s.spent} planned={s.scheduled} budget={s.total} label="이번 달 예산 사용" compact />
        </>
      ) : (
        <>
          <div>
            <p className="text-muted-foreground text-sm">이번 달 쓴 돈</p>
            <p className="text-title font-semibold tabular-nums">{money(totals(txs).expense)}</p>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href="/money/budget">예산 정하기</Link>
          </Button>
        </>
      ),
    },
    soon.length
      ? {
          title: "다가오는 결제",
          href: "/money/fixed",
          body: (
            <ul className="space-y-1.5">
              {soon.slice(0, 4).map((u) => (
                <li key={u.id + u.date} className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground w-16 shrink-0">{soonLabel(u.date, today)}</span>
                  <span className="min-w-0 flex-1 truncate">{u.name}</span>
                  {u.memo && <StickyNote className="text-muted-foreground size-3.5 shrink-0" aria-label={`메모: ${u.memo.split("\n")[0]}`} />}
                  <span className="shrink-0 tabular-nums">
                    {u.variableAmount && "약 "}
                    {money(u.amount)}
                  </span>
                </li>
              ))}
            </ul>
          ),
        }
      : { title: "다가오는 결제", href: "/money/fixed", empty: "7일 안에 나갈 고정 지출이 없어요" },
    recent.length
      ? {
          title: "최근 기록",
          href: "/records",
          body: (
            <ul className="space-y-1">
              {recent.map((r) => (
                <li key={r.key}>
                  <Link href={r.href} className="hover:bg-accent/50 -mx-1 flex items-center gap-2.5 rounded-md px-1 py-1">
                    <r.icon className="text-muted-foreground size-4 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{r.title}</span>
                      <span className="text-muted-foreground block text-caption">{r.sub}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ),
        }
      : { title: "최근 기록", href: "/records", empty: "오늘 있었던 일을 짧게 남겨 보세요", action: { label: "일기 쓰기", href: "/records/journal/new" } },
  ];
  const full = widgets.filter((w) => !w.empty);
  const empty = widgets.filter((w) => w.empty);

  return (
    <Page>
      <div className="md:hidden">
        <HomeMenu date={dateLabel} greet={name ? `${greet},` : greet} name={name || null} />
      </div>

      {/* PC·태블릿: 대시보드 */}
      <div className="space-y-8 max-md:hidden">
        <div>
          <p className="text-muted-foreground text-sm">{dateLabel}</p>
          <h1 className="text-title font-semibold">
            {greet}
            {name ? `, ${name}님` : ""}
          </h1>
        </div>

        {full.length > 0 && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {full.map((w) => (
              <Widget key={w.title} title={w.title} href={w.href}>
                {w.body}
              </Widget>
            ))}
          </div>
        )}

        {/* 비어 있는 위젯은 한 줄씩 모아 아래에(내용 있는 위젯이 먼저 보이게) */}
        {empty.length > 0 && (
          <section aria-label="비어 있는 항목" className="bg-card grid grid-cols-1 divide-y rounded-xl border px-4 shadow-sm md:grid-cols-2 md:divide-y-0 xl:grid-cols-3">
            {empty.map((w) => (
              <div key={w.title} className="flex min-h-12 items-center gap-2 py-2 text-sm md:pr-4">
                <Link href={w.href} className="hover:text-link shrink-0 font-semibold">
                  {w.title}
                </Link>
                <span className="text-muted-foreground min-w-0 flex-1 break-keep">{w.empty}</span>
                {w.action && (
                  <Button asChild size="sm" variant="ghost" className="text-link shrink-0">
                    <Link href={w.action.href}>{w.action.label}</Link>
                  </Button>
                )}
              </div>
            ))}
          </section>
        )}
      </div>
    </Page>
  );
}
