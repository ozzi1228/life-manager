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

/** 지우기·고치기 알림. 되돌리기는 팝업 대신 사이드바 아래 작업 기록에서(D-077) */
export function toastDone(message: string) {
  toast(message, { description: "작업 기록에서 되돌릴 수 있어요" });
}
