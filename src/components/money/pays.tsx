"use client";

// 페이 목록(06 §6.7): 네이버페이·카카오페이 등과 연결한 카드·계좌. 지출 입력에서 페이를 고르면 "어디서 나갔나요?"에 연결한 것이 나옴
// 결제수단에는 실제로 돈이 나간 곳(연결 카드·계좌·페이 머니)을 적어서, 카드별 합계가 두 번 잡히지 않음
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { addPay, editPay, hidePaymentAction } from "@/app/actions/cards";
import { ResponsiveModal } from "@/components/app/responsive";
import { EmptyState } from "@/components/app/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";
import type { PayInput, PayItem } from "@/server/cards";

const NAMES = ["네이버페이", "카카오페이", "토스페이", "삼성페이", "애플페이", "페이코", "스마일페이", "SSG페이"];
type Source = { id: string; kind: "card" | "account"; name: string };

export function PayGrid({ pays, sources }: { pays: PayItem[]; sources: Source[] }) {
  const [form, setForm] = useState<PayItem | "new" | null>(null);
  const mobile = useIsMobile();
  const add = (
    <Button variant={mobile ? "outline" : "default"} onClick={() => setForm("new")}>
      <Plus /> 페이 추가
    </Button>
  );
  return (
    <div className="space-y-4">
      {pays.length > 0 && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-muted-foreground text-sm">페이를 누르면 고칠 수 있어요</p>
          {add}
        </div>
      )}
      {pays.length === 0 ? (
        <EmptyState pet="komong" title="쓰는 페이를 등록해 보세요" description="페이에 연결한 카드·계좌를 적어 두면 지출을 적을 때 실제로 돈이 나간 곳을 바로 고를 수 있어요" action={add} />
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {pays.map((p) => {
            const linked = p.sourceIds.map((id) => sources.find((s) => s.id === id)).filter((s) => !!s);
            return (
              <li key={p.id}>
                <button type="button" onClick={() => setForm(p)} className="bg-card hover:bg-accent/40 flex h-full w-full flex-col justify-start space-y-2 rounded-xl border p-5 text-left shadow-sm">
                  <p className="truncate font-semibold">{p.name}</p>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="secondary">페이 머니</Badge>
                    {linked.map((s) => (
                      <Badge key={s.id} variant="outline">
                        {s.name}
                      </Badge>
                    ))}
                  </div>
                  {p.memo ? <p className="line-clamp-6 text-sm whitespace-pre-line">{p.memo}</p> : <p className="text-muted-foreground text-sm">적립 혜택이나 쓰임새를 메모해 두세요</p>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {form && <PayForm edit={form === "new" ? undefined : form} sources={sources} close={() => setForm(null)} />}
    </div>
  );
}

function PayForm({ edit, sources, close }: { edit?: PayItem; sources: Source[]; close: () => void }) {
  const router = useRouter();
  const [v, setV] = useState<PayInput>({ name: edit?.name ?? "", sourceIds: edit?.sourceIds.filter((id) => sources.some((s) => s.id === id)) ?? [], memo: edit?.memo ?? null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ids = v.sourceIds ?? [];
  const toggle = (id: string) => setV((s) => ({ ...s, sourceIds: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id] }));

  async function save() {
    setBusy(true);
    const input = { ...v, memo: v.memo?.trim() || null };
    const r = edit ? await editPay(edit.id, edit.pmVersion, input) : await addPay(input);
    setBusy(false);
    if (!r.ok) return setError(r.error.code === "VERSION_CONFLICT" ? "다른 기기에서 먼저 수정했어요. 닫고 다시 열어 주세요" : (r.error.fields?.[0]?.message ?? r.error.message));
    toast(edit ? "페이를 고쳤어요" : "페이를 추가했어요");
    close();
    router.refresh();
  }

  async function hide() {
    if (!edit) return;
    const r = await hidePaymentAction("pay", edit.id, edit.pmVersion);
    if (!r.ok) return setError(r.error.message);
    toast("페이를 숨겼어요. 지난 지출의 이름은 그대로예요");
    close();
    router.refresh();
  }

  return (
    <ResponsiveModal
      open
      onOpenChange={(o) => !o && close()}
      title={edit ? "페이 수정" : "페이 추가"}
      footer={
        <div className="flex w-full gap-2 max-md:flex-col-reverse">
          {edit && (
            <Button variant="ghost" className="text-destructive-text" onClick={hide}>
              페이 숨기기
            </Button>
          )}
          <Button className="md:ml-auto" disabled={!v.name.trim() || busy} onClick={save}>
            {busy && <Spinner />} {edit ? "저장" : "페이 추가"}
          </Button>
        </div>
      }
    >
      <FieldGroup className="gap-5">
        <Field>
          <FieldLabel htmlFor="py-name">페이 이름</FieldLabel>
          <Input id="py-name" list="py-names" autoFocus={!edit} maxLength={20} placeholder="예: 네이버페이" className="h-11 text-base md:h-9 md:text-sm [&::-webkit-calendar-picker-indicator]:opacity-0" value={v.name} onChange={(e) => setV((s) => ({ ...s, name: e.target.value }))} />
          <datalist id="py-names">
            {NAMES.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </Field>
        <Field>
          <FieldLabel>연결한 카드·계좌</FieldLabel>
          <FieldDescription>페이 머니는 따로 고르지 않아도 늘 쓸 수 있어요</FieldDescription>
          {sources.length ? (
            <div className="flex flex-wrap gap-2" role="group" aria-label="연결한 카드·계좌">
              {sources.map((s) => (
                <Button key={s.id} type="button" aria-pressed={ids.includes(s.id)} variant={ids.includes(s.id) ? "default" : "outline"} className="h-9 rounded-full max-md:h-10" onClick={() => toggle(s.id)}>
                  {s.name}
                </Button>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">카드나 계좌를 먼저 추가하면 여기서 연결할 수 있어요</p>
          )}
        </Field>
        <Field>
          <FieldLabel htmlFor="py-memo">메모</FieldLabel>
          <Textarea
            id="py-memo"
            maxLength={2000}
            className="field-sizing-content min-h-24 leading-7"
            placeholder={"예: - 네이버 쇼핑은 포인트 5% 적립\n- 충전할 땐 국민 통장에서"}
            value={v.memo ?? ""}
            onChange={(e) => setV((s) => ({ ...s, memo: e.target.value }))}
          />
        </Field>
        {error && <FieldError>{error}</FieldError>}
      </FieldGroup>
    </ResponsiveModal>
  );
}
