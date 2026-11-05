"use client";

// 금액 표시·입력·예산 막대 (docs/planning/03 §11, §3.1.3, §9.4)
import { ChevronDown, CircleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { currencyRates } from "@/app/actions/money";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { CURRENCIES, CURRENCY_CODES, decimals, money, parseMoney, rateOf, rescale, toKrw, toMajor, type Currency } from "@/lib/format";
import { cn } from "@/lib/utils";

/** 금액 글자. over면 초과 표시(빨간 글자 + 아이콘, 색만으로 전달하지 않음) */
export function MoneyText({ amount, sign, over, currency, className }: { amount: number; sign?: boolean; over?: boolean; currency?: Currency; className?: string }) {
  return (
    <span className={cn("tabular-nums", over && "text-over-text inline-flex items-center gap-1", className)}>
      {over && <CircleAlert className="size-4" aria-hidden />}
      {money(amount, { sign, currency })}
    </span>
  );
}

const group = (int: string) => (int ? Number(int).toLocaleString("ko-KR") : "");
const fmt = (v: number | null, c: Currency) => (v === null ? "" : toMajor(v, c).toLocaleString("ko-KR", { maximumFractionDigits: decimals(c) }));
/** 입력 중 글자: 정수 부분만 쉼표, 소수점·소수는 친 그대로(통화 자리까지) — "12." 같은 중간 글자도 남게 */
const typing = (s: string, c: Currency) => {
  const d = decimals(c);
  const [int, ...rest] = s.replace(d ? /[^\d.]/g : /[^\d]/g, "").split(".");
  const i = group(int.slice(0, 15 - d));
  return rest.length ? `${i || "0"}.${rest.join("").slice(0, d)}` : i;
};

/** 금액 입력: 휴대폰 숫자 키패드, 입력하면서 천 단위 쉼표, 끝에 "원"(또는 통화). onCurrency를 주면 끝에서 통화를 고름 */
export function AmountInput({
  value,
  onChange,
  id,
  placeholder = "0",
  invalid,
  autoFocus,
  currency = "KRW",
  onCurrency,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  id?: string;
  placeholder?: string;
  invalid?: boolean;
  autoFocus?: boolean;
  currency?: Currency;
  onCurrency?: (c: Currency) => void;
}) {
  // 입력 중 글자는 따로 들고, 밖에서 값이 바뀌면 다시 맞춤(렌더 중 조정, effect 없이)
  const [text, setText] = useState(fmt(value, currency));
  const [last, setLast] = useState({ value, currency });
  if (value !== last.value || currency !== last.currency) {
    setLast({ value, currency });
    setText(fmt(value, currency));
  }
  return (
    <InputGroup className="h-11 md:h-9" data-invalid={invalid || undefined}>
      <InputGroupInput
        id={id}
        inputMode={decimals(currency) ? "decimal" : "numeric"}
        autoComplete="off"
        autoFocus={autoFocus}
        aria-invalid={invalid || undefined}
        placeholder={placeholder}
        className="text-right text-base tabular-nums md:text-sm"
        value={text}
        onChange={(e) => {
          const v = parseMoney(e.target.value, currency);
          setText(typing(e.target.value, currency));
          setLast({ value: v, currency });
          onChange(v);
        }}
      />
      <InputGroupAddon align="inline-end">
        {onCurrency ? (
          // 통화 고르기: 닫혀 있을 땐 "원"·"USD"만 짧게, 누르면 이름까지(네이티브 select를 위에 투명하게 — 휴대폰은 시스템 선택 창)
          <span className="text-muted-foreground hover:text-foreground focus-within:ring-ring/50 relative -mr-1 inline-flex h-8 items-center gap-0.5 rounded-md pr-0.5 text-sm focus-within:ring-2">
            {currency === "KRW" ? "원" : currency}
            <ChevronDown className="size-3.5" aria-hidden />
            <select aria-label="통화" className="absolute inset-0 cursor-pointer opacity-0" value={currency} onChange={(e) => onCurrency(e.target.value as Currency)}>
              {CURRENCY_CODES.map((c) => (
                <option key={c} value={c}>
                  {c === "KRW" ? "원" : `${c} ${CURRENCIES[c]}`}
                </option>
              ))}
            </select>
          </span>
        ) : (
          <InputGroupText>{currency === "KRW" ? "원" : currency}</InputGroupText>
        )}
      </InputGroupAddon>
    </InputGroup>
  );
}

/** 금액 + 통화. amount는 언제나 원(합계·예산은 이것으로 셈), 다른 통화면 foreignAmount에 그 통화 금액 */
export type MoneyValue = { amount: number | null; currency: Currency; foreignAmount: number | null };
type Rates = Partial<Record<Currency, number>>;
let ratesCache: Promise<Rates> | null = null;
/** 마지막에 쓴 환율(화면을 새로 열 때까지 한 번만 불러옴) */
const loadRates = () =>
  (ratesCache ??= currencyRates()
    .then((r): Rates => (r.ok ? r.data : {}))
    .catch((): Rates => ((ratesCache = null), {})));

/** 금액 입력 + 통화 고르기. 다른 통화면 "원화로" 칸이 붙고 마지막에 쓴 환율로 채움(명세서 금액으로 고칠 수 있음) */
export function MoneyInput({ value, onChange, id, invalid, autoFocus, placeholder }: { value: MoneyValue; onChange: (v: MoneyValue) => void; id?: string; invalid?: boolean; autoFocus?: boolean; placeholder?: string }) {
  const [rates, setRates] = useState<Rates>({});
  const fx = value.currency !== "KRW";
  useEffect(() => {
    if (fx) loadRates().then(setRates);
  }, [fx]);
  const rate = rates[value.currency];
  const toWon = (n: number | null, c: Currency, r = rate) => (n && r ? toKrw(n, c, r) : null);
  return (
    <div className="space-y-2">
      <AmountInput
        id={id}
        invalid={invalid}
        autoFocus={autoFocus}
        placeholder={placeholder}
        currency={value.currency}
        value={fx ? value.foreignAmount : value.amount}
        onChange={(n) => onChange(fx ? { ...value, foreignAmount: n, amount: rate ? toWon(n, value.currency) : value.amount } : { ...value, amount: n })}
        onCurrency={async (c) => {
          // 통화를 바꿔도 친 숫자는 그대로(12,000원 → 12,000엔)
          const n = rescale(fx ? value.foreignAmount : value.amount, value.currency, c);
          if (c === "KRW") return onChange({ currency: c, amount: n, foreignAmount: null });
          onChange({ currency: c, foreignAmount: n, amount: null });
          const r = await loadRates();
          setRates(r);
          if (r[c]) onChange({ currency: c, foreignAmount: n, amount: toWon(n, c, r[c]) });
        }}
      />
      {fx && (
        <>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground shrink-0 text-sm">원화로</span>
            <div className="flex-1">
              <AmountInput id={id && `${id}-krw`} value={value.amount} onChange={(n) => onChange({ ...value, amount: n })} invalid={invalid && !value.amount} />
            </div>
          </div>
          <p className="text-muted-foreground text-caption">
            {value.amount && value.foreignAmount
              ? `1 ${value.currency} ≈ ${rateOf(value.amount, value.foreignAmount, value.currency).toLocaleString("ko-KR")}원${rate ? " · 마지막에 쓴 환율로 계산해요. 고칠 수 있어요" : ""}`
              : "원화로 얼마인지 적어 주세요. 다음부터 그 환율로 계산해요"}
          </p>
        </>
      )}
    </div>
  );
}

/** 원화 금액 + (다른 통화면) 원래 금액 */
export const moneyWithForeign = (v: { amount: number; currency?: Currency; foreignAmount?: number | null }) =>
  v.currency && v.currency !== "KRW" && v.foreignAmount ? `${money(v.foreignAmount, { currency: v.currency })} (${money(v.amount)})` : money(v.amount);

/** 예산 막대: 쓴 돈(+계획된 돈) / 예산. 80% 이상 주의, 100% 넘으면 초과 */
/** compact: 막대만(남음·초과 문구는 바깥에서 보여 줄 때) */
export function BudgetBar({ used, planned = 0, budget, label, compact }: { used: number; planned?: number; budget: number; label?: string; compact?: boolean }) {
  const pct = budget > 0 ? (used / budget) * 100 : used > 0 ? 100 : 0;
  const over = used > budget;
  const warn = !over && pct >= 80;
  const usedW = Math.min(100, pct);
  const plannedW = Math.max(0, Math.min(100 - usedW, budget > 0 ? (planned / budget) * 100 : 0));
  const valueText = `${money(budget)} 중 ${money(used)} 사용` + (over ? `, ${money(used - budget)} 초과` : "");
  return (
    <div className="space-y-1">
      <div
        className="bg-muted relative h-2.5 overflow-hidden rounded-full"
        role="progressbar"
        aria-label={label ?? "예산 사용"}
        aria-valuemin={0}
        aria-valuemax={budget}
        aria-valuenow={used}
        aria-valuetext={valueText}
      >
        <div className={cn("h-full rounded-full", over ? "bg-over" : warn ? "bg-warning" : "bg-primary")} style={{ width: `${usedW}%` }} />
        {plannedW > 0 && <div className="bg-primary/30 absolute inset-y-0" style={{ left: `${usedW}%`, width: `${plannedW}%` }} title="계획된 지출" />}
      </div>
      {!compact && (
        <div className="text-caption flex justify-between">
          <span className="text-muted-foreground tabular-nums">{Math.round(pct)}% 사용</span>
          {over ? (
            <span className="text-over-text inline-flex items-center gap-1 tabular-nums">
              <CircleAlert className="size-3.5" aria-hidden />
              {money(used - budget)} 초과
            </span>
          ) : (
            <span className={cn("tabular-nums", warn ? "text-warning-text" : "text-muted-foreground")}>{money(budget - used)} 남음</span>
          )}
        </div>
      )}
    </div>
  );
}
