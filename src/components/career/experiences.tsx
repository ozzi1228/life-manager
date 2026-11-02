"use client";

// 커리어 · 경험 정리: 목록(유형·태그·검색으로 거르기) + 쓰기·고치기(전체 화면, 일기처럼)
// 본문은 마크다운 글자 그대로. "STAR 틀 넣기"로 상황·과제·행동·결과 머리말을 넣어 줌
import { ExternalLink, Plus, Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { addExperience, deleteExperience, editExperience, restoreExperience } from "@/app/actions/career";
import { EmptyState, toastUndo } from "@/components/app/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { EXP_TYPES, expTypeLabel, periodLabel, type ExpType } from "@/lib/career";
import { cn } from "@/lib/utils";
import type { Experience } from "@/server/career";

const STAR = "## 상황 (Situation)\n\n\n## 과제 (Task)\n\n\n## 행동 (Action)\n\n\n## 결과 (Result)\n\n";

export function ExperienceList({ items }: { items: Experience[] }) {
  const [type, setType] = useState<"all" | ExpType>("all");
  const [tag, setTag] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const words = q.trim().toLowerCase();
  const shown = items.filter(
    (e) => (type === "all" || e.type === type) && (!tag || e.tags.includes(tag)) && (!words || [e.title, e.organization, e.role, e.summary, e.body, ...e.tags].some((t) => t?.toLowerCase().includes(words))),
  );
  const add = (
    <Button asChild>
      <Link href="/career/exp/new">
        <Plus /> 경험 추가
      </Link>
    </Button>
  );
  if (!items.length) return <EmptyState pet="komong" title="지금까지의 경험을 정리해 보세요" description="프로젝트·업무·활동을 하나씩 적어 두면 이력서·자소서를 쓸 때 꺼내 쓸 수 있어요." action={add} />;
  const usedTypes = EXP_TYPES.filter((t) => items.some((e) => e.type === t.value));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1 md:max-w-xs">
          <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input aria-label="경험 검색" placeholder="제목·내용·태그로 찾기" className="pl-8" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <span className="ml-auto">{add}</span>
      </div>
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
        {[{ value: "all", label: "전체" } as const, ...usedTypes].map((t) => (
          <button
            key={t.value}
            type="button"
            aria-pressed={type === t.value}
            onClick={() => setType(t.value)}
            className={cn("shrink-0 rounded-full border px-3 py-1 text-sm", type === t.value ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent")}
          >
            {t.label} <span className="opacity-70">{t.value === "all" ? items.length : items.filter((e) => e.type === t.value).length}</span>
          </button>
        ))}
        {tag && (
          <button type="button" onClick={() => setTag(null)} className="bg-accent flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-sm">
            #{tag} <X className="size-3.5" />
          </button>
        )}
      </div>
      {shown.length ? (
        <ul className="grid gap-3 md:grid-cols-2">
          {shown.map((e) => (
            <li key={e.id} className="bg-card hover:border-primary/40 relative rounded-xl border p-4">
              <Link href={`/career/exp/${e.id}`} className="absolute inset-0 rounded-xl" aria-label={`${e.title} 열기`} />
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{expTypeLabel(e.type)}</Badge>
                <span className="text-muted-foreground text-caption tabular-nums">{periodLabel(e.startMonth, e.endMonth)}</span>
              </div>
              <h3 className="mt-1.5 font-semibold">{e.title}</h3>
              {(e.organization || e.role) && <p className="text-muted-foreground text-sm">{[e.organization, e.role].filter(Boolean).join(" · ")}</p>}
              {e.summary && <p className="mt-1 line-clamp-2 text-sm">{e.summary}</p>}
              {e.tags.length > 0 && (
                <div className="relative mt-2 flex flex-wrap gap-1">
                  {e.tags.map((t) => (
                    <button key={t} type="button" onClick={() => setTag(t)} className="text-link hover:bg-accent rounded px-1 text-caption">
                      #{t}
                    </button>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground py-8 text-center text-sm">맞는 경험이 없어요</p>
      )}
    </div>
  );
}

export function ExperienceEditor({ exp }: { exp?: Experience }) {
  const router = useRouter();
  const [v, setV] = useState({
    title: exp?.title ?? "",
    type: (exp?.type ?? "project") as ExpType,
    organization: exp?.organization ?? "",
    role: exp?.role ?? "",
    startMonth: exp?.startMonth ?? "",
    endMonth: exp?.endMonth ?? "",
    tags: exp?.tags ?? [],
    summary: exp?.summary ?? "",
    body: exp?.body ?? "",
    links: exp?.links.length ? exp.links : [""],
  });
  const [tagText, setTagText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const key = useRef(crypto.randomUUID());
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((s) => ({ ...s, [k]: val }));

  function addTag(raw: string) {
    const t = raw.trim().replace(/^#/, "");
    if (t && !v.tags.includes(t)) set("tags", [...v.tags, t].slice(0, 20));
    setTagText("");
  }
  async function save() {
    setBusy(true);
    setError("");
    const input = { ...v, organization: v.organization.trim() || null, role: v.role.trim() || null, startMonth: v.startMonth || null, endMonth: v.endMonth || null, summary: v.summary.trim() || null, links: v.links.map((l) => l.trim()).filter(Boolean) };
    const r = exp ? await editExperience(exp.id, exp.version, input) : await addExperience(key.current, input);
    setBusy(false);
    if (!r.ok) return setError(r.error.code === "VERSION_CONFLICT" ? "다른 기기에서 먼저 수정했어요. 새로 고침해 주세요" : (r.error.fields?.[0]?.message ?? r.error.message));
    toast(exp ? "고쳤어요" : "경험을 기록했어요");
    router.push("/career");
    router.refresh();
  }
  async function remove() {
    if (!exp) return;
    await deleteExperience(exp.id);
    router.push("/career");
    router.refresh();
    toastUndo("휴지통으로 옮겼어요", async () => {
      await restoreExperience(exp.id);
      router.refresh();
    });
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-4 md:px-8 md:py-6">
      <Input aria-label="제목" placeholder="경험 제목 (예: 결제 시스템 개편 프로젝트)" maxLength={100} autoFocus={!exp} className="h-12 border-0 px-0 text-title font-semibold shadow-none focus-visible:ring-0" value={v.title} onChange={(e) => set("title", e.target.value)} />
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="유형">
        {EXP_TYPES.map((t) => (
          <button key={t.value} type="button" role="radio" aria-checked={v.type === t.value} onClick={() => set("type", t.value)} className={cn("rounded-full border px-3 py-1 text-sm", v.type === t.value ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent")}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="ex-org">소속</FieldLabel>
          <Input id="ex-org" maxLength={60} placeholder="회사·학교·단체" value={v.organization} onChange={(e) => set("organization", e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="ex-role">역할</FieldLabel>
          <Input id="ex-role" maxLength={60} placeholder="예: 백엔드 개발, 팀장" value={v.role} onChange={(e) => set("role", e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="ex-start">시작한 달</FieldLabel>
          <Input id="ex-start" type="month" value={v.startMonth} onChange={(e) => set("startMonth", e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="ex-end">끝난 달 (비우면 진행 중)</FieldLabel>
          <Input id="ex-end" type="month" value={v.endMonth} onChange={(e) => set("endMonth", e.target.value)} />
        </Field>
      </div>
      <Field>
        <FieldLabel htmlFor="ex-tags">역량·키워드</FieldLabel>
        <div className="flex flex-wrap items-center gap-1.5 rounded-md border px-2 py-1.5">
          {v.tags.map((t) => (
            <span key={t} className="bg-accent flex items-center gap-1 rounded-full px-2 py-0.5 text-sm">
              #{t}
              <button type="button" aria-label={`${t} 빼기`} onClick={() => set("tags", v.tags.filter((x) => x !== t))}>
                <X className="size-3.5" />
              </button>
            </span>
          ))}
          <input
            id="ex-tags"
            className="min-w-32 flex-1 bg-transparent py-1 text-sm outline-none"
            placeholder="입력 후 Enter (예: 협업, Python)"
            maxLength={20}
            value={tagText}
            onChange={(e) => (e.target.value.endsWith(",") ? addTag(e.target.value.slice(0, -1)) : setTagText(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag(tagText);
              }
              if (e.key === "Backspace" && !tagText && v.tags.length) set("tags", v.tags.slice(0, -1));
            }}
            onBlur={() => tagText && addTag(tagText)}
          />
        </div>
      </Field>
      <Field>
        <FieldLabel htmlFor="ex-sum">한 줄 요약</FieldLabel>
        <Input id="ex-sum" maxLength={200} placeholder="예: 결제 실패율을 3%에서 0.5%로 낮춤" value={v.summary} onChange={(e) => set("summary", e.target.value)} />
      </Field>
      <Field>
        <div className="flex items-center">
          <FieldLabel htmlFor="ex-body">내용</FieldLabel>
          {!v.body.includes("## 상황") && (
            <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={() => set("body", v.body ? `${v.body}\n\n${STAR}` : STAR)}>
              STAR 틀 넣기
            </Button>
          )}
        </div>
        <Textarea id="ex-body" maxLength={50_000} className="min-h-[40vh] leading-7" placeholder="무엇을, 왜, 어떻게 했고 결과가 어땠는지 자유롭게 적어 보세요" value={v.body} onChange={(e) => set("body", e.target.value)} />
      </Field>
      <Field>
        <FieldLabel htmlFor="ex-link-0">참고 링크</FieldLabel>
        {v.links.map((l, i) => (
          <div key={i} className="flex gap-1">
            <Input id={`ex-link-${i}`} type="url" inputMode="url" placeholder="결과물·기사·저장소 주소" value={l} onChange={(e) => set("links", v.links.map((x, j) => (j === i ? e.target.value : x)))} />
            {l && /^https?:\/\//.test(l) && (
              <Button asChild variant="ghost" size="icon" aria-label="열기">
                <a href={l} target="_blank" rel="noreferrer noopener">
                  <ExternalLink />
                </a>
              </Button>
            )}
            {v.links.length > 1 && (
              <Button type="button" variant="ghost" size="icon" aria-label="링크 빼기" onClick={() => set("links", v.links.filter((_, j) => j !== i))}>
                <X />
              </Button>
            )}
          </div>
        ))}
        {v.links.length < 10 && (
          <div>
            <Button type="button" variant="ghost" size="sm" className="-ml-2" onClick={() => set("links", [...v.links, ""])}>
              <Plus /> 링크 추가
            </Button>
          </div>
        )}
      </Field>
      {error && <FieldError>{error}</FieldError>}
      <div className="bg-background/95 sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] flex gap-2 border-t py-3 backdrop-blur md:bottom-0">
        {exp && (
          <Button variant="ghost" className="text-destructive-text" onClick={remove}>
            삭제
          </Button>
        )}
        <Button variant="outline" className="ml-auto" onClick={() => router.back()}>
          취소
        </Button>
        <Button disabled={!v.title.trim() || busy} onClick={save}>
          {busy && <Spinner />} 저장
        </Button>
      </div>
    </div>
  );
}
