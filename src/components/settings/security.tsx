"use client";

// 보안 기록 목록 (SCR-SET-10): 시각 · 무엇 · 기기. 50개씩 더 보기
import { useState } from "react";
import { moreSecurityLog } from "@/app/actions/trash";
import { Button } from "@/components/ui/button";
import { timeLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SecurityEntry } from "@/server/security";

const at = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} ${timeLabel(d)}`;
};

export function SecurityList({ first }: { first: SecurityEntry[] }) {
  const [list, setList] = useState(first);
  const [more, setMore] = useState(first.length === 50);
  async function load() {
    const r = await moreSecurityLog(list.at(-1)!.at);
    if (!r.ok) return;
    setList((l) => [...l, ...r.data]);
    setMore(r.data.length === 50);
  }
  if (!list.length) return <p className="text-muted-foreground py-8 text-center text-sm">아직 기록이 없어요</p>;
  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">로그인·비밀번호 변경·영구 삭제 같은 일을 기록해요. 위치는 모으지 않아요.</p>
      <ul className="divide-y rounded-lg border">
        {list.map((e) => (
          <li key={e.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
            <span className="text-muted-foreground w-36 shrink-0 tabular-nums">{at(e.at)}</span>
            <span className={cn("min-w-0 flex-1", e.failed && "text-destructive-text")}>
              {e.label}
              {e.detail && <span className="text-muted-foreground"> · {e.detail}</span>}
            </span>
            <span className="text-muted-foreground shrink-0 text-caption">{e.device ?? ""}</span>
          </li>
        ))}
      </ul>
      {more && (
        <Button variant="outline" size="sm" onClick={load}>
          더 보기
        </Button>
      )}
    </div>
  );
}
