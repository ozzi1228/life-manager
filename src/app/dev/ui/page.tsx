"use client";

// M-02 디자인 시스템 부품 모아 보기(개발용)
import { useState } from "react";
import { GuideDialog, HowToTip, InfoTip } from "@/components/app/help";
import { AmountInput, BudgetBar, MoneyText } from "@/components/app/money";
import { MonthSwitcher, QuickChips } from "@/components/app/pickers";
import { ResponsiveDetail, ResponsiveModal } from "@/components/app/responsive";
import { EmptyState, toastUndo } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { dayLabel } from "@/lib/format";
import { GOAL_PALETTE, textOn } from "@/lib/palette";

export default function UiShowcase() {
  const [month, setMonth] = useState("2026-11");
  const [amount, setAmount] = useState<number | null>(12000);
  const [chip, setChip] = useState<string | null>("food");
  const [modal, setModal] = useState(false);
  const [detail, setDetail] = useState(false);
  const [guide, setGuide] = useState(false);

  return (
    <main className="mx-auto w-full max-w-2xl space-y-8 p-4 md:p-8">
      <h1 className="text-title md:text-title-lg font-bold">디자인 부품</h1>

      <section className="space-y-3">
        <h2 className="text-subtitle font-semibold">버튼 위계</h2>
        <div className="flex flex-wrap gap-2">
          <Button>지출 추가</Button>
          <Button variant="secondary">보조</Button>
          <Button variant="outline">외곽선</Button>
          <Button variant="ghost">고스트</Button>
          <Button variant="link">자세히 보기</Button>
          <Button variant="destructive">영구 삭제</Button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-subtitle font-semibold">금액</h2>
        <Field>
          <FieldLabel htmlFor="amt">
            금액 <InfoTip label="금액">원 단위로 입력해요. 쉼표는 자동으로 들어가요.</InfoTip>
          </FieldLabel>
          <AmountInput id="amt" value={amount} onChange={setAmount} />
          <FieldDescription>입력값: {amount ?? "없음"}</FieldDescription>
        </Field>
        <p className="space-x-3">
          <MoneyText amount={426000} /> <MoneyText amount={50000} sign /> <MoneyText amount={32000} over />
        </p>
        <BudgetBar used={420000} planned={50000} budget={800000} />
        <BudgetBar used={690000} budget={800000} />
        <BudgetBar used={832000} budget={800000} />
      </section>

      <section className="space-y-3">
        <h2 className="text-subtitle font-semibold">
          달·칩 <HowToTip label="달 이동" steps={["화살표로 이전·다음 달", "가운데를 누르면 달 고르기"]} />
        </h2>
        <MonthSwitcher value={month} onChange={setMonth} />
        <QuickChips
          label="분류"
          value={chip}
          onChange={setChip}
          options={[
            { id: "food", label: "식비" },
            { id: "cafe", label: "카페" },
            { id: "transport", label: "교통" },
            { id: "shopping", label: "쇼핑" },
          ]}
          onMore={() => {}}
        />
        <p className="text-muted-foreground text-sm">
          {dayLabel("2026-11-01", new Date(2026, 10, 1))} · {dayLabel("2026-10-31", new Date(2026, 10, 1))} · {dayLabel("2026-10-20", new Date(2026, 10, 1))}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-subtitle font-semibold">목표 색</h2>
        <div className="grid grid-cols-6 gap-2">
          {GOAL_PALETTE.map((c) => (
            <div key={c.hex} className="text-caption flex h-10 items-center justify-center rounded-sm font-medium" style={{ background: c.hex, color: textOn(c.hex) }}>
              {c.name}
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-subtitle font-semibold">창</h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setModal(true)}>
            추가 창
          </Button>
          <Button variant="outline" onClick={() => setDetail(true)}>
            상세 패널
          </Button>
          <Button variant="outline" onClick={() => setGuide(true)}>
            가이드
          </Button>
          <Button variant="outline" onClick={() => toastUndo("휴지통으로 옮겼어요", () => {})}>
            되돌리기 토스트
          </Button>
        </div>
        <ResponsiveModal
          open={modal}
          onOpenChange={setModal}
          title="지출 추가"
          description="PC는 가운데 창, 휴대폰은 아래에서 올라와요"
          footer={
            <>
              <Button variant="outline" onClick={() => setModal(false)}>
                취소
              </Button>
              <Button onClick={() => setModal(false)}>지출 추가</Button>
            </>
          }
        >
          <AmountInput value={amount} onChange={setAmount} autoFocus />
        </ResponsiveModal>
        <ResponsiveDetail open={detail} onOpenChange={setDetail} title="넷플릭스" description="매달 15일 결제">
          <p className="text-sm">PC는 오른쪽 패널, 휴대폰은 아래에서 올라와요.</p>
        </ResponsiveDetail>
        <GuideDialog open={guide} onOpenChange={setGuide} title="카드 혜택 등록 가이드">
          <p>긴 설명은 이렇게 따로 열어요.</p>
        </GuideDialog>
      </section>

      <EmptyState title="아직 고정 지출이 없어요" action={<Button>고정 지출 추가</Button>} />
    </main>
  );
}
