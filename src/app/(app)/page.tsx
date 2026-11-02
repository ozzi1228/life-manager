// 홈 (SCR-HOME, 04 §3.1): 인사 + 위젯(고정 구성) — 오늘 일정, 오늘의 습관(칸 체크), 이번 달 예산, 다가오는 결제, 최근 기록
// 건강 등 민감 정보는 홈에 내보내지 않음(10 §7)
// ponytail: 홈 편집(위젯 켜기·끄기·순서, P1)·위젯별 따로 불러오기는 아직 — 한 번에 불러옴
import { BookOpen, ChevronRight, Film, NotebookPen, StickyNote, Tv } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { BudgetBar } from "@/components/app/money";
import { Page } from "@/components/app/page-shell";
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
    <section className="bg-card space-y-3 rounded-xl border p-4 shadow-sm">
      <Link href={href} className="hover:text-link -m-1 flex items-center gap-1 rounded-md p-1">
        <h2 className="font-semibold">{title}</h2>
        {extra}
        <ChevronRight className="text-muted-foreground ml-auto size-4" />
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

  const hidden = new Set(cal.calendars.filter((c) => !c.isVisible).map((c) => c.id));
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
      return { key: m.id, icon: { book: BookOpen, movie: Film, drama: Tv }[m.kind], title: m.title, sub: `${statusLabel(m.kind, m.status)} · ${dayLabel(date, d)}`, date, href: "/records/media" };
    }),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3);

  return (
    <Page>
      <div>
        <p className="text-muted-foreground text-sm">
          {d.getMonth() + 1}월 {d.getDate()}일 {WEEK[d.getDay()]}요일
        </p>
        <h1 className="text-title font-semibold">
          {greet}
          {name ? `, ${name}님` : ""}
        </h1>
      </div>

      <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Widget title="오늘 일정" href={`/calendar?view=day&date=${today}`}>
          {events.length ? (
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
          ) : (
            <div className="space-y-2">
              <p className="text-muted-foreground text-sm">오늘 일정이 없어요</p>
              <Button asChild size="sm" variant="outline">
                <Link href="/calendar?new=1">일정 추가</Link>
              </Button>
            </div>
          )}
        </Widget>

        <Widget title="오늘의 습관" href="/goals/habits">
          {tracker.items.length ? (
            <TodayGoals
              items={tracker.items.map((i) => ({ id: i.id, name: i.name, colorHex: i.colorHex }))}
              done={todayCells.filter((c) => c.done).map((c) => c.itemId)}
              memos={Object.fromEntries(todayCells.map((c) => [c.itemId, c.memo]))}
              today={today}
            />
          ) : (
            <div className="space-y-2">
              <p className="text-muted-foreground text-sm">매일 할 일을 트래커에 추가해 보세요</p>
              <Button asChild size="sm" variant="outline">
                <Link href="/goals/habits">항목 추가</Link>
              </Button>
            </div>
          )}
        </Widget>

        <Widget title="이번 달 예산" href="/money">
          {hasBudget ? (
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
            <div className="space-y-2">
              <p className="text-sm tabular-nums">이번 달 쓴 돈 {money(totals(txs).expense)}</p>
              <Button asChild size="sm" variant="outline">
                <Link href="/money/budget">예산 정하기</Link>
              </Button>
            </div>
          )}
        </Widget>

        <Widget title="다가오는 결제" href="/money/fixed">
          {soon.length ? (
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
          ) : (
            <p className="text-muted-foreground text-sm">7일 안에 나갈 고정 지출이 없어요</p>
          )}
        </Widget>

        <Widget title="최근 기록" href="/records">
          {recent.length ? (
            <ul className="space-y-1">
              {recent.map((r) => (
                <li key={r.key}>
                  <Link href={r.href} className="hover:bg-accent/50 -mx-1 flex items-center gap-2 rounded-md px-1 py-1 text-sm">
                    <r.icon className="text-muted-foreground size-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{r.title}</span>
                    <span className="text-muted-foreground shrink-0 text-caption">{r.sub}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="space-y-2">
              <p className="text-muted-foreground text-sm">오늘 있었던 일을 짧게 남겨 보세요</p>
              <Button asChild size="sm" variant="outline">
                <Link href="/records/journal/new">일기 쓰기</Link>
              </Button>
            </div>
          )}
        </Widget>
      </div>
    </Page>
  );
}
