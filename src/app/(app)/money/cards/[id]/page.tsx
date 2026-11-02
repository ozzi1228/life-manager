// 카드 상세 (SCR-FIN-09): 실적·전월 실적, 혜택별 이번 달 사용, 혜택 받은 지출
import { notFound } from "next/navigation";
import { Page } from "@/components/app/page-shell";
import { CardDetailView } from "@/components/money/cards";
import { MoneyTabs } from "@/components/money/money-tabs";
import { AppError } from "@/server/errors";
import { cardDetail } from "@/server/cards";
import { formData, todayIn } from "@/server/finance";
import { pageCtx } from "@/server/session";

export default async function CardPage({ params }: PageProps<"/money/cards/[id]">) {
  const { id } = await params;
  const ctx = await pageCtx();
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [c, f] = await Promise.all([cardDetail(ctx, id).catch((e) => (e instanceof AppError && e.code === "NOT_FOUND" ? null : Promise.reject(e))), formData(ctx)]);
  if (!c) notFound();
  return (
    <Page>
      <MoneyTabs />
      <CardDetailView c={c} categories={f.categories.filter((x) => x.kind === "expense").map(({ id, name }) => ({ id, name }))} today={todayIn()} />
    </Page>
  );
}
