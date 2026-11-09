// 일정 (SCR-CAL-01): ?view=year|month|week|day&date=YYYY-MM-DD, 보는 기간의 메모·목표 함께(D-072)
import { CalendarView } from "@/components/calendar/calendar";
import { Page } from "@/components/app/page-shell";
import { addDays, weekStartOf } from "@/lib/calendar";
import { getNote, periodKey, rangeView } from "@/server/calendar";
import { googleStatus } from "@/server/google-calendar";
import { periodGoals } from "@/server/goals";
import { pageCtx } from "@/server/session";
import { todayIn } from "@/server/time";

export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const q = await searchParams;
  const ctx = await pageCtx();
  const today = todayIn();
  const view = (q.view === "year" || q.view === "week" || q.view === "day" ? q.view : "month") as "year" | "month" | "week" | "day";
  const date = typeof q.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(q.date) ? q.date : today;
  // 연: 1월 1일~12월 31일, 월: 그 달 1일이 든 주의 월요일부터 6주, 주: 월요일부터 7일, 일: 그 날
  const first = view === "month" ? `${date.slice(0, 7)}-01` : date;
  const from = view === "year" ? `${date.slice(0, 4)}-01-01` : view === "day" ? date : weekStartOf(first);
  const to = view === "year" ? `${date.slice(0, 4)}-12-31` : view === "month" ? addDays(from, 41) : view === "week" ? addDays(from, 6) : date;
  const key = periodKey(view, date);
  const [{ calendars, instances }, saved, goals, google, all] = await Promise.all([rangeView(ctx, from, to), getNote(ctx, view, key), periodGoals(ctx, view, key), googleStatus(ctx), getNote(ctx, "all", "all")]);
  const note = { scope: view, key, id: saved?.id ?? null, version: saved?.version ?? null, body: saved?.body ?? "" };
  const memo = { scope: "all" as const, key: "all", id: all?.id ?? null, version: all?.version ?? null, body: all?.body ?? "" };
  return (
    <Page>
      <CalendarView view={view} date={date} from={from} today={today} calendars={calendars} instances={instances} note={note} memo={memo} goals={goals} google={google} startNew={q.new === "1"} />
    </Page>
  );
}
