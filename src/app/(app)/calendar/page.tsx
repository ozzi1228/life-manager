// 일정 (SCR-CAL-01): ?view=month|week|day&date=YYYY-MM-DD
import { CalendarView } from "@/components/calendar/calendar";
import { Page } from "@/components/app/page-shell";
import { addDays, dayOfWeek } from "@/lib/calendar";
import { rangeView } from "@/server/calendar";
import { pageCtx } from "@/server/session";
import { todayIn } from "@/server/time";

export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const q = await searchParams;
  const ctx = await pageCtx();
  const today = todayIn();
  const view = q.view === "week" || q.view === "day" ? q.view : "month";
  const date = typeof q.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(q.date) ? q.date : today;
  // 월: 그 달 1일이 든 주의 일요일부터 6주, 주: 일요일부터 7일, 일: 그 날
  const first = view === "month" ? `${date.slice(0, 7)}-01` : date;
  const from = view === "day" ? date : addDays(first, -dayOfWeek(first));
  const to = view === "month" ? addDays(from, 41) : view === "week" ? addDays(from, 6) : date;
  const { calendars, instances } = await rangeView(ctx, from, to);
  return (
    <Page>
      <CalendarView view={view} date={date} from={from} today={today} calendars={calendars} instances={instances} />
    </Page>
  );
}
