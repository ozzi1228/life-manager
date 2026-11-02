// 카드 실적·혜택 계산 (docs/planning/06 §6.3·6.4). 카드사 데이터가 없으므로 "기록된 지출로 계산한 예상값"
// - 실적 = 그 카드로 결제한 지출 − 환불 − 실적 제외 분류·업종
// - 혜택 구간 = 전월 실적이 넘은 가장 높은 구간(구간이 있는데 하나도 못 넘으면 혜택 없음)
// - 혜택 대상: 가맹점(지출 내용에 이름이 들어 있으면) 또는 업종(내용으로 가맹점 사전을 찾아 업종 추정)
// ponytail: 할부는 전액을 결제한 달 실적으로(Q-032 추천안). 시간 조건·온라인 제외는 저장만(지출에 시각·온라인 여부가 없음)

export const INDUSTRIES = ["영화", "카페", "편의점", "대형마트", "온라인 쇼핑", "배달", "대중교통", "택시", "주유", "통신", "구독", "외식", "병원·약국", "해외", "기타"] as const;

// 가맹점 → 업종 기본 사전(06 §6.3). 지출 내용에 이 이름이 들어 있으면 그 업종으로 봄
const MERCHANTS: Record<string, string[]> = {
  영화: ["CGV", "메가박스", "롯데시네마"],
  카페: ["스타벅스", "투썸", "이디야", "메가커피", "컴포즈", "빽다방", "할리스", "폴바셋", "블루보틀", "커피빈", "파스쿠찌"],
  편의점: ["GS25", "CU", "세븐일레븐", "이마트24", "미니스톱"],
  대형마트: ["이마트", "홈플러스", "롯데마트", "코스트코", "트레이더스"],
  "온라인 쇼핑": ["쿠팡", "11번가", "G마켓", "옥션", "SSG", "무신사", "29CM", "올리브영온라인", "네이버쇼핑"],
  배달: ["배달의민족", "배민", "요기요", "쿠팡이츠"],
  대중교통: ["지하철", "버스", "코레일", "KTX", "SRT", "티머니"],
  택시: ["택시", "카카오T", "우티"],
  주유: ["주유", "SK에너지", "GS칼텍스", "S-OIL", "현대오일뱅크"],
  통신: ["SKT", "KT", "LG U+", "LGU+", "알뜰폰"],
  구독: ["넷플릭스", "유튜브", "디즈니", "티빙", "웨이브", "왓챠", "멜론", "지니", "스포티파이", "쿠팡와우", "네이버플러스"],
  외식: ["맥도날드", "버거킹", "롯데리아", "KFC", "아웃백", "빕스"],
  "병원·약국": ["병원", "의원", "약국", "치과", "한의원"],
};
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");
// 긴 이름부터(이마트24가 이마트로 잡히지 않게)
const DICT = Object.entries(MERCHANTS)
  .flatMap(([industry, names]) => names.map((n) => ({ key: norm(n), industry })))
  .sort((a, b) => b.key.length - a.key.length);

/** 지출 내용으로 업종 추정. 모르면 null */
export const industryOf = (title: string | null) => {
  if (!title) return null;
  const t = norm(title);
  return DICT.find((d) => t.includes(d.key))?.industry ?? null;
};

export type CardTx = { id: string; amount: number; isRefund: boolean; date: string; categoryId: string; title: string | null };
export type Excludes = { categoryIds: string[]; industries: string[] };
export type Tier = { minPrevPerf: number; value?: number | null; limit?: number | null };
export type Benefit = {
  targetType: "merchant" | "industry";
  targets: string[];
  valueType: "percent" | "amount";
  value: number;
  perTxnMax: number | null;
  minAmount: number | null;
  limitType: "amount" | "count" | "none";
  monthlyLimit: number | null;
  tiers: Tier[];
  daysOfWeek: number[] | null; // 0 = 일요일
};

/** 기간 실적: 환불 차감, 제외 분류·업종 뺌 */
export function performance(txs: CardTx[], ex: Excludes) {
  return txs.reduce((a, t) => {
    if (ex.categoryIds.includes(t.categoryId)) return a;
    const ind = industryOf(t.title);
    if (ind && ex.industries.includes(ind)) return a;
    return a + (t.isRefund ? -t.amount : t.amount);
  }, 0);
}

/** 전월 실적으로 이번 달 적용 값. 구간이 있는데 못 넘으면 적용 안 됨 */
export function tierFor(b: Pick<Benefit, "tiers" | "value" | "monthlyLimit">, prevPerf: number) {
  if (!b.tiers.length) return { applies: true, value: b.value, limit: b.monthlyLimit, tier: null as Tier | null };
  const tier = [...b.tiers].sort((x, y) => y.minPrevPerf - x.minPrevPerf).find((t) => prevPerf >= t.minPrevPerf) ?? null;
  return { applies: !!tier, value: tier?.value ?? b.value, limit: tier?.limit ?? b.monthlyLimit, tier };
}

/** 이 카드에서 혜택 조건을 받는 데 필요한 전월 실적(가장 낮은 구간). 없으면 null */
export const perfTarget = (benefits: Pick<Benefit, "tiers">[]) => {
  const mins = benefits.flatMap((b) => b.tiers.map((t) => t.minPrevPerf)).filter((m) => m > 0);
  return mins.length ? Math.min(...mins) : null;
};

const dow = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();

export function matches(b: Pick<Benefit, "targetType" | "targets">, title: string | null) {
  if (!title) return false;
  if (b.targetType === "merchant") return b.targets.some((m) => m.trim() && norm(title).includes(norm(m)));
  const ind = industryOf(title);
  return !!ind && b.targets.includes(ind);
}

/** 이번 달 혜택 예상: 날짜 순으로 조건·1회 최대·월 한도(금액·횟수)를 적용 */
export function benefitUsage(b: Benefit, txs: CardTx[], prevPerf: number) {
  const t = tierFor(b, prevPerf);
  const items: { txId: string; amount: number }[] = [];
  if (!t.applies) return { applies: false, used: 0, count: 0, limit: t.limit, value: t.value, items };
  let used = 0;
  for (const x of [...txs].sort((a, c) => a.date.localeCompare(c.date))) {
    if (x.isRefund || !matches(b, x.title)) continue;
    if (b.minAmount && x.amount < b.minAmount) continue;
    if (b.daysOfWeek?.length && !b.daysOfWeek.includes(dow(x.date))) continue;
    if (b.limitType === "count" && t.limit !== null && items.length >= t.limit) break;
    let v = b.valueType === "percent" ? Math.floor((x.amount * t.value) / 100) : t.value;
    if (b.perTxnMax) v = Math.min(v, b.perTxnMax);
    if (b.limitType === "amount" && t.limit !== null) v = Math.min(v, t.limit - used);
    if (v <= 0) continue;
    used += v;
    items.push({ txId: x.id, amount: v });
  }
  return { applies: true, used, count: items.length, limit: t.limit, value: t.value, items };
}

/** "10% 할인, 1회 최대 5,000원, 월 1만원" 같은 한 줄 요약 */
export function benefitLabel(b: Benefit & { benefitType: "discount" | "point" | "cashback" }, won: (n: number) => string) {
  const kind = { discount: "할인", point: "적립", cashback: "캐시백" }[b.benefitType];
  const parts = [b.valueType === "percent" ? `${b.value}% ${kind}` : `${won(b.value)} ${kind}`];
  if (b.perTxnMax) parts.push(`1회 최대 ${won(b.perTxnMax)}`);
  if (b.limitType === "amount" && b.monthlyLimit) parts.push(`월 ${won(b.monthlyLimit)}까지`);
  if (b.limitType === "count" && b.monthlyLimit) parts.push(`월 ${b.monthlyLimit}회`);
  return parts.join(", ");
}
