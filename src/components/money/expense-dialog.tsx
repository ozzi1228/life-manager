"use client";

// 지출 입력·수정 (SCR-FIN-03, 04 §6.3): 결제 직후 15초 안에. 어느 화면에서든 열 수 있게 앱 셸에 하나만 둠
import { ChevronDown, Minus, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  addCategory,
  addPaymentMethod,
  addTransaction,
  editTransaction,
  expenseFormData,
  removeTransaction,
  restoreTransaction,
} from "@/app/actions/money";
import { AmountInput } from "@/components/app/money";
import { ResponsiveModal } from "@/components/app/responsive";
import { toastUndo } from "@/components/app/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { dayLabel, fromYmd, ymd } from "@/lib/format";
import { cn } from "@/lib/utils";

export type TxEdit = {
  id: string;
  version: number;
  type: "expense" | "income";
  amount: number;
  isRefund: boolean;
  date: string;
  categoryId: string;
  paymentMethodId: string | null;
  title: string | null;
  memo: string | null;
};
type FormData = Extract<Awaited<ReturnType<typeof expenseFormData>>, { ok: true }>["data"];

const Ctx = createContext<(edit?: TxEdit) => void>(() => {});
/** 화면 어디서든: const openExpense = useExpenseDialog(); openExpense() / openExpense(행) */
export const useExpenseDialog = () => useContext(Ctx);

export function ExpenseDialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ open: boolean; edit?: TxEdit; n: number }>({ open: false, n: 0 });
  return (
    <Ctx.Provider value={(edit) => setState((s) => ({ open: true, edit, n: s.n + 1 }))}>
      {children}
      <ResponsiveModal
        open={state.open}
        onOpenChange={(open) => setState((s) => ({ ...s, open }))}
        title={state.edit ? "지출 수정" : "지출 추가"}
        size="md"
      >
        {state.open && <ExpenseForm key={state.n} edit={state.edit} close={() => setState((s) => ({ ...s, open: false }))} />}
      </ResponsiveModal>
    </Ctx.Provider>
  );
}

const newKey = () => crypto.randomUUID();

function ExpenseForm({ edit, close }: { edit?: TxEdit; close: () => void }) {
  const router = useRouter();
  const [data, setData] = useState<FormData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [type, setType] = useState<"expense" | "income">(edit?.type ?? "expense");
  const [refund, setRefund] = useState(edit?.isRefund ?? false);
  const [amount, setAmount] = useState<number | null>(edit?.amount ?? null);
  const [categoryId, setCategoryId] = useState<string | null>(edit?.categoryId ?? null); // 직전 선택 기억 안 함(오기록 방지, 04 §6.3)
  const [paymentId, setPaymentId] = useState<string | null>(edit?.paymentMethodId ?? null);
  const [date, setDate] = useState(edit?.date ?? ymd(new Date()));
  const [title, setTitle] = useState(edit?.title ?? "");
  const [memo, setMemo] = useState(edit?.memo ?? "");
  const [allCats, setAllCats] = useState(false);
  const [newCat, setNewCat] = useState<string | null>(null);
  const [newPm, setNewPm] = useState<string | null>(null);
  const [repeat, setRepeat] = useState(false);
  const [key, setKey] = useState(newKey);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field?: string; message: string } | null>(null);
  const [dateOpen, setDateOpen] = useState(false);

  // 열릴 때 한 번 불러옴(분류·결제수단, 마지막 쓴 결제수단)
  useEffect(() => {
    expenseFormData().then((r) => {
      if (!r.ok) return setLoadError(r.error.message);
      setData(r.data);
      if (!edit) setPaymentId(r.data.lastPaymentMethodId);
    });
  }, [edit]);

  const cats = data?.categories.filter((c) => c.kind === type) ?? [];
  const shownCats = allCats ? cats : cats.slice(0, 6);
  const picked = cats.find((c) => c.id === categoryId);
  const future = date > ymd(new Date());
  const canSave = !!amount && !busy;

  async function save() {
    if (!amount) return;
    if (!categoryId) return setError({ field: "category", message: "분류를 골라 주세요" });
    setBusy(true);
    setError(null);
    const input = { type, amount, isRefund: type === "expense" && refund, date, categoryId, paymentMethodId: paymentId, title: title.trim() || null, memo: memo.trim() || null };
    const r = edit ? await editTransaction(edit.id, edit.version, input) : await addTransaction(key, input);
    setBusy(false);
    if (!r.ok) {
      if (r.error.code === "VERSION_CONFLICT") return setError({ message: "다른 기기에서 먼저 수정했어요. 닫고 다시 열어 주세요" });
      const f = r.error.fields?.[0];
      return setError({ field: f?.path === "categoryId" ? "category" : f?.path === "amount" ? "amount" : undefined, message: f?.message ?? r.error.message });
    }
    router.refresh();
    if (edit) {
      toast("고쳤어요");
      return close();
    }
    const id = r.data.id;
    const undo = async () => {
      await removeTransaction(id);
      router.refresh();
    };
    const label = type === "income" ? "수입을 기록했어요" : refund ? "환불을 기록했어요" : "지출을 기록했어요";
    if ("restraint" in r.data && r.data.restraint) toast(`사치 지출을 기록했어요 · 이번 달 참아야 할 금액에 더해져요`, { duration: 6000, action: { label: "되돌리기", onClick: undo } });
    else toastUndo(label, undo);
    if (repeat) {
      // 연속 입력: 비우고 다시 금액부터
      setAmount(null);
      setTitle("");
      setMemo("");
      setCategoryId(null);
      setKey(newKey());
    } else close();
  }

  async function remove() {
    if (!edit) return;
    setBusy(true);
    const r = await removeTransaction(edit.id);
    setBusy(false);
    if (!r.ok) return setError({ message: r.error.message });
    router.refresh();
    close();
    toastUndo("휴지통으로 옮겼어요", async () => {
      await restoreTransaction(edit.id);
      router.refresh();
    });
  }

  async function createCategory() {
    const name = newCat?.trim();
    if (!name) return setNewCat(null);
    const r = await addCategory(type, name);
    if (!r.ok) return setError({ field: "category", message: r.error.fields?.[0]?.message ?? r.error.message });
    setData((d) => d && { ...d, categories: [r.data, ...d.categories] });
    setCategoryId(r.data.id);
    setNewCat(null);
  }

  async function createPayment() {
    const name = newPm?.trim();
    if (!name) return setNewPm(null);
    const r = await addPaymentMethod("card", name);
    if (!r.ok) return setError({ field: "payment", message: r.error.fields?.[0]?.message ?? r.error.message });
    setData((d) => d && { ...d, paymentMethods: [r.data, ...d.paymentMethods] });
    setPaymentId(r.data.id);
    setNewPm(null);
  }

  if (loadError) return <p className="text-destructive-text text-sm">{loadError}</p>;
  if (!data)
    return (
      <div className="flex h-40 items-center justify-center">
        <Spinner />
      </div>
    );

  const chip = "h-9 rounded-full px-3 max-md:h-10";
  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <ToggleGroup type="single" variant="outline" value={type} onValueChange={(v) => v && (setType(v as typeof type), setCategoryId(null))} className="w-full">
        <ToggleGroupItem value="expense" className="flex-1">
          지출
        </ToggleGroupItem>
        <ToggleGroupItem value="income" className="flex-1">
          수입
        </ToggleGroupItem>
      </ToggleGroup>

      <Field data-invalid={error?.field === "amount" || undefined}>
        <div className="flex items-center gap-2">
          {type === "expense" && (
            <Button
              type="button"
              variant={refund ? "secondary" : "ghost"}
              size="sm"
              aria-pressed={refund}
              onClick={() => setRefund(!refund)}
              title="환불·취소는 지출에서 빼요"
            >
              {refund ? <Plus /> : <Minus />} {refund ? "환불" : "환불이면"}
            </Button>
          )}
          <div className="flex-1">
            <AmountInput value={amount} onChange={setAmount} autoFocus={!edit} invalid={error?.field === "amount"} />
          </div>
        </div>
        {error?.field === "amount" && <FieldError>{error.message}</FieldError>}
      </Field>

      <FieldGroup className="gap-4">
        <Field data-invalid={error?.field === "category" || undefined}>
          <FieldLabel>분류</FieldLabel>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="분류">
            {shownCats.map((c) => (
              <Button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={categoryId === c.id}
                variant={categoryId === c.id ? "default" : "outline"}
                className={chip}
                onClick={() => (setCategoryId(c.id), error?.field === "category" && setError(null))}
              >
                {c.name}
              </Button>
            ))}
            {!allCats && cats.length > 6 && (
              <Button type="button" variant="ghost" className={chip} onClick={() => setAllCats(true)}>
                더 보기 <ChevronDown />
              </Button>
            )}
            {allCats &&
              (newCat === null ? (
                <Button type="button" variant="ghost" className={chip} onClick={() => setNewCat("")}>
                  <Plus /> 새 분류
                </Button>
              ) : (
                <Input
                  autoFocus
                  aria-label="새 분류 이름"
                  placeholder="새 분류 이름"
                  className="h-9 w-36"
                  maxLength={20}
                  value={newCat}
                  onChange={(e) => setNewCat(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), createCategory())}
                  onBlur={createCategory}
                />
              ))}
          </div>
          {picked?.restraint && <p className="text-muted-foreground text-caption">이 분류에 쓴 돈만큼 참은 소비를 채워야 해요</p>}
          {error?.field === "category" && <FieldError>{error.message}</FieldError>}
        </Field>

        {type === "expense" && (
          <Field data-invalid={error?.field === "payment" || undefined}>
            <FieldLabel>결제</FieldLabel>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="결제수단">
              {data.paymentMethods.slice(0, 8).map((p) => (
                <Button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={paymentId === p.id}
                  variant={paymentId === p.id ? "secondary" : "outline"}
                  className={cn(chip, paymentId === p.id && "ring-primary ring-2")}
                  onClick={() => setPaymentId(paymentId === p.id ? null : p.id)}
                >
                  {p.name}
                </Button>
              ))}
              {newPm === null ? (
                <Button type="button" variant="ghost" className={chip} onClick={() => setNewPm("")}>
                  <Plus /> 카드·계좌
                </Button>
              ) : (
                <Input
                  autoFocus
                  aria-label="새 결제수단 이름"
                  placeholder="예: 신한카드"
                  className="h-9 w-36"
                  maxLength={20}
                  value={newPm}
                  onChange={(e) => setNewPm(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), createPayment())}
                  onBlur={createPayment}
                />
              )}
            </div>
            {error?.field === "payment" && <FieldError>{error.message}</FieldError>}
          </Field>
        )}

        <Field orientation="horizontal" className="items-center">
          <FieldLabel className="w-10 shrink-0">날짜</FieldLabel>
          <Popover open={dateOpen} onOpenChange={setDateOpen}>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" className="justify-start">
                {dayLabel(date)}
                {future && <Badge variant="secondary">예정</Badge>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={fromYmd(date)}
                onSelect={(d) => {
                  if (d) setDate(ymd(d));
                  setDateOpen(false);
                }}
              />
            </PopoverContent>
          </Popover>
        </Field>

        <Field>
          <FieldLabel htmlFor="tx-title">내용</FieldLabel>
          <Input id="tx-title" maxLength={60} placeholder={picked ? picked.name : "예: 점심"} className="h-11 text-base md:h-9 md:text-sm" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>

        <Collapsible defaultOpen={!!edit?.memo}>
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="-ml-2">
              <ChevronDown /> 메모
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <Textarea aria-label="메모" maxLength={1000} value={memo} onChange={(e) => setMemo(e.target.value)} />
          </CollapsibleContent>
        </Collapsible>
      </FieldGroup>

      {error && !error.field && <p className="text-destructive-text text-sm">{error.message}</p>}

      <div className="bg-popover sticky bottom-0 -mx-1 space-y-2 px-1 pt-2">
        {!edit && (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={repeat} onCheckedChange={(v) => setRepeat(v === true)} /> 연속 입력
          </label>
        )}
        <div className="flex gap-2">
          {edit && (
            <Button type="button" variant="ghost" className="text-destructive-text" disabled={busy} onClick={remove}>
              삭제
            </Button>
          )}
          <Button type="submit" size="lg" className="h-12 flex-1 md:h-10" disabled={!canSave}>
            {busy && <Spinner />} {edit ? "저장" : type === "income" ? "수입 추가" : refund ? "환불 기록" : "지출 추가"}
          </Button>
        </div>
      </div>
    </form>
  );
}
