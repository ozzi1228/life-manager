"use client";

// 상태별 공통 화면 (docs/planning/03 §10): 빈 화면, 늦게 뜨는 Skeleton, 되돌리기 토스트
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

/** 빈 화면: 펫 그림(작게) + 한 줄 + 행동 버튼 하나 */
export function EmptyState({ title, description, action, pet = "meongi" }: { title: ReactNode; description?: ReactNode; action?: ReactNode; pet?: string }) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia>
          {/* eslint-disable-next-line @next/next/no-img-element -- 작은 장식 그림(정적 파일) */}
          <img src={`/pets/${pet}/idle.png`} alt="" width={64} height={64} />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  );
}

/** 300ms 넘게 걸릴 때만 보임(빠른 로딩에서 Skeleton이 깜빡이지 않게) */
export function Delayed({ children, ms = 300 }: { children: ReactNode; ms?: number }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), ms);
    return () => clearTimeout(t);
  }, [ms]);
  return show ? <>{children}</> : null;
}

/** "휴지통으로 옮겼어요 · 되돌리기" (최소 5초 보임) */
export function toastUndo(message: string, undo: () => void) {
  toast(message, { duration: 6000, action: { label: "되돌리기", onClick: undo } });
}
