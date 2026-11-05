"use client";

// 카드 목록(SCR-FIN-08, D-071): 내 결제수단 카드와 메모. 혜택은 메모에 직접 적음(예: "- 편의점 갈 때 최대 혜택")
// 카드를 누르면 수정 창. 지출 입력에서 만든 카드도 여기 나옴
import { ChevronRight, Copy, Eye, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { addCard, editCard, removePaymentAction, showCardSecret } from "@/app/actions/cards";
import { AmountInput } from "@/components/app/money";
import { ResponsiveModal } from "@/components/app/responsive";
import { EmptyState, toastDone } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useIsMobile } from "@/hooks/use-mobile";
import { money, rescale, type Currency } from "@/lib/format";
import type { CardInput, CardItem, CardSecret } from "@/server/cards";

const ISSUERS = ["신한", "삼성", "현대", "KB국민", "롯데", "하나", "우리", "BC", "NH농협", "IBK기업", "카카오뱅크", "토스뱅크"];
const TYPE = { credit: "신용", check: "체크" } as const;

type Opt = { id: string; name: string };

export function CardGrid({ cards, accounts }: { cards: CardItem[]; accounts: Opt[] }) {
  const [form, setForm] = useState<CardItem | "new" | null>(null);
  const mobile = useIsMobile();
  const add = (
    <Button variant={mobile ? "outline" : "default"} onClick={() => setForm("new")}>
      <Plus /> 카드 추가
    </Button>
  );
  return (
    <div className="space-y-4">
      {cards.length > 0 && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-muted-foreground text-sm">카드를 누르면 고칠 수 있어요</p>
          {add}
        </div>
      )}
      {cards.length === 0 ? (
        <EmptyState pet="komong" title="카드를 등록해 보세요" description="결제일·연회비와 혜택 메모를 한곳에 모아 둘 수 있어요" action={add} />
      ) : (
        // 목록형: 한 줄에 이름·카드사·뒤 4자리, 아래 줄에 결제일·연회비·결제 계좌, 메모 첫 줄
        <ul className="bg-card divide-y rounded-xl border">
          {cards.map((c) => {
            const top = [c.card?.issuer, c.card?.cardType && TYPE[c.card.cardType], c.card?.last4 && `•••• ${c.card.last4}`].filter(Boolean);
            const meta = [c.card?.billingDay && `매월 ${c.card.billingDay}일 결제`, c.card?.annualFee && `연회비 ${money(c.card.annualFee, { currency: c.card.currency })}`, accounts.find((a) => a.id === c.card?.linkedAccountId)?.name].filter(Boolean);
            return (
              <li key={c.id}>
                <button type="button" onClick={() => setForm(c)} className="hover:bg-accent/50 flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left">
                  <span className="min-w-0 flex-1 space-y-0.5">
                    <span className="flex items-baseline gap-2">
                      <span className="truncate font-medium">{c.name}</span>
                      {top.length > 0 && <span className="text-muted-foreground shrink-0 text-caption tabular-nums">{top.join(" · ")}</span>}
                    </span>
                    {meta.length > 0 && <span className="text-muted-foreground block truncate text-sm">{meta.join(" · ")}</span>}
                    {c.card?.memo && <span className="block truncate text-sm">{c.card.memo.split("\n")[0]}</span>}
                  </span>
                  <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {form && <CardForm edit={form === "new" ? undefined : form} accounts={accounts} close={() => setForm(null)} />}
    </div>
  );
}

function CardForm({ edit, accounts, close }: { edit?: CardItem; accounts: Opt[]; close: () => void }) {
  const router = useRouter();
  const c = edit?.card;
  const [v, setV] = useState<CardInput>({
    name: edit?.name ?? "",
    issuer: c?.issuer ?? null,
    cardType: c?.cardType ?? null,
    billingDay: c?.billingDay ?? null,
    annualFee: c?.annualFee ?? null,
    currency: c?.currency ?? "KRW",
    memo: c?.memo ?? null,
    linkedAccountId: c?.linkedAccountId ?? null,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof CardInput>(k: K, val: CardInput[K]) => setV((s) => ({ ...s, [k]: val }));
  // 카드번호·CVC·유효기간: 저장된 게 있으면 "보기"를 눌러 불러온 뒤에만 고침(안 불러오면 그대로 둠)
  const [secret, setSecret] = useState<CardSecret | null>(c?.hasSecret ? null : { number: "", expiry: "", cvc: "" });
  const [revealing, setRevealing] = useState(false);
  async function reveal() {
    if (!edit) return;
    setRevealing(true);
    const r = await showCardSecret(edit.id);
    setRevealing(false);
    if (!r.ok) return setError(r.error.message);
    setSecret(r.data ?? { number: "", expiry: "", cvc: "" });
  }
  const setS = (k: keyof CardSecret, val: string) => setSecret((s) => s && { ...s, [k]: val });

  async function save() {
    setBusy(true);
    const input = { ...v, issuer: v.issuer?.trim() || null, memo: v.memo?.trim() || null, secret: secret ?? undefined };
    const r = edit ? await editCard(edit.id, edit.pmVersion, input) : await addCard(input);
    setBusy(false);
    if (!r.ok) return setError(r.error.code === "VERSION_CONFLICT" ? "다른 기기에서 먼저 수정했어요. 닫고 다시 열어 주세요" : (r.error.fields?.[0]?.message ?? r.error.message));
    close();
    router.refresh();
  }

  async function remove() {
    if (!edit) return;
    const r = await removePaymentAction("card", edit.id);
    if (!r.ok) return setError(r.error.message);
    close();
    router.refresh();
    toastDone(`${edit.name}을(를) 휴지통으로 옮겼어요. 지난 지출의 이름은 그대로예요`);
  }

  return (
    <ResponsiveModal
      open
      onOpenChange={(o) => !o && close()}
      title={edit ? "카드 수정" : "카드 추가"}
      footer={
        // 모바일은 다른 서랍처럼 저장이 위에서 꽉 차게
        <div className="flex w-full gap-2 max-md:flex-col-reverse">
          {edit && (
            <Button variant="ghost" className="text-destructive-text" onClick={remove}>
              카드 삭제
            </Button>
          )}
          <Button className="md:ml-auto" disabled={!v.name.trim() || busy} onClick={save}>
            {busy && <Spinner />} {edit ? "저장" : "카드 추가"}
          </Button>
        </div>
      }
    >
      <FieldGroup className="gap-5">
        <Field>
          <FieldLabel htmlFor="cd-name">카드 이름</FieldLabel>
          <Input id="cd-name" autoFocus={!edit} maxLength={20} placeholder="카드 이름을 입력하세요" className="h-11 text-base md:h-9 md:text-sm" value={v.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="cd-issuer">카드사</FieldLabel>
            <Input id="cd-issuer" list="cd-issuers" maxLength={20} className="h-11 text-base md:h-9 md:text-sm [&::-webkit-calendar-picker-indicator]:opacity-0" value={v.issuer ?? ""} onChange={(e) => set("issuer", e.target.value)} />
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
              <SelectTrigger aria-label="결제일" className="w-full data-[size=default]:h-11 md:data-[size=default]:h-9">
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
            <AmountInput
              id="cd-fee"
              value={v.annualFee ?? null}
              onChange={(a) => set("annualFee", a)}
              currency={(v.currency ?? "KRW") as Currency}
              onCurrency={(cur) => setV((s) => ({ ...s, currency: cur, annualFee: rescale(s.annualFee ?? null, (s.currency ?? "KRW") as Currency, cur) }))}
            />
          </Field>
        </div>
        <CardSecretFields secret={secret} last4={c?.last4 ?? null} revealing={revealing} reveal={reveal} set={setS} />
        <Field>
          <FieldLabel>결제 계좌</FieldLabel>
          <Select value={v.linkedAccountId ?? "none"} onValueChange={(a) => set("linkedAccountId", a === "none" ? null : a)}>
            <SelectTrigger aria-label="결제 계좌" className="w-full data-[size=default]:h-11 md:data-[size=default]:h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{accounts.length ? "정하지 않음" : "계좌 탭에서 계좌를 먼저 추가해요"}</SelectItem>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="cd-memo">메모</FieldLabel>
          <Textarea
            id="cd-memo"
            maxLength={2000}
            className="field-sizing-content min-h-32 leading-7"
            placeholder="혜택·쓰임새를 입력하세요"
            value={v.memo ?? ""}
            onChange={(e) => set("memo", e.target.value)}
          />
        </Field>
        {error && <FieldError>{error}</FieldError>}
      </FieldGroup>
    </ResponsiveModal>
  );
}

/** 카드번호 4자리씩 띄움 */
const groupCard = (s: string) => s.replace(/\D/g, "").slice(0, 19).replace(/(\d{4})(?=\d)/g, "$1 ");

/** 카드번호·유효기간·CVC. 저장된 게 있으면 "보기"를 눌러야 보이고 고칠 수 있음(서버에는 암호화해 저장) */
function CardSecretFields({ secret, last4, revealing, reveal, set }: { secret: CardSecret | null; last4: string | null; revealing: boolean; reveal: () => void; set: (k: keyof CardSecret, v: string) => void }) {
  const [copied, setCopied] = useState(false);
  const input = "h-11 text-base tabular-nums md:h-9 md:text-sm";
  if (!secret)
    return (
      <Field>
        <FieldLabel>카드 정보</FieldLabel>
        <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
          <span className="text-muted-foreground text-sm tabular-nums">{last4 ? `•••• ${last4}` : "저장됨"} · 유효기간 · CVC</span>
          <Button type="button" variant="outline" size="sm" disabled={revealing} onClick={reveal}>
            {revealing ? <Spinner /> : <Eye />} 보기·고치기
          </Button>
        </div>
      </Field>
    );
  return (
    <div className="space-y-3">
      <Field>
        <FieldLabel htmlFor="cd-number">카드번호</FieldLabel>
        <div className="flex gap-2">
          <Input id="cd-number" inputMode="numeric" autoComplete="cc-number" placeholder="0000 0000 0000 0000" className={input} value={groupCard(secret.number)} onChange={(e) => set("number", e.target.value.replace(/\D/g, "").slice(0, 19))} />
          {secret.number && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-11 shrink-0 md:size-9"
              aria-label={copied ? "복사됨" : "카드번호 복사"}
              onClick={() => navigator.clipboard.writeText(secret.number).then(() => (setCopied(true), setTimeout(() => setCopied(false), 1500)))}
            >
              {copied ? "✓" : <Copy />}
            </Button>
          )}
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field>
          <FieldLabel htmlFor="cd-exp">유효기간</FieldLabel>
          <Input
            id="cd-exp"
            inputMode="numeric"
            autoComplete="cc-exp"
            placeholder="MM/YY"
            className={input}
            value={secret.expiry}
            // 숫자만 치면 MM/YY로(1228 → 12/28)
            onChange={(e) => {
              const d = e.target.value.replace(/\D/g, "").slice(0, 4);
              set("expiry", d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d);
            }}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="cd-cvc">CVC</FieldLabel>
          <Input id="cd-cvc" inputMode="numeric" autoComplete="cc-csc" placeholder="000" className={input} value={secret.cvc} onChange={(e) => set("cvc", e.target.value.replace(/\D/g, "").slice(0, 4))} />
        </Field>
      </div>
      <p className="text-muted-foreground text-caption">암호화해서 저장해요. 목록에는 뒤 4자리만 보여요</p>
    </div>
  );
}
