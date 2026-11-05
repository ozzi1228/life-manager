"use client";

// 커리어 · 경험 정리 (D-064): 취업 준비에서 흔히 쓰는 경험 정리 양식
// 기본(경험명·분류·기관·역할·기간) · 내용(주요 활동·성과·배운 점·역량 키워드) · STAR(자소서용) · 자격·점수 · 비고·링크
// 목록은 분류별 묶음(여러 분류면 묶음마다 보임), 분류를 고르면 그 분류만. 쓰기·고치기는 전체 화면
import {
  ChevronDown,
  ChevronLeft,
  ExternalLink,
  Plus,
  Search,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";
import {
  addExpCat,
  addExperience,
  deleteExperience,
  editExperience,
  removeExpCat,
  renameExpCat,
  reorderExpCats,
  setExpCat,
  } from "@/app/actions/career";
import { CategoryEditor } from "@/components/app/category-editor";
import { EmptyState, toastDone } from "@/components/app/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  defaultSections,
  EXP_SECTIONS,
  periodLabel,
  type ExpCategory,
  type ExpSection,
} from "@/lib/career";
import { cn } from "@/lib/utils";
import type { Experience } from "@/server/career";

const NONE = "분류 없음";
type Cat = ExpCategory & { count?: number };
// 분류 편집(목록·편집 화면 공용): 이름을 바꾸거나 지우면 경험에 붙은 분류도 같이 바뀜
const catEditor = (
  categories: Cat[],
  onRenamed?: (from: string, to: string) => void,
  onRemoved?: (name: string) => void,
) => ({
  title: "경험 분류 편집",
  description:
    "바꾸면 바로 저장돼요. 이 순서대로 화면에 보이고, 체크한 칸만 경험 양식에 보여요",
  items: categories.map((c) => ({
    key: c.name,
    name: c.name,
    color: c.color,
    count: c.count,
  })),
  onReorder: reorderExpCats,
  onColor: (it: { key: string }, color: string | null) =>
    setExpCat(it.key, { color }),
  columns: EXP_SECTIONS.map((x) => ({
    key: x.value,
    label: x.value === "cert" ? "자격" : x.label,
  })),
  isOn: (it: { key: string }, col: string) =>
    !!categories
      .find((c) => c.name === it.key)
      ?.sections.includes(col as ExpSection),
  onToggle: (it: { key: string }, col: string, on: boolean) => {
    const cur = categories.find((c) => c.name === it.key)!.sections;
    return setExpCat(it.key, {
      sections: on ? [...cur, col] : cur.filter((x) => x !== col),
    });
  },
  countLabel: "개",
  removeNote: "이 분류가 붙은 경험에서도 빠져요",
  onAdd: addExpCat,
  onRename: async (it: { key: string }, name: string) => {
    const r = await renameExpCat(it.key, name);
    if (r.ok) onRenamed?.(it.key, name);
    return r;
  },
  onRemove: async (it: { key: string }) => {
    const r = await removeExpCat(it.key);
    if (r.ok) onRemoved?.(it.key);
    return r;
  },
});
/** 분류 색으로 칠한 카드 배경·테두리(첫 번째로 색이 있는 분류) */
const tint = (hex: string | null | undefined) =>
  hex
    ? {
        background: `color-mix(in oklab, ${hex} 12%, var(--card))`,
        borderColor: `color-mix(in oklab, ${hex} 45%, var(--border))`,
      }
    : undefined;
const Dot = ({ hex }: { hex: string | null | undefined }) =>
  hex ? (
    <span
      className="inline-block size-2 shrink-0 rounded-full"
      style={{ background: hex }}
    />
  ) : null;

const chip = (on: boolean) =>
  cn(
    "rounded-full border px-3 py-1 text-sm max-md:min-h-10",
    on
      ? "border-primary bg-primary text-primary-foreground"
      : "hover:bg-accent",
  );

function Card({
  e,
  colors,
}: {
  e: Experience;
  colors: Map<string, string | null>;
}) {
  const period = periodLabel(e.startText, e.endText, e.ongoing);
  const color = e.categories.map((c) => colors.get(c)).find(Boolean);
  const sub = [e.organization !== e.title && e.organization, e.role]
    .filter(Boolean)
    .join(" · ");
  const lead = e.achievement || e.body;
  return (
    <li
      className="bg-card hover:border-primary/40 relative rounded-xl border p-3.5"
      style={tint(color)}
    >
      <Link
        href={`/career/exp/${e.id}`}
        className="absolute inset-0 rounded-xl"
        aria-label={`${e.title} 열기`}
      />
      <h3 className="font-semibold">{e.title}</h3>
      {(sub || period) && (
        <p className="text-muted-foreground text-sm">
          {sub}
          {sub && period && " · "}
          <span className="tabular-nums">{period}</span>
        </p>
      )}
      {e.score && <p className="mt-1 text-sm font-medium">{e.score}</p>}
      {lead && (
        <p className="mt-1 line-clamp-2 text-sm whitespace-pre-line">{lead}</p>
      )}
      {(e.categories.length > 1 || e.tags.length > 0) && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {e.categories.length > 1 &&
            e.categories.map((c) => (
              <Badge key={c} variant="secondary" className="gap-1 px-1.5">
                <Dot hex={colors.get(c)} />
                {c}
              </Badge>
            ))}
          {e.tags.slice(0, 4).map((t) => (
            <span key={t} className="text-link text-caption">
              #{t}
            </span>
          ))}
        </div>
      )}
    </li>
  );
}

export function ExperienceList({
  items,
  categories,
}: {
  items: Experience[];
  categories: Cat[];
}) {
  const [cat, setCat] = useState<string | null>(null);
  const colors = new Map(categories.map((c) => [c.name, c.color]));
  const [q, setQ] = useState("");
  const words = q.trim().toLowerCase();
  const found = items.filter(
    (e) =>
      !words ||
      [
        e.title,
        e.organization,
        e.role,
        e.body,
        e.achievement,
        e.learned,
        e.note,
        e.score,
        e.issuer,
        ...e.categories,
        ...e.tags,
        ...Object.values(e.star),
      ].some((t) => t?.toLowerCase().includes(words)),
  );
  const add = (
    <Button asChild>
      <Link href="/career/exp/new">
        <Plus /> 경험 추가
      </Link>
    </Button>
  );
  if (!items.length)
    return (
      <EmptyState
        pet="komong"
        title="지금까지의 경험을 정리해 보세요"
        description="활동·성과·배운 점을 적어 두면 이력서·자소서를 쓸 때 꺼내 쓰기 쉬워요."
        action={add}
      />
    );
  const groups = [
    ...categories
      .map((c) => c.name)
      .filter((c) => items.some((e) => e.categories.includes(c))),
    ...(items.some((e) => !e.categories.length) ? [NONE] : []),
  ];
  const inGroup = (g: string) =>
    found.filter((e) =>
      g === NONE ? !e.categories.length : e.categories.includes(g),
    );
  const grid = (list: Experience[]) => (
    <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {list.map((e) => (
        <Card key={e.id} e={e} colors={colors} />
      ))}
    </ul>
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1 md:max-w-xs">
          <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            aria-label="경험 검색"
            placeholder="경험명·내용·키워드로 찾기"
            className="pl-8"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <span className="ml-auto">{add}</span>
      </div>
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
        {[null, ...groups].map((g) => (
          <button
            key={g ?? "all"}
            type="button"
            aria-pressed={cat === g}
            onClick={() => setCat(g)}
            className={cn(
              "flex shrink-0 items-center gap-1.5",
              chip(cat === g),
            )}
          >
            {g && <Dot hex={colors.get(g)} />}
            {g ?? "전체"}{" "}
            <span className="opacity-70">
              {g ? inGroup(g).length : found.length}
            </span>
          </button>
        ))}
        {/* 분류 칩 줄 끝에 붙여 시선이 이어지게 */}
        <CategoryEditor {...catEditor(categories)} className="shrink-0" />
      </div>
      {cat
        ? grid(inGroup(cat))
        : groups.map((g) => {
            const list = inGroup(g);
            return (
              list.length > 0 && (
                <section key={g} className="space-y-2">
                  <h2 className="text-muted-foreground flex items-center gap-1.5 text-sm font-semibold">
                    <Dot hex={colors.get(g)} />
                    {g} {list.length}
                  </h2>
                  {grid(list)}
                </section>
              )
            );
          })}
      {!found.length && (
        <p className="text-muted-foreground py-8 text-center text-sm">
          맞는 경험이 없어요
        </p>
      )}
    </div>
  );
}

function Section({
  title,
  hint,
  open,
  children,
}: {
  title: string;
  hint?: string;
  open?: boolean;
  children: ReactNode;
}) {
  return (
    <Collapsible defaultOpen={open} className="rounded-xl border">
      <CollapsibleTrigger className="group flex w-full items-center gap-2 px-4 py-3 text-left">
        <span className="font-semibold">{title}</span>
        {hint && (
          <span className="text-muted-foreground text-caption">{hint}</span>
        )}
        <ChevronDown className="text-muted-foreground ml-auto size-4 transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-4 px-4 pb-4">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

const grow = "field-sizing-content min-h-20 leading-7";

export function ExperienceEditor({
  exp,
  categories,
}: {
  exp?: Experience;
  categories: Cat[];
}) {
  const router = useRouter();
  const [v, setV] = useState({
    title: exp?.title ?? "",
    categories: exp?.categories ?? [],
    organization: exp?.organization ?? "",
    role: exp?.role ?? "",
    startText: exp?.startText ?? "",
    endText: exp?.endText ?? "",
    ongoing: exp?.ongoing ?? false,
    body: exp?.body ?? "",
    achievement: exp?.achievement ?? "",
    learned: exp?.learned ?? "",
    tags: exp?.tags ?? [],
    star: { situation: "", task: "", action: "", result: "", ...exp?.star },
    score: exp?.score ?? "",
    issuer: exp?.issuer ?? "",
    certNo: exp?.certNo ?? "",
    validUntil: exp?.validUntil ?? "",
    note: exp?.note ?? "",
    links: exp?.links.length ? exp.links : [""],
  });
  const [newCat, setNewCat] = useState<string | null>(null);
  const [tagText, setTagText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const key = useRef(crypto.randomUUID());
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) =>
    setV((s) => ({ ...s, [k]: val }));
  const options = [
    ...new Set([...categories.map((c) => c.name), ...v.categories]),
  ];
  const toggle = (c: string) =>
    set(
      "categories",
      v.categories.includes(c)
        ? v.categories.filter((x) => x !== c)
        : [...v.categories, c],
    );
  // 분류에 따라 보일 칸(분류 편집에서 고침). 분류가 없거나 "다른 칸 보기"면 다, 값이 있는 칸은 늘 보임
  const colors = new Map(categories.map((c) => [c.name, c.color]));
  const conf = new Map(categories.map((c) => [c.name, c.sections]));
  const want = new Set<ExpSection>(
    v.categories.length
      ? v.categories.flatMap((c) => conf.get(c) ?? defaultSections(c))
      : EXP_SECTIONS.map((x) => x.value),
  );
  const hasStar = Object.values(v.star).some((x) => x.trim());
  const filled: Record<ExpSection, boolean> = {
    content: !!(
      v.body.trim() ||
      v.achievement.trim() ||
      v.learned.trim() ||
      v.tags.length
    ),
    star: hasStar,
    cert: !!(v.score || v.issuer || v.certNo || v.validUntil),
  };
  const [showAll, setShowAll] = useState(false);
  const shown = (s: ExpSection) => showAll || want.has(s) || filled[s];
  const hidden = EXP_SECTIONS.filter((x) => !shown(x.value));
  const isCert = want.has("cert") || filled.cert;

  function addCat() {
    const c = newCat?.trim();
    if (c && !v.categories.includes(c))
      set("categories", [...v.categories, c].slice(0, 10));
    setNewCat(null);
  }
  function addTag(raw: string) {
    const t = raw.trim().replace(/^#/, "");
    if (t && !v.tags.includes(t)) set("tags", [...v.tags, t].slice(0, 20));
    setTagText("");
  }
  async function save() {
    setBusy(true);
    setError("");
    const trim = (s: string) => s.trim() || null;
    const input = {
      ...v,
      organization: trim(v.organization),
      role: trim(v.role),
      startText: trim(v.startText),
      endText: v.ongoing ? null : trim(v.endText),
      achievement: trim(v.achievement),
      learned: trim(v.learned),
      score: trim(v.score),
      issuer: trim(v.issuer),
      certNo: trim(v.certNo),
      validUntil: trim(v.validUntil),
      note: trim(v.note),
      links: v.links.map((l) => l.trim()).filter(Boolean),
    };
    const r = exp
      ? await editExperience(exp.id, exp.version, input)
      : await addExperience(key.current, input);
    setBusy(false);
    if (!r.ok)
      return setError(
        r.error.code === "VERSION_CONFLICT"
          ? "다른 기기에서 먼저 수정했어요. 새로 고침해 주세요"
          : (r.error.fields?.[0]?.message ?? r.error.message),
      );
    router.push("/career");
    router.refresh();
  }
  async function remove() {
    if (!exp) return;
    await deleteExperience(exp.id);
    router.replace("/career"); // refresh를 붙이면 지운 경험 주소를 다시 불러와 404(일기 삭제와 같은 문제)
    toastDone("휴지통으로 옮겼어요");
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-4 md:px-8 md:py-6">
      <Link
        href="/career"
        className="text-muted-foreground hover:text-foreground -ml-2 inline-flex h-10 items-center gap-1 px-2 text-sm"
      >
        <ChevronLeft className="size-4" />
        경험 정리
      </Link>
      <Input
        aria-label="경험명"
        placeholder="경험명을 입력하세요"
        maxLength={100}
        autoFocus={!exp}
        className="focus-visible:border-primary h-12 rounded-none border-0 border-b px-0 text-title font-semibold shadow-none placeholder:font-normal md:text-title focus-visible:ring-0"
        value={v.title}
        onChange={(e) => set("title", e.target.value)}
      />

      <Section title="기본" open>
        <Field>
          <FieldLabel>분류</FieldLabel>
          <div
            className="flex flex-wrap gap-1.5"
            role="group"
            aria-label="분류(여러 개)"
          >
            {options.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={v.categories.includes(c)}
                onClick={() => toggle(c)}
                className={cn(
                  "flex items-center gap-1.5",
                  chip(v.categories.includes(c)),
                )}
              >
                {!v.categories.includes(c) && <Dot hex={colors.get(c)} />}
                {c}
              </button>
            ))}
            {newCat === null ? (
              <button
                type="button"
                onClick={() => setNewCat("")}
                className="text-muted-foreground hover:bg-accent flex items-center gap-1 rounded-full border border-dashed px-3 py-1 text-sm max-md:min-h-10"
              >
                <Plus className="size-3.5" /> 새 분류
              </button>
            ) : (
              <Input
                autoFocus
                aria-label="새 분류 이름"
                placeholder="이름을 입력하세요"
                maxLength={20}
                className="h-8 w-32 max-md:h-10"
                value={newCat}
                onChange={(e) => setNewCat(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCat();
                  }
                }}
                onBlur={addCat}
              />
            )}
            {/* 분류 칩 줄 끝: 순서·이름·색·보일 칸 */}
            <CategoryEditor
              {...catEditor(
                categories,
                (from, to) =>
                  set(
                    "categories",
                    v.categories.map((x) => (x === from ? to : x)),
                  ),
                (name) =>
                  set(
                    "categories",
                    v.categories.filter((x) => x !== name),
                  ),
              )}
            />
          </div>
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="ex-org">기관·소속</FieldLabel>
            <Input
              id="ex-org"
              maxLength={60}
              placeholder="회사·학교·단체"
              value={v.organization}
              onChange={(e) => set("organization", e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="ex-role">역할·직무</FieldLabel>
            <Input
              id="ex-role"
              maxLength={60}
              placeholder="역할·직무를 입력하세요"
              value={v.role}
              onChange={(e) => set("role", e.target.value)}
            />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="ex-start">기간</FieldLabel>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <div className="flex min-w-0 flex-1 items-center gap-2 sm:max-w-sm">
              <Input
                id="ex-start"
                inputMode="numeric"
                placeholder="시작한 날"
                className="min-w-0 flex-1"
                value={v.startText}
                onChange={(e) => set("startText", e.target.value)}
              />
              {/* 진행 중이면 끝난 날 칸은 숨김(값은 남겨 둠, 저장할 땐 비움) */}
              {!v.ongoing && (
                <>
                  <span className="text-muted-foreground">~</span>
                  <Input
                    aria-label="끝난 날"
                    inputMode="numeric"
                    placeholder="끝난 날"
                    className="min-w-0 flex-1"
                    value={v.endText}
                    onChange={(e) => set("endText", e.target.value)}
                  />
                </>
              )}
            </div>
            <label className="flex items-center gap-1.5 text-sm">
              <Checkbox
                checked={v.ongoing}
                onCheckedChange={(c) => set("ongoing", c === true)}
              />{" "}
              진행 중
            </label>
          </div>
          <FieldDescription>
            2024.06처럼 달까지만 써도 돼요. 하루짜리(시험·수상)는 끝난 날을 비워
            두세요
          </FieldDescription>
        </Field>
      </Section>

      {shown("content") && (
        <Section title="내용" open>
          <Field>
            <FieldLabel htmlFor="ex-body">주요 활동·업무</FieldLabel>
            <Textarea
              id="ex-body"
              maxLength={50_000}
              className={cn(grow, "min-h-28")}
              placeholder="무엇을 맡아 어떻게 했는지"
              value={v.body}
              onChange={(e) => set("body", e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="ex-ach">성과·결과</FieldLabel>
            <Textarea
              id="ex-ach"
              maxLength={5000}
              className={grow}
              placeholder="성과·결과를 입력하세요"
              value={v.achievement}
              onChange={(e) => set("achievement", e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="ex-learn">배운 점·느낀 점</FieldLabel>
            <Textarea
              id="ex-learn"
              maxLength={5000}
              className={grow}
              value={v.learned}
              onChange={(e) => set("learned", e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="ex-tags">역량 키워드</FieldLabel>
            <div className="flex flex-wrap items-center gap-1.5 rounded-md border px-2 py-1.5">
              {v.tags.map((t) => (
                <span
                  key={t}
                  className="bg-accent flex items-center gap-1 rounded-full px-2 py-0.5 text-sm"
                >
                  #{t}
                  <button
                    type="button"
                    aria-label={`${t} 빼기`}
                    onClick={() =>
                      set(
                        "tags",
                        v.tags.filter((x) => x !== t),
                      )
                    }
                  >
                    <X className="size-3.5" />
                  </button>
                </span>
              ))}
              <input
                id="ex-tags"
                className="min-w-32 flex-1 bg-transparent py-1 text-sm outline-none"
                placeholder="입력 후 Enter"
                maxLength={20}
                value={tagText}
                onChange={(e) =>
                  e.target.value.endsWith(",")
                    ? addTag(e.target.value.slice(0, -1))
                    : setTagText(e.target.value)
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag(tagText);
                  }
                  if (e.key === "Backspace" && !tagText && v.tags.length)
                    set("tags", v.tags.slice(0, -1));
                }}
                onBlur={() => tagText && addTag(tagText)}
              />
            </div>
          </Field>
        </Section>
      )}

      {shown("star") && (
        <Section
          title="STAR로 정리"
          hint="자기소개서·면접 답변용"
          open={hasStar}
        >
          {(
            [
              ["situation", "상황 (Situation)", "어떤 상황·배경이었나요?"],
              ["task", "과제 (Task)", "해결해야 했던 문제·목표는?"],
              ["action", "행동 (Action)", "내가 구체적으로 한 일은?"],
              ["result", "결과 (Result)", "어떤 결과가 나왔나요?"],
            ] as const
          ).map(([k, label, ph]) => (
            <Field key={k}>
              <FieldLabel htmlFor={`ex-star-${k}`}>{label}</FieldLabel>
              <Textarea
                id={`ex-star-${k}`}
                maxLength={5000}
                className={grow}
                placeholder={ph}
                value={v.star[k]}
                onChange={(e) =>
                  set("star", { ...v.star, [k]: e.target.value })
                }
              />
            </Field>
          ))}
        </Section>
      )}

      {/* 자격증·어학 분류를 고르면 펼쳐지도록 다시 그림(칸 값은 위 상태에 있어 그대로) */}
      {shown("cert") && (
        <Section
          key={String(isCert)}
          title="자격·점수"
          hint="자격증·어학 시험"
          open={isCert}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="ex-score">점수·등급</FieldLabel>
              <Input
                id="ex-score"
                maxLength={60}
                placeholder="점수·등급을 입력하세요"
                value={v.score}
                onChange={(e) => set("score", e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="ex-issuer">발급 기관</FieldLabel>
              <Input
                id="ex-issuer"
                maxLength={60}
                placeholder="발급 기관을 입력하세요"
                value={v.issuer}
                onChange={(e) => set("issuer", e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="ex-certno">자격·수험 번호</FieldLabel>
              <Input
                id="ex-certno"
                maxLength={60}
                value={v.certNo}
                onChange={(e) => set("certNo", e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="ex-valid">유효기간(까지)</FieldLabel>
              <Input
                id="ex-valid"
                inputMode="numeric"
                placeholder="날짜를 입력하세요"
                value={v.validUntil}
                onChange={(e) => set("validUntil", e.target.value)}
              />
            </Field>
          </div>
        </Section>
      )}

      <Section title="비고·링크" open={!!v.note || v.links.some(Boolean)}>
        <Field>
          <FieldLabel htmlFor="ex-note">비고</FieldLabel>
          <Textarea
            id="ex-note"
            maxLength={2000}
            className={grow}
            placeholder="그 밖에 남겨 둘 것"
            value={v.note}
            onChange={(e) => set("note", e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="ex-link-0">참고 링크</FieldLabel>
          {v.links.map((l, i) => (
            <div key={i} className="flex gap-1">
              <Input
                id={`ex-link-${i}`}
                type="url"
                inputMode="url"
                placeholder="결과물·증명서·기사 주소"
                value={l}
                onChange={(e) =>
                  set(
                    "links",
                    v.links.map((x, j) => (j === i ? e.target.value : x)),
                  )
                }
              />
              {l && /^https?:\/\//.test(l) && (
                <Button asChild variant="ghost" size="icon" aria-label="열기">
                  <a href={l} target="_blank" rel="noreferrer noopener">
                    <ExternalLink />
                  </a>
                </Button>
              )}
              {v.links.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="링크 빼기"
                  onClick={() =>
                    set(
                      "links",
                      v.links.filter((_, j) => j !== i),
                    )
                  }
                >
                  <X />
                </Button>
              )}
            </div>
          ))}
          {v.links.length < 10 && (
            <div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="-ml-2"
                onClick={() => set("links", [...v.links, ""])}
              >
                <Plus /> 링크 추가
              </Button>
            </div>
          )}
        </Field>
      </Section>
      {hidden.length > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="text-muted-foreground hover:text-foreground text-sm"
        >
          <Plus className="mr-1 inline size-3.5" />
          다른 칸도 쓰기 ({hidden.map((x) => x.label).join(" · ")})
        </button>
      )}

      {error && <FieldError>{error}</FieldError>}
      <div
        data-pet-avoid
        className="bg-background/95 sticky bottom-0 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex gap-2 border-t py-3 backdrop-blur"
      >
        {exp && (
          <Button
            variant="ghost"
            className="text-destructive-text"
            onClick={remove}
          >
            삭제
          </Button>
        )}
        <Button variant="outline" className="ml-auto" asChild>
          <Link href="/career">취소</Link>
        </Button>
        <Button disabled={!v.title.trim() || busy} onClick={save}>
          {busy && <Spinner />} 저장
        </Button>
      </div>
    </div>
  );
}
