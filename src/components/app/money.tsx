"use client";

// 금액 표시·입력·예산 막대 (docs/planning/03 §11, §3.1.3, §9.4)
import { CircleAlert } from "lucide-react";
import { useState } from "react";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { CURRENCIES, CURRENCY_CODES, decimals, money, parseMoney, toMajor, type Currency } from "@/lib/format";
import { cn } from "@/lib/utils";

/** 금액 글자. over면 초과 표시(빨간 글자 + 아이콘, 색만으로 전달하지 않음) */
export function MoneyText({ amount, sign, over, currency, className }: { amount: number; sign?: boolean; over?: boolean; currency?: Currency; className?: string }) {
  return (
    <span className={cn("tabular-nums", over && "text-destructive-text inline-flex items-center gap-1", className)}>
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
          // 통화 고르기: 휴대폰에서는 시스템 선택 창이 떠서 고르기 쉬움(네이티브 select)
          <select
            aria-label="통화"
            className="text-muted-foreground hover:text-foreground -mr-1 h-8 cursor-pointer rounded-md bg-transparent pr-1 text-sm outline-none focus-visible:ring-2"
            value={currency}
            onChange={(e) => onCurrency(e.target.value as Currency)}
          >
            {CURRENCY_CODES.map((c) => (
              <option key={c} value={c}>
                {c === "KRW" ? "원" : `${c} ${CURRENCIES[c]}`}
              </option>
            ))}
          </select>
        ) : (
          <InputGroupText>{currency === "KRW" ? "원" : currency}</InputGroupText>
        )}
      </InputGroupAddon>
    </InputGroup>
  );
}

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
        <div className={cn("h-full rounded-full", over ? "bg-destructive" : warn ? "bg-warning" : "bg-primary")} style={{ width: `${usedW}%` }} />
        {plannedW > 0 && <div className="bg-primary/30 absolute inset-y-0" style={{ left: `${usedW}%`, width: `${plannedW}%` }} title="계획된 지출" />}
      </div>
      {!compact && (
        <div className="text-caption flex justify-between">
          <span className="text-muted-foreground tabular-nums">{Math.round(pct)}% 사용</span>
          {over ? (
            <span className="text-destructive-text inline-flex items-center gap-1 tabular-nums">
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
