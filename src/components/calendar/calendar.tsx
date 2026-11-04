"use client";

// 일정 (SCR-CAL-01~03, 04 §4): 연(연간 계획표)·월·주·일 보기, 선택한 날 목록, 상세, 추가·수정(반복), 반복 범위 고르기, 내 캘린더 관리
// 주소: /calendar?view=year|month|week|day&date=YYYY-MM-DD. 키보드: T 오늘, Y/M/W/D 보기
// 우클릭(휴대폰은 길게 누르기): 빈 칸 → 일정 추가, 일정 → 상세·수정·복제·배경색·삭제. 칸·일정은 data-day·data-time·data-ev로 찾음
// 월 보기: 칸을 누르면 그 날 일정 목록(PC 오른쪽 시트·모바일 서랍) → 일정을 누르면 상세. PC는 칩을 바로 눌러도 상세
// 주·일 보기: 시간표 대신 날짜별 목록(시간순). ponytail: 칩 끌어 옮기기·모바일 스와이프는 아직
import { PeriodGoals, type PeriodGoal } from "@/components/goals/period-goals";
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Clock, Copy, Eye, Layers, MapPin, Palette, Pencil, Plus, Repeat, StickyNote, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { addEvent, colorEvent, editEvent, removeEvent, saveCalendarNote, showCalendar, undoRemoveEvent } from "@/app/actions/calendar";
import { CalendarList } from "@/components/calendar/calendar-list";
import { RichNote } from "@/components/calendar/rich-note";
import { ResponsiveDetail, ResponsiveModal } from "@/components/app/responsive";
import { toastUndo } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuSeparator, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { GOAL_PALETTE } from "@/lib/palette";
import { noteText } from "@/lib/rich-note";
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
import type { GoogleStatus } from "@/server/google-calendar";

type View = "year" | "month" | "week" | "day";
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

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
/** 우클릭 메뉴가 찾는 일정 표시 */
const evKey = (e: Instance) => `${e.id}|${e.occurrenceDate}`;

// ── 일정 칩·행 ──

function Chip({ e, color, onOpen, day }: { e: Instance; color: string; onOpen: () => void; day: string }) {
  return (
    <button
      type="button"
      data-ev={evKey(e)}
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
      <button type="button" data-ev={evKey(e)} onClick={onOpen} className="hover:bg-accent/50 flex w-full items-start gap-3 rounded-md px-2 py-2 text-left">
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
    <section data-day={day} className={compact ? "space-y-1" : "space-y-2"}>
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

function MonthGrid({ from, month, selected, today, items, color, openDay, open, mobile }: { from: string; month: string; selected: string; today: string; items: Instance[]; color: (e: Instance) => string; openDay: (d: string) => void; open: (e: Instance) => void; mobile: boolean }) {
  const days = Array.from({ length: 42 }, (_, i) => addDays(from, i));
  const rows = days[35].slice(0, 7) === month ? 6 : 5;
  const max = mobile ? 2 : 4;
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
          return (
            <div
              key={d}
              role="gridcell"
              data-day={d}
              aria-label={`${dayTitle(d)}${list.length ? `, 일정 ${list.length}개` : ""}`}
              aria-selected={d === selected}
              tabIndex={d === selected ? 0 : -1}
              onClick={() => openDay(d)}
              onKeyDown={(ev) => ev.key === "Enter" && openDay(d)}
              className={cn("hover:bg-accent/30 min-h-20 min-w-0 cursor-pointer border-r border-b p-0.5 text-left md:min-h-28 md:p-1 xl:min-h-32", out && "bg-muted/40", d === selected && "bg-accent/60")}
            >
              <span
                className={cn(
                  "inline-flex size-6 items-center justify-center rounded-full text-caption tabular-nums",
                  d === today ? "bg-primary text-primary-foreground font-semibold" : out ? "text-muted-foreground/60" : dayOfWeek(d) === 0 ? "text-destructive-text" : "text-muted-foreground",
                )}
              >
                {+d.slice(8)}
              </span>
              <div className="space-y-0.5">
                {list.slice(0, max).map((e) =>
                  mobile ? (
                    // 모바일: 칸이 좁아 누르면 그 날 목록(칩은 누를 수 없는 짧은 제목 막대, 길게 누르면 일정 메뉴)
                    <span key={e.id + e.occurrenceDate} data-ev={evKey(e)} className="block truncate rounded-[3px] px-0.5 text-[10px] leading-4" style={{ background: `${color(e)}33`, borderLeft: `2px solid ${color(e)}` }}>
                      {e.title}
                    </span>
                  ) : (
                    <Chip key={e.id + e.occurrenceDate} e={e} color={color(e)} onOpen={() => open(e)} day={d} />
                  ),
                )}
                {list.length > max && <span className="text-muted-foreground block px-0.5 text-[10px] leading-4 md:px-1 md:text-caption">+{list.length - max}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 그 날 일정 목록(달력 칸을 누르면): PC 오른쪽 시트, 모바일 아래 서랍. 일정을 누르면 상세가 그 위에 ──

function DaySheet({ day, today, items, color, open, add, close, wrap }: { day: string; today: string; items: Instance[]; color: (e: Instance) => string; open: (e: Instance) => void; add: () => void; close: () => void; wrap: (n: React.ReactNode) => React.ReactNode }) {
  return (
    <ResponsiveDetail
      open
      onOpenChange={(o) => !o && close()}
      title={
        <>
          {dayTitle(day)} {day === today && <span className="text-link text-sm">오늘</span>}
        </>
      }
      description={items.length ? `일정 ${items.length}개` : undefined}
      footer={
        <Button className="w-full" onClick={add}>
          <Plus /> 이 날 일정 추가
        </Button>
      }
    >
      {items.length ? (
        wrap(
          <ul data-day={day} className="-mx-2">
            {items.map((e) => (
              <Row key={e.id + e.occurrenceDate} e={e} color={color(e)} onOpen={() => open(e)} day={day} />
            ))}
          </ul>,
        )
      ) : (
        <p className="text-muted-foreground py-6 text-center text-sm">일정이 없어요</p>
      )}
    </ResponsiveDetail>
  );
}

// ── 상세 ──

function Detail({ e, cal, close, edit, copy, remove }: { e: Instance; cal?: CalendarItem; close: () => void; edit: () => void; copy: () => void; remove: () => void }) {
  const ro = !!cal?.google;
  return (
    <ResponsiveDetail
      open
      onOpenChange={(o) => !o && close()}
      title={e.title}
      footer={
        <div className="flex w-full gap-2">
          {!ro && (
            <Button variant="ghost" className="text-destructive-text" onClick={remove}>
              삭제
            </Button>
          )}
          <Button variant="ghost" onClick={copy}>
            {ro ? "내 캘린더로 복제" : "복제"}
          </Button>
          {!ro && (
            <Button variant="outline" className="ml-auto" onClick={edit}>
              수정
            </Button>
          )}
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
            {ro && <span className="text-muted-foreground">· 구글에서 가져옴(고치기는 구글에서)</span>}
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
          {value}
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
              {calendars.filter((c) => !c.google).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  <span className="size-2.5 rounded-full" style={{ background: c.colorHex }} /> {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="ev-location">장소</FieldLabel>
          <Input id="ev-location" maxLength={200} value={v.location ?? ""} onChange={(e) => set("location", e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="ev-memo">메모</FieldLabel>
          <Textarea id="ev-memo" maxLength={2000} className="min-h-16" value={v.memo ?? ""} onChange={(e) => set("memo", e.target.value)} />
        </Field>
        {error && <FieldError>{error}</FieldError>}
      </FieldGroup>
    </ResponsiveModal>
  );
}

// ── 기간 메모(연·월·주·일) ──

export type Note = { scope: NoteScope; key: string; id: string | null; version: number | null; body: string };
const NOTE_HINT: Record<NoteScope, string> = { year: "올해 이루고 싶은 것, 큰 계획", month: "이번 달 안에 해야 할 일", week: "이번 주에 할 일", day: "오늘 메모" };

/** 쓰는 동안 잠깐 멈추면 저장(0.8초). 다른 기기에서 먼저 고쳤으면 알려 줌. 서식(굵게 등)은 RichNote */
function NotePanel({ note, title }: { note: Note; title: string }) {
  const text = useRef(note.body);
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
    text.current = v;
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
      <RichNote initial={note.body} label={title} placeholder={NOTE_HINT[note.scope]} onChange={change} onBlur={() => (clearTimeout(timer.current), save(text.current))} />
    </section>
  );
}

/** 보는 기간의 목표·메모. PC는 위에 나란히, 모바일은 한 줄로 접어 달력이 먼저 보이게 */
function TopPanels({ label, goals, note, children }: { label: string; goals: PeriodGoal[]; note: Note; children: React.ReactNode }) {
  const mobile = useIsMobile();
  if (!mobile) return <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{children}</div>;
  const done = goals.filter((g) => g.status === "done").length;
  return (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <button type="button" className="bg-card flex h-11 w-full items-center gap-2 rounded-lg border px-3 text-left text-sm [&[data-state=open]>svg]:rotate-180">
          <span className="font-semibold">{label} 목표·메모</span>
          <span className="text-muted-foreground min-w-0 flex-1 truncate text-caption">
            {[goals.length ? `목표 ${done}/${goals.length}` : "목표 없음", noteText(note.body).trim() ? `메모: ${noteText(note.body).trim().split("\n")[0]}` : ""].filter(Boolean).join(" · ")}
          </span>
          <ChevronDown className="text-muted-foreground size-4 shrink-0 transition-transform" />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 pt-3">{children}</CollapsibleContent>
    </Collapsible>
  );
}

// ── 연 보기: 연간 계획표(가로 1~12월 × 세로 1~31일) ──
// 칸을 누르면 그 날 일정 추가, 칩을 누르면 상세, +N은 그 달 보기. 없는 날(2월 30일 등)은 회색
// ponytail: 공휴일 데이터가 없어 일요일만 분홍 — 공휴일 목록이 생기면 같은 색으로 칠하기

function YearPlanner({ year, focus, today, items, color, open, add, month }: { year: string; focus: string; today: string; items: Instance[]; color: (e: Instance) => string; open: (e: Instance) => void; add: (d: string) => void; month: (d: string) => void }) {
  // 날짜별 일정(여러 날 일정은 그 사이 모든 날 — 같은 색이 세로 띠로 이어짐)
  const byDay = new Map<string, Instance[]>();
  for (const e of items) {
    for (let d = e.startDate < `${year}-01-01` ? `${year}-01-01` : e.startDate; d <= e.endDate && d <= `${year}-12-31`; d = addDays(d, 1)) {
      const list = byDay.get(d);
      if (list) list.push(e);
      else byDay.set(d, [e]);
    }
  }
  // 처음엔 보던 날(오늘)이 든 달·줄이 보이게(모바일은 가로로, 둘 다 세로로 스크롤). 화면 위 위치 기준
  const scroller = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = scroller.current;
    const cell = el?.querySelector<HTMLElement>(`[data-day="${focus}"]`);
    const corner = el?.querySelector<HTMLElement>("[data-corner]");
    if (!el || !cell || !corner) return;
    const c = cell.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    const head = corner.getBoundingClientRect();
    el.scrollLeft += c.left - box.left - head.width;
    el.scrollTop += c.top - box.top - head.height - c.height * 2;
  }, [focus]);
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
  const lengths = months.map((_, i) => new Date(Date.UTC(+year, i + 1, 0)).getUTCDate());
  return (
    <div ref={scroller} className="bg-card relative max-h-[75dvh] overflow-auto overscroll-x-contain rounded-lg border" role="region" aria-label={`${year}년 연간 계획표`} tabIndex={-1}>
      <div className="grid w-max min-w-full auto-rows-[minmax(2rem,auto)] grid-cols-[1.75rem_repeat(12,minmax(5.5rem,1fr))] md:grid-cols-[2rem_repeat(12,minmax(4.5rem,1fr))]">
        <div data-corner className="bg-card sticky top-0 left-0 z-30 border-b" />
        {months.map((m) => (
          <div key={m} className="bg-card sticky top-0 z-20 border-b border-l">
            <button type="button" onClick={() => month(`${m}-01`)} aria-label={`${+m.slice(5)}월 보기`} className={cn("hover:bg-accent/50 size-full py-1.5 text-sm font-semibold", m === today.slice(0, 7) && "text-link")}>
              {+m.slice(5)}월
            </button>
          </div>
        ))}
        {Array.from({ length: 31 }, (_, k) => [
          <div key={`n${k}`} className="bg-card text-muted-foreground sticky left-0 z-10 border-b pt-1 text-center text-caption tabular-nums">
            {k + 1}
          </div>,
          ...months.map((m, i) => {
            if (k >= lengths[i]) return <div key={`${m}-x${k}`} aria-hidden className="bg-muted/70 border-b border-l" />;
            const d = `${m}-${String(k + 1).padStart(2, "0")}`;
            const w = dayOfWeek(d);
            const list = byDay.get(d) ?? [];
            const max = list.length > 2 ? 1 : 2;
            return (
              <div key={d} data-day={d} className={cn("relative flex gap-0.5 border-b border-l p-0.5", w === 6 && "bg-primary/10", w === 0 && "bg-destructive/10", d === today && "ring-primary ring-2 ring-inset")}>
                <button
                  type="button"
                  aria-label={`${md(d)} ${WEEK[w]}요일${d === today ? ", 오늘" : ""}, ${list.length ? `일정 ${list.length}개` : "일정 없음"}`}
                  title={`${dayTitle(d)} 일정 추가`}
                  onClick={() => add(d)}
                  className="hover:bg-accent/50 focus-visible:ring-ring absolute inset-0 outline-none focus-visible:ring-2 focus-visible:ring-inset"
                />
                <span aria-hidden className={cn("pointer-events-none relative w-3.5 shrink-0 pt-px text-center text-micro", d === today ? "text-link font-bold" : w === 6 ? "text-link" : w === 0 ? "text-destructive-text" : "text-muted-foreground")}>
                  {WEEK[w]}
                </span>
                <div className="pointer-events-none relative min-w-0 flex-1 space-y-px">
                  {list.slice(0, max).map((e) => (
                    <button
                      key={e.id + e.occurrenceDate}
                      type="button"
                      data-ev={evKey(e)}
                      onClick={() => open(e)}
                      title={`${e.title} · ${whenLabel(e)}`}
                      className="pointer-events-auto block w-full truncate rounded-[3px] px-0.5 text-left text-micro leading-3.5 hover:brightness-95"
                      style={e.startDate === d ? tint(color(e)) : { background: `${color(e)}26` }}
                    >
                      {e.title}
                    </button>
                  ))}
                  {list.length > max && (
                    <button type="button" onClick={() => month(d)} aria-label={`${md(d)} 일정 ${list.length - max}개 더 보기`} className="text-muted-foreground hover:text-foreground pointer-events-auto block px-0.5 text-micro leading-3.5">
                      +{list.length - max}
                    </button>
                  )}
                </div>
              </div>
            );
          }),
        ])}
      </div>
    </div>
  );
}

// ── 화면 ──

/** 새 일정 초안: 고른 날, 다음 정시부터 한 시간 */
function newDraft(calendarId: string, d: string, time?: string): Draft {
  const start = time ?? toHm(Math.min(22, new Date().getHours() + 1) * 60);
  return { calendarId, title: "", allDay: false, startDate: d, startTime: start, endDate: d, endTime: toHm(Math.min(minutes(start) + 60, 1439)), rrule: null, location: null, memo: null };
}

type Target = { kind: "day"; day: string; time?: string } | { kind: "ev"; e: Instance } | null;

export function CalendarView({ view, date, from, today, calendars, instances, note, goals, google, startNew }: { view: View; date: string; from: string; today: string; calendars: CalendarItem[]; instances: Instance[]; note: Note; goals: PeriodGoal[]; google: GoogleStatus; startNew?: boolean }) {
  const router = useRouter();
  const mobile = useIsMobile();
  const [selected, setSelected] = useState(date);
  const [seenDate, setSeenDate] = useState(date);
  if (seenDate !== date) {
    setSeenDate(date);
    setSelected(date);
  }
  const [detail, setDetail] = useState<Instance | null>(null);
  const writable = calendars.filter((c) => !c.google);
  // 빠른 추가(+ → 일정 추가, ?new=1)면 처음부터 추가 창
  const [form, setForm] = useState<{ draft: Draft; edit?: Instance } | null>(() => (startNew ? { draft: newDraft(writable.find((c) => c.isVisible)?.id ?? writable[0]?.id ?? "", date) } : null));
  useEffect(() => {
    if (startNew) router.replace(`/calendar?view=${view}&date=${date}`, { scroll: false });
  }, [startNew, router, view, date]);
  // 구글 연동하고 돌아왔을 때(?google=connected|denied|error|off)
  useEffect(() => {
    const g = new URLSearchParams(window.location.search).get("google");
    if (!g) return;
    toast(({ connected: "구글 캘린더를 연동했어요", denied: "구글 연동을 취소했어요", off: "구글 앱 키를 먼저 넣어 주세요" } as Record<string, string>)[g] ?? "구글 연동을 마치지 못했어요. 다시 해 주세요");
    router.replace(`/calendar?view=${view}&date=${date}`, { scroll: false });
  }, [router, view, date]);
  const [scopeFor, setScopeFor] = useState<Instance | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [hidden, setHidden] = useState(() => new Set(calendars.filter((c) => !c.isVisible).map((c) => c.id)));
  const [target, setTarget] = useState<Target>(null);
  const [dayOpen, setDayOpen] = useState<string | null>(null); // 그 날 일정 목록(월 보기 칸 누르기)

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
      if (e.metaKey || e.ctrlKey || e.altKey || t.closest("input, textarea, [contenteditable], [role=dialog], [role=menu]")) return;
      const k = e.key.toLowerCase();
      if (k === "t") go(view, today);
      else if (k === "y" || k === "m" || k === "w" || k === "d") go(({ y: "year", m: "month", w: "week", d: "day" } as const)[k], selected);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const visible = instances.filter((e) => !hidden.has(e.calendarId));
  const calOf = (e: Instance) => calendars.find((c) => c.id === e.calendarId);
  const colorOf = (e: Instance) => e.colorHex ?? calOf(e)?.colorHex ?? "#888888";
  const defaultCal = writable.find((c) => !hidden.has(c.id))?.id ?? writable[0]?.id ?? "";
  const addAt = (d: string, time?: string) => setForm({ draft: newDraft(defaultCal, d, time) });
  const draftOf = (e: Instance): Draft => ({ calendarId: calOf(e)?.google ? defaultCal : e.calendarId, title: e.title, allDay: e.allDay, startDate: e.startDate, startTime: e.startTime, endDate: e.endDate, endTime: e.endTime, rrule: e.rrule, location: e.location, memo: e.memo });
  const editOf = (e: Instance) => (setForm({ draft: draftOf(e), edit: e }), setDetail(null));
  const copyOf = (e: Instance) => (setForm({ draft: { ...draftOf(e), title: calOf(e)?.google ? e.title : `${e.title} (복제)`, rrule: null } }), setDetail(null));
  const askRemove = (e: Instance) => (e.rrule ? (setScopeFor(e), setDetail(null)) : remove(e));
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
  async function setColor(e: Instance, hex: string | null) {
    const r = await colorEvent(e.id, e.version, hex);
    if (!r.ok) return toast(r.error.code === "VERSION_CONFLICT" ? "다른 기기에서 먼저 고쳤어요. 다시 해 주세요" : r.error.message);
    router.refresh();
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

  // 우클릭·길게 누르기: 누른 곳의 일정(data-ev) 또는 칸(data-day·data-time)을 기억해 메뉴 내용을 정함. 둘 다 아니면 메뉴를 안 띄움
  const pick = (ev: React.SyntheticEvent) => {
    const el = ev.target as HTMLElement;
    const evEl = el.closest<HTMLElement>("[data-ev]");
    const dayEl = el.closest<HTMLElement>("[data-day]");
    const e = evEl && visible.find((x) => evKey(x) === evEl.dataset.ev);
    const t: Target = e ? { kind: "ev", e } : dayEl ? { kind: "day", day: dayEl.dataset.day!, time: dayEl.dataset.time } : null;
    setTarget(t);
    if (!t && ev.type === "contextmenu") ev.preventDefault();
  };
  const ro = target?.kind === "ev" && !!calOf(target.e)?.google;
  const menu = (children: React.ReactNode) => (
    <ContextMenu modal={false}>
      <ContextMenuTrigger asChild onContextMenu={pick} onPointerDown={pick}>
        <div>{children}</div>
      </ContextMenuTrigger>
      {target && (
        <ContextMenuContent className="w-52">
          {target.kind === "day" ? (
            <>
              <ContextMenuLabel className="text-muted-foreground text-caption">
                {dayTitle(target.day)}
                {target.time && ` ${hmLabel(target.time)}`}
              </ContextMenuLabel>
              <ContextMenuItem onSelect={() => (setSelected(target.day), addAt(target.day, target.time))}>
                <Plus /> 일정 추가
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => (setSelected(target.day), setForm({ draft: { ...newDraft(defaultCal, target.day), allDay: true, startTime: null, endTime: null } }))}>
                <CalendarDays /> 종일 일정 추가
              </ContextMenuItem>
              {view !== "day" && (
                <ContextMenuItem onSelect={() => go("day", target.day)}>
                  <Eye /> 이 날 보기
                </ContextMenuItem>
              )}
            </>
          ) : (
            <>
              <ContextMenuLabel className="truncate">{target.e.title}</ContextMenuLabel>
              <ContextMenuItem onSelect={() => setDetail(target.e)}>
                <Eye /> 자세히 보기
              </ContextMenuItem>
              <ContextMenuItem disabled={ro} onSelect={() => editOf(target.e)}>
                <Pencil /> 수정
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => copyOf(target.e)}>
                <Copy /> {ro ? "내 캘린더로 복제" : "복제"}
              </ContextMenuItem>
              <ContextMenuSub>
                <ContextMenuSubTrigger>
                  <Palette className="text-muted-foreground size-4" /> 배경색
                </ContextMenuSubTrigger>
                <ContextMenuSubContent className="w-48 p-2">
                  <div className="grid grid-cols-6 gap-1.5" role="group" aria-label="배경색">
                    {GOAL_PALETTE.map((c) => (
                      <ContextMenuItem key={c.hex} aria-label={c.name} title={c.name} className="flex size-6 items-center justify-center rounded-full p-0 focus:ring-2 focus:ring-ring" style={{ background: c.hex }} onSelect={() => setColor(target.e, c.hex)}>
                        {target.e.colorHex === c.hex && <Check className="size-3.5 text-white" />}
                      </ContextMenuItem>
                    ))}
                  </div>
                  <ContextMenuSeparator className="my-2" />
                  <ContextMenuItem disabled={!target.e.colorHex} onSelect={() => setColor(target.e, null)}>
                    <span className="size-3 rounded-full" style={{ background: calOf(target.e)?.colorHex }} /> 캘린더 색으로
                  </ContextMenuItem>
                  {target.e.rrule && <p className="text-muted-foreground px-2 pt-1 text-caption">반복 일정은 모든 회차가 바뀌어요</p>}
                </ContextMenuSubContent>
              </ContextMenuSub>
              <ContextMenuSeparator />
              <ContextMenuItem variant="destructive" disabled={ro} onSelect={() => askRemove(target.e)}>
                <Trash2 /> 삭제
              </ContextMenuItem>
              {ro && <p className="text-muted-foreground px-2 py-1 text-caption">구글 일정은 구글에서 고쳐 주세요</p>}
            </>
          )}
        </ContextMenuContent>
      )}
    </ContextMenu>
  );

  const label =
    view === "year"
      ? `${date.slice(0, 4)}년`
      : view === "month"
      ? `${date.slice(0, 4)}년 ${+date.slice(5, 7)}월`
      : view === "week"
        ? `${md(from)} ~ ${addDays(from, 6).slice(5, 7) === from.slice(5, 7) ? `${+addDays(from, 6).slice(8)}일` : md(addDays(from, 6))}`
        : dayTitle(date);
  const dayItems = (d: string) =>
    visible
      .filter((e) => onDay(e, d))
      .sort((a, b) => (a.allDay || a.startDate < d ? "" : a.startTime!).localeCompare(b.allDay || b.startDate < d ? "" : b.startTime!));
  // 보는 기간의 목표(목표 메뉴의 기간별 목표와 같은 것): 바로 추가·달성 체크
  const goalLabel = view === "year" ? `${date.slice(0, 4)}년` : view === "month" ? `${+date.slice(5, 7)}월` : view === "week" ? label : md(date);
  const goalPanel = <PeriodGoals key={`goals-${view}-${note.key}`} scope={view} periodKey={note.key} label={goalLabel} goals={goals} />;
  const noteTitle = view === "year" ? `${date.slice(0, 4)}년 메모` : view === "month" ? `${+date.slice(5, 7)}월 메모` : view === "week" ? `${label} 메모` : `${md(date)} 메모`;
  const list = <CalendarList calendars={calendars} hidden={hidden} toggle={toggleCal} google={google} />;

  return (
    // 넓은 화면(xl)은 왼쪽에 캘린더 목록이 늘 보이고, 좁으면 "캘린더" 버튼으로 엶
    <div className="xl:grid xl:grid-cols-[13rem_minmax(0,1fr)] xl:gap-6">
      <aside className="max-xl:hidden" aria-label="캘린더 목록">
        <div className="sticky top-4">{list}</div>
      </aside>
      <div className="min-w-0 space-y-4">
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
          <Button variant="outline" size="sm" className="max-md:ml-auto max-md:h-11 xl:hidden" onClick={() => setListOpen(true)}>
            <Layers /> 캘린더
          </Button>
          <Button className="max-md:hidden" onClick={() => addAt(selected)}>
            <Plus /> 일정
          </Button>
        </div>

        {/* 모든 보기: 목표·메모를 맨 위에(모바일은 접어 둠) */}
        <TopPanels label={goalLabel} goals={goals} note={note}>
          {goalPanel}
          <NotePanel key={note.scope + note.key} note={note} title={noteTitle} />
        </TopPanels>
        {view === "year" ? (
          <>
            {menu(<YearPlanner key={date} year={date.slice(0, 4)} focus={date} today={today} items={visible} color={colorOf} open={setDetail} add={(d) => (setSelected(d), addAt(d))} month={(d) => go("month", d)} />)}
          </>
        ) : view === "month" ? (
          menu(<MonthGrid from={from} month={date.slice(0, 7)} selected={selected} today={today} items={visible} color={colorOf} openDay={(d) => (setSelected(d), setDayOpen(d))} open={setDetail} mobile={mobile} />)
        ) : (
          // 주·일 보기: 시간표 대신 날짜별 목록(시간 · 제목 · 장소, 시간순)
          menu(
            <div className="bg-card divide-y rounded-lg border px-3">
              {(view === "week" ? Array.from({ length: 7 }, (_, i) => addDays(from, i)) : [date]).map((d) => (
                <div key={d} className="py-2">
                  <DayList day={d} items={dayItems(d)} color={colorOf} open={setDetail} add={() => addAt(d)} today={today} compact />
                </div>
              ))}
            </div>,
          )
        )}
      </div>

      {dayOpen && view === "month" && <DaySheet day={dayOpen} today={today} items={dayItems(dayOpen)} color={colorOf} open={setDetail} add={() => addAt(dayOpen)} close={() => setDayOpen(null)} wrap={menu} />}
      {detail && <Detail e={detail} cal={calOf(detail)} close={() => setDetail(null)} edit={() => editOf(detail)} copy={() => copyOf(detail)} remove={() => askRemove(detail)} />}
      {scopeFor && <ScopeDialog title="반복 일정을 어떻게 지울까요?" close={() => setScopeFor(null)} pick={(s) => remove(scopeFor, s)} />}
      {form && <EventForm key={form.edit?.id ?? "new"} draft={form.draft} edit={form.edit} calendars={calendars} close={() => setForm(null)} done={done} />}
      {listOpen && (
        <ResponsiveModal open onOpenChange={(o) => !o && setListOpen(false)} title="캘린더" size="sm">
          {list}
        </ResponsiveModal>
      )}
    </div>
  );
}
