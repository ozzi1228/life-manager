"use client";

// 지출 입력·수정 (SCR-FIN-03, 04 §6.3): 결제 직후 15초 안에. 어느 화면에서든 열 수 있게 앱 셸에 하나만 둠
import { ChevronDown, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  addCategory,
  deleteCategory,
  editCategory,
  reorderCategory,
  addPaymentMethod,
  addTransaction,
  editTransaction,
  expenseFormData,
  removeTransaction,
  restoreTransaction,
  transactionHistory,
} from "@/app/actions/money";
import { buyWish, undoBuyWish } from "@/app/actions/wish";
import { CategoryEditor } from "@/components/app/category-editor";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { dayLabel, fromYmd, money, timeLabel, ymd } from "@/lib/format";
import type { HistoryEntry } from "@/server/history";
import { cn } from "@/lib/utils";

export type TxEdit = {
  id: string;
  version: number;
  type: "expense" | "income";
  amount: number;
  isRefund: boolean;
  restraint?: boolean;
  date: string;
  categoryId: string;
  paymentMethodId: string | null;
  title: string | null;
  memo: string | null;
  plannedExpenseId?: string | null;
};
/** 위시 구매(09 §6, 04 §7.8): 가격·이름·쇼핑 분류로 채워 열고, 저장하면 지출 + 위시 구매함을 한 번에 */
export type WishBuy = { id: string; version: number; name: string; price: number | null; notice?: string; done?: () => void };
type FormData = Extract<Awaited<ReturnType<typeof expenseFormData>>, { ok: true }>["data"];

const Ctx = createContext<(edit?: TxEdit, wish?: WishBuy) => void>(() => {});
/** 화면 어디서든: const openExpense = useExpenseDialog(); openExpense() / openExpense(행) / openExpense(undefined, 위시) */
export const useExpenseDialog = () => useContext(Ctx);

export function ExpenseDialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ open: boolean; edit?: TxEdit; wish?: WishBuy; n: number }>({ open: false, n: 0 });
  return (
    <Ctx.Provider value={(edit, wish) => setState((s) => ({ open: true, edit, wish, n: s.n + 1 }))}>
      {children}
      <ResponsiveModal
        open={state.open}
        onOpenChange={(open) => setState((s) => ({ ...s, open }))}
        title={state.edit ? "지출 수정" : state.wish ? "구매 기록" : "지출 추가"}
        size="md"
      >
        {state.open && <ExpenseForm key={state.n} edit={state.edit} wish={state.wish} close={() => setState((s) => ({ ...s, open: false }))} />}
      </ResponsiveModal>
    </Ctx.Provider>
  );
}

const newKey = () => crypto.randomUUID();

function ExpenseForm({ edit, wish, close }: { edit?: TxEdit; wish?: WishBuy; close: () => void }) {
  const router = useRouter();
  const [data, setData] = useState<FormData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [type, setType] = useState<"expense" | "income">(edit?.type ?? "expense");
  const [refund, setRefund] = useState(edit?.isRefund ?? false);
  const [restraint, setRestraint] = useState(edit?.restraint ?? false); // 참아서 갚기(20 §3)
  const [amount, setAmount] = useState<number | null>(edit?.amount ?? wish?.price ?? null);
  const [categoryId, setCategoryId] = useState<string | null>(edit?.categoryId ?? null); // 직전 선택 기억 안 함(오기록 방지, 04 §6.3)
  const [paymentId, setPaymentId] = useState<string | null>(edit?.paymentMethodId ?? null);
  const [date, setDate] = useState(edit?.date ?? ymd(new Date()));
  const [title, setTitle] = useState(edit?.title ?? wish?.name.slice(0, 60) ?? "");
  const [memo, setMemo] = useState(edit?.memo ?? "");
  const [plannedId, setPlannedId] = useState<string | null>(edit?.plannedExpenseId ?? null);
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
      if (wish) setCategoryId(r.data.categories.find((c) => c.kind === "expense" && c.name === "쇼핑")?.id ?? null);
    });
  }, [edit, wish]);

  const cats = data?.categories.filter((c) => c.kind === type) ?? [];
  const shownCats = allCats ? cats : cats.slice(0, 6);
  const picked = cats.find((c) => c.id === categoryId);
  const future = date > ymd(new Date());
  const canSave = !!amount && !busy;
  // 큰 지출 연결: 고른 날짜가 든 달의 큰 지출만(06 §3.1)
  const plannedOpts = type === "expense" ? (data?.planned.filter((p) => p.month === date.slice(0, 7)) ?? []) : [];
  const linked = plannedOpts.some((p) => p.id === plannedId) ? plannedId : null;

  async function save() {
    if (!amount) return;
    if (!categoryId) return setError({ field: "category", message: "분류를 골라 주세요" });
    setBusy(true);
    setError(null);
    const input = { type, amount, isRefund: type === "expense" && refund, restraint: type === "expense" && restraint, date, categoryId, paymentMethodId: paymentId, title: title.trim() || null, memo: memo.trim() || null, plannedExpenseId: linked };
    const r = edit ? await editTransaction(edit.id, edit.version, input) : wish ? await buyWish(key, wish.id, wish.version, input) : await addTransaction(key, input);
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
    if (wish) return bought(r.data as { budget: { category: string; over: number } | null });
    const id = r.data.id!;
    const undo = async () => {
      await removeTransaction(id);
      router.refresh();
    };
    const label = type === "income" ? "수입을 기록했어요" : refund ? "환불을 기록했어요" : "지출을 기록했어요";
    if ("budget" in r.data && r.data.budget) toast.warning(`${r.data.budget.category} 예산을 ${money(r.data.budget.over)} 넘었어요 · 그만큼 참아야 할 금액에 더해져요`, { duration: 5000, action: { label: "되돌리기", onClick: undo } });
    else if ("restraint" in r.data && r.data.restraint) toast(`참아서 갚을 지출을 기록했어요 · 이번 달 참아야 할 금액 +${money(amount)}`, { duration: 6000, action: { label: "되돌리기", onClick: undo } });
    else toastUndo(label, undo);
    if (repeat) {
      // 연속 입력: 비우고 다시 금액부터
      setAmount(null);
      setTitle("");
      setMemo("");
      setCategoryId(null);
      setRestraint(false);
      setKey(newKey());
    } else close();
  }

  /** 위시 구매함 처리 뒤: 토스트 되돌리기 = 지출도 휴지통 + 담아둠으로 */
  function bought(d: { budget: { category: string; over: number } | null }) {
    if (!wish) return;
    const undo = async () => {
      await undoBuyWish(wish.id);
      router.refresh();
    };
    if (d.budget) toast.warning(`구매함으로 옮겼어요 · ${d.budget.category} 예산을 ${money(d.budget.over)} 넘었어요`, { duration: 5000, action: { label: "되돌리기", onClick: undo } });
    else toastUndo("구매함으로 옮겼어요", undo);
    wish.done?.();
    close();
  }

  async function buyWithoutExpense() {
    if (!wish) return;
    setBusy(true);
    const r = await buyWish(key, wish.id, wish.version, null);
    setBusy(false);
    if (!r.ok) return setError({ message: r.error.code === "VERSION_CONFLICT" ? "다른 기기에서 먼저 바꿨어요. 닫고 다시 열어 주세요" : r.error.message });
    router.refresh();
    bought({ budget: null });
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
      {wish && (
        <div className="space-y-2">
          <Badge variant="secondary" className="max-w-full truncate">
            위시: {wish.name}
          </Badge>
          {wish.notice && <p className="bg-warning/15 rounded-md p-2 text-sm">{wish.notice}</p>}
        </div>
      )}
      {/* 지출 · 환불 · 수입: 환불은 저장할 땐 "지출 + 환불 표시"(지출 합계에서 빠짐). 지출↔환불은 분류를 그대로 둠 */}
      <ToggleGroup
        type="single"
        variant="outline"
        value={type === "income" ? "income" : refund ? "refund" : "expense"}
        onValueChange={(v) => {
          if (!v) return;
          const next = v === "income" ? "income" : "expense";
          if (next !== type) setCategoryId(null);
          setType(next);
          setRefund(v === "refund");
        }}
        className={cn("w-full", wish && "hidden")}
      >
        <ToggleGroupItem value="expense" className="flex-1">
          지출
        </ToggleGroupItem>
        {(!edit || edit.type === "expense") && (
          <ToggleGroupItem value="refund" className="flex-1">
            환불
          </ToggleGroupItem>
        )}
        <ToggleGroupItem value="income" className="flex-1">
          수입
        </ToggleGroupItem>
      </ToggleGroup>

      <Field data-invalid={error?.field === "amount" || undefined}>
        <div className="flex items-center gap-2">
          {/* 돌려받는 돈은 금액 앞에 + */}
          {type === "expense" && refund && (
            <span className="text-success-text text-title font-semibold" aria-hidden>
              +
            </span>
          )}
          <div className="flex-1">
            <AmountInput value={amount} onChange={setAmount} autoFocus={!edit} invalid={error?.field === "amount"} />
          </div>
        </div>
        {type === "expense" && refund && <p className="text-muted-foreground text-caption">돌려받은 금액이에요. 이 달 지출 합계에서 빠져요</p>}
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
                  className="h-9 w-36 max-md:h-10"
                  maxLength={20}
                  value={newCat}
                  onChange={(e) => setNewCat(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), createCategory())}
                  onBlur={createCategory}
                />
              ))}
            {/* 분류 편집: 칩 줄 끝. 바꾼 결과를 이 창의 목록에도 바로 반영 */}
            <CategoryEditor
              title={type === "income" ? "수입 분류 편집" : "지출 분류 편집"}
              items={cats.map((x) => ({ key: x.id, name: x.name }))}
              removeNote="지난 기록은 이름 그대로 남아요"
              className="h-9"
              onReorder={async (keys) => {
                const r = await reorderCategory(keys);
                if (r.ok) setData((d) => d && { ...d, categories: [...d.categories].sort((x, y) => keys.indexOf(x.id) - keys.indexOf(y.id)) });
                return r;
              }}
              onAdd={async (name) => {
                const r = await addCategory(type, name);
                if (r.ok) setData((d) => d && { ...d, categories: [...d.categories, r.data] });
                return r;
              }}
              onRename={async (it, name) => {
                const r = await editCategory(it.key, name);
                if (r.ok) setData((d) => d && { ...d, categories: d.categories.map((x) => (x.id === it.key ? { ...x, name } : x)) });
                return r;
              }}
              onRemove={async (it) => {
                const r = await deleteCategory(it.key);
                if (r.ok) {
                  setData((d) => d && { ...d, categories: d.categories.filter((x) => x.id !== it.key) });
                  if (categoryId === it.key) setCategoryId(null);
                }
                return r;
              }}
            />
          </div>
          {error?.field === "category" && <FieldError>{error.message}</FieldError>}
        </Field>

        {type === "expense" && (
          <label className="flex cursor-pointer items-start gap-2.5 text-sm max-md:py-1">
            <Checkbox className="mt-0.5 max-md:size-5" checked={restraint} onCheckedChange={(v) => setRestraint(v === true)} />
            <span>
              참아서 갚기
              <span className="text-muted-foreground block text-caption">{refund ? "체크하면 이 금액만큼 참아야 할 금액이 줄어요" : "괜히 썼다 싶은 돈이면 체크해요. 이만큼 참은 소비로 채워야 해요"}</span>
            </span>
          </label>
        )}

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
                  variant={paymentId === p.id ? "default" : "outline"}
                  className={chip}
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
                  className="h-9 w-36 max-md:h-10"
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

        {plannedOpts.length > 0 && (
          <Field orientation="horizontal" className="items-center">
            <FieldLabel className="shrink-0">큰 지출</FieldLabel>
            <Select value={linked ?? "none"} onValueChange={(v) => setPlannedId(v === "none" ? null : v)}>
              <SelectTrigger aria-label="큰 지출 연결" className="min-w-0 flex-1 data-[size=default]:h-11 md:data-[size=default]:h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">연결 안 함</SelectItem>
                {plannedOpts.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}

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
        {edit && <History id={edit.id} />}
      </FieldGroup>

      {error && !error.field && <p className="text-destructive-text text-sm">{error.message}</p>}

      <div className="bg-popover sticky bottom-0 -mx-1 space-y-2 px-1 pt-2">
        {!edit && !wish && (
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
        {wish && (
          <Button type="button" variant="link" className="w-full" disabled={busy} onClick={buyWithoutExpense}>
            지출 없이 구매함으로
          </Button>
        )}
      </div>
    </form>
  );
}

/** 변경 기록(04 §8.8): 펼칠 때 불러옴 */
function History({ id }: { id: string }) {
  const [list, setList] = useState<HistoryEntry[] | null>(null);
  return (
    <Collapsible onOpenChange={(o) => o && !list && transactionHistory(id).then((r) => setList(r.ok ? r.data : []))}>
      <CollapsibleTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="-ml-2">
          <ChevronDown /> 변경 기록
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">
        {!list ? (
          <Spinner />
        ) : (
          <ol className="space-y-2 border-l pl-3 text-sm">
            {list.map((h) => {
              const d = new Date(h.at);
              return (
                <li key={h.id}>
                  <span className="text-muted-foreground tabular-nums">
                    {d.getMonth() + 1}월 {d.getDate()}일 {timeLabel(d)}
                  </span>{" "}
                  {h.action}
                  {h.by && <span className="text-muted-foreground"> ({h.by})</span>}
                  {h.changes.map((c) => (
                    <span key={c.label} className="text-muted-foreground block text-caption">
                      {c.label} {c.before} → {c.after}
                    </span>
                  ))}
                </li>
              );
            })}
          </ol>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
