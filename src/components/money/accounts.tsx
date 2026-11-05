"use client";

// 계좌 목록(06 §7): 종류마다 다른 칸 — 입출금(잔액), 예금·적금(시작·만기·이율·예상 이자), 주식(원금·평가 금액·수익)
import { ChevronRight, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { addAccount, editAccount, removePaymentAction } from "@/app/actions/cards";
import { AmountInput, MoneyText } from "@/components/app/money";
import { ResponsiveModal } from "@/components/app/responsive";
import { EmptyState } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useIsMobile } from "@/hooks/use-mobile";
import { ACCOUNT_CATEGORY, TAX, daysUntil, expectedInterest, stockProfit, type AccountCategory, type Tax } from "@/lib/accounts";
import { money, rescale, type Currency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AccountInput, AccountItem } from "@/server/cards";

const BANKS = ["KB국민", "신한", "우리", "하나", "NH농협", "IBK기업", "카카오뱅크", "토스뱅크", "케이뱅크", "SC제일", "새마을금고", "우체국", "키움증권", "미래에셋증권", "삼성증권", "한국투자증권", "토스증권"];
const input = "h-11 text-base md:h-9 md:text-sm";

export function AccountGrid({ accounts, today }: { accounts: AccountItem[]; today: string }) {
  const [form, setForm] = useState<AccountItem | "new" | null>(null);
  const mobile = useIsMobile();
  const add = (
    <Button variant={mobile ? "outline" : "default"} onClick={() => setForm("new")}>
      <Plus /> 계좌 추가
    </Button>
  );
  return (
    <div className="space-y-4">
      {accounts.length > 0 && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-muted-foreground text-sm">계좌를 누르면 고칠 수 있어요</p>
          {add}
        </div>
      )}
      {accounts.length === 0 ? (
        <EmptyState pet="komong" title="계좌를 등록해 보세요" description="잔액, 예금·적금의 만기와 예상 이자를 한눈에 볼 수 있어요" action={add} />
      ) : (
        // 종류별 소제목: 입출금 · 예금 · 적금 · 주식 순(있는 것만)
        Object.entries(ACCOUNT_CATEGORY).map(([k, label]) => {
          const list = accounts.filter((a) => (a.account?.category ?? "checking") === k);
          if (!list.length) return null;
          return (
            <section key={k} aria-labelledby={`ac-${k}`} className="space-y-2">
              <h3 id={`ac-${k}`} className="text-muted-foreground text-sm font-semibold">
                {label} 계좌 <span className="font-normal tabular-nums">{list.length}</span>
              </h3>
              <ul className="bg-card divide-y rounded-xl border">
                {list.map((a) => (
                  <li key={a.id}>
                    <AccountRow a={a} today={today} open={() => setForm(a)} />
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
      {form && <AccountForm edit={form === "new" ? undefined : form} close={() => setForm(null)} />}
    </div>
  );
}

/** 목록 한 줄: 이름·은행 / 요약(이율·만기·수익) · 오른쪽에 금액 */
function AccountRow({ a, today, open }: { a: AccountItem; today: string; open: () => void }) {
  const d = a.account;
  const cat = d?.category ?? "checking";
  const interest = d && expectedInterest(d);
  const profit = d && cat === "stock" ? stockProfit(d.principal, d.balance) : null;
  const left = d?.maturityDate ? daysUntil(d.maturityDate, today) : null;
  const m = (n: number, o: { sign?: boolean } = {}) => money(n, { ...o, currency: d?.currency }); // 계좌 통화로
  const saving = cat === "deposit" || cat === "savings";
  // 오른쪽 큰 금액: 입출금 잔액 · 주식 평가 금액 · 예금·적금은 만기에 받을 돈(없으면 원금)
  const main = saving ? (interest?.total ?? d?.principal) : d?.balance;
  const sub = saving
    ? [d?.principal != null && `${cat === "savings" ? "매월 " : ""}${m(d.principal)}`, d?.rate != null && `연 ${d.rate}%`, left !== null && (left > 0 ? `D-${left}` : left === 0 ? "오늘 만기" : "만기 지남")]
    : [profit && `원금 ${m(d!.principal!)}`];
  return (
    <button type="button" onClick={open} className="hover:bg-accent/50 flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left">
      <span className="min-w-0 flex-1 space-y-0.5">
        <span className="flex items-baseline gap-2">
          <span className="truncate font-medium">{a.name}</span>
          {(d?.bank || d?.number) && <span className="text-muted-foreground min-w-0 truncate text-caption">{[d.bank, d.number].filter(Boolean).join(" · ")}</span>}
        </span>
        {sub.some(Boolean) && <span className="text-muted-foreground block truncate text-sm">{sub.filter(Boolean).join(" · ")}</span>}
      </span>
      <span className="shrink-0 text-right">
        {main != null ? <MoneyText amount={main} currency={d?.currency} className="font-semibold" /> : <span className="text-muted-foreground text-sm">금액 없음</span>}
        {saving && interest && <span className="text-muted-foreground block text-caption tabular-nums">이자 {m(interest.net, { sign: true })}</span>}
        {profit && (
          <span className={cn("block text-caption tabular-nums", profit.profit < 0 ? "text-blue-600 dark:text-blue-400" : "text-destructive-text")}>
            {m(profit.profit, { sign: true })} ({profit.pct > 0 ? "+" : ""}
            {profit.pct}%)
          </span>
        )}
      </span>
      <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
    </button>
  );
}

function AccountForm({ edit, close }: { edit?: AccountItem; close: () => void }) {
  const router = useRouter();
  const d = edit?.account;
  const [v, setV] = useState<AccountInput & { category: AccountCategory }>({
    name: edit?.name ?? "",
    category: d?.category ?? "checking",
    currency: d?.currency ?? "KRW",
    bank: d?.bank ?? null,
    number: d?.number ?? null,
    balance: d?.balance ?? null,
    principal: d?.principal ?? null,
    rate: d?.rate ?? null,
    tax: d?.tax ?? "normal",
    startDate: d?.startDate ?? null,
    maturityDate: d?.maturityDate ?? null,
    memo: d?.memo ?? null,
  });
  const [rateText, setRateText] = useState(d?.rate != null ? String(d.rate) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof AccountInput>(k: K, val: AccountInput[K]) => setV((s) => ({ ...s, [k]: val }));
  const cur = (v.currency ?? "KRW") as Currency;
  const m = (n: number, o: { sign?: boolean } = {}) => money(n, { ...o, currency: cur });
  /** 통화 바꾸기: 적어 둔 숫자는 그대로 */
  const onCurrency = (c: Currency) => setV((s) => ({ ...s, currency: c, balance: rescale(s.balance ?? null, cur, c), principal: rescale(s.principal ?? null, cur, c) }));
  const amt = { currency: cur, onCurrency };
  const saving = v.category === "deposit" || v.category === "savings";
  const interest = saving ? expectedInterest({ category: v.category, principal: v.principal ?? null, rate: v.rate ?? null, tax: (v.tax ?? "normal") as Tax, startDate: v.startDate ?? null, maturityDate: v.maturityDate ?? null }) : null;
  const profit = v.category === "stock" ? stockProfit(v.principal ?? null, v.balance ?? null) : null;

  async function save() {
    setBusy(true);
    const data = { ...v, bank: v.bank?.trim() || null, number: v.number?.trim() || null, memo: v.memo?.trim() || null };
    const r = edit ? await editAccount(edit.id, edit.pmVersion, data) : await addAccount(data);
    setBusy(false);
    if (!r.ok) return setError(r.error.code === "VERSION_CONFLICT" ? "다른 기기에서 먼저 수정했어요. 닫고 다시 열어 주세요" : (r.error.fields?.[0]?.message ?? r.error.message));
    close();
    router.refresh();
  }

  async function remove() {
    if (!edit) return;
    const r = await removePaymentAction("account", edit.id);
    if (!r.ok) return setError(r.error.message);
    close();
    router.refresh();
  }

  return (
    <ResponsiveModal
      open
      onOpenChange={(o) => !o && close()}
      title={edit ? "계좌 수정" : "계좌 추가"}
      footer={
        <div className="flex w-full gap-2 max-md:flex-col-reverse">
          {edit && (
            <Button variant="ghost" className="text-destructive-text" onClick={remove}>
              계좌 삭제
            </Button>
          )}
          <Button className="md:ml-auto" disabled={!v.name.trim() || busy} onClick={save}>
            {busy && <Spinner />} {edit ? "저장" : "계좌 추가"}
          </Button>
        </div>
      }
    >
      <FieldGroup className="gap-5">
        <Field>
          <FieldLabel>종류</FieldLabel>
          <ToggleGroup type="single" variant="outline" className="w-full" value={v.category} onValueChange={(c) => c && set("category", c as AccountCategory)} aria-label="계좌 종류">
            {Object.entries(ACCOUNT_CATEGORY).map(([k, label]) => (
              <ToggleGroupItem key={k} value={k} className="flex-1 max-md:h-10">
                {label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>
        <Field>
          <FieldLabel htmlFor="ac-name">계좌 이름</FieldLabel>
          <Input id="ac-name" autoFocus={!edit} maxLength={20} placeholder="계좌 이름을 입력하세요" className={input} value={v.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="ac-bank">{v.category === "stock" ? "증권사" : "은행"}</FieldLabel>
            <Input id="ac-bank" list="ac-banks" maxLength={20} className={`${input} [&::-webkit-calendar-picker-indicator]:opacity-0`} value={v.bank ?? ""} onChange={(e) => set("bank", e.target.value)} />
            <datalist id="ac-banks">
              {BANKS.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </Field>
          <Field>
            <FieldLabel htmlFor="ac-number">계좌번호</FieldLabel>
            <Input id="ac-number" inputMode="numeric" maxLength={40} placeholder="선택" className={input} value={v.number ?? ""} onChange={(e) => set("number", e.target.value)} />
          </Field>
        </div>

        {v.category === "checking" && (
          <Field>
            <FieldLabel htmlFor="ac-balance">잔액</FieldLabel>
            <AmountInput id="ac-balance" placeholder="선택" value={v.balance ?? null} onChange={(a) => set("balance", a)} {...amt} />
          </Field>
        )}

        {saving && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor="ac-principal">{v.category === "savings" ? "월 납입액" : "예치 금액"}</FieldLabel>
                <AmountInput id="ac-principal" value={v.principal ?? null} onChange={(a) => set("principal", a)} {...amt} />
              </Field>
              <Field>
                <FieldLabel htmlFor="ac-rate">연 이율</FieldLabel>
                <div className="relative">
                  <Input
                    id="ac-rate"
                    inputMode="decimal"
                    placeholder="0.0"
                    className={`${input} pr-8 text-right tabular-nums`}
                    value={rateText}
                    onChange={(e) => {
                      const t = e.target.value.replace(/[^\d.]/g, "");
                      setRateText(t);
                      set("rate", t && Number.isFinite(Number(t)) ? Number(t) : null);
                    }}
                  />
                  <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm">%</span>
                </div>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor="ac-start">시작일</FieldLabel>
                <Input id="ac-start" type="date" className={input} value={v.startDate ?? ""} onChange={(e) => set("startDate", e.target.value || null)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="ac-end">만기일</FieldLabel>
                <Input id="ac-end" type="date" className={input} value={v.maturityDate ?? ""} onChange={(e) => set("maturityDate", e.target.value || null)} />
              </Field>
            </div>
            <Field>
              <FieldLabel>이자 과세</FieldLabel>
              <Select value={v.tax ?? "normal"} onValueChange={(t) => set("tax", t as Tax)}>
                <SelectTrigger aria-label="이자 과세" className="w-full data-[size=default]:h-11 md:data-[size=default]:h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TAX).map(([k, t]) => (
                    <SelectItem key={k} value={k}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="bg-muted/50 rounded-lg p-3 text-sm" aria-live="polite">
              {interest ? (
                <>
                  <p className="flex justify-between">
                    <span>예상 이자 (세후, 단리)</span>
                    <b className="font-semibold">{m(interest.net)}</b>
                  </p>
                  <p className="text-muted-foreground mt-1">
                    {interest.months}개월 · 세전 {m(interest.gross)} − 세금 {m(interest.tax)} · 만기에 {m(interest.total)}
                  </p>
                </>
              ) : (
                <p className="text-muted-foreground">금액·이율·시작일·만기일을 적으면 예상 이자를 계산해 줘요</p>
              )}
            </div>
          </>
        )}

        {v.category === "stock" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor="ac-principal">투자 원금</FieldLabel>
                <AmountInput id="ac-principal" value={v.principal ?? null} onChange={(a) => set("principal", a)} {...amt} />
              </Field>
              <Field>
                <FieldLabel htmlFor="ac-balance">평가 금액</FieldLabel>
                <AmountInput id="ac-balance" value={v.balance ?? null} onChange={(a) => set("balance", a)} {...amt} />
              </Field>
            </div>
            {profit && (
              <p className="bg-muted/50 rounded-lg p-3 text-sm">
                수익 {m(profit.profit, { sign: true })} ({profit.pct > 0 ? "+" : ""}
                {profit.pct}%)
              </p>
            )}
          </>
        )}

        <Field>
          <FieldLabel htmlFor="ac-memo">메모</FieldLabel>
          <Textarea id="ac-memo" maxLength={2000} className="field-sizing-content min-h-24 leading-7" placeholder="메모를 입력하세요" value={v.memo ?? ""} onChange={(e) => set("memo", e.target.value)} />
        </Field>
        {error && <FieldError>{error}</FieldError>}
      </FieldGroup>
    </ResponsiveModal>
  );
}
