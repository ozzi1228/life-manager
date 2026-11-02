"use client";

// 카드 목록(SCR-FIN-08)·상세(SCR-FIN-09)·카드 설정·혜택 추가(SCR-FIN-10). 계산은 서버(src/server/cards.ts)
// ponytail: "혜택 문구로 한 번에 추가"(AI 붙여넣기, P1)와 "어떤 카드 쓸까"(C-06)는 나중에
import { Check, ChevronDown, CircleAlert, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { addCard, addCardBenefit, deleteCardBenefit, editCard, editCardBenefit, hideCardAction, restoreCardBenefit } from "@/app/actions/cards";
import { InfoTip } from "@/components/app/help";
import { AmountInput } from "@/components/app/money";
import { ResponsiveModal } from "@/components/app/responsive";
import { EmptyState, toastUndo } from "@/components/app/states";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { benefitLabel, INDUSTRIES, type Benefit } from "@/lib/cards";
import { dayLabel, fromYmd, money } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { BenefitInput, cardDetail, CardInput, cardList } from "@/server/cards";

type ListCard = Awaited<ReturnType<typeof cardList>>["cards"][number];
type DetailCard = Awaited<ReturnType<typeof cardDetail>>;
type BenefitRow = DetailCard["benefits"][number];
type Opt = { id: string; name: string };

const ISSUERS = ["신한", "삼성", "현대", "KB국민", "롯데", "하나", "우리", "BC", "NH농협", "IBK기업", "카카오뱅크", "토스뱅크"];
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const STALE_DAYS = 90;
const daysSince = (d: string, today: string) => Math.round((fromYmd(today).getTime() - fromYmd(d).getTime()) / 86_400_000);
const PERF_TIP = "카드로 쓴 금액 중 혜택 조건 계산에 인정되는 금액이에요. 실적 제외로 정한 분류·업종과 환불은 빠져요. 기록된 지출로 계산한 예상값이에요.";

/** 실적 막대: 조건(가장 낮은 전월 실적 구간)이 있으면 채움 정도, 없으면 금액만 */
function PerfBar({ perf, target }: { perf: number; target: number | null }) {
  if (!target) return <p className="tabular-nums">{money(perf)}</p>;
  const met = perf >= target;
  return (
    <div className="space-y-1">
      <p className="text-sm tabular-nums">
        {money(perf)} <span className="text-muted-foreground">/ {money(target)}</span>
        {met && <Check className="text-success ml-1 inline size-4" aria-label="조건 충족" />}
      </p>
      <Progress value={Math.min(100, (perf / target) * 100)} aria-label="이번 달 실적" />
      <p className="text-muted-foreground text-caption">{met ? "다음 달 혜택 조건을 채웠어요" : `${money(target - perf)} 더 쓰면 다음 달 혜택 조건을 채워요`}</p>
    </div>
  );
}

export function CardGrid({ cards, noPayment, categories, today }: { cards: ListCard[]; noPayment: number; categories: Opt[]; today: string }) {
  const [adding, setAdding] = useState(false);
  const router = useRouter();
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">이번 달 실적과 남은 혜택 한도</p>
        <Button onClick={() => setAdding(true)}>
          <Plus /> 카드 추가
        </Button>
      </div>
      {noPayment > 0 && cards.length > 0 && (
        <Alert>
          <CircleAlert />
          <AlertDescription>
            <span>
              결제수단이 없는 이번 달 지출 {noPayment}건은 실적에 들어가지 않았어요.{" "}
              <Link href="/money/expenses" className="text-link underline">
                지출 확인
              </Link>
            </span>
          </AlertDescription>
        </Alert>
      )}
      {cards.length === 0 ? (
        <EmptyState pet="komong" title="카드를 등록해 보세요" description="카드로 쓴 지출을 모아 이번 달 실적과 할인 한도를 계산해 드려요" action={<Button onClick={() => setAdding(true)}>카드 추가</Button>} />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cards.map((c) => {
            const targets = [...new Set(c.benefits.flatMap((b) => b.targets))].slice(0, 3);
            const stale = c.card?.verifiedAt && daysSince(c.card.verifiedAt, today) > STALE_DAYS;
            return (
              <li key={c.id}>
                <Link href={`/money/cards/${c.id}`} className="bg-card hover:bg-accent/40 block h-full space-y-3 rounded-xl border p-5 shadow-sm">
                  <div className="flex items-baseline gap-2">
                    <span className="truncate font-semibold">{c.name}</span>
                    {c.card?.issuer && <span className="text-muted-foreground truncate text-sm">{c.card.issuer}</span>}
                    {c.card?.billingDay && <span className="text-muted-foreground ml-auto shrink-0 text-caption">매월 {c.card.billingDay}일 결제</span>}
                  </div>
                  <div>
                    <p className="text-muted-foreground text-caption">이번 달 실적</p>
                    <PerfBar perf={c.perf} target={c.target} />
                  </div>
                  {c.limitTotal > 0 && (
                    <p className="text-sm tabular-nums">
                      <span className="text-muted-foreground">할인 한도</span> {money(c.limitUsed)} / {money(c.limitTotal)}
                      {c.limitUsed >= c.limitTotal && <span className="text-muted-foreground"> · 다 씀</span>}
                    </p>
                  )}
                  <p className="text-muted-foreground truncate text-sm">{targets.length ? targets.join(" · ") : "혜택을 넣으면 한도를 계산해 드려요"}</p>
                  {stale && <p className="text-warning-text text-caption">혜택이 바뀌었는지 확인해 보세요 · 최종 확인 {c.card!.verifiedAt}</p>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {adding && <CardForm categories={categories} close={() => setAdding(false)} done={(id) => router.push(`/money/cards/${id}`)} />}
    </div>
  );
}

export function CardDetailView({ c, categories, today }: { c: DetailCard; categories: Opt[]; today: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [benefit, setBenefit] = useState<BenefitRow | "new" | null>(null);
  const catName = (id: string) => categories.find((x) => x.id === id)?.name ?? "지운 분류";
  const txTitle = (id: string) => c.txs.find((t) => t.id === id);
  const got = c.benefits.flatMap((b) => b.usage.items.map((i) => ({ ...i, benefit: b })));
  const ex = c.card?.perfExcludes;
  const refresh = () => router.refresh();

  async function remove(b: BenefitRow) {
    const r = await deleteCardBenefit(b.id);
    if (!r.ok) return toast(r.error.message);
    refresh();
    toastUndo("혜택을 휴지통으로 옮겼어요", async () => (await restoreCardBenefit(b.id), refresh()));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-title font-semibold">{c.name}</h1>
          <p className="text-muted-foreground text-sm">
            {[c.card?.issuer, c.card?.cardType === "credit" ? "신용" : c.card?.cardType === "check" ? "체크" : null, c.card?.billingDay ? `매월 ${c.card.billingDay}일 결제` : null, c.card?.annualFee ? `연회비 ${money(c.card.annualFee)}` : null]
              .filter(Boolean)
              .join(" · ") || "카드 정보를 넣어 보세요"}
          </p>
        </div>
        <Button variant="outline" onClick={() => setEditing(true)}>
          <Pencil /> 수정
        </Button>
      </div>

      <section className="bg-card space-y-3 rounded-xl border p-5 shadow-sm">
        <h2 className="text-subtitle flex items-center gap-1 font-semibold">
          이번 달 실적 <InfoTip label="실적">{PERF_TIP}</InfoTip>
        </h2>
        <PerfBar perf={c.perf} target={c.target} />
        <p className="text-muted-foreground flex items-center gap-1 text-sm">
          지난달 실적 {money(c.prevPerf)}
          {c.target !== null && (c.prevPerf >= c.target ? " → 이번 달 혜택을 받고 있어요" : " → 조건을 못 채워 이번 달은 구간 혜택이 없어요")}
          <InfoTip label="전월 실적 구간">지난달 실적에 따라 이번 달에 받을 수 있는 혜택이 달라져요.</InfoTip>
        </p>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-subtitle flex items-center gap-1 font-semibold">
            혜택 <InfoTip label="혜택 계산">지출 내용에 가맹점 이름(예: 스타벅스, CGV)을 적으면 업종을 알아보고 혜택을 계산해요. 카드사 데이터가 아니라 기록한 지출로 계산한 예상값이에요.</InfoTip>
          </h2>
          <Button size="sm" onClick={() => setBenefit("new")}>
            <Plus /> 혜택 추가
          </Button>
        </div>
        {c.benefits.length === 0 ? (
          <p className="text-muted-foreground text-sm">아직 혜택이 없어요. 카드사 앱의 혜택 안내를 보며 넣어 보세요.</p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {c.benefits.map((b) => (
              <li key={b.id}>
                <Collapsible>
                  <div className="flex items-start gap-2 px-4 py-3">
                    <CollapsibleTrigger className="min-w-0 flex-1 space-y-1 text-left">
                      <span className="flex items-center gap-1.5 text-sm">
                        <ChevronDown className="text-muted-foreground size-4 shrink-0" />
                        <span className="font-medium">{b.targets.join(", ")}</span>
                      </span>
                      <span className="text-muted-foreground block text-sm">{benefitLabel(b as Benefit & { benefitType: typeof b.benefitType }, money)}</span>
                      <span className="block text-sm tabular-nums">
                        {!b.usage.applies ? (
                          <span className="text-muted-foreground">지난달 실적이 모자라 이번 달은 혜택이 없어요</span>
                        ) : b.limitType === "amount" && b.usage.limit ? (
                          <>
                            이번 달 {money(b.usage.used)} / {money(b.usage.limit)}
                            <Progress value={Math.min(100, (b.usage.used / b.usage.limit) * 100)} className="mt-1 h-1.5" aria-label="혜택 한도 사용" />
                          </>
                        ) : b.limitType === "count" && b.usage.limit ? (
                          `이번 달 ${b.usage.count} / ${b.usage.limit}회 · ${money(b.usage.used)}`
                        ) : (
                          `이번 달 ${money(b.usage.used)}`
                        )}
                      </span>
                    </CollapsibleTrigger>
                    <Button variant="ghost" size="icon" aria-label="혜택 고치기" onClick={() => setBenefit(b)}>
                      <Pencil />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label="혜택 지우기" onClick={() => remove(b)}>
                      <Trash2 />
                    </Button>
                  </div>
                  <CollapsibleContent>
                    <dl className="text-muted-foreground grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 px-4 pb-3 pl-10 text-sm">
                      {b.tiers.length > 0 && (
                        <>
                          <dt>전월 실적</dt>
                          <dd>{b.tiers.map((t) => `${money(t.minPrevPerf)} 이상${t.value ? ` → ${b.valueType === "percent" ? `${t.value}%` : money(t.value)}` : ""}${t.limit ? `, 한도 ${money(t.limit)}` : ""}`).join(" / ")}</dd>
                        </>
                      )}
                      {b.minAmount && (
                        <>
                          <dt>최소 결제</dt>
                          <dd>{money(b.minAmount)} 이상</dd>
                        </>
                      )}
                      {b.daysOfWeek && (
                        <>
                          <dt>요일</dt>
                          <dd>{b.daysOfWeek.map((d) => WEEK[d]).join(", ")}</dd>
                        </>
                      )}
                      {b.timeFrom && (
                        <>
                          <dt>시간</dt>
                          <dd>
                            {b.timeFrom}~{b.timeTo}
                          </dd>
                        </>
                      )}
                      {(b.excludeInstallment || b.excludeOnline || b.excludeNote) && (
                        <>
                          <dt>제외</dt>
                          <dd>{[b.excludeInstallment && "할부", b.excludeOnline && "온라인", b.excludeNote].filter(Boolean).join(", ")}</dd>
                        </>
                      )}
                      {b.memo && (
                        <>
                          <dt>메모</dt>
                          <dd className="whitespace-pre-line">{b.memo}</dd>
                        </>
                      )}
                      {!b.tiers.length && !b.minAmount && !b.daysOfWeek && !b.timeFrom && !b.excludeInstallment && !b.excludeOnline && !b.excludeNote && !b.memo && <dd className="col-span-2">다른 조건 없음</dd>}
                    </dl>
                  </CollapsibleContent>
                </Collapsible>
              </li>
            ))}
          </ul>
        )}
        {c.card?.verifiedAt && (
          <p className={cn("text-caption", daysSince(c.card.verifiedAt, today) > STALE_DAYS ? "text-warning-text" : "text-muted-foreground")}>
            최종 확인 {c.card.verifiedAt}
            {daysSince(c.card.verifiedAt, today) > STALE_DAYS && " · 혜택이 바뀌었는지 확인해 보세요"}
          </p>
        )}
      </section>

      {got.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-subtitle font-semibold">이번 달 혜택 받은 지출</h2>
          <ul className="divide-y rounded-xl border text-sm">
            {got.map((g) => {
              const t = txTitle(g.txId);
              return (
                <li key={g.benefit.id + g.txId} className="flex items-center gap-3 px-4 py-2">
                  <span className="text-muted-foreground w-16 shrink-0">{t && dayLabel(t.date, fromYmd(today))}</span>
                  <span className="min-w-0 flex-1 truncate">{t?.title}</span>
                  <span className="tabular-nums">{t && money(t.amount)}</span>
                  <span className="text-success w-20 text-right tabular-nums">−{money(g.amount)}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {ex && (ex.categoryIds.length > 0 || ex.industries.length > 0) && (
        <section className="space-y-1 text-sm">
          <h2 className="text-subtitle font-semibold">실적 제외</h2>
          <p className="text-muted-foreground">{[...ex.categoryIds.map(catName), ...ex.industries].join(", ")}</p>
        </section>
      )}
      {c.card?.memo && (
        <section className="space-y-1 text-sm">
          <h2 className="text-subtitle font-semibold">메모</h2>
          <p className="whitespace-pre-line">{c.card.memo}</p>
        </section>
      )}

      {editing && <CardForm edit={c} categories={categories} close={() => setEditing(false)} done={refresh} />}
      {benefit && <BenefitForm pmId={c.id} edit={benefit === "new" ? undefined : benefit} close={() => setBenefit(null)} done={refresh} />}
    </div>
  );
}

function CardForm({ edit, categories, close, done }: { edit?: DetailCard; categories: Opt[]; close: () => void; done: (id: string) => void }) {
  const router = useRouter();
  const c = edit?.card;
  const [v, setV] = useState<Omit<CardInput, "perfExcludes"> & { perfExcludes: { categoryIds: string[]; industries: string[] } }>({
    name: edit?.name ?? "",
    issuer: c?.issuer ?? null,
    cardType: c?.cardType ?? null,
    billingDay: c?.billingDay ?? null,
    perfExcludes: c?.perfExcludes ?? { categoryIds: [], industries: [] },
    annualFee: c?.annualFee ?? null,
    memo: c?.memo ?? null,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((s) => ({ ...s, [k]: val }));
  const toggle = (list: string[], x: string) => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x]);

  async function save() {
    setBusy(true);
    const input = { ...v, issuer: v.issuer?.trim() || null, memo: v.memo?.trim() || null } as CardInput;
    const r = edit ? await editCard(edit.id, edit.pmVersion, input) : await addCard(input);
    setBusy(false);
    if (!r.ok) return setError(r.error.code === "VERSION_CONFLICT" ? "다른 기기에서 먼저 수정했어요. 닫고 다시 열어 주세요" : (r.error.fields?.[0]?.message ?? r.error.message));
    toast(edit ? "카드를 고쳤어요" : "카드를 추가했어요");
    close();
    done(edit ? edit.id : (r.data as { id: string }).id);
  }

  async function hide() {
    if (!edit) return;
    const r = await hideCardAction(edit.id, edit.pmVersion);
    if (!r.ok) return setError(r.error.message);
    toast("카드를 숨겼어요. 지난 지출의 결제수단 이름은 그대로예요");
    router.push("/money/cards");
  }

  return (
    <ResponsiveModal
      open
      onOpenChange={(o) => !o && close()}
      title={edit ? "카드 수정" : "카드 추가"}
      footer={
        <div className="flex w-full flex-wrap gap-2">
          {edit && (
            <Button variant="ghost" className="text-destructive-text" onClick={hide}>
              카드 숨기기
            </Button>
          )}
          <Button className="ml-auto" disabled={!v.name.trim() || busy} onClick={save}>
            {busy && <Spinner />} {edit ? "저장" : "카드 추가"}
          </Button>
        </div>
      }
    >
      <FieldGroup className="gap-5">
        <Field>
          <FieldLabel htmlFor="cd-name">카드 이름</FieldLabel>
          <Input id="cd-name" autoFocus={!edit} maxLength={20} placeholder="예: 신한 Deep Dream" className="h-11 text-base md:h-9 md:text-sm" value={v.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="cd-issuer">카드사</FieldLabel>
            <Input id="cd-issuer" list="cd-issuers" maxLength={20} value={v.issuer ?? ""} onChange={(e) => set("issuer", e.target.value)} />
            <datalist id="cd-issuers">
              {ISSUERS.map((i) => (
                <option key={i} value={i} />
              ))}
            </datalist>
          </Field>
          <Field>
            <FieldLabel>종류</FieldLabel>
            <ToggleGroup type="single" variant="outline" value={v.cardType ?? ""} onValueChange={(t) => set("cardType", (t || null) as CardInput["cardType"])} aria-label="카드 종류">
              <ToggleGroupItem value="credit">신용</ToggleGroupItem>
              <ToggleGroupItem value="check">체크</ToggleGroupItem>
            </ToggleGroup>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel>결제일</FieldLabel>
            <Select value={String(v.billingDay ?? "none")} onValueChange={(d) => set("billingDay", d === "none" ? null : Number(d))}>
              <SelectTrigger aria-label="결제일">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="none">정하지 않음</SelectItem>
                {Array.from({ length: 31 }, (_, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>
                    매월 {i + 1}일
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="cd-fee">연회비</FieldLabel>
            <AmountInput id="cd-fee" value={v.annualFee ?? null} onChange={(a) => set("annualFee", a)} />
          </Field>
        </div>
        <Field>
          <FieldLabel>
            실적 제외 <InfoTip label="실적 제외">카드사가 실적으로 쳐 주지 않는 분류·업종을 고르면 실적 계산에서 빠져요. 보통 세금·공과금, 보험료, 상품권 등이에요.</InfoTip>
          </FieldLabel>
          <div className="flex flex-wrap gap-1.5">
            {categories.map((cat) => (
              <Toggle key={cat.id} on={v.perfExcludes.categoryIds.includes(cat.id)} onClick={() => set("perfExcludes", { ...v.perfExcludes, categoryIds: toggle(v.perfExcludes.categoryIds, cat.id) })}>
                {cat.name}
              </Toggle>
            ))}
          </div>
          <p className="text-muted-foreground text-caption">업종</p>
          <div className="flex flex-wrap gap-1.5">
            {INDUSTRIES.map((ind) => (
              <Toggle key={ind} on={v.perfExcludes.industries.includes(ind)} onClick={() => set("perfExcludes", { ...v.perfExcludes, industries: toggle(v.perfExcludes.industries, ind) })}>
                {ind}
              </Toggle>
            ))}
          </div>
        </Field>
        <Field>
          <FieldLabel htmlFor="cd-memo">메모</FieldLabel>
          <Textarea id="cd-memo" maxLength={1000} value={v.memo ?? ""} onChange={(e) => set("memo", e.target.value)} />
        </Field>
        {error && <FieldError>{error}</FieldError>}
      </FieldGroup>
    </ResponsiveModal>
  );
}

/** 고르기 칩(여러 개 선택) */
function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={cn("rounded-full border px-3 py-1 text-sm", on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent")}>
      {children}
    </button>
  );
}

type TierDraft = { key: string; minPrevPerf: number | null; value: number | null; limit: number | null };

function BenefitForm({ pmId, edit, close, done }: { pmId: string; edit?: BenefitRow; close: () => void; done: () => void }) {
  const [v, setV] = useState({
    targetType: edit?.targetType ?? ("industry" as "merchant" | "industry"),
    targets: edit?.targets ?? ([] as string[]),
    merchants: edit?.targetType === "merchant" ? edit.targets.join(", ") : "",
    benefitType: edit?.benefitType ?? ("discount" as "discount" | "point" | "cashback"),
    valueType: edit?.valueType ?? ("percent" as "percent" | "amount"),
    value: edit?.value ?? null,
    perTxnMax: edit?.perTxnMax ?? null,
    minAmount: edit?.minAmount ?? null,
    limitType: edit?.limitType ?? ("none" as "amount" | "count" | "none"),
    monthlyLimit: edit?.monthlyLimit ?? null,
    daysOfWeek: edit?.daysOfWeek ?? ([] as number[]),
    timeFrom: edit?.timeFrom ?? "",
    timeTo: edit?.timeTo ?? "",
    excludeInstallment: edit?.excludeInstallment ?? false,
    excludeOnline: edit?.excludeOnline ?? false,
    excludeNote: edit?.excludeNote ?? "",
    memo: edit?.memo ?? "",
  });
  const [tiers, setTiers] = useState<TierDraft[]>((edit?.tiers ?? []).map((t) => ({ key: crypto.randomUUID(), minPrevPerf: t.minPrevPerf, value: t.value ?? null, limit: t.limit ?? null })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((s) => ({ ...s, [k]: val }));
  const targets = v.targetType === "merchant" ? v.merchants.split(/[,，\n]/).map((m) => m.trim()).filter(Boolean) : v.targets;
  const hasMore = !!(edit && (edit.tiers.length || edit.minAmount || edit.daysOfWeek || edit.timeFrom || edit.excludeInstallment || edit.excludeOnline || edit.excludeNote || edit.memo || edit.perTxnMax || edit.limitType !== "none"));

  async function save() {
    if (tiers.some((t) => !t.minPrevPerf)) return setError("전월 실적 구간의 금액을 채워 주세요");
    setBusy(true);
    const input: BenefitInput = {
      targetType: v.targetType,
      targets,
      benefitType: v.benefitType,
      valueType: v.valueType,
      value: v.value ?? 0,
      perTxnMax: v.perTxnMax,
      minAmount: v.minAmount,
      limitType: v.limitType,
      monthlyLimit: v.monthlyLimit,
      tiers: tiers.map((t) => ({ minPrevPerf: t.minPrevPerf!, value: t.value, limit: t.limit })),
      daysOfWeek: v.daysOfWeek.length ? v.daysOfWeek : null,
      timeFrom: v.timeFrom && v.timeTo ? v.timeFrom : null,
      timeTo: v.timeFrom && v.timeTo ? v.timeTo : null,
      excludeInstallment: v.excludeInstallment,
      excludeOnline: v.excludeOnline,
      excludeNote: v.excludeNote.trim() || null,
      memo: v.memo.trim() || null,
    };
    const r = edit ? await editCardBenefit(edit.id, edit.version, input) : await addCardBenefit(pmId, input);
    setBusy(false);
    if (!r.ok) return setError(r.error.code === "VERSION_CONFLICT" ? "다른 기기에서 먼저 수정했어요. 닫고 다시 열어 주세요" : (r.error.fields?.[0]?.message ?? r.error.message));
    toast(edit ? "혜택을 고쳤어요" : "혜택을 추가했어요");
    done();
    close();
  }

  return (
    <ResponsiveModal
      open
      onOpenChange={(o) => !o && close()}
      title={edit ? "혜택 수정" : "혜택 추가"}
      footer={
        <Button disabled={!targets.length || !v.value || busy} onClick={save}>
          {busy && <Spinner />} {edit ? "저장" : "혜택 추가"}
        </Button>
      }
    >
      <FieldGroup className="gap-5">
        <Field>
          <FieldLabel>대상</FieldLabel>
          <ToggleGroup type="single" variant="outline" value={v.targetType} onValueChange={(t) => t && set("targetType", t as typeof v.targetType)} aria-label="대상 종류">
            <ToggleGroupItem value="industry">업종</ToggleGroupItem>
            <ToggleGroupItem value="merchant">가맹점</ToggleGroupItem>
          </ToggleGroup>
          {v.targetType === "industry" ? (
            <div className="flex flex-wrap gap-1.5">
              {INDUSTRIES.map((ind) => (
                <Toggle key={ind} on={v.targets.includes(ind)} onClick={() => set("targets", v.targets.includes(ind) ? v.targets.filter((x) => x !== ind) : [...v.targets, ind])}>
                  {ind}
                </Toggle>
              ))}
            </div>
          ) : (
            <Input aria-label="가맹점 이름" placeholder="예: CGV, 메가박스 (쉼표로 나눠요)" className="h-11 text-base md:h-9 md:text-sm" value={v.merchants} onChange={(e) => set("merchants", e.target.value)} />
          )}
        </Field>
        <Field>
          <FieldLabel>혜택</FieldLabel>
          <div className="flex flex-wrap items-center gap-2">
            <ToggleGroup type="single" variant="outline" value={v.benefitType} onValueChange={(t) => t && set("benefitType", t as typeof v.benefitType)} aria-label="혜택 종류">
              <ToggleGroupItem value="discount">할인</ToggleGroupItem>
              <ToggleGroupItem value="point">적립</ToggleGroupItem>
              <ToggleGroupItem value="cashback">캐시백</ToggleGroupItem>
            </ToggleGroup>
            <Input
              aria-label="혜택 크기"
              inputMode="decimal"
              className="h-11 w-24 text-base md:h-9 md:text-sm"
              value={v.value ?? ""}
              onChange={(e) => {
                const n = e.target.value.replace(/[^\d.]/g, "");
                set("value", n ? Number(n) : null);
              }}
            />
            <ToggleGroup type="single" variant="outline" value={v.valueType} onValueChange={(t) => t && set("valueType", t as typeof v.valueType)} aria-label="% 또는 원">
              <ToggleGroupItem value="percent">%</ToggleGroupItem>
              <ToggleGroupItem value="amount">원</ToggleGroupItem>
            </ToggleGroup>
          </div>
        </Field>

        <Collapsible defaultOpen={hasMore}>
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="-ml-2">
              <ChevronDown /> 조건 더 넣기
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-5 pt-3">
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor="bf-max">1회 최대</FieldLabel>
                <AmountInput id="bf-max" value={v.perTxnMax} onChange={(a) => set("perTxnMax", a)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="bf-min">최소 결제 금액</FieldLabel>
                <AmountInput id="bf-min" value={v.minAmount} onChange={(a) => set("minAmount", a)} />
              </Field>
            </div>
            <Field>
              <FieldLabel>
                월 한도 <InfoTip label="할인 한도">한 달 동안 받을 수 있는 혜택의 최대 금액이나 횟수예요.</InfoTip>
              </FieldLabel>
              <div className="flex flex-wrap items-center gap-2">
                <ToggleGroup type="single" variant="outline" value={v.limitType} onValueChange={(t) => t && set("limitType", t as typeof v.limitType)} aria-label="월 한도 종류">
                  <ToggleGroupItem value="none">없음</ToggleGroupItem>
                  <ToggleGroupItem value="amount">금액</ToggleGroupItem>
                  <ToggleGroupItem value="count">횟수</ToggleGroupItem>
                </ToggleGroup>
                {v.limitType === "amount" && (
                  <div className="w-36">
                    <AmountInput value={v.monthlyLimit} onChange={(a) => set("monthlyLimit", a)} />
                  </div>
                )}
                {v.limitType === "count" && (
                  <Input aria-label="월 횟수" inputMode="numeric" className="h-11 w-20 text-base md:h-9 md:text-sm" value={v.monthlyLimit ?? ""} onChange={(e) => set("monthlyLimit", Number(e.target.value.replace(/\D/g, "")) || null)} />
                )}
              </div>
            </Field>
            <Field>
              <FieldLabel>
                전월 실적 구간 <InfoTip label="전월 실적 구간">지난달 실적이 이 금액을 넘어야 혜택을 받아요. 구간마다 혜택 크기·한도가 다르면 함께 적어요. 비우면 조건 없음.</InfoTip>
              </FieldLabel>
              {tiers.map((t, i) => (
                <div key={t.key} className="flex flex-wrap items-center gap-2 text-sm">
                  <div className="w-32">
                    <AmountInput value={t.minPrevPerf} onChange={(a) => setTiers((l) => l.map((x, j) => (j === i ? { ...x, minPrevPerf: a } : x)))} />
                  </div>
                  이상 →
                  <Input
                    aria-label="이 구간 혜택 크기"
                    placeholder={String(v.value ?? "")}
                    inputMode="decimal"
                    className="h-11 w-20 text-base md:h-9 md:text-sm"
                    value={t.value ?? ""}
                    onChange={(e) => setTiers((l) => l.map((x, j) => (j === i ? { ...x, value: Number(e.target.value.replace(/[^\d.]/g, "")) || null } : x)))}
                  />
                  {v.valueType === "percent" ? "%" : "원"}
                  {v.limitType === "amount" && (
                    <>
                      한도
                      <div className="w-28">
                        <AmountInput value={t.limit} onChange={(a) => setTiers((l) => l.map((x, j) => (j === i ? { ...x, limit: a } : x)))} />
                      </div>
                    </>
                  )}
                  <Button variant="ghost" size="icon" aria-label="구간 빼기" onClick={() => setTiers((l) => l.filter((_, j) => j !== i))}>
                    <Trash2 />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" className="w-fit" onClick={() => setTiers((l) => [...l, { key: crypto.randomUUID(), minPrevPerf: null, value: null, limit: null }])}>
                <Plus /> 구간 추가
              </Button>
            </Field>
            <Field>
              <FieldLabel>요일·시간</FieldLabel>
              <ToggleGroup type="multiple" variant="outline" size="sm" value={v.daysOfWeek.map(String)} onValueChange={(d) => set("daysOfWeek", d.map(Number).sort())} aria-label="요일">
                {WEEK.map((w, i) => (
                  <ToggleGroupItem key={w} value={String(i)}>
                    {w}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <div className="flex items-center gap-2 text-sm">
                <Input type="time" aria-label="시작 시각" className="w-32" value={v.timeFrom} onChange={(e) => set("timeFrom", e.target.value)} />~
                <Input type="time" aria-label="끝 시각" className="w-32" value={v.timeTo} onChange={(e) => set("timeTo", e.target.value)} />
              </div>
            </Field>
            <Field>
              <FieldLabel>제외 조건</FieldLabel>
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <Checkbox checked={v.excludeInstallment} onCheckedChange={(c) => set("excludeInstallment", c === true)} /> 할부 제외
                </label>
                <label className="flex items-center gap-2">
                  <Checkbox checked={v.excludeOnline} onCheckedChange={(c) => set("excludeOnline", c === true)} /> 온라인 제외
                </label>
              </div>
              <Input aria-label="그 밖의 제외 조건" placeholder="예: 백화점 입점 매장 제외" maxLength={200} value={v.excludeNote} onChange={(e) => set("excludeNote", e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="bf-memo">메모</FieldLabel>
              <Textarea id="bf-memo" maxLength={1000} value={v.memo} onChange={(e) => set("memo", e.target.value)} />
            </Field>
          </CollapsibleContent>
        </Collapsible>
        {error && <FieldError>{error}</FieldError>}
      </FieldGroup>
    </ResponsiveModal>
  );
}
