"use client";

// 건강 (SCR-HLT-01·02, 04 §7.9·7.10): 체중·혈당 요약 카드(작은 추세선), 기록 목록(기간), 입력·수정·삭제
// 판정 문구 없음(10 §2) — 숫자와 변화만. 생리 주기는 만들지 않음(D-063)
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { addHealth, deleteHealth, editHealth, restoreHealth } from "@/app/actions/health";
import { ResponsiveModal } from "@/components/app/responsive";
import { EmptyState, toastUndo } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { dateLabel, dayLabel, fromYmd, ymd } from "@/lib/format";
import { CONTEXTS, contextLabel, dailyLast, glucoseOn, SITES, weekChange, type GlucoseContext, type HealthKind } from "@/lib/health";
import type { HealthRecord } from "@/server/health";

const UNIT: Record<HealthKind, string> = { weight: "kg", glucose: "mg/dL", injection: "" };
const NAME: Record<HealthKind, string> = { weight: "체중", glucose: "혈당", injection: "주사" };
const injLabel = (r: HealthRecord) => [r.injection?.name, r.injection?.dose].filter(Boolean).join(" ");
const PERIODS = [
  { v: "7", label: "1주" },
  { v: "30", label: "1달" },
  { v: "90", label: "3달" },
  { v: "365", label: "1년" },
];
const daysAgo = (today: string, n: number) => ymd(new Date(fromYmd(today).getTime() - n * 86_400_000));

/** 작은 추세선(값만, 축 없음) */
function Sparkline({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${max === min ? 20 : 36 - ((v - min) / (max - min)) * 32}`).join(" ");
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="text-health h-10 w-full" role="img" aria-label={label}>
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

type Draft = { kind: HealthKind; date: string; time: string; context: GlucoseContext | null; value: string; memo: string; name: string; dose: string; site: string };

/** last: 마지막 주사(새 주사 기록에 약 이름·용량을 미리 채움), names: 지난 약 이름(고르기) */
function HealthForm({ edit, kind, today, last, names, close, done }: { edit?: HealthRecord; kind: HealthKind; today: string; last?: HealthRecord; names: string[]; close: () => void; done: () => void }) {
  const now = () => `${String(new Date().getHours()).padStart(2, "0")}:${String(new Date().getMinutes()).padStart(2, "0")}`;
  const [v, setV] = useState<Draft>(() => ({
    kind: edit?.kind ?? kind,
    date: edit?.date ?? today,
    time: edit?.time ?? now(),
    context: edit?.context ?? (kind === "glucose" ? "fasting" : null),
    value: edit && edit.kind !== "injection" ? String(edit.value) : "",
    memo: edit?.memo ?? "",
    name: edit?.injection?.name ?? last?.injection?.name ?? "",
    dose: edit?.injection?.dose ?? last?.injection?.dose ?? "",
    site: edit?.injection?.site ?? "",
  }));
  const [dateOpen, setDateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const key = useRef(crypto.randomUUID());
  const set = <K extends keyof Draft>(k: K, val: Draft[K]) => setV((s) => ({ ...s, [k]: val }));
  const num = Number(v.value.replace(",", "."));
  const inj = v.kind === "injection";
  const ready = inj ? !!v.name.trim() : !!v.value.trim() && !Number.isNaN(num);

  async function save() {
    setBusy(true);
    setError("");
    const input = {
      kind: v.kind,
      date: v.date,
      time: v.time,
      context: v.kind === "glucose" ? v.context : null,
      value: inj ? null : num,
      injection: inj ? { name: v.name.trim(), dose: v.dose.trim() || null, site: v.site.trim() || null } : null,
      memo: v.memo.trim() || null,
    };
    const r = edit ? await editHealth(edit.id, edit.version, input) : await addHealth(key.current, input);
    setBusy(false);
    if (!r.ok) return setError(r.error.code === "VERSION_CONFLICT" ? "다른 기기에서 먼저 수정했어요. 닫고 다시 열어 주세요" : (r.error.fields?.[0]?.message ?? r.error.message));
    toast(edit ? "고쳤어요" : `${NAME[v.kind]}${inj ? "를" : "을"} 기록했어요`);
    done();
  }
  async function remove() {
    if (!edit) return;
    const r = await deleteHealth(edit.id);
    if (!r.ok) return setError(r.error.message);
    done();
    toastUndo("휴지통으로 옮겼어요", async () => {
      await restoreHealth(edit.id);
      done();
    });
  }

  return (
    <ResponsiveModal
      open
      onOpenChange={(o) => !o && close()}
      title={edit ? `${NAME[v.kind]} 기록 수정` : "건강 기록"}
      size="sm"
      footer={
        <div className="flex w-full gap-2">
          {edit && (
            <Button variant="ghost" className="text-destructive-text" onClick={remove}>
              삭제
            </Button>
          )}
          <Button className="ml-auto max-md:flex-1" disabled={!ready || busy} onClick={save}>
            {busy && <Spinner />} 저장
          </Button>
        </div>
      }
    >
      <FieldGroup className="gap-4">
        {!edit && (
          <ToggleGroup type="single" variant="outline" value={v.kind} onValueChange={(k) => k && setV((s) => ({ ...s, kind: k as HealthKind, context: k === "glucose" ? (s.context ?? "fasting") : null }))} aria-label="종류" className="w-full">
            <ToggleGroupItem value="weight" className="flex-1">
              체중
            </ToggleGroupItem>
            <ToggleGroupItem value="glucose" className="flex-1">
              혈당
            </ToggleGroupItem>
            <ToggleGroupItem value="injection" className="flex-1">
              주사
            </ToggleGroupItem>
          </ToggleGroup>
        )}
        {inj && (
          <>
            <div className="grid grid-cols-[1fr_7rem] gap-2">
              <Field>
                <FieldLabel htmlFor="hl-name">약 이름</FieldLabel>
                <Input id="hl-name" autoFocus={!v.name} list="hl-names" maxLength={40} placeholder="예: 인슐린" className="h-11 text-base md:h-9 md:text-sm" value={v.name} onChange={(e) => set("name", e.target.value)} />
                <datalist id="hl-names">
                  {names.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              </Field>
              <Field>
                <FieldLabel htmlFor="hl-dose">용량</FieldLabel>
                <Input id="hl-dose" maxLength={20} placeholder="예: 10단위" className="h-11 text-base md:h-9 md:text-sm" value={v.dose} onChange={(e) => set("dose", e.target.value)} />
              </Field>
            </div>
            <Field>
              <FieldLabel>부위</FieldLabel>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="부위">
                {SITES.map((s) => (
                  <Button key={s} type="button" role="radio" aria-checked={v.site === s} size="sm" variant={v.site === s ? "default" : "outline"} className="rounded-full" onClick={() => set("site", v.site === s ? "" : s)}>
                    {s}
                  </Button>
                ))}
              </div>
              {last?.injection?.site && !edit && <p className="text-muted-foreground text-caption">지난번: {last.injection.site}</p>}
            </Field>
          </>
        )}
        {!inj && (
        <Field>
          <FieldLabel htmlFor="hl-value">{v.kind === "weight" ? "체중" : "혈당"}</FieldLabel>
          <div className="flex items-center gap-2">
            <Input
              id="hl-value"
              autoFocus
              inputMode={v.kind === "weight" ? "decimal" : "numeric"}
              placeholder={v.kind === "weight" ? "52.3" : "98"}
              className="h-12 text-right text-title tabular-nums"
              value={v.value}
              onChange={(e) => set("value", e.target.value.replace(/[^\d.,]/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && v.value && save()}
            />
            <span className="text-muted-foreground w-14 shrink-0">{UNIT[v.kind]}</span>
          </div>
        </Field>
        )}
        {v.kind === "glucose" && (
          <Field>
            <FieldLabel>측정 시점</FieldLabel>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="측정 시점">
              {CONTEXTS.map((c) => (
                <Button key={c.value} type="button" role="radio" aria-checked={v.context === c.value} size="sm" variant={v.context === c.value ? "default" : "outline"} className="rounded-full" onClick={() => set("context", c.value)}>
                  {c.label}
                </Button>
              ))}
            </div>
          </Field>
        )}
        <div className="flex gap-2">
          <Popover open={dateOpen} onOpenChange={setDateOpen}>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" className="flex-1 justify-start">
                {dateLabel(v.date, fromYmd(today))}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={fromYmd(v.date)} disabled={{ after: fromYmd(today) }} onSelect={(d) => (d && set("date", ymd(d)), setDateOpen(false))} />
            </PopoverContent>
          </Popover>
          <Input type="time" aria-label="시간" className="w-32" value={v.time} onChange={(e) => e.target.value && set("time", e.target.value)} />
        </div>
        <Textarea aria-label="메모" placeholder={v.kind === "glucose" ? "메모 (먹은 것 등)" : "메모"} maxLength={500} value={v.memo} onChange={(e) => set("memo", e.target.value)} />
        {error && <FieldError>{error}</FieldError>}
      </FieldGroup>
    </ResponsiveModal>
  );
}

export function HealthView({ weight, glucose, injection, today }: { weight: HealthRecord[]; glucose: HealthRecord[]; injection: HealthRecord[]; today: string }) {
  const router = useRouter();
  const [form, setForm] = useState<{ kind: HealthKind; edit?: HealthRecord } | null>(null);
  const [kind, setKind] = useState<HealthKind>("weight");
  const [period, setPeriod] = useState("30");

  const wDaily = dailyLast(weight);
  const wLast = weight[0];
  const change = weekChange(wDaily);
  const gToday = glucoseOn(glucose, today);
  const gLast = glucose[0];
  const iLast = injection[0];
  const iDays = iLast ? Math.round((fromYmd(today).getTime() - fromYmd(iLast.date).getTime()) / 86_400_000) : 0;
  const recentSites = injection.flatMap((r) => (r.injection?.site ? [r.injection.site] : [])).slice(0, 4);
  const names = [...new Set(injection.map((r) => r.injection?.name).filter((n): n is string => !!n))];
  const list = { weight, glucose, injection }[kind].filter((r) => r.date >= daysAgo(today, Number(period)));
  const fmt = (r: HealthRecord) => (r.kind === "injection" ? injLabel(r) : r.kind === "weight" ? r.value.toFixed(1) : String(r.value));

  const card = "bg-card space-y-2 rounded-xl border p-4";
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <p className="text-muted-foreground text-caption">건강 기록은 암호화해 저장하고, 홈·검색·AI에는 보이지 않아요.</p>
        <Button className="ml-auto shrink-0" onClick={() => setForm({ kind })}>
          <Plus /> 기록
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <section className={card}>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">체중</h2>
            <Button variant="outline" size="sm" onClick={() => setForm({ kind: "weight" })}>
              <Plus /> 체중
            </Button>
          </div>
          {wLast ? (
            <>
              <p>
                <span className="text-title font-semibold tabular-nums">{wLast.value.toFixed(1)}kg</span>
                <span className="text-muted-foreground ml-2 text-sm">
                  {dayLabel(wLast.date, fromYmd(today))}
                  {change !== null && ` · 지난주보다 ${change > 0 ? "+" : ""}${change.toFixed(1)}kg`}
                </span>
              </p>
              <Sparkline values={wDaily.filter((d) => d.date >= daysAgo(today, 30)).map((d) => d.value)} label="최근 30일 체중 추세" />
            </>
          ) : (
            <p className="text-muted-foreground text-sm">아직 기록이 없어요</p>
          )}
        </section>
        <section className={card}>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">혈당</h2>
            <Button variant="outline" size="sm" onClick={() => setForm({ kind: "glucose" })}>
              <Plus /> 혈당
            </Button>
          </div>
          {gToday.length ? (
            <p className="text-sm tabular-nums">
              오늘{" "}
              {gToday.map((g, i) => (
                <span key={g.id}>
                  {i > 0 && " · "}
                  {contextLabel(g.context)} <b className="text-base">{g.value}</b>mg/dL
                </span>
              ))}
            </p>
          ) : gLast ? (
            <p className="text-sm tabular-nums">
              <span className="text-muted-foreground">{dayLabel(gLast.date, fromYmd(today))}</span> {contextLabel(gLast.context)} <b className="text-base">{gLast.value}</b>mg/dL
            </p>
          ) : (
            <p className="text-muted-foreground text-sm">아직 기록이 없어요</p>
          )}
          <Sparkline
            values={glucose
              .filter((g) => g.date >= daysAgo(today, 14))
              .reverse()
              .map((g) => g.value)}
            label="최근 14일 혈당 추세"
          />
        </section>
        <section className={card}>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">주사</h2>
            <Button variant="outline" size="sm" onClick={() => setForm({ kind: "injection" })}>
              <Plus /> 주사
            </Button>
          </div>
          {iLast ? (
            <>
              <p>
                <span className="font-semibold">{injLabel(iLast)}</span>
                <span className="text-muted-foreground ml-2 text-sm">
                  {dayLabel(iLast.date, fromYmd(today))} {iLast.time}
                  {iDays > 0 && ` · ${iDays}일 전`}
                </span>
              </p>
              {recentSites.length > 0 && <p className="text-muted-foreground text-sm">최근 부위: {recentSites.join(" → ")}</p>}
            </>
          ) : (
            <p className="text-muted-foreground text-sm">아직 기록이 없어요</p>
          )}
        </section>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup type="single" variant="outline" size="sm" value={kind} onValueChange={(k) => k && setKind(k as HealthKind)} aria-label="기록 종류">
            <ToggleGroupItem value="weight">체중</ToggleGroupItem>
            <ToggleGroupItem value="glucose">혈당</ToggleGroupItem>
            <ToggleGroupItem value="injection">주사</ToggleGroupItem>
          </ToggleGroup>
          <ToggleGroup type="single" variant="outline" size="sm" value={period} onValueChange={(p) => p && setPeriod(p)} aria-label="기간" className="ml-auto">
            {PERIODS.map((p) => (
              <ToggleGroupItem key={p.v} value={p.v}>
                {p.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        {list.length ? (
          <ul className="divide-y rounded-lg border">
            {list.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => setForm({ kind: r.kind, edit: r })} className="hover:bg-accent/50 flex w-full items-center gap-3 px-3 py-2.5 text-left">
                  <span className="text-muted-foreground shrink-0 text-sm whitespace-nowrap tabular-nums">
                    {dayLabel(r.date, fromYmd(today))} {r.time}
                  </span>
                  <span className="min-w-0 flex-1">
                    {r.context && <span className="text-muted-foreground mr-2 text-sm">{contextLabel(r.context)}</span>}
                    {r.injection?.site && <span className="text-muted-foreground mr-2 text-sm">{r.injection.site}</span>}
                    {r.memo && <span className="text-muted-foreground truncate text-caption">{r.memo}</span>}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">
                    {fmt(r)}
                    <span className="text-muted-foreground ml-0.5 text-caption font-normal">{UNIT[r.kind]}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : weight.length + glucose.length + injection.length === 0 ? (
          <EmptyState pet="komong" title="체중·혈당·주사를 기록해 보세요" description="숫자 하나면 돼요. 날짜별로 모아 추세를 보여 드려요." action={<Button onClick={() => setForm({ kind })}>기록하기</Button>} />
        ) : (
          <p className="text-muted-foreground py-6 text-center text-sm">이 기간의 {NAME[kind]} 기록이 없어요</p>
        )}
      </section>

      {form && (
        <HealthForm
          key={form.edit?.id ?? form.kind}
          edit={form.edit}
          kind={form.kind}
          today={today}
          last={iLast}
          names={names}
          close={() => setForm(null)}
          done={() => {
            setForm(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
