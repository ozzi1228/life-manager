"use client";

// 고정 지출 목록·상세·추가·수정·해지 (SCR-FIN-06·07, 04 §6.6·6.7)
import { ChevronDown, Plus, StickyNote } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import {
  addRecurring,
  cancelRecurringEnd,
  deleteRecurring,
  editRecurring,
  endRecurringNow,
  endRecurringOn,
  reactivateRecurring,
  type RecurringIn,
} from "@/app/actions/recurring";
import { InfoTip } from "@/components/app/help";
import { AmountInput } from "@/components/app/money";
import { ResponsiveDetail, ResponsiveModal } from "@/components/app/responsive";
import { EmptyState, toastDone } from "@/components/app/states";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";
import { dateLabel, fromYmd, money, ymd } from "@/lib/format";

export type RecurringItem = RecurringIn & {
  id: string;
  version: number;
  status: "active" | "ending" | "ended";
  lastUseDate: string | null;
  endedAt: string | null;
  label: string;
  next: string | null;
  perMonth: number;
};
type Opt = { id: string; name: string };

const md = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8))}일`;
/** 고르기 칸 높이를 입력칸(모바일 44px·PC 36px)과 맞춤 */
const SEL_H = "data-[size=default]:h-11 md:data-[size=default]:h-9";
const SUGGEST = ["넷플릭스", "유튜브 프리미엄", "쿠팡 와우", "네이버플러스", "티빙", "디즈니+", "멜론", "통신비", "인터넷", "보험", "월세", "관리비"];

export function RecurringList({ items, categories, payments, today }: { items: RecurringItem[]; categories: Opt[]; payments: Opt[]; today: string }) {
  const router = useRouter();
  const mobile = useIsMobile();
  const [detail, setDetail] = useState<RecurringItem | null>(null);
  const [form, setForm] = useState<{ item?: RecurringItem; preset?: string } | null>(null);
  const live = items.filter((i) => i.status !== "ended");
  const ended = items.filter((i) => i.status === "ended");
  const monthSum = live.reduce((a, i) => a + i.perMonth, 0);
  const pmName = (id: string | null) => payments.find((p) => p.id === id)?.name;
  const refresh = () => router.refresh();

  const row = (i: RecurringItem) => (
    <li key={i.id}>
      <button type="button" onClick={() => setDetail(i)} className="hover:bg-accent/50 flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left md:min-h-11">
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className={i.status === "ended" ? "text-muted-foreground truncate" : "truncate"}>{i.name}</span>
            {i.memo && <StickyNote className="text-muted-foreground size-3.5 shrink-0" aria-label="메모 있음" />}
            {i.status === "ending" && <Badge className="bg-warning text-warning-foreground">해지 예정</Badge>}
          </span>
          <span className="text-muted-foreground block truncate text-caption">
            {i.status === "ended"
              ? `${i.endedAt ? dateLabel(i.endedAt, fromYmd(today)) : ""} 해지됨`
              : [i.label, i.next ? `다음 ${md(i.next)}` : null, i.status === "ending" && i.lastUseDate ? `${md(i.lastUseDate)}까지` : null, pmName(i.paymentMethodId)].filter(Boolean).join(" · ")}
          </span>
          {i.memo && i.status !== "ended" && <span className="text-muted-foreground block truncate text-caption md:hidden">{i.memo.split("\n")[0]}</span>}
        </span>
        <span className={i.status === "ended" ? "text-muted-foreground shrink-0 tabular-nums" : "shrink-0 tabular-nums"}>
          {i.variableAmount && "약 "}
          {money(i.amount)}
        </span>
      </button>
    </li>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="tabular-nums">
          월 <span className="font-semibold">{money(monthSum)}</span>
          <span className="text-muted-foreground"> · 연 환산 {money(monthSum * 12)}</span>
        </p>
        <InfoTip label="월 환산">매년·몇 개월마다·매주 나가는 돈도 한 달 기준으로 바꿔 더했어요. 해지된 것은 빼요.</InfoTip>
        <Button className="ml-auto" variant={mobile ? "outline" : "default"} onClick={() => setForm({})}>
          <Plus /> 고정 지출 추가
        </Button>
      </div>

      {items.length === 0 ? (
        <EmptyState
          pet="pomong"
          title="매달 나가는 돈을 등록해 보세요"
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {["넷플릭스", "통신비", "보험"].map((n) => (
                <Button key={n} variant="outline" className="rounded-full" onClick={() => setForm({ preset: n })}>
                  {n}
                </Button>
              ))}
            </div>
          }
        />
      ) : (
        <>
          {live.length > 0 && <ul className="divide-y rounded-lg border">{live.map(row)}</ul>}
          {ended.length > 0 && (
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="-ml-2">
                  <ChevronDown /> 해지됨 {ended.length}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ul className="divide-y rounded-lg border">{ended.map(row)}</ul>
              </CollapsibleContent>
            </Collapsible>
          )}
        </>
      )}

      {detail && (
        <Detail
          key={detail.id + detail.version}
          item={detail}
          today={today}
          payment={pmName(detail.paymentMethodId)}
          category={categories.find((c) => c.id === detail.categoryId)?.name}
          close={() => setDetail(null)}
          edit={() => (setForm({ item: detail }), setDetail(null))}
          done={refresh}
        />
      )}
      {form && <RecurringForm item={form.item} preset={form.preset} categories={categories} payments={payments} today={today} close={() => setForm(null)} done={refresh} />}
    </div>
  );
}

function Detail({ item, today, payment, category, close, edit, done }: { item: RecurringItem; today: string; payment?: string; category?: string; close: () => void; edit: () => void; done: () => void }) {
  const [ending, setEnding] = useState(false);
  // 기본값: 다음 결제 전날(오늘보다 앞이면 오늘)
  const dayBefore = item.next ? ymd(new Date(fromYmd(item.next).getTime() - 86_400_000)) : today;
  const [lastUse, setLastUse] = useState(dayBefore < today ? today : dayBefore);
  const [busy, setBusy] = useState(false);
  const run = async (f: () => Promise<{ ok: boolean; error?: { message: string } }>, msg: string) => {
    setBusy(true);
    const r = await f();
    setBusy(false);
    if (!r.ok) return toast(r.error?.message ?? "잠시 후 다시 시도해 주세요");
    done();
    close();
    toastDone(msg);
  };

  // 겹친 서랍은 바깥 서랍을 닫아 버려서, 날짜 고르기는 상세 대신 띄움
  if (ending)
    return (
      <ResponsiveModal
        open
        onOpenChange={(o) => !o && setEnding(false)}
        size="sm"
        title="언제까지 이용하나요?"
        description="이 날 이후에는 결제 예정에서 빠져요"
        footer={
          <Button disabled={busy} onClick={() => run(() => endRecurringOn(item.id, item.version, lastUse), `${md(lastUse)}에 해지돼요`)}>
            해지 예정으로 바꾸기
          </Button>
        }
      >
        <Calendar mode="single" selected={fromYmd(lastUse)} onSelect={(d) => d && setLastUse(ymd(d))} disabled={{ before: fromYmd(today) }} className="mx-auto" />
      </ResponsiveModal>
    );

  return (
    <ResponsiveDetail
      open
      onOpenChange={(o) => !o && close()}
      title={
        <span className="flex items-center gap-2">
          {item.name}
          {item.status === "ending" && <Badge className="bg-warning text-warning-foreground">해지 예정</Badge>}
          {item.status === "ended" && <Badge variant="secondary">해지됨</Badge>}
        </span>
      }
      description={`${item.variableAmount ? "약 " : ""}${money(item.amount)} · ${item.label}`}
      footer={
        <div className="flex w-full flex-wrap gap-2">
          <Button variant="outline" onClick={edit}>
            수정
          </Button>
          {item.status === "active" && (
            <Button variant="outline" onClick={() => setEnding(true)}>
              해지 예정으로 바꾸기
            </Button>
          )}
          {item.status === "ending" && (
            <Button variant="outline" disabled={busy} onClick={() => run(() => cancelRecurringEnd(item.id, item.version), "해지 예정을 취소했어요")}>
              해지 취소
            </Button>
          )}
          {item.status !== "ended" ? (
            <Button variant="ghost" disabled={busy} onClick={() => run(() => endRecurringNow(item.id, item.version), "해지됨으로 옮겼어요")}>
              바로 해지됨으로
            </Button>
          ) : (
            <Button variant="outline" disabled={busy} onClick={() => run(() => reactivateRecurring(item.id, item.version), "다시 이용 중으로 바꿨어요")}>
              다시 이용하기
            </Button>
          )}
          <Button variant="ghost" className="text-destructive-text ml-auto" disabled={busy} onClick={() => run(() => deleteRecurring(item.id), "휴지통으로 옮겼어요")}>
            삭제
          </Button>
        </div>
      }
    >
      <div className="space-y-5 text-sm">
        {item.next && (
          <div>
            <p className="text-muted-foreground">다음 결제</p>
            <p className="text-title font-semibold">{dateLabel(item.next, fromYmd(today))}</p>
          </div>
        )}
        {item.status === "ending" && item.lastUseDate && (
          <Alert>
            <AlertDescription>
              {dateLabel(item.lastUseDate, fromYmd(today))}까지 이용하고 해지돼요. 실제 해지는 해당 서비스에서 직접 해 주세요.
            </AlertDescription>
          </Alert>
        )}
        {item.memo && (
          <div>
            <p className="text-muted-foreground">메모</p>
            <p className="whitespace-pre-line">{item.memo}</p>
          </div>
        )}
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt className="text-muted-foreground">결제수단</dt>
          <dd>{payment ?? "—"}</dd>
          <dt className="text-muted-foreground">분류</dt>
          <dd>{category ?? "—"}</dd>
          <dt className="text-muted-foreground">결제일 알림</dt>
          <dd>{item.notify ? "켬(하루 전)" : "끔"}</dd>
        </dl>
      </div>

    </ResponsiveDetail>
  );
}

function RecurringForm({ item, preset, categories, payments, today, close, done }: { item?: RecurringItem; preset?: string; categories: Opt[]; payments: Opt[]; today: string; close: () => void; done: () => void }) {
  const fixedCat = categories.find((c) => c.name === "구독·고정")?.id ?? null;
  const [v, setV] = useState<RecurringIn>(
    item ?? {
      name: preset ?? "",
      amount: 0,
      variableAmount: false,
      cycle: "monthly",
      dayOfMonth: Number(today.slice(8)),
      monthOfYear: Number(today.slice(5, 7)),
      intervalMonths: 3,
      anchorMonth: today.slice(0, 7),
      weekday: fromYmd(today).getDay(),
      paymentMethodId: null,
      categoryId: fixedCat,
      memo: null,
      notify: true,
    },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof RecurringIn>(k: K, val: RecurringIn[K]) => setV((s) => ({ ...s, [k]: val }));

  async function save() {
    setBusy(true);
    // 주기에 따라 필요한 값이 비어 있지 않게 채워 보냄(서버가 필요 없는 값은 버림)
    const input = { ...v, dayOfMonth: v.dayOfMonth ?? 1, monthOfYear: v.monthOfYear ?? 1, intervalMonths: v.intervalMonths ?? 3, anchorMonth: v.anchorMonth ?? today.slice(0, 7), weekday: v.weekday ?? 1, memo: v.memo?.trim() || null };
    const r = item ? await editRecurring(item.id, item.version, input) : await addRecurring(input);
    setBusy(false);
    if (!r.ok) return setError(r.error.code === "VERSION_CONFLICT" ? "다른 기기에서 먼저 수정했어요. 닫고 다시 열어 주세요" : (r.error.fields?.[0]?.message ?? r.error.message));
    toast(item ? "고쳤어요" : "고정 지출에 추가했어요");
    done();
    close();
  }

  const days = (
    <Select value={String(v.dayOfMonth ?? 1)} onValueChange={(d) => set("dayOfMonth", Number(d))}>
      <SelectTrigger className={`w-24 ${SEL_H}`} aria-label="날짜">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {Array.from({ length: 31 }, (_, i) => (
          <SelectItem key={i + 1} value={String(i + 1)}>
            {i + 1}일
          </SelectItem>
        ))}
        <SelectItem value="0">말일</SelectItem>
      </SelectContent>
    </Select>
  );
  const months = (value: number | null, onChange: (m: number) => void, label: string) => (
    <Select value={String(value ?? 1)} onValueChange={(m) => onChange(Number(m))}>
      <SelectTrigger className={`w-24 ${SEL_H}`} aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Array.from({ length: 12 }, (_, i) => (
          <SelectItem key={i + 1} value={String(i + 1)}>
            {i + 1}월
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <ResponsiveModal
      open
      onOpenChange={(o) => !o && close()}
      title={item ? "고정 지출 수정" : "고정 지출 추가"}
      footer={
        <Button disabled={!v.name.trim() || !v.amount || busy} onClick={save}>
          {busy && <Spinner />} {item ? "저장" : "고정 지출 추가"}
        </Button>
      }
    >
      <FieldGroup className="gap-5">
        <Field>
          <FieldLabel htmlFor="rc-name">이름</FieldLabel>
          <Input id="rc-name" list="rc-suggest" autoFocus={!item} maxLength={40} className="h-11 text-base md:h-9 md:text-sm [&::-webkit-calendar-picker-indicator]:opacity-0" value={v.name} onChange={(e) => set("name", e.target.value)} />
          <datalist id="rc-suggest">
            {SUGGEST.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </Field>
        <Field>
          <FieldLabel htmlFor="rc-amount">금액</FieldLabel>
          <AmountInput id="rc-amount" value={v.amount || null} onChange={(a) => set("amount", a ?? 0)} />
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={v.variableAmount} onCheckedChange={(c) => set("variableAmount", c === true)} /> 금액이 매번 달라요
          </label>
        </Field>
        <Field>
          <FieldLabel>
            결제일 <InfoTip label="결제일">매월 31일처럼 없는 날은 그 달 마지막 날에 결제돼요.</InfoTip>
          </FieldLabel>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={v.cycle} onValueChange={(c) => set("cycle", c as RecurringIn["cycle"])}>
              <SelectTrigger className={`w-32 ${SEL_H}`} aria-label="주기">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">매월</SelectItem>
                <SelectItem value="yearly">매년</SelectItem>
                <SelectItem value="every_n_months">몇 개월마다</SelectItem>
                <SelectItem value="weekly">매주</SelectItem>
              </SelectContent>
            </Select>
            {v.cycle === "monthly" && days}
            {v.cycle === "yearly" && (
              <>
                {months(v.monthOfYear, (m) => set("monthOfYear", m), "월")}
                {days}
              </>
            )}
            {v.cycle === "every_n_months" && (
              <>
                <Select value={String(v.intervalMonths ?? 3)} onValueChange={(n) => set("intervalMonths", Number(n))}>
                  <SelectTrigger className={`w-24 ${SEL_H}`} aria-label="간격">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 11 }, (_, i) => (
                      <SelectItem key={i + 2} value={String(i + 2)}>
                        {i + 2}개월
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {days}
                <span className="text-muted-foreground text-sm">시작</span>
                {months(Number((v.anchorMonth ?? today).slice(5, 7)), (m) => set("anchorMonth", `${(v.anchorMonth ?? today).slice(0, 4)}-${String(m).padStart(2, "0")}`), "시작 달")}
              </>
            )}
            {v.cycle === "weekly" && (
              <Select value={String(v.weekday ?? 1)} onValueChange={(w) => set("weekday", Number(w))}>
                <SelectTrigger className={`w-28 ${SEL_H}`} aria-label="요일">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["일", "월", "화", "수", "목", "금", "토"].map((w, i) => (
                    <SelectItem key={w} value={String(i)}>
                      {w}요일
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel>결제수단</FieldLabel>
            <Select value={v.paymentMethodId ?? "none"} onValueChange={(p) => set("paymentMethodId", p === "none" ? null : p)}>
              <SelectTrigger aria-label="결제수단" className={`w-full ${SEL_H}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">정하지 않음</SelectItem>
                {payments.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>분류</FieldLabel>
            <Select value={v.categoryId ?? "none"} onValueChange={(c) => set("categoryId", c === "none" ? null : c)}>
              <SelectTrigger aria-label="분류" className={`w-full ${SEL_H}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">정하지 않음</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="rc-memo">메모</FieldLabel>
          <Textarea id="rc-memo" maxLength={1000} placeholder="메모를 입력하세요" value={v.memo ?? ""} onChange={(e) => set("memo", e.target.value)} />
        </Field>
        <label className="flex items-center justify-between gap-3 text-sm">
          결제일 하루 전 알림
          <Switch checked={v.notify} onCheckedChange={(n) => set("notify", n)} />
        </label>
        {error && <FieldError>{error}</FieldError>}
      </FieldGroup>
    </ResponsiveModal>
  );
}
