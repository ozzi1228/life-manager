// 전체 검색(상단 돋보기 → /search): 일기·일정·수입·지출·목표·기간 메모·위시·커리어에서 한 번에
// 건강 기록은 암호화해 두고 검색·AI에 안 보이기로 했으므로 넣지 않음(health.tsx 안내 문구)
// ponytail: 종류마다 ILIKE로 최근 것 몇 개씩. 기록이 아주 많아지면 pg_trgm 인덱스로
import { desc, ilike, or, sql } from "drizzle-orm";
import { careerExperiences, events, goals, journalEntries, periodNotes, transactions, wishItems } from "../db/schema.ts";
import { textOnly } from "../lib/journal-body.ts";
import { noteText } from "../lib/rich-note.ts";
import { eventRepo, noteRepo } from "./calendar.ts";
import { expRepo } from "./career.ts";
import { txRepo } from "./finance.ts";
import { goalRepo } from "./goals.ts";
import { entryRepo } from "./journal.ts";
import type { Ctx } from "./repo.ts";
import { likePattern } from "./validate.ts";
import { wishRepo } from "./wish.ts";

export type Hit = { id: string; title: string; sub: string; snippet: string; href: string };
export type Group = { key: string; label: string; hits: Hit[]; more?: string };

const PER = 8;

/** 찾은 말 앞뒤로 조금(본문이 길 때) */
function around(text: string, q: string, n = 40) {
  const flat = text.replace(/\s+/g, " ").trim();
  const i = flat.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return flat.slice(0, n * 2);
  const a = Math.max(0, i - n);
  return `${a > 0 ? "…" : ""}${flat.slice(a, i + q.length + n)}${i + q.length + n < flat.length ? "…" : ""}`;
}

const NOTE_SCOPE = { year: "연", month: "월", week: "주", day: "일", all: "전체" } as const;
const noteDate = (scope: string, key: string) => (scope === "year" ? `${key}-01-01` : scope === "month" ? `${key}-01` : key);
const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

export async function searchAll(ctx: Ctx, raw: string): Promise<Group[]> {
  const q = raw.trim().slice(0, 60);
  if (!q) return [];
  const like = likePattern(q);
  const [journal, cal, tx, goal, notes, wish, career] = await Promise.all([
    entryRepo.list(ctx, { where: or(ilike(journalEntries.title, like), ilike(journalEntries.bodyMd, like)), orderBy: [sql`${journalEntries.date} desc nulls first`, desc(journalEntries.createdAt)], limit: PER + 1 }),
    eventRepo.list(ctx, { where: or(ilike(events.title, like), ilike(events.location, like), ilike(events.memo, like)), orderBy: [desc(events.startDate)], limit: PER + 1 }),
    txRepo.list(ctx, { where: or(ilike(transactions.title, like), ilike(transactions.memo, like), sql`array_to_string(${transactions.tags}, ' ') ilike ${like}`), orderBy: [desc(transactions.date), desc(transactions.createdAt)], limit: PER + 1 }),
    goalRepo.list(ctx, { where: or(ilike(goals.title, like), ilike(goals.memo, like)), orderBy: [desc(goals.createdAt)], limit: PER + 1 }),
    noteRepo.list(ctx, { where: ilike(periodNotes.body, like), orderBy: [desc(periodNotes.updatedAt)], limit: PER + 1 }),
    wishRepo.list(ctx, { where: or(ilike(wishItems.name, like), ilike(wishItems.seenWhere, like)), orderBy: [desc(wishItems.createdAt)], limit: PER + 1 }),
    expRepo.list(ctx, {
      where: or(
        ilike(careerExperiences.title, like),
        ilike(careerExperiences.organization, like),
        ilike(careerExperiences.role, like),
        ilike(careerExperiences.body, like),
        ilike(careerExperiences.achievement, like),
        ilike(careerExperiences.learned, like),
        sql`array_to_string(${careerExperiences.tags}, ' ') ilike ${like}`,
      ),
      orderBy: [desc(careerExperiences.periodStart)],
      limit: PER + 1,
    }),
  ]);
  const enc = encodeURIComponent(q);
  const groups: Group[] = [
    {
      key: "journal",
      label: "일기",
      more: journal.length > PER ? `/records?q=${enc}` : undefined,
      hits: journal.map((e) => {
        const text = textOnly(e.bodyMd);
        return { id: e.id, title: e.title || text.split("\n")[0].slice(0, 40) || "사진", sub: e.date ?? "날짜 없음", snippet: around(text, q), href: `/records/journal/${e.id}` };
      }),
    },
    {
      key: "calendar",
      label: "일정",
      hits: cal.map((e) => ({ id: e.id, title: e.title, sub: `${e.startDate}${e.startTime ? ` ${e.startTime}` : ""}${e.rrule ? " · 반복" : ""}`, snippet: around([e.location, e.memo].filter(Boolean).join(" · "), q), href: `/calendar?view=day&date=${e.startDate}` })),
    },
    {
      key: "money",
      label: "수입·지출",
      more: tx.length > PER ? `/money/expenses?q=${enc}&period=all` : undefined,
      hits: tx.map((t) => ({ id: t.id, title: t.title || t.memo || "내역", sub: `${t.date} · ${t.type === "income" ? "+" : "-"}${won(t.amount)}`, snippet: around([t.memo, t.tags.map((x) => `#${x}`).join(" ")].filter(Boolean).join(" "), q), href: `/money/expenses?q=${enc}&period=all` })),
    },
    {
      key: "goals",
      label: "목표",
      hits: goal.map((g) => ({
        id: g.id,
        title: g.title,
        sub: [g.periodKey ?? (g.startYear ? (g.startYear === g.endYear ? `${g.startYear}년` : `${g.startYear}~${g.endYear}년`) : "기간 없음"), g.status === "done" ? "달성" : g.status === "active" ? "" : "멈춤"].filter(Boolean).join(" · "),
        snippet: around(g.memo ?? "", q),
        href: g.periodScope ? `/goals/${g.periodScope}?p=${g.periodKey}` : "/goals/list",
      })),
    },
    {
      key: "notes",
      label: "일정 메모",
      hits: notes.map((n) => ({
        id: n.id,
        title: n.scope === "all" ? "전체 메모" : `${NOTE_SCOPE[n.scope]} 메모 · ${n.periodKey}`,
        sub: "",
        snippet: around(noteText(n.body), q),
        href: n.scope === "all" ? "/calendar" : `/calendar?view=${n.scope}&date=${noteDate(n.scope, n.periodKey)}`,
      })),
    },
    {
      key: "wish",
      label: "위시",
      hits: wish.map((w) => ({ id: w.id, title: w.name, sub: w.kind === "media" ? "작품" : "물건", snippet: around(w.seenWhere ?? "", q), href: `/wish?q=${enc}` })),
    },
    {
      key: "career",
      label: "커리어",
      hits: career.map((c) => ({ id: c.id, title: c.title, sub: [c.organization, c.startText].filter(Boolean).join(" · "), snippet: around([c.role, c.body, c.achievement, c.learned].filter(Boolean).join(" "), q), href: `/career/exp/${c.id}` })),
    },
  ];
  return groups.map((g) => ({ ...g, hits: g.hits.slice(0, PER) })).filter((g) => g.hits.length);
}
