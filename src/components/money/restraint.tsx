"use client";

// 참은 소비 (SCR-FIN-14, 04 §6.14, 20): 참아야 할 금액·참은 금액·진행, 내역, 목록, 월말 후보, 지난 달 정산 결과
import { CheckCircle2, ChevronDown, MoreHorizontal, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { addRestraint, deleteRestraint, editRestraint, excludeRestraint, resettleMonth, restoreRestraint } from "@/app/actions/restraint";
import { InfoTip } from "@/components/app/help";
import { AmountInput } from "@/components/app/money";
import { ResponsiveModal } from "@/components/app/responsive";
import { toastUndo } from "@/components/app/states";
import { MonthNav } from "@/components/money/controls";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";
import { addMonths, dateLabel, fromYmd, money, monthLabel, ymd } from "@/lib/format";
import { fillState } from "@/lib/restraint";
import { cn } from "@/lib/utils";
import type { RestraintView as View } from "@/server/restraint";

type Entry = View["entries"][number];
const ORIGIN: Record<Entry["origin"], string> = { manual: "직접", wish_auto: "위시", wish_dropped: "그만둔 위시", wish_picked: "위시에서" };
const LEVEL: Record<string, string> = { want: "갖고 싶음", like: "관심" };

function EntryForm({ edit, pickable, today, close, done }: { edit?: Entry; pickable: View["pickable"]; today: string; close: () => void; done: () => void }) {
  const [name, setName] = useState(edit?.name ?? "");
  const [amount, setAmount] = useState<number | null>(edit?.amount ?? null);
  const [date, setDate] = useState(edit?.date ?? today);
  const [reason, setReason] = useState(edit?.reason ?? "");
  const [wishId, setWishId] = useState<string | null>(edit?.wishItemId ?? null);
  const [dateOpen, setDateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const key = useRef(crypto.randomUUID());

  function pick(id: string) {
    const w = pickable.find((p) => p.id === id);
    setWishId(w?.id ?? null);
    if (w) {
      setName(w.name.slice(0, 100));
      setAmount(w.price);
    }
  }
  async function save() {
    if (!amount) return;
    setBusy(true);
    const input = { name, amount, date, reason: reason.trim() || null, wishItemId: wishId };
    const r = edit ? await editRestraint(edit.id, edit.version, input) : await addRestraint(key.current, input);
    setBusy(false);
    if (!r.ok) return setError(r.error.code === "VERSION_CONFLICT" ? "다른 기기에서 먼저 수정했어요. 닫고 다시 열어 주세요" : (r.error.fields?.[0]?.message ?? r.error.message));
    toast(edit ? "고쳤어요" : "참은 것을 기록했어요");
    done();
  }

  return (
    <ResponsiveModal
      open
      onOpenChange={(o) => !o && close()}
      title={edit ? "참은 소비 수정" : "참은 것 기록"}
      footer={
        <Button className="w-full md:ml-auto md:w-auto" disabled={!name.trim() || !amount || busy} onClick={save}>
          {busy && <Spinner />} 기록
        </Button>
      }
    >
      <FieldGroup className="gap-5">
        {!edit && pickable.length > 0 && (
          <Field>
            <FieldLabel>위시에서 고르기</FieldLabel>
            <Select value={wishId ?? "none"} onValueChange={(v) => (v === "none" ? setWishId(null) : pick(v))}>
              <SelectTrigger aria-label="위시에서 고르기" className="data-[size=default]:h-11 md:data-[size=default]:h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">고르지 않음</SelectItem>
                {pickable.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} {p.price ? `· ${money(p.price)}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
        <Field>
          <FieldLabel htmlFor="rs-name">이름</FieldLabel>
          <Input id="rs-name" autoFocus={!edit} maxLength={100} placeholder="예: 한정판 운동화" className="h-11 text-base md:h-9 md:text-sm" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="rs-amount">금액</FieldLabel>
          <AmountInput id="rs-amount" value={amount} onChange={setAmount} />
        </Field>
        <Field orientation="horizontal" className="items-center">
          <FieldLabel className="w-10 shrink-0">날짜</FieldLabel>
          <Popover open={dateOpen} onOpenChange={setDateOpen}>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline">
                {dateLabel(date, fromYmd(today))}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={fromYmd(date)} onSelect={(d) => (d && setDate(ymd(d)), setDateOpen(false))} />
            </PopoverContent>
          </Popover>
        </Field>
        <Field>
          <FieldLabel htmlFor="rs-reason">참은 이유</FieldLabel>
          <Textarea id="rs-reason" maxLength={1000} placeholder="예: 세일이라 흔들렸지만 이미 비슷한 게 있음" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {error && <FieldError>{error}</FieldError>}
      </FieldGroup>
    </ResponsiveModal>
  );
}

export function RestraintView({ v, today }: { v: View; today: string }) {
  const router = useRouter();
  const mobile = useIsMobile();
  const [form, setForm] = useState<{ edit?: Entry } | null>(null);
  const [busy, setBusy] = useState(false);
  const state = fillState(v.target, v.filled);
  const short = Math.max(0, v.target - v.filled);
  const pct = v.target > 0 ? Math.min(100, Math.round((v.filled / v.target) * 100)) : 0;
  const refresh = () => router.refresh();
  const candSum = v.candidates.reduce((a, c) => a + c.price, 0);
  const mLabel = monthLabel(v.month, fromYmd(today));

  async function call(p: Promise<{ ok: boolean; error?: { message: string } }>, message: string) {
    setBusy(true);
    const r = await p;
    setBusy(false);
    if (!r.ok) return toast(r.error?.message ?? "잠시 후 다시 시도해 주세요");
    toast(message);
    refresh();
  }
  async function remove(e: Entry) {
    const r = await deleteRestraint(e.id);
    if (!r.ok) return toast(r.error.message);
    refresh();
    toastUndo("휴지통으로 옮겼어요", async () => {
      await restoreRestraint(e.id);
      refresh();
    });
  }
  const pickNow = (c: View["candidates"][number]) => call(addRestraint(crypto.randomUUID(), { name: c.name, amount: c.price, date: today, reason: null, wishItemId: c.id }), "참은 것으로 기록했어요");

  const add = (
    <Button variant={mobile ? "outline" : "default"} onClick={() => setForm({})}>
      <Plus /> 참은 것 기록
    </Button>
  );
  const tip = (
    <InfoTip label="참은 소비 계산" title="참아야 할 금액">
      <p>지출을 기록할 때 &quot;참아서 갚기&quot;를 체크한 돈과 분류별 예산을 넘은 금액을 더한 만큼 참아야 해요.</p>
      <p>진짜 사고 싶었는데 참은 것을 기록해 채워요. 부족하면 다음 달로 넘어가요.</p>
    </InfoTip>
  );
  const lines = [
    { label: "참아서 갚을 지출", value: v.detail.luxury },
    ...v.detail.overage.map((o) => ({ label: `${o.name} 예산 초과`, value: o.over })),
    ...(v.detail.carriedIn ? [{ label: "지난달에서 넘어온 금액", value: v.detail.carriedIn }] : []),
    ...(v.detail.laterBought ? [{ label: "참았다가 산 물건", value: v.detail.laterBought }] : []),
  ];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-4">
        <MonthNav month={v.month} />

        <section className="bg-card space-y-3 rounded-xl border p-4">
          {state === "none" ? (
            <p className="flex items-center gap-1 py-2 font-semibold">
              {v.current ? "이번 달은" : `${mLabel}은`} 참아야 할 금액이 없어요 {tip}
            </p>
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-2">
                <div>
                  <dt className="text-muted-foreground flex min-h-8 items-center gap-1 text-sm">참아야 할 금액 {tip}</dt>
                  <dd className="text-title font-semibold tabular-nums">{money(v.target)}</dd>
                </div>
                <div>
                  {/* 옆 칸의 도움말 버튼만큼 높이를 맞춰 금액 줄을 나란히 */}
                  <dt className="text-muted-foreground flex min-h-8 items-center text-sm">참은 금액</dt>
                  <dd className="text-title font-semibold tabular-nums">{money(v.filled)}</dd>
                </div>
              </dl>
              <Progress value={pct} aria-label={`참은 비율 ${pct}%`} />
              {state === "done" ? (
                <p className="text-success-text flex items-center gap-1.5 font-semibold">
                  <CheckCircle2 className="size-4" /> {v.current ? "이번 달" : mLabel} 목표만큼 참았어요
                </p>
              ) : (
                <p className="font-semibold tabular-nums">
                  {money(short)} 더 참아야 해요
                  {v.closed && <span className="text-muted-foreground font-normal"> · {monthLabel(addMonths(v.month, 1), fromYmd(today))}로 넘어갔어요</span>}
                </p>
              )}
            </>
          )}
          {state === "none" && v.filled > 0 && <p className="text-muted-foreground text-sm tabular-nums">참은 금액 {money(v.filled)}</p>}
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="-ml-2">
                <ChevronDown /> 내역
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ul className="space-y-1 text-sm">
                {lines.map((l) => (
                  <li key={l.label} className="flex justify-between tabular-nums">
                    <span className="text-muted-foreground">{l.label}</span>
                    {money(l.value)}
                  </li>
                ))}
              </ul>
              {!v.hasBudget && (
                <p className="text-muted-foreground mt-2 text-caption">
                  <Link href="/money/budget" className="underline">
                    예산
                  </Link>
                  을 정하면 초과 금액도 더해져요
                </p>
              )}
            </CollapsibleContent>
          </Collapsible>
          {v.stale && (
            <div className="bg-warning/15 flex flex-wrap items-center gap-2 rounded-md p-2 text-sm">
              정산 뒤에 바뀐 지출·기록이 있어요
              <Button size="sm" variant="outline" className="ml-auto" disabled={busy} onClick={() => call(resettleMonth(v.month), "다시 정산했어요")}>
                {busy && <Spinner />} 다시 정산
              </Button>
            </div>
          )}
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-subtitle font-semibold">
              참은 소비 <span className="text-muted-foreground font-normal">{v.entries.filter((e) => e.status !== "excluded").length}</span>
            </h2>
            {add}
          </div>
          {v.entries.length ? (
            <ul className="divide-y rounded-lg border">
              {v.entries.map((e) => {
                const editable = e.origin !== "wish_auto";
                return (
                  <li key={e.id} className="flex items-center gap-2 px-3 py-2">
                    <button type="button" disabled={!editable} onClick={() => setForm({ edit: e })} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                      <span className="text-muted-foreground w-10 shrink-0 text-caption tabular-nums">{`${Number(e.date.slice(5, 7))}/${Number(e.date.slice(8))}`}</span>
                      <span className="min-w-0 flex-1">
                        <span className={cn("block truncate", e.status === "excluded" && "text-muted-foreground line-through")}>{e.name}</span>
                        <span className="text-muted-foreground block truncate text-caption">
                          {[ORIGIN[e.origin], e.status === "excluded" && "이 달에서 뺌", e.status === "later_bought" && e.boughtMonth && `${monthLabel(e.boughtMonth, fromYmd(today))}에 샀어요`, e.reason].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      <span className={cn("shrink-0 tabular-nums", e.status === "excluded" && "text-muted-foreground line-through")}>{money(e.amount)}</span>
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="더 보기" className="max-md:size-11">
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {e.origin === "wish_auto" ? (
                          <DropdownMenuItem onSelect={() => call(excludeRestraint(e.id, e.version, e.status !== "excluded"), e.status === "excluded" ? "다시 넣었어요" : "이 달에서 뺐어요")}>
                            {e.status === "excluded" ? "다시 넣기" : "이 달에서 빼기"}
                          </DropdownMenuItem>
                        ) : (
                          <>
                            <DropdownMenuItem onSelect={() => setForm({ edit: e })}>수정</DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive-text" onSelect={() => remove(e)}>
                              삭제
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">진짜 사고 싶었는데 참은 것을 기록해 보세요</p>
          )}
          {v.later.length > 0 && (
            <p className="text-muted-foreground text-caption">
              참았다가 이 달에 산 물건: {v.later.map((l) => `${l.name} ${money(l.amount)}`).join(", ")}
            </p>
          )}
        </section>
      </div>

      {v.current && (
        <aside className="space-y-2">
          <h2 className="text-subtitle flex items-center gap-1 font-semibold">
            이번 달 말에 들어갈 후보
            <InfoTip label="후보">1일 전부터 담아 둔 갖고 싶음·관심 위시 중 이번 달에 사지 않은 것이 다음 달 1일에 자동으로 들어가요.</InfoTip>
          </h2>
          {v.candidates.length ? (
            <>
              <ul className="divide-y rounded-lg border">
                {v.candidates.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 px-3 py-2">
                    {c.photoId ? (
                      // eslint-disable-next-line @next/next/no-img-element -- 로그인한 본인만 보는 사진(이 서버가 직접 보냄)
                      <img src={`/api/v1/attachments/${c.photoId}?v=thumb`} alt="" className="size-10 shrink-0 rounded-md object-cover" />
                    ) : (
                      <span className="bg-muted size-10 shrink-0 rounded-md" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{c.name}</span>
                      <span className="text-muted-foreground text-caption">
                        {LEVEL[c.level ?? ""]} · {money(c.price)}
                      </span>
                    </span>
                    <Button variant="link" size="sm" className="shrink-0 px-0" disabled={busy} onClick={() => pickNow(c)}>
                      지금 기록
                    </Button>
                  </li>
                ))}
              </ul>
              <p className="text-sm tabular-nums">
                지금 이대로 사지 않으면 <b>{money(candSum)}</b>이 채워져요
              </p>
            </>
          ) : (
            <div className="text-muted-foreground space-y-2 rounded-lg border border-dashed p-4 text-center text-sm">
              <p>이번 달 말에 들어갈 위시가 없어요</p>
              <Button variant="outline" size="sm" asChild>
                <Link href="/wish">위시 보기</Link>
              </Button>
            </div>
          )}
        </aside>
      )}

      {form && (
        <EntryForm
          edit={form.edit}
          pickable={v.pickable}
          today={today}
          close={() => setForm(null)}
          done={() => {
            setForm(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}
