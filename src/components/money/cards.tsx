"use client";

// 카드 목록(SCR-FIN-08, D-071): 내 결제수단 카드와 메모. 혜택은 메모에 직접 적음(예: "- 편의점 갈 때 최대 혜택")
// 카드를 누르면 수정 창. 지출 입력에서 만든 카드도 여기 나옴
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { addCard, editCard, hidePaymentAction } from "@/app/actions/cards";
import { AmountInput } from "@/components/app/money";
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
import { money } from "@/lib/format";
import type { CardInput, CardItem } from "@/server/cards";

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
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cards.map((c) => {
            const meta = [c.card?.issuer, c.card?.cardType && TYPE[c.card.cardType], c.card?.billingDay && `매월 ${c.card.billingDay}일 결제`, c.card?.annualFee && `연회비 ${money(c.card.annualFee)}`, accounts.find((a) => a.id === c.card?.linkedAccountId)?.name].filter(Boolean);
            return (
              <li key={c.id}>
                <button type="button" onClick={() => setForm(c)} className="bg-card hover:bg-accent/40 flex h-full w-full flex-col justify-start space-y-2 rounded-xl border p-5 text-left shadow-sm">
                  <p className="truncate font-semibold">{c.name}</p>
                  {meta.length > 0 && <p className="text-muted-foreground text-sm">{meta.join(" · ")}</p>}
                  {c.card?.memo ? <p className="line-clamp-6 text-sm whitespace-pre-line">{c.card.memo}</p> : <p className="text-muted-foreground text-sm">혜택이나 쓰임새를 메모해 두세요</p>}
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
    memo: c?.memo ?? null,
    linkedAccountId: c?.linkedAccountId ?? null,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof CardInput>(k: K, val: CardInput[K]) => setV((s) => ({ ...s, [k]: val }));

  async function save() {
    setBusy(true);
    const input = { ...v, issuer: v.issuer?.trim() || null, memo: v.memo?.trim() || null };
    const r = edit ? await editCard(edit.id, edit.pmVersion, input) : await addCard(input);
    setBusy(false);
    if (!r.ok) return setError(r.error.code === "VERSION_CONFLICT" ? "다른 기기에서 먼저 수정했어요. 닫고 다시 열어 주세요" : (r.error.fields?.[0]?.message ?? r.error.message));
    toast(edit ? "카드를 고쳤어요" : "카드를 추가했어요");
    close();
    router.refresh();
  }

  async function hide() {
    if (!edit) return;
    const r = await hidePaymentAction("card", edit.id, edit.pmVersion);
    if (!r.ok) return setError(r.error.message);
    toast("카드를 숨겼어요. 지난 지출의 결제수단 이름은 그대로예요");
    close();
    router.refresh();
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
            <Button variant="ghost" className="text-destructive-text" onClick={hide}>
              카드 숨기기
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
            <AmountInput id="cd-fee" value={v.annualFee ?? null} onChange={(a) => set("annualFee", a)} />
          </Field>
        </div>
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
