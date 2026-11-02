// 일정 (SCR-CAL-01): ?view=year|month|week|day&date=YYYY-MM-DD, 보는 기간의 메모 함께
import { CalendarView } from "@/components/calendar/calendar";
import { Page } from "@/components/app/page-shell";
import { addDays, dayOfWeek } from "@/lib/calendar";
import { getNote, periodKey, rangeView } from "@/server/calendar";
import { pageCtx } from "@/server/session";
import { todayIn } from "@/server/time";

export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const q = await searchParams;
  const ctx = await pageCtx();
  const today = todayIn();
  const view = (q.view === "year" || q.view === "week" || q.view === "day" ? q.view : "month") as "year" | "month" | "week" | "day";
  const date = typeof q.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(q.date) ? q.date : today;
  // 연: 1월 1일~12월 31일, 월: 그 달 1일이 든 주의 일요일부터 6주, 주: 일요일부터 7일, 일: 그 날
  const first = view === "month" ? `${date.slice(0, 7)}-01` : date;
  const from = view === "year" ? `${date.slice(0, 4)}-01-01` : view === "day" ? date : addDays(first, -dayOfWeek(first));
  const to = view === "year" ? `${date.slice(0, 4)}-12-31` : view === "month" ? addDays(from, 41) : view === "week" ? addDays(from, 6) : date;
  const key = periodKey(view, date);
  const [{ calendars, instances }, saved] = await Promise.all([rangeView(ctx, from, to), getNote(ctx, view, key)]);
  const note = { scope: view, key, id: saved?.id ?? null, version: saved?.version ?? null, body: saved?.body ?? "" };
  return (
    <Page>
      <CalendarView view={view} date={date} from={from} today={today} calendars={calendars} instances={instances} note={note} startNew={q.new === "1"} />
    </Page>
  );
}
