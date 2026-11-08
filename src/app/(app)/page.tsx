// 홈 (SCR-HOME, 04 §3.1): 인사 + 요약 한 줄 → "오늘"(오늘 일정·습관·이번 주·오늘 목표) · "돈"(남은 예산·이번 달 수입·지출·다가오는 결제) → 최근 기록
// 휴대폰은 대시보드 대신 메뉴 바로 가기(HomeMenu). 비어 있는 칸은 카드 안에 한 줄 안내로 — 날마다 배치가 흔들리지 않게
// 건강 등 민감 정보는 홈에 내보내지 않음(10 §7)
// ponytail: 홈 편집(위젯 켜기·끄기·순서, P1)·위젯별 따로 불러오기는 아직 — 한 번에 불러옴
import { ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { BudgetBar } from "@/components/app/money";
import { Page } from "@/components/app/page-shell";
import { HomeGoals } from "@/components/goals/period-goals";
import { HomeMenu } from "@/components/home/home-menu";
import { TodayGoals } from "@/components/home/today-goals";
import { Button } from "@/components/ui/button";
import { dayLabel, fromYmd, money, moneyShort, signClass, signedMoney } from "@/lib/format";
import { textOnly } from "@/lib/journal-body";
import { cn } from "@/lib/utils";
import { budgetView } from "@/server/budget";
import { periodKey, rangeView } from "@/server/calendar";
import { monthTransactions, totals } from "@/server/finance";
import { periodGoals, trackerMonth } from "@/server/goals";
import { recentEntries } from "@/server/journal";
import { upcoming } from "@/server/recurring";
import { pageUser } from "@/server/session";
import { todayIn } from "@/server/time";

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const hm = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${h < 12 ? "오전" : "오후"} ${h % 12 || 12}:${String(m).padStart(2, "0")}`;
};
/** 짧은 날짜: 오늘·내일·모레, 그 뒤는 11/10 — 한 줄에 들어가게(요일 없이) */
const short = (d: string, today: string) => {
  const n = Math.round((fromYmd(d).getTime() - fromYmd(today).getTime()) / 86_400_000);
  return n === 0 ? "오늘" : n === 1 ? "내일" : n === 2 ? "모레" : `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;
};

/** 카드: 제목(누르면 그 화면) + 내용 */
function Card({ title, href, link, className, children }: { title: string; href: string; link: string; className?: string; children: ReactNode }) {
  return (
    <section className={cn("bg-card space-y-3 rounded-xl border p-4 shadow-sm", className)}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        <Link href={href} className="text-muted-foreground hover:text-link -mr-1 inline-flex min-h-9 items-center gap-0.5 px-1 text-sm">
          {link} <ChevronRight className="size-4" />
        </Link>
      </div>
      {children}
    </section>
  );
}
const Sub = ({ children }: { children: ReactNode }) => <p className="text-muted-foreground text-caption">{children}</p>;
/** 비어 있을 때 한 줄 안내 + 바로 가기 */
const Empty = ({ text, href, action }: { text: string; href: string; action: string }) => (
  <div className="text-muted-foreground flex min-h-9 items-center gap-2 text-sm">
    <span className="min-w-0 flex-1">{text}</span>
    <Button asChild size="sm" variant="ghost" className="text-link shrink-0">
      <Link href={href}>
        <Plus /> {action}
      </Link>
    </Button>
  </div>
);

export default async function Home() {
  const { ctx, name } = await pageUser();
  const today = todayIn();
  const month = today.slice(0, 7);
  const [cal, tracker, view, txs, soon, entries, weekGoals, dayGoals] = await Promise.all([
    rangeView(ctx, today, today),
    trackerMonth(ctx, month),
    budgetView(ctx, month),
    monthTransactions(ctx, month),
    upcoming(ctx),
    recentEntries(ctx, 3),
    periodGoals(ctx, "week", periodKey("week", today)),
    periodGoals(ctx, "day", today),
  ]);

  const hour = Number(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul", hour: "numeric", hourCycle: "h23" }));
  const greet = hour >= 5 && hour < 11 ? "좋은 아침이에요" : hour >= 11 && hour < 18 ? "좋은 하루 보내요" : "편안한 저녁 보내요";
  const d = fromYmd(today);
  const dateLabel = `${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEK[d.getDay()]}요일`;

  // 일정: 일 보기에서 숨긴 캘린더는 빼고
  const hidden = new Set(cal.calendars.filter((x) => x.hiddenIn.includes("day")).map((x) => x.id));
  const events = cal.instances.filter((e) => !hidden.has(e.calendarId));
  const color = (id: string) => cal.calendars.find((c) => c.id === id)?.colorHex ?? "#888";

  const todayCells = tracker.cells.filter((c) => c.date === today);
  const habitsDone = todayCells.filter((c) => c.done && tracker.items.some((i) => i.id === c.itemId)).length;
  const goalsAll = [...weekGoals, ...dayGoals];
  const s = view.summary;
  const hasBudget = !!view.budget || view.planned.length > 0;
  const t = totals(txs);

  const chips = [
    `일정 ${events.length}`,
    tracker.items.length > 0 && `습관 ${habitsDone}/${tracker.items.length}`,
    goalsAll.length > 0 && `목표 ${goalsAll.filter((g) => g.status === "done").length}/${goalsAll.length}`,
    hasBudget && (s.left < 0 ? `예산 ${moneyShort(-s.left)} 초과` : `남은 예산 ${moneyShort(s.left)}`),
  ].filter(Boolean) as string[];

  return (
    <Page>
      <div className="md:hidden">
        <HomeMenu date={dateLabel} greet={name ? `${greet},` : greet} name={name || null} />
      </div>
      <div className="space-y-6 max-md:hidden">
        <div className="space-y-2">
          <p className="text-muted-foreground text-sm">{dateLabel}</p>
          <h1 className="text-title font-semibold">
            {greet}
            {name ? `, ${name}님` : ""}
          </h1>
          <ul className="flex flex-wrap gap-1.5" aria-label="오늘 요약">
            {chips.map((c) => (
              <li key={c} className="bg-card text-muted-foreground rounded-full border px-2.5 py-0.5 text-caption tabular-nums">
                {c}
              </li>
            ))}
          </ul>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] md:items-start">
          {/* 오늘: 일정 · 습관 · 이번 주·오늘 목표 */}
          <Card title="오늘" href={`/calendar?view=day&date=${today}`} link="일정 보기">
            <div className="space-y-1">
              <Sub>일정</Sub>
              {events.length ? (
                <ul className="space-y-1.5">
                  {events.slice(0, 4).map((e) => (
                    <li key={e.id + e.occurrenceDate} className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground w-16 shrink-0 tabular-nums">{e.allDay || e.startDate !== today ? "종일" : hm(e.startTime!)}</span>
                      <span className="size-2 shrink-0 rounded-full" style={{ background: color(e.calendarId) }} />
                      <span className="truncate">{e.title}</span>
                    </li>
                  ))}
                  {events.length > 4 && <li className="text-muted-foreground text-sm">+{events.length - 4}개 더</li>}
                </ul>
              ) : (
                <Empty text="오늘 일정이 없어요" href="/calendar?new=1" action="일정" />
              )}
            </div>
            <div className="space-y-1 border-t pt-3">
              <Sub>습관</Sub>
              {tracker.items.length ? (
                <TodayGoals
                  key={today} // 날짜가 바뀌어 새로 불러오면 체크 상태도 새로
                  items={tracker.items.map((i) => ({ id: i.id, name: i.name, colorHex: i.colorHex }))}
                  done={todayCells.filter((c) => c.done).map((c) => c.itemId)}
                  memos={Object.fromEntries(todayCells.map((c) => [c.itemId, c.memo]))}
                  today={today}
                />
              ) : (
                <Empty text="매일 할 일을 트래커에 넣어 보세요" href="/goals/habits" action="습관" />
              )}
            </div>
            <div className="space-y-1 border-t pt-3">
              <Sub>이번 주 목표</Sub>
              {goalsAll.length ? <HomeGoals week={weekGoals} day={dayGoals} /> : <Empty text="이번 주에 이룰 목표를 적어 보세요" href="/goals/week" action="목표" />}
            </div>
          </Card>

          {/* 돈: 남은 예산 · 이번 달 수입·지출 · 다가오는 결제·입금 */}
          <Card title="돈" href="/money" link="가계부">
            {hasBudget ? (
              <div className="space-y-1.5">
                <Sub>{s.left < 0 ? "예산 초과" : "남은 예산"}</Sub>
                <p className={cn("text-title font-semibold tabular-nums", s.left < 0 && "text-over-text")}>{money(Math.abs(s.left))}</p>
                <BudgetBar used={s.spent} planned={s.scheduled} budget={s.total} label="이번 달 예산 사용" compact />
                <p className="text-muted-foreground flex justify-between text-caption tabular-nums">
                  <span>쓴 돈 {money(s.spent)}</span>
                  <span>예산 {money(s.total)}</span>
                </p>
              </div>
            ) : (
              <Empty text="예산을 정하면 남은 돈을 알려 드려요" href="/money/budget" action="예산" />
            )}
            <div className="flex items-center gap-3 border-t pt-3 text-sm tabular-nums">
              <span className="text-muted-foreground mr-auto">이번 달</span>
              <span className={signClass(t.income)}>{signedMoney(t.income)}</span>
              <span className={signClass(-t.expense)}>{signedMoney(-t.expense)}</span>
            </div>
            <div className="space-y-1 border-t pt-3">
              <Sub>다가오는 결제·입금</Sub>
              {soon.length ? (
                <ul className="space-y-1.5">
                  {soon.slice(0, 4).map((u) => (
                    <li key={u.id + u.date} className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground w-11 shrink-0 tabular-nums">{short(u.date, today)}</span>
                      <span className="min-w-0 flex-1 truncate">{u.name}</span>
                      <span className={`shrink-0 tabular-nums ${signClass(u.type === "income" ? 1 : -1)}`}>
                        {u.variableAmount && "약 "}
                        {signedMoney(u.type === "income" ? u.amount : -u.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty text="7일 안에 오갈 고정 수입·지출이 없어요" href="/money/fixed" action="고정" />
              )}
            </div>
          </Card>
        </div>

        {/* 최근 기록: 일기 3개를 가로로(사진이 있으면 작은 사진) */}
        <Card title="최근 기록" href="/records" link="일기">
          {entries.length ? (
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {entries.map((e) => {
                const text = textOnly(e.bodyMd);
                return (
                  <li key={e.id}>
                    <Link href={`/records/journal/${e.id}`} className="hover:bg-accent/50 -m-1 flex items-center gap-2.5 rounded-md p-1">
                      {e.cover && (
                        // eslint-disable-next-line @next/next/no-img-element -- 본인만 보는 사진(이 서버가 직접 보냄)
                        <img src={`/api/v1/attachments/${e.cover}?v=thumb`} alt="" loading="lazy" className="size-10 shrink-0 rounded-md object-cover" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{e.title || text.split("\n")[0].slice(0, 40) || "사진"}</span>
                        <span className="text-muted-foreground block text-caption">{e.date ? dayLabel(e.date, d) : "날짜 없음"}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty text="오늘 있었던 일을 짧게 남겨 보세요" href="/records/journal/new" action="일기 쓰기" />
          )}
        </Card>
      </div>
    </Page>
  );
}
