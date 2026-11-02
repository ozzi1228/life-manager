"use client";

// 일정 (SCR-CAL-01~03, 04 §4): 월·주·일 보기, 선택한 날 목록, 상세, 추가·수정(반복), 반복 범위 고르기, 내 캘린더 관리
// 주소: /calendar?view=month|week|day&date=YYYY-MM-DD. 키보드: T 오늘, M/W/D 보기
// ponytail: 칩 끌어 옮기기·주간 드래그로 시간 고르기·모바일 스와이프는 아직 — 빈 칸 누르기(PC 두 번 클릭)로 그 날·그 시간 추가
import { ChevronLeft, ChevronRight, Clock, MapPin, Plus, Repeat, Settings2, StickyNote } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { addCalendar, addEvent, editCalendar, editEvent, removeCalendar, removeEvent, restoreCalendar, saveCalendarNote, showCalendar, undoRemoveEvent } from "@/app/actions/calendar";
import { ColorPalettePicker } from "@/components/app/color-picker";
import { ResponsiveDetail, ResponsiveModal } from "@/components/app/responsive";
import { toastUndo } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useIsMobile } from "@/hooks/use-mobile";
import { addDays, dayOfWeek, daysBetween, parseRule, ruleLabel, ruleString, type Freq, type Rule } from "@/lib/calendar";
import { fromYmd, ymd } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CalendarItem, EventInput, Instance, NoteScope, Scope } from "@/server/calendar";

type View = "year" | "month" | "week" | "day";
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const HOUR = 48; // 시간축 한 시간 높이(px)

const md = (d: string) => `${+d.slice(5, 7)}월 ${+d.slice(8)}일`;
const dayTitle = (d: string) => `${md(d)} (${WEEK[dayOfWeek(d)]})`;
/** "14:30" → "오후 2:30" */
export const hmLabel = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${h < 12 ? "오전" : "오후"} ${h % 12 || 12}:${String(m).padStart(2, "0")}`;
};
const minutes = (t: string | null) => (t ? +t.slice(0, 2) * 60 + +t.slice(3) : 0);
const toHm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
function whenLabel(e: Pick<Instance, "allDay" | "startDate" | "startTime" | "endDate" | "endTime">) {
  const sameDay = e.startDate === e.endDate;
  if (e.allDay) return sameDay ? `${dayTitle(e.startDate)} 종일` : `${dayTitle(e.startDate)} ~ ${dayTitle(e.endDate)}`;
  return sameDay ? `${dayTitle(e.startDate)} ${hmLabel(e.startTime!)} ~ ${hmLabel(e.endTime!)}` : `${dayTitle(e.startDate)} ${hmLabel(e.startTime!)} ~ ${dayTitle(e.endDate)} ${hmLabel(e.endTime!)}`;
}
const onDay = (e: Instance, d: string) => e.startDate <= d && e.endDate >= d;
const tint = (hex: string) => ({ background: `${hex}26`, borderLeft: `3px solid ${hex}` });

// ── 일정 칩·행 ──

function Chip({ e, color, onOpen, day }: { e: Instance; color: string; onOpen: () => void; day: string }) {
  return (
    <button
      type="button"
      onClick={(ev) => (ev.stopPropagation(), onOpen())}
      onDoubleClick={(ev) => ev.stopPropagation()}
      title={`${e.title} · ${whenLabel(e)}`}
      className="block w-full truncate rounded-sm px-1 text-left text-caption leading-5 hover:brightness-95"
      style={tint(color)}
    >
      {!e.allDay && e.startDate === day && <span className="text-muted-foreground mr-1 tabular-nums max-xl:hidden">{e.startTime}</span>}
      {e.title}
    </button>
  );
}

function Row({ e, color, onOpen, day }: { e: Instance; color: string; onOpen: () => void; day: string }) {
  return (
    <li>
      <button type="button" onClick={onOpen} className="hover:bg-accent/50 flex w-full items-start gap-3 rounded-md px-2 py-2 text-left">
        <span className="text-muted-foreground w-16 shrink-0 text-sm tabular-nums">{e.allDay || e.startDate !== day ? (e.allDay ? "종일" : "이어서") : hmLabel(e.startTime!)}</span>
        <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: color }} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1">
            <span className="truncate">{e.title}</span>
            {e.rrule && <Repeat className="text-muted-foreground size-3.5 shrink-0" aria-label="반복" />}
          </span>
          {e.location && <span className="text-muted-foreground block truncate text-caption">{e.location}</span>}
        </span>
      </button>
    </li>
  );
}

function DayList({ day, items, color, open, add, today, compact }: { day: string; items: Instance[]; color: (e: Instance) => string; open: (e: Instance) => void; add: () => void; today: string; compact?: boolean }) {
  // compact(모바일 주 보기): 머리 줄에 + 버튼, 빈 날은 한 줄
  return (
    <section className={compact ? "space-y-1" : "space-y-2"}>
      <div className="flex items-center gap-2">
        <h2 className="font-semibold">
          {dayTitle(day)} {day === today && <span className="text-link text-sm">오늘</span>}
        </h2>
        {compact && !items.length && <span className="text-muted-foreground text-sm">일정 없음</span>}
        {compact && (
          <Button variant="ghost" size="icon" className="ml-auto size-9" aria-label={`${dayTitle(day)} 일정 추가`} onClick={add}>
            <Plus />
          </Button>
        )}
      </div>
      {items.length > 0 ? (
        <ul>
          {items.map((e) => (
            <Row key={e.id + e.occurrenceDate} e={e} color={color(e)} onOpen={() => open(e)} day={day} />
          ))}
        </ul>
      ) : (
        !compact && <p className="text-muted-foreground py-2 text-sm">일정이 없어요</p>
      )}
      {!compact && (
        <Button variant="outline" size="sm" onClick={add}>
          <Plus /> 이 날 일정 추가
        </Button>
      )}
    </section>
  );
}

// ── 월 보기 ──

function MonthGrid({ from, month, selected, today, items, color, select, open, add, mobile }: { from: string; month: string; selected: string; today: string; items: Instance[]; color: (e: Instance) => string; select: (d: string) => void; open: (e: Instance) => void; add: (d: string) => void; mobile: boolean }) {
  const days = Array.from({ length: 42 }, (_, i) => addDays(from, i));
  const rows = days[35].slice(0, 7) === month ? 6 : 5;
  return (
    <div className="rounded-lg border">
      <div className="grid grid-cols-7 border-b text-center text-caption">
        {WEEK.map((w, i) => (
          <span key={w} className={cn("py-1.5", i === 0 ? "text-destructive-text" : "text-muted-foreground")}>
            {w}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7" role="grid" aria-label={`${+month.slice(5)}월`}>
        {days.slice(0, rows * 7).map((d) => {
          const list = items.filter((e) => onDay(e, d));
          const out = d.slice(0, 7) !== month;
          const max = 3;
          return (
            <div
              key={d}
              role="gridcell"
              aria-label={`${dayTitle(d)}${list.length ? `, 일정 ${list.length}개` : ""}`}
              aria-selected={d === selected}
              tabIndex={d === selected ? 0 : -1}
              onClick={() => select(d)}
              onDoubleClick={() => add(d)}
              onKeyDown={(ev) => ev.key === "Enter" && add(d)}
              className={cn("min-h-16 cursor-pointer border-r border-b p-1 text-left md:min-h-24", out && "bg-muted/40", d === selected && "bg-accent/60")}
            >
              <span
                className={cn(
                  "inline-flex size-6 items-center justify-center rounded-full text-caption tabular-nums",
                  d === today ? "bg-primary text-primary-foreground font-semibold" : out ? "text-muted-foreground/60" : dayOfWeek(d) === 0 ? "text-destructive-text" : "text-muted-foreground",
                )}
              >
                {+d.slice(8)}
              </span>
              {mobile ? (
                <span className="flex justify-center gap-0.5 pt-0.5">
                  {list.slice(0, 3).map((e) => (
                    <span key={e.id + e.occurrenceDate} className="size-1.5 rounded-full" style={{ background: color(e) }} />
                  ))}
                </span>
              ) : (
                <div className="space-y-0.5">
                  {list.slice(0, max).map((e) => (
                    <Chip key={e.id + e.occurrenceDate} e={e} color={color(e)} onOpen={() => open(e)} day={d} />
                  ))}
                  {list.length > max && <span className="text-muted-foreground block px-1 text-caption">+{list.length - max}</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 주·일 보기(시간축) ──

/** 하루의 시간 일정 조각: 여러 날 일정은 그 날 0시~24시로 자름. 겹치면 옆으로 나눔 */
function layout(day: string, items: Instance[]) {
  const segs = items
    .filter((e) => !e.allDay && onDay(e, day))
    .map((e) => ({ e, top: e.startDate === day ? minutes(e.startTime) : 0, bottom: e.endDate === day ? Math.max(minutes(e.endTime), minutes(e.startTime) + 15) : 1440 }))
    .sort((a, b) => a.top - b.top || b.bottom - a.bottom);
  const out: { e: Instance; top: number; bottom: number; col: number; cols: number }[] = [];
  let cluster: typeof out = [];
  let clusterEnd = -1;
  const flush = () => {
    const cols = Math.max(1, ...cluster.map((c) => c.col + 1));
    for (const c of cluster) out.push({ ...c, cols });
    cluster = [];
  };
  for (const s of segs) {
    if (s.top >= clusterEnd) flush();
    const used = new Set(cluster.filter((c) => c.bottom > s.top).map((c) => c.col));
    let col = 0;
    while (used.has(col)) col++;
    cluster.push({ ...s, col, cols: 1 });
    clusterEnd = Math.max(clusterEnd, s.bottom);
  }
  flush();
  return out;
}

function TimeGrid({ days, today, items, color, open, add }: { days: string[]; today: string; items: Instance[]; color: (e: Instance) => string; open: (e: Instance) => void; add: (d: string, time?: string) => void }) {
  // 처음엔 아침 7시쯤이 보이게
  const scroller = (el: HTMLDivElement | null) => {
    if (el && !el.dataset.scrolled) {
      el.scrollTop = 7 * HOUR - 12;
      el.dataset.scrolled = "1";
    }
  };
  const allDay = (d: string) => items.filter((e) => e.allDay && onDay(e, d));
  const cols = `48px repeat(${days.length}, minmax(0, 1fr))`;
  return (
    <div className="overflow-hidden rounded-lg border">
      <div ref={scroller} className="max-h-[70vh] overflow-y-auto">
        <div className="bg-card sticky top-0 z-10 grid border-b" style={{ gridTemplateColumns: cols }}>
          <span />
          {days.map((d) => (
            <div key={d} className="border-l px-1 py-1 text-center">
              <span className={cn("text-caption", dayOfWeek(d) === 0 ? "text-destructive-text" : "text-muted-foreground")}>{WEEK[dayOfWeek(d)]}</span>
              <span className={cn("mx-auto flex size-7 items-center justify-center rounded-full tabular-nums", d === today && "bg-primary text-primary-foreground font-semibold")}>{+d.slice(8)}</span>
              <div className="space-y-0.5">
                {allDay(d).map((e) => (
                  <Chip key={e.id + e.occurrenceDate} e={e} color={color(e)} onOpen={() => open(e)} day={d} />
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="relative grid" style={{ gridTemplateColumns: cols, height: 24 * HOUR }}>
          <div>
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="text-muted-foreground relative pr-1 text-right text-micro" style={{ height: HOUR }}>
                {h > 0 && <span className="relative -top-2">{h}시</span>}
              </div>
            ))}
          </div>
          {days.map((d) => (
            <div key={d} className="relative border-l">
              {Array.from({ length: 24 }, (_, h) => (
                <button
                  key={h}
                  type="button"
                  aria-label={`${dayTitle(d)} ${h}시에 일정 추가`}
                  onClick={() => add(d, toHm(h * 60))}
                  className="hover:bg-accent/40 block w-full border-b border-dashed"
                  style={{ height: HOUR }}
                />
              ))}
              {d === today && <NowLine />}
              {layout(d, items).map(({ e, top, bottom, col, cols: n }) => (
                <button
                  key={e.id + e.occurrenceDate}
                  type="button"
                  onClick={() => open(e)}
                  title={`${e.title} · ${whenLabel(e)}`}
                  className="absolute overflow-hidden rounded-sm px-1 text-left text-caption leading-tight hover:brightness-95"
                  style={{ ...tint(color(e)), top: (top / 60) * HOUR, height: Math.max(18, ((bottom - top) / 60) * HOUR - 2), left: `calc(${(col / n) * 100}% + 1px)`, width: `calc(${100 / n}% - 2px)` }}
                >
                  <span className="block truncate font-medium">{e.title}</span>
                  {bottom - top >= 45 && e.startDate === d && <span className="text-muted-foreground block truncate tabular-nums">{e.startTime}</span>}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function NowLine() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date().getHours() * 60 + new Date().getMinutes());
    tick();
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, []);
  if (now === null) return null;
  return <span aria-hidden className="bg-destructive pointer-events-none absolute right-0 left-0 h-0.5" style={{ top: (now / 60) * HOUR }} />;
}

// ── 상세 ──

function Detail({ e, cal, close, edit, copy, remove }: { e: Instance; cal?: CalendarItem; close: () => void; edit: () => void; copy: () => void; remove: () => void }) {
  return (
    <ResponsiveDetail
      open
      onOpenChange={(o) => !o && close()}
      title={e.title}
      footer={
        <div className="flex w-full gap-2">
          <Button variant="ghost" className="text-destructive-text" onClick={remove}>
            삭제
          </Button>
          <Button variant="ghost" onClick={copy}>
            복제
          </Button>
          <Button variant="outline" className="ml-auto" onClick={edit}>
            수정
          </Button>
        </div>
      }
    >
      <ul className="space-y-3 pb-2 text-sm">
        <li className="flex gap-2">
          <Clock className="text-muted-foreground mt-0.5 size-4 shrink-0" /> {whenLabel(e)}
        </li>
        {e.rrule && (
          <li className="flex gap-2">
            <Repeat className="text-muted-foreground mt-0.5 size-4 shrink-0" /> {ruleLabel(e.rrule, e.seriesStart)}
            {e.modified && <span className="text-muted-foreground">· 이 일정만 바꿈</span>}
          </li>
        )}
        {e.location && (
          <li className="flex gap-2">
            <MapPin className="text-muted-foreground mt-0.5 size-4 shrink-0" /> {e.location}
          </li>
        )}
        {e.memo && (
          <li className="flex gap-2">
            <StickyNote className="text-muted-foreground mt-0.5 size-4 shrink-0" /> <span className="whitespace-pre-wrap">{e.memo}</span>
          </li>
        )}
        {cal && (
          <li className="flex items-center gap-2">
            <span className="mx-[3px] size-2.5 rounded-full" style={{ background: cal.colorHex }} /> {cal.name}
          </li>
        )}
      </ul>
    </ResponsiveDetail>
  );
}

// ── 반복 범위 ──

function ScopeDialog({ title, close, pick }: { title: string; close: () => void; pick: (s: Scope) => void }) {
  const [scope, setScope] = useState<Scope>("this");
  const opts: { v: Scope; label: string }[] = [
    { v: "this", label: "이 일정만" },
    { v: "following", label: "이 일정과 이후 일정" },
    { v: "all", label: "모든 일정" },
  ];
  return (
    <ResponsiveModal open onOpenChange={(o) => !o && close()} title={title} size="sm" footer={<Button onClick={() => pick(scope)}>확인</Button>}>
      <div role="radiogroup" aria-label="범위" className="space-y-1">
        {opts.map((o) => (
          <label key={o.v} className="hover:bg-accent/50 flex cursor-pointer items-center gap-3 rounded-md px-2 py-2.5">
            <input type="radio" name="scope" className="accent-primary size-4" checked={scope === o.v} onChange={() => setScope(o.v)} />
            {o.label}
          </label>
        ))}
      </div>
    </ResponsiveModal>
  );
}

// ── 추가·수정 ──

type Preset = "none" | "daily" | "weekly" | "monthly" | "yearly" | "custom";
const presetOf = (rrule: string | null, start: string): Preset => {
  const r = parseRule(rrule);
  if (!r) return "none";
  if (r.interval !== 1 || r.until || r.count) return "custom";
  if (r.freq === "WEEKLY") return r.byDay.length <= 1 && (r.byDay[0] ?? dayOfWeek(start)) === dayOfWeek(start) ? "weekly" : "custom";
  return ({ DAILY: "daily", MONTHLY: "monthly", YEARLY: "yearly" } as const)[r.freq as Exclude<Freq, "WEEKLY">];
};
const presetRule = (p: Preset, start: string): Rule | null =>
  p === "none" || p === "custom" ? null : { freq: ({ daily: "DAILY", weekly: "WEEKLY", monthly: "MONTHLY", yearly: "YEARLY" } as const)[p], interval: 1, byDay: p === "weekly" ? [dayOfWeek(start)] : [], until: null, count: null };

function DateButton({ value, onChange, label }: { value: string; onChange: (d: string) => void; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" aria-label={label} className="flex-1 justify-start font-normal">
          {dayTitle(value)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={fromYmd(value)} defaultMonth={fromYmd(value)} onSelect={(d) => (d && onChange(ymd(d)), setOpen(false))} />
      </PopoverContent>
    </Popover>
  );
}

export type Draft = Omit<EventInput, "calendarId"> & { calendarId: string };

function EventForm({ draft, edit, calendars, close, done }: { draft: Draft; edit?: Instance; calendars: CalendarItem[]; close: () => void; done: (date: string) => void }) {
  const [v, setV] = useState<Draft>(draft);
  const [preset, setPreset] = useState<Preset>(presetOf(draft.rrule ?? null, draft.startDate));
  const [custom, setCustom] = useState<Rule>(() => parseRule(draft.rrule ?? null) ?? { freq: "WEEKLY", interval: 1, byDay: [dayOfWeek(draft.startDate)], until: null, count: null });
  const [endMode, setEndMode] = useState<"none" | "until" | "count">(custom.until ? "until" : custom.count ? "count" : "none");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [askScope, setAskScope] = useState(false);
  const key = useRef(crypto.randomUUID());
  const set = <K extends keyof Draft>(k: K, val: Draft[K]) => setV((s) => ({ ...s, [k]: val }));

  // 시작을 바꾸면 길이를 유지한 채 끝도 따라감(07 §4.3: 오류 대신 자동 조정)
  function setStart(date: string, time = v.startTime ?? null) {
    const days = daysBetween(v.startDate, v.endDate);
    const dur = minutes(v.endTime ?? "00:00") - minutes(v.startTime ?? "00:00") + days * 1440;
    if (v.allDay || !time) return setV((s) => ({ ...s, startDate: date, endDate: addDays(date, days) }));
    const endAbs = minutes(time) + Math.max(15, dur);
    setV((s) => ({ ...s, startDate: date, startTime: time, endDate: addDays(date, Math.floor(endAbs / 1440)), endTime: toHm(endAbs % 1440) }));
  }

  const rrule = preset === "custom" ? ruleString({ ...custom, until: endMode === "until" ? (custom.until ?? addDays(v.startDate, 30)) : null, count: endMode === "count" ? (custom.count ?? 10) : null }) : (() => {
    const r = presetRule(preset, v.startDate);
    return r && ruleString(r);
  })();

  async function save(scope: Scope = "all") {
    setBusy(true);
    setError("");
    const input: EventInput = { ...v, title: v.title.trim(), rrule, location: v.location?.trim() || null, memo: v.memo || null };
    const r = edit ? await editEvent(edit.id, edit.version, input, scope, edit.occurrenceDate) : await addEvent(key.current, input);
    setBusy(false);
    setAskScope(false);
    if (!r.ok) return setError(r.error.code === "VERSION_CONFLICT" ? "다른 기기에서 먼저 수정했어요. 닫고 다시 열어 주세요" : (r.error.fields?.[0]?.message ?? r.error.message));
    toast(edit ? "일정을 고쳤어요" : "일정을 추가했어요");
    done(v.startDate);
  }

  if (askScope) return <ScopeDialog title="반복 일정을 어떻게 바꿀까요?" close={() => setAskScope(false)} pick={save} />;
  const cal = calendars.find((c) => c.id === v.calendarId);
  return (
    <ResponsiveModal
      open
      onOpenChange={(o) => !o && close()}
      title={edit ? "일정 수정" : "일정 추가"}
      footer={
        <Button className="w-full md:ml-auto md:w-auto" disabled={!v.title.trim() || busy} onClick={() => (edit?.rrule ? setAskScope(true) : save())}>
          {busy && <Spinner />} 저장
        </Button>
      }
    >
      <FieldGroup className="gap-4">
        <Input autoFocus aria-label="제목" placeholder="제목" maxLength={100} className="h-11 text-base md:h-10" value={v.title} onChange={(e) => set("title", e.target.value)} onKeyDown={(e) => e.key === "Enter" && v.title.trim() && !edit?.rrule && save()} />
        <label className="flex items-center justify-between text-sm">
          종일
          <Switch aria-label="종일" checked={!!v.allDay} onCheckedChange={(on) => setV((s) => ({ ...s, allDay: on, startTime: on ? null : (s.startTime ?? "09:00"), endTime: on ? null : (s.endTime ?? "10:00") }))} />
        </label>
        <div className="space-y-2">
          <div className="flex gap-2">
            <span className="text-muted-foreground w-7 shrink-0 self-center text-sm">시작</span>
            <DateButton label="시작 날짜" value={v.startDate} onChange={(d) => setStart(d)} />
            {!v.allDay && <Input type="time" step={900} aria-label="시작 시간" className="w-36 shrink-0 md:w-32" value={v.startTime ?? ""} onChange={(e) => e.target.value && setStart(v.startDate, e.target.value)} />}
          </div>
          <div className="flex gap-2">
            <span className="text-muted-foreground w-7 shrink-0 self-center text-sm">끝</span>
            <DateButton label="끝 날짜" value={v.endDate} onChange={(d) => set("endDate", d)} />
            {!v.allDay && <Input type="time" step={900} aria-label="끝 시간" className="w-36 shrink-0 md:w-32" value={v.endTime ?? ""} onChange={(e) => e.target.value && set("endTime", e.target.value)} />}
          </div>
        </div>
        <Field>
          <FieldLabel>반복</FieldLabel>
          <Select value={preset} onValueChange={(p) => setPreset(p as Preset)}>
            <SelectTrigger aria-label="반복">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">안 함</SelectItem>
              <SelectItem value="daily">매일</SelectItem>
              <SelectItem value="weekly">매주 {WEEK[dayOfWeek(v.startDate)]}요일</SelectItem>
              <SelectItem value="monthly">매월 {+v.startDate.slice(8)}일</SelectItem>
              <SelectItem value="yearly">매년 {md(v.startDate)}</SelectItem>
              <SelectItem value="custom">직접 정하기</SelectItem>
            </SelectContent>
          </Select>
          {preset === "custom" && (
            <div className="bg-muted/40 space-y-3 rounded-md p-3">
              <div className="flex items-center gap-2 text-sm">
                <Input type="number" min={1} max={99} aria-label="간격" className="w-16" value={custom.interval} onChange={(e) => setCustom((c) => ({ ...c, interval: Math.min(99, Math.max(1, +e.target.value || 1)) }))} />
                <Select value={custom.freq} onValueChange={(f) => setCustom((c) => ({ ...c, freq: f as Freq, byDay: f === "WEEKLY" && !c.byDay.length ? [dayOfWeek(v.startDate)] : c.byDay }))}>
                  <SelectTrigger aria-label="단위" className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DAILY">일</SelectItem>
                    <SelectItem value="WEEKLY">주</SelectItem>
                    <SelectItem value="MONTHLY">개월</SelectItem>
                    <SelectItem value="YEARLY">년</SelectItem>
                  </SelectContent>
                </Select>
                마다
              </div>
              {custom.freq === "WEEKLY" && (
                <ToggleGroup type="multiple" variant="outline" size="sm" aria-label="요일" value={custom.byDay.map(String)} onValueChange={(d) => d.length && setCustom((c) => ({ ...c, byDay: d.map(Number).sort() }))}>
                  {WEEK.map((w, i) => (
                    <ToggleGroupItem key={w} value={String(i)} className="w-9">
                      {w}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              )}
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Select value={endMode} onValueChange={(m) => setEndMode(m as typeof endMode)}>
                  <SelectTrigger aria-label="반복 끝" className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">계속</SelectItem>
                    <SelectItem value="until">날짜까지</SelectItem>
                    <SelectItem value="count">횟수만큼</SelectItem>
                  </SelectContent>
                </Select>
                {endMode === "until" && <DateButton label="반복 끝나는 날" value={custom.until ?? addDays(v.startDate, 30)} onChange={(d) => setCustom((c) => ({ ...c, until: d }))} />}
                {endMode === "count" && (
                  <>
                    <Input type="number" min={1} max={999} aria-label="횟수" className="w-20" value={custom.count ?? 10} onChange={(e) => setCustom((c) => ({ ...c, count: Math.min(999, Math.max(1, +e.target.value || 1)) }))} />번
                  </>
                )}
              </div>
              <p className="text-muted-foreground text-caption">{ruleLabel(rrule, v.startDate)}</p>
            </div>
          )}
        </Field>
        <Field>
          <FieldLabel>캘린더</FieldLabel>
          <Select value={v.calendarId} onValueChange={(c) => set("calendarId", c)}>
            <SelectTrigger aria-label="캘린더">
              <SelectValue>
                <span className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full" style={{ background: cal?.colorHex }} /> {cal?.name}
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {calendars.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  <span className="size-2.5 rounded-full" style={{ background: c.colorHex }} /> {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Collapsible defaultOpen={!!(draft.location || draft.memo)}>
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="text-muted-foreground -ml-2">
              <Plus /> 장소·메모 추가
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 pt-2">
            <Input aria-label="장소" placeholder="장소" maxLength={200} value={v.location ?? ""} onChange={(e) => set("location", e.target.value)} />
            <Textarea aria-label="메모" placeholder="메모" maxLength={2000} value={v.memo ?? ""} onChange={(e) => set("memo", e.target.value)} />
          </CollapsibleContent>
        </Collapsible>
        {error && <FieldError>{error}</FieldError>}
      </FieldGroup>
    </ResponsiveModal>
  );
}

// ── 내 캘린더 ──

function CalendarManager({ calendars, close, refresh }: { calendars: CalendarItem[]; close: () => void; refresh: () => void }) {
  const [edit, setEdit] = useState<{ id?: string; version?: number; name: string; colorHex: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (!edit) return;
    setBusy(true);
    const input = { name: edit.name, colorHex: edit.colorHex };
    const r = edit.id ? await editCalendar(edit.id, edit.version!, input) : await addCalendar(input);
    setBusy(false);
    if (!r.ok) return setError(r.error.fields?.[0]?.message ?? r.error.message);
    setEdit(null);
    refresh();
  }
  async function remove(c: CalendarItem) {
    const r = await removeCalendar(c.id);
    if (!r.ok) return toast(r.error.message);
    setEdit(null);
    refresh();
    toastUndo(`${c.name} 캘린더와 일정을 휴지통으로 옮겼어요`, async () => {
      await restoreCalendar(c.id);
      refresh();
    });
  }

  return (
    <ResponsiveModal open onOpenChange={(o) => !o && close()} title="내 캘린더">
      {edit ? (
        <FieldGroup className="gap-4">
          <Input autoFocus aria-label="캘린더 이름" placeholder="예: 회사, 가족" maxLength={20} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
          <ColorPalettePicker value={edit.colorHex} onChange={(colorHex) => setEdit({ ...edit, colorHex })} used={calendars.filter((c) => c.id !== edit.id).map((c) => c.colorHex)} />
          {error && <FieldError>{error}</FieldError>}
          <div className="flex gap-2">
            {edit.id && calendars.length > 1 && (
              <Button variant="ghost" className="text-destructive-text" onClick={() => remove(calendars.find((c) => c.id === edit.id)!)}>
                삭제
              </Button>
            )}
            <Button variant="outline" className="ml-auto" onClick={() => setEdit(null)}>
              취소
            </Button>
            <Button disabled={!edit.name.trim() || busy} onClick={save}>
              저장
            </Button>
          </div>
        </FieldGroup>
      ) : (
        <div className="space-y-2">
          <ul className="divide-y rounded-lg border">
            {calendars.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => setEdit({ ...c })} className="hover:bg-accent/50 flex w-full items-center gap-3 px-3 py-2.5 text-left">
                  <span className="size-3 rounded-full" style={{ background: c.colorHex }} /> {c.name}
                </button>
              </li>
            ))}
          </ul>
          <Button variant="outline" onClick={() => setEdit({ name: "", colorHex: "#5B8DEF" })}>
            <Plus /> 캘린더 추가
          </Button>
        </div>
      )}
    </ResponsiveModal>
  );
}

// ── 기간 메모(연·월·주·일) ──

export type Note = { scope: NoteScope; key: string; id: string | null; version: number | null; body: string };
const NOTE_HINT: Record<NoteScope, string> = { year: "올해 이루고 싶은 것, 큰 계획", month: "이번 달 안에 해야 할 일", week: "이번 주에 할 일", day: "오늘 메모" };

/** 쓰는 동안 잠깐 멈추면 저장(0.8초). 다른 기기에서 먼저 고쳤으면 알려 줌 */
function NotePanel({ note, title }: { note: Note; title: string }) {
  const [text, setText] = useState(note.body);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "conflict">("idle");
  const version = useRef(note.version);
  const saved = useRef(note.body);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  async function save(body: string) {
    if (body === saved.current) return;
    setState("saving");
    const r = await saveCalendarNote(note.scope, note.key, body, version.current);
    if (!r.ok) return setState(r.error.code === "VERSION_CONFLICT" ? "conflict" : "idle");
    version.current = r.data.version;
    saved.current = body;
    setState("saved");
  }
  const change = (v: string) => {
    setText(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => save(v), 800);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <section className="bg-card space-y-1.5 rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-muted-foreground ml-auto text-caption" aria-live="polite">
          {state === "saving" ? "저장 중" : state === "saved" ? "저장됨" : state === "conflict" ? "다른 기기에서 먼저 고쳤어요. 새로 고침해 주세요" : ""}
        </span>
      </div>
      <Textarea
        aria-label={title}
        placeholder={NOTE_HINT[note.scope]}
        maxLength={10_000}
        className="field-sizing-content min-h-16 resize-none border-0 bg-transparent p-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
        value={text}
        onChange={(e) => change(e.target.value)}
        onBlur={() => (clearTimeout(timer.current), save(text))}
      />
    </section>
  );
}

// ── 연 보기 ──

function YearGrid({ year, today, items, open }: { year: string; today: string; items: Instance[]; open: (v: View, d: string) => void }) {
  // 일정 있는 날(여러 날 일정은 그 사이 모든 날)
  const busy = new Set<string>();
  for (const e of items) for (let d = e.startDate; d <= e.endDate && d <= `${year}-12-31`; d = addDays(d, 1)) busy.add(d);
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 12 }, (_, i) => {
        const first = `${year}-${String(i + 1).padStart(2, "0")}-01`;
        const days = new Date(Date.UTC(+year, i + 1, 0)).getUTCDate();
        return (
          <section key={first} className="space-y-1">
            <button type="button" onClick={() => open("month", first)} className="hover:text-link font-semibold">
              {i + 1}월
            </button>
            <div className="grid grid-cols-7 text-center text-micro">
              {WEEK.map((w, k) => (
                <span key={w} className={k === 0 ? "text-destructive-text" : "text-muted-foreground"}>
                  {w}
                </span>
              ))}
              {Array.from({ length: dayOfWeek(first) }, (_, k) => (
                <span key={`e${k}`} />
              ))}
              {Array.from({ length: days }, (_, k) => {
                const d = addDays(first, k);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-label={`${dayTitle(d)}${busy.has(d) ? ", 일정 있음" : ""}`}
                    onClick={() => open("month", d)}
                    className={cn(
                      "hover:bg-accent relative mx-auto flex size-6 items-center justify-center rounded-full tabular-nums",
                      d === today ? "bg-primary text-primary-foreground font-semibold" : dayOfWeek(d) === 0 && "text-destructive-text",
                    )}
                  >
                    {k + 1}
                    {busy.has(d) && d !== today && <span className="bg-primary absolute bottom-0 size-1 rounded-full" />}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// ── 화면 ──

/** 새 일정 초안: 고른 날, 다음 정시부터 한 시간 */
function newDraft(calendarId: string, d: string, time?: string): Draft {
  const start = time ?? toHm(Math.min(22, new Date().getHours() + 1) * 60);
  return { calendarId, title: "", allDay: false, startDate: d, startTime: start, endDate: d, endTime: toHm(Math.min(minutes(start) + 60, 1439)), rrule: null, location: null, memo: null };
}

export function CalendarView({ view, date, from, today, calendars, instances, note, startNew }: { view: View; date: string; from: string; today: string; calendars: CalendarItem[]; instances: Instance[]; note: Note; startNew?: boolean }) {
  const router = useRouter();
  const mobile = useIsMobile();
  const [selected, setSelected] = useState(date);
  const [seenDate, setSeenDate] = useState(date);
  if (seenDate !== date) {
    setSeenDate(date);
    setSelected(date);
  }
  const [detail, setDetail] = useState<Instance | null>(null);
  // 빠른 추가(+ → 일정 추가, ?new=1)면 처음부터 추가 창
  const [form, setForm] = useState<{ draft: Draft; edit?: Instance } | null>(() => (startNew ? { draft: newDraft(calendars.find((c) => c.isVisible)?.id ?? calendars[0]?.id ?? "", date) } : null));
  useEffect(() => {
    if (startNew) router.replace(`/calendar?view=${view}&date=${date}`, { scroll: false });
  }, [startNew, router, view, date]);
  const [scopeFor, setScopeFor] = useState<Instance | null>(null);
  const [manage, setManage] = useState(false);
  const [hidden, setHidden] = useState(() => new Set(calendars.filter((c) => !c.isVisible).map((c) => c.id)));

  const go = (v: View, d: string) => router.push(`/calendar?view=${v}&date=${d}`, { scroll: false });
  const step = (n: number) => {
    if (view === "year") return go(view, `${+date.slice(0, 4) + n}-01-01`);
    if (view === "month") {
      const [y, m] = date.split("-").map(Number);
      const t = new Date(Date.UTC(y, m - 1 + n, 1));
      return go(view, `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-01`);
    }
    go(view, addDays(date, n * (view === "week" ? 7 : 1)));
  };

  // 키보드: T 오늘, Y/M/W/D 보기 전환(입력 중이면 무시)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || t.closest("input, textarea, [contenteditable], [role=dialog]")) return;
      const k = e.key.toLowerCase();
      if (k === "t") go(view, today);
      else if (k === "y" || k === "m" || k === "w" || k === "d") go(({ y: "year", m: "month", w: "week", d: "day" } as const)[k], selected);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const visible = instances.filter((e) => !hidden.has(e.calendarId));
  const colorOf = (e: Instance) => calendars.find((c) => c.id === e.calendarId)?.colorHex ?? "#888888";
  const defaultCal = calendars.find((c) => !hidden.has(c.id))?.id ?? calendars[0]?.id ?? "";
  const addAt = (d: string, time?: string) => setForm({ draft: newDraft(defaultCal, d, time) });
  const draftOf = (e: Instance): Draft => ({ calendarId: e.calendarId, title: e.title, allDay: e.allDay, startDate: e.startDate, startTime: e.startTime, endDate: e.endDate, endTime: e.endTime, rrule: e.rrule, location: e.location, memo: e.memo });
  const done = (d: string) => {
    setForm(null);
    router.refresh();
    if (view === "month" && d.slice(0, 7) !== date.slice(0, 7)) go(view, d);
    else setSelected(d);
  };

  async function remove(e: Instance, scope: Scope = "all") {
    setScopeFor(null);
    setDetail(null);
    const r = await removeEvent(e.id, scope, e.occurrenceDate);
    if (!r.ok) return toast(r.error.message);
    router.refresh();
    if (r.data.restoreId || r.data.exceptionId)
      toastUndo("일정을 지웠어요", async () => {
        await undoRemoveEvent(r.data);
        router.refresh();
      });
    else toast("이후 일정을 지웠어요");
  }
  async function toggleCal(c: CalendarItem, on: boolean) {
    setHidden((h) => {
      const n = new Set(h);
      if (on) n.delete(c.id);
      else n.add(c.id);
      return n;
    });
    const r = await showCalendar(c.id, c.version, on);
    if (r.ok) router.refresh();
  }

  const label =
    view === "year"
      ? `${date.slice(0, 4)}년`
      : view === "month"
      ? `${date.slice(0, 4)}년 ${+date.slice(5, 7)}월`
      : view === "week"
        ? `${md(from)} ~ ${addDays(from, 6).slice(5, 7) === from.slice(5, 7) ? `${+addDays(from, 6).slice(8)}일` : md(addDays(from, 6))}`
        : dayTitle(date);
  const dayItems = (d: string) => visible.filter((e) => onDay(e, d));
  const noteTitle = view === "year" ? `${date.slice(0, 4)}년 메모` : view === "month" ? `${+date.slice(5, 7)}월 메모` : view === "week" ? `${label} 메모` : `${md(date)} 메모`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center">
          <Button variant="outline" size="icon" className="max-md:size-11" aria-label="이전" onClick={() => step(-1)}>
            <ChevronLeft />
          </Button>
          <span className="min-w-28 px-2 text-center font-semibold tabular-nums">{label}</span>
          <Button variant="outline" size="icon" className="max-md:size-11" aria-label="다음" onClick={() => step(1)}>
            <ChevronRight />
          </Button>
        </div>
        <Button variant="outline" size="sm" className="max-md:h-11" onClick={() => go(view, today)}>
          오늘
        </Button>
        {/* 모바일: 보기 전환은 둘째 줄에 꽉 차게 */}
        <ToggleGroup type="single" variant="outline" size="sm" value={view} onValueChange={(v) => v && go(v as View, selected)} aria-label="보기" className="max-md:order-last max-md:w-full md:ml-auto">
          {[["year", "연"], ["month", "월"], ["week", "주"], ["day", "일"]].map(([k, t]) => (
            <ToggleGroupItem key={k} value={k} className="max-md:h-10 max-md:flex-1">
              {t}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="max-md:ml-auto max-md:size-11" aria-label="캘린더 보기 설정">
              <Settings2 />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-60 space-y-2">
            <p className="text-sm font-semibold">보이는 캘린더</p>
            {calendars.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm">
                <Checkbox checked={!hidden.has(c.id)} onCheckedChange={(on) => toggleCal(c, on === true)} />
                <span className="size-2.5 rounded-full" style={{ background: c.colorHex }} /> {c.name}
              </label>
            ))}
            <Button variant="outline" size="sm" className="w-full" onClick={() => setManage(true)}>
              내 캘린더 관리
            </Button>
          </PopoverContent>
        </Popover>
        <Button className="max-md:hidden" onClick={() => addAt(selected)}>
          <Plus /> 일정
        </Button>
      </div>

      {view !== "month" && <NotePanel key={note.scope + note.key} note={note} title={noteTitle} />}
      {view === "year" ? (
        <YearGrid year={date.slice(0, 4)} today={today} items={visible} open={go} />
      ) : view === "month" ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <MonthGrid from={from} month={date.slice(0, 7)} selected={selected} today={today} items={visible} color={colorOf} select={setSelected} open={setDetail} add={addAt} mobile={mobile} />
          {/* 모바일은 고른 날 일정 → 메모 순 */}
          <div className="flex flex-col gap-4">
            <div className="max-lg:order-last">
              <NotePanel key={note.scope + note.key} note={note} title={noteTitle} />
            </div>
            <DayList day={selected} items={dayItems(selected)} color={colorOf} open={setDetail} add={() => addAt(selected)} today={today} />
          </div>
        </div>
      ) : view === "week" && mobile ? (
        <div className="divide-y">
          {Array.from({ length: 7 }, (_, i) => addDays(from, i)).map((d) => (
            <div key={d} className="py-2">
              <DayList day={d} items={dayItems(d)} color={colorOf} open={setDetail} add={() => addAt(d)} today={today} compact />
            </div>
          ))}
        </div>
      ) : (
        <TimeGrid days={view === "week" ? Array.from({ length: 7 }, (_, i) => addDays(from, i)) : [date]} today={today} items={visible} color={colorOf} open={setDetail} add={addAt} />
      )}

      {detail && (
        <Detail
          e={detail}
          cal={calendars.find((c) => c.id === detail.calendarId)}
          close={() => setDetail(null)}
          edit={() => (setForm({ draft: draftOf(detail), edit: detail }), setDetail(null))}
          copy={() => (setForm({ draft: { ...draftOf(detail), title: `${detail.title} (복제)`, rrule: null } }), setDetail(null))}
          remove={() => (detail.rrule ? (setScopeFor(detail), setDetail(null)) : remove(detail))}
        />
      )}
      {scopeFor && <ScopeDialog title="반복 일정을 어떻게 지울까요?" close={() => setScopeFor(null)} pick={(s) => remove(scopeFor, s)} />}
      {form && <EventForm key={form.edit?.id ?? "new"} draft={form.draft} edit={form.edit} calendars={calendars} close={() => setForm(null)} done={done} />}
      {manage && <CalendarManager calendars={calendars} close={() => setManage(false)} refresh={() => router.refresh()} />}
    </div>
  );
}
