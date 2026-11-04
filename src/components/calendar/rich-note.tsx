"use client";

// 서식 있는 메모 칸: 굵게·기울임·밑줄·취소선
// - PC 단축키: Ctrl(⌘)+B·I·U, 취소선 Ctrl(⌘)+Shift+X(또는 S)
// - 글자를 고르면(모바일은 끌어 고르기) 도구 상자가 뜸. 모바일은 기본 복사 메뉴와 겹치지 않게 고른 글 아래, PC는 위
// - 붙여 넣기는 글자만(다른 곳의 서식·태그가 섞이지 않게)
// ponytail: document.execCommand(사라질 예정이지만 모든 브라우저가 지원) — 안 되게 되면 편집기 라이브러리로
import { Bold, Italic, Strikethrough, Underline } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { noteHtml, noteText } from "@/lib/rich-note";
import { cn } from "@/lib/utils";

const TOOLS = [
  { cmd: "bold", icon: Bold, label: "굵게", key: "B" },
  { cmd: "italic", icon: Italic, label: "기울임", key: "I" },
  { cmd: "underline", icon: Underline, label: "밑줄", key: "U" },
  { cmd: "strikeThrough", icon: Strikethrough, label: "취소선", key: "Shift+X" },
] as const;
type Cmd = (typeof TOOLS)[number]["cmd"];

export function RichNote({ initial, label, placeholder, onChange, onBlur }: { initial: string; label: string; placeholder: string; onChange: (html: string) => void; onBlur: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const mobile = useIsMobile();
  const [empty, setEmpty] = useState(!noteText(initial).trim());
  const [bar, setBar] = useState<{ x: number; y: number; active: Record<Cmd, boolean> } | null>(null);

  // 처음 내용은 한 번만(값이 안 바뀌어 React가 다시 넣지 않음 — 그 뒤로는 브라우저가 편집)
  const [html] = useState(() => ({ __html: noteHtml(initial) }));

  const changed = () => {
    const el = ref.current!;
    const blank = !el.textContent?.trim();
    setEmpty(blank);
    onChange(blank ? "" : el.innerHTML);
  };

  // 고른 글자가 이 칸 안에 있으면 도구 상자 위치를 잡음(스크롤해도 따라감)
  useEffect(() => {
    const place = () => {
      const sel = document.getSelection();
      const el = ref.current;
      if (!sel || !el || sel.isCollapsed || !sel.rangeCount || !el.contains(sel.anchorNode) || !el.contains(sel.focusNode)) return setBar(null);
      const r = sel.getRangeAt(0).getBoundingClientRect();
      const W = 4 * 40 + 8;
      const x = Math.min(Math.max(8, r.left + r.width / 2 - W / 2), window.innerWidth - W - 8);
      const below = mobile || r.top < 56;
      setBar({ x, y: below ? r.bottom + 10 : r.top - 48, active: Object.fromEntries(TOOLS.map((t) => [t.cmd, document.queryCommandState(t.cmd)])) as Record<Cmd, boolean> });
    };
    document.addEventListener("selectionchange", place);
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("selectionchange", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [mobile]);

  const run = (cmd: Cmd) => {
    document.execCommand(cmd);
    changed();
    document.dispatchEvent(new Event("selectionchange")); // 눌린 상태 다시 표시
  };

  return (
    <>
      <div className="relative">
        {empty && (
          <span aria-hidden className="text-muted-foreground pointer-events-none absolute inset-0 text-sm md:text-sm">
            {placeholder}
          </span>
        )}
        <div
          ref={ref}
          role="textbox"
          aria-multiline
          aria-label={label}
          contentEditable
          suppressContentEditableWarning
          dangerouslySetInnerHTML={html}
          className="min-h-16 text-base break-words whitespace-pre-wrap outline-none md:text-sm [&_s]:opacity-70"
          onInput={changed}
          onBlur={onBlur}
          onPaste={(e) => {
            e.preventDefault();
            document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
          }}
          onKeyDown={(e) => {
            if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
            const k = e.key.toLowerCase();
            const cmd: Cmd | null = e.shiftKey ? (k === "x" || k === "s" ? "strikeThrough" : null) : k === "b" ? "bold" : k === "i" ? "italic" : k === "u" ? "underline" : null;
            if (!cmd) return;
            e.preventDefault();
            run(cmd);
          }}
        />
      </div>
      {bar &&
        createPortal(
          <div
            role="toolbar"
            aria-label="글자 서식"
            className="bg-popover text-popover-foreground animate-in fade-in-0 zoom-in-95 fixed z-50 flex gap-0.5 rounded-lg border p-1 shadow-md"
            style={{ left: bar.x, top: bar.y }}
            // 누르는 순간 고른 글자가 풀리지 않게
            onPointerDown={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
          >
            {TOOLS.map((t) => (
              <button
                key={t.cmd}
                type="button"
                aria-label={t.label}
                aria-pressed={bar.active[t.cmd]}
                title={mobile ? t.label : `${t.label} (Ctrl+${t.key})`}
                onClick={() => run(t.cmd)}
                className={cn("hover:bg-accent flex size-10 items-center justify-center rounded-md md:size-9", bar.active[t.cmd] && "bg-accent text-primary")}
              >
                <t.icon className="size-4" />
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
