"use client";

// 도움말 컴포넌트 (docs/planning/03 §7.2)
// - InfoTip(i): 용어·조건 설명 2~5줄. PC는 호버(300ms) 또는 클릭, 터치는 탭
// - HowToTip(?): 사용 방법 3단계 이하. 호버로 열지 않음(읽는 데 시간이 필요)
// - GuideDialog: 학습형 긴 설명. PC Dialog lg / 모바일 Drawer
// - FirstTimeHint: 처음 한 번만 뜨는 안내. 본 기록은 계정 설정에(HintsProvider가 목록을 받음)
import { CircleHelp, Info } from "lucide-react";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { markHintSeen } from "@/app/actions/settings";
import { ResponsiveModal } from "@/components/app/responsive";
import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const canHover = () => typeof window !== "undefined" && matchMedia("(hover: hover) and (pointer: fine)").matches;

/** label: 설명하는 대상(스크린리더는 "<label> 설명") */
export function InfoTip({ label, title, children, more }: { label: string; title?: string; children: ReactNode; more?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hover = (on: boolean) => {
    if (!canHover()) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(on), on ? 300 : 150);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${label} 설명`}
          className="text-muted-foreground hover:text-foreground inline-flex size-8 items-center justify-center rounded-full align-middle max-md:-m-1.5 max-md:size-11"
          onPointerEnter={() => hover(true)}
          onPointerLeave={() => hover(false)}
        >
          <Info className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-1 text-sm break-keep" onPointerEnter={() => hover(true)} onPointerLeave={() => hover(false)}>
        {title && <p className="font-semibold">{title}</p>}
        <div className="text-muted-foreground space-y-1">{children}</div>
        {more}
      </PopoverContent>
    </Popover>
  );
}

export function HowToTip({ label, steps, more }: { label: string; steps: string[]; more?: ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${label} 사용 방법`}
          className="text-muted-foreground hover:text-foreground inline-flex size-8 items-center justify-center rounded-full align-middle max-md:-m-1.5 max-md:size-11"
        >
          <CircleHelp className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 text-sm break-keep">
        <ol className="list-decimal space-y-1 pl-5">
          {steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        {more}
      </PopoverContent>
    </Popover>
  );
}

export function GuideDialog({ open, onOpenChange, title, children }: { open: boolean; onOpenChange: (o: boolean) => void; title: ReactNode; children: ReactNode }) {
  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title={title} size="lg">
      <div className="space-y-4 text-sm leading-6">{children}</div>
    </ResponsiveModal>
  );
}

const Hints = createContext<{ seen: Set<string>; mark: (id: string) => void } | null>(null);

/** 앱 셸이 로그인 사용자의 본 안내 목록으로 감쌈 */
export function HintsProvider({ seen, children }: { seen: string[]; children: ReactNode }) {
  const [set, setSet] = useState(() => new Set(seen));
  const mark = (id: string) => {
    setSet((s) => new Set(s).add(id));
    markHintSeen(id);
  };
  return <Hints.Provider value={{ seen: set, mark }}>{children}</Hints.Provider>;
}

/** children(가리킬 요소) 옆에 처음 한 번 안내. "알겠어요"면 다시 안 뜸, 바깥을 누르면 다음 방문 때 한 번 더 */
export function FirstTimeHint({ id, text, children }: { id: string; text: ReactNode; children: ReactNode }) {
  const ctx = useContext(Hints);
  const [open, setOpen] = useState(false);
  const unseen = !!ctx && !ctx.seen.has(id);
  useEffect(() => {
    if (!unseen) return;
    const t = setTimeout(() => setOpen(true), 600); // 화면이 자리 잡은 뒤
    return () => clearTimeout(t);
  }, [unseen]);
  if (!unseen) return <>{children}</>;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <span className="inline-block">{children}</span>
      </PopoverAnchor>
      <PopoverContent className="w-64 space-y-3 text-sm" role="status">
        <p>{text}</p>
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={() => {
              ctx.mark(id);
              setOpen(false);
            }}
          >
            알겠어요
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
