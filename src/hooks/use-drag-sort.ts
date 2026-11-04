"use client";

// 끌어 순서 바꾸기(마우스·터치 공용, 포인터 이벤트)
// - handle(id): 손잡이를 바로 끌기(목표 트래커·분류). 키보드는 손잡이에서 ↑↓(가로면 ←→)
// - item(id): 항목 자체를 끌기(메뉴·탭). 마우스는 6px 넘게 끌면, 터치는 길게(0.3초) 누른 뒤 끌면 시작 — 그냥 누르면 원래대로 이동
//   키보드는 Alt+↑↓(가로면 Alt+←→). 끌고 난 뒤의 클릭(이동)은 막음
// 끄는 동안은 그리는 순서를 바꾸지 않고 transform 으로만 움직임: 끄는 항목은 손가락을 그대로 따라가고, 나머지는 비켜 미끄러짐. 놓을 때 한 번 저장
// 쓰는 법: const d = useDragSort(ids, save, "x"); 항목에 ref={d.rowRef(id)} + {...d.item(id)}, 그리는 순서는 d.order
import { useEffect, useLayoutEffect, useRef, useState } from "react";

const move = <T,>(list: T[], from: number, to: number) => {
  const next = [...list];
  next.splice(to, 0, ...next.splice(from, 1));
  return next;
};
const SLIDE = "transform 150ms ease";

type Drag = { id: string; from: number; to: number; start: number; slots: { pos: number; size: number }[]; moved: boolean };

export function useDragSort(ids: string[], save: (ids: string[]) => void, axis: "x" | "y" = "y") {
  const [order, setOrder] = useState(ids);
  const [seen, setSeen] = useState(ids);
  // 서버 목록이 바뀌면(추가·삭제·새로 고침) 다시 맞춤
  if (seen.join() !== ids.join()) {
    setSeen(ids);
    setOrder(ids);
  }
  const [dragging, setDragging] = useState<string | null>(null);
  const rows = useRef(new Map<string, HTMLElement>());
  const live = useRef({ order, ids, save });
  useEffect(() => void (live.current = { order, ids, save }));
  const press = useRef<{ id: string; x: number; y: number; touch: boolean; t?: ReturnType<typeof setTimeout> } | null>(null);
  const drag = useRef<Drag | null>(null);
  const dragged = useRef(false);
  const reset = useRef(false);

  const clear = (animate: boolean) =>
    rows.current.forEach((el) => {
      el.style.transition = animate ? SLIDE : "";
      el.style.transform = "";
      el.style.zIndex = "";
      el.style.position = "";
    });
  // 새 순서가 화면에 그려진 뒤(칠하기 전)에 transform 을 지워야 깜빡이지 않음
  useLayoutEffect(() => {
    if (!reset.current) return;
    reset.current = false;
    clear(false);
  });

  const at = (x: number, y: number) => (axis === "x" ? x : y);
  const begin = (id: string, x: number, y: number) => {
    const cur = live.current.order;
    const slots = cur.map((o) => {
      const r = rows.current.get(o)?.getBoundingClientRect();
      return r ? { pos: axis === "x" ? r.left : r.top, size: axis === "x" ? r.width : r.height } : { pos: 0, size: 0 };
    });
    const from = cur.indexOf(id);
    drag.current = { id, from, to: from, start: at(x, y), slots, moved: false };
    const el = rows.current.get(id);
    if (el) {
      el.style.transition = "";
      el.style.zIndex = "10";
      if (getComputedStyle(el).position === "static") el.style.position = "relative"; // z-index 가 먹게
    }
    setDragging(id);
  };
  // 끄는 항목은 손가락만큼 옮기고, 그 가운데가 넘어선 자리까지의 항목들을 한 칸씩 비켜 놓음
  const follow = (x: number, y: number) => {
    const d = drag.current;
    if (!d) return;
    const cur = live.current.order;
    const delta = at(x, y) - d.start;
    if (Math.abs(delta) > 3) d.moved = true;
    const me = d.slots[d.from];
    const mid = me.pos + me.size / 2 + delta;
    let to = d.from;
    while (to + 1 < cur.length && mid > d.slots[to + 1].pos + d.slots[to + 1].size / 2) to++;
    while (to - 1 >= 0 && mid < d.slots[to - 1].pos + d.slots[to - 1].size / 2) to--;
    d.to = to;
    const t = (v: number) => (axis === "x" ? `translate3d(${v}px,0,0)` : `translate3d(0,${v}px,0)`);
    rows.current.get(d.id)!.style.transform = t(delta);
    // 비키는 거리 = 끄는 항목 크기 + 항목 사이 간격
    const next = d.slots[d.from + 1] ?? d.slots[d.from - 1];
    const gap = next ? Math.max(0, d.from + 1 < cur.length ? next.pos - me.pos - me.size : me.pos - next.pos - next.size) : 0;
    cur.forEach((o, i) => {
      if (i === d.from) return;
      const el = rows.current.get(o);
      if (!el) return;
      const shift = i > d.from && i <= to ? -(me.size + gap) : i < d.from && i >= to ? me.size + gap : 0;
      el.style.transition = SLIDE;
      el.style.transform = shift ? t(shift) : "";
    });
  };
  const end = (keep: boolean) => {
    const d = drag.current;
    drag.current = null;
    setDragging(null);
    if (!d) return;
    if (d.moved) {
      dragged.current = true;
      setTimeout(() => (dragged.current = false), 50);
    }
    const next = move(live.current.order, d.from, d.to);
    if (!keep || d.to === d.from) return clear(true); // 제자리로 미끄러져 돌아감
    reset.current = true;
    commit(next);
  };

  const commit = (next: string[]) => {
    setOrder(next);
    if (next.join() !== live.current.ids.join()) live.current.save(next);
  };
  const keyMove = (id: string, e: React.KeyboardEvent) => {
    const [back, fwd] = axis === "x" ? ["ArrowLeft", "ArrowRight"] : ["ArrowUp", "ArrowDown"];
    const from = order.indexOf(id);
    const to = e.key === back ? from - 1 : e.key === fwd ? from + 1 : -1;
    if (to < 0 || to >= order.length) return;
    e.preventDefault();
    commit(move(order, from, to));
  };

  // item(): 누른 뒤의 움직임은 창 전체에서 받음(끌다 항목 밖으로 나가도 이어지게), 터치로 끄는 동안은 화면 스크롤 막음
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const p = press.current;
      if (!p) return;
      if (drag.current) return follow(e.clientX, e.clientY);
      const far = Math.hypot(e.clientX - p.x, e.clientY - p.y);
      if (!p.touch && far > 6) begin(p.id, p.x, p.y);
      else if (p.touch && far > 10) {
        clearTimeout(p.t); // 스크롤하려는 것
        press.current = null;
      }
    };
    const onUp = () => {
      const p = press.current;
      press.current = null;
      if (!p) return;
      clearTimeout(p.t);
      if (drag.current) end(true);
    };
    const onCancel = () => {
      if (press.current) clearTimeout(press.current.t);
      press.current = null;
      if (drag.current) end(false);
    };
    const noScroll = (e: TouchEvent) => drag.current && e.cancelable && e.preventDefault();
    addEventListener("pointermove", onMove);
    addEventListener("pointerup", onUp);
    addEventListener("pointercancel", onCancel);
    addEventListener("touchmove", noScroll, { passive: false });
    return () => {
      removeEventListener("pointermove", onMove);
      removeEventListener("pointerup", onUp);
      removeEventListener("pointercancel", onCancel);
      removeEventListener("touchmove", noScroll);
    };
  });

  return {
    order,
    dragging,
    rowRef: (id: string) => (el: HTMLElement | null) => void (el ? rows.current.set(id, el) : rows.current.delete(id)),
    handle: (id: string) => ({
      "aria-label": "끌어서 순서 바꾸기",
      title: `끌어서 순서 바꾸기 (키보드: ${axis === "x" ? "←→" : "↑↓"})`,
      style: { touchAction: "none" } as const,
      onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        begin(id, e.clientX, e.clientY);
      },
      onPointerMove: (e: React.PointerEvent) => drag.current?.id === id && follow(e.clientX, e.clientY),
      onPointerUp: () => drag.current?.id === id && end(true),
      onPointerCancel: () => drag.current?.id === id && end(false),
      onKeyDown: (e: React.KeyboardEvent) => keyMove(id, e),
    }),
    item: (id: string) => ({
      style: { WebkitTouchCallout: "none" } as const,
      onPointerDown: (e: React.PointerEvent) => {
        if (e.button !== 0) return;
        const touch = e.pointerType !== "mouse";
        const p: NonNullable<typeof press.current> = { id, x: e.clientX, y: e.clientY, touch };
        if (touch) p.t = setTimeout(() => (begin(id, p.x, p.y), navigator.vibrate?.(10)), 300);
        press.current = p;
      },
      // 끌어서 옮겼을 때만 클릭(이동)을 막음 — 길게 눌렀다 그대로 떼면 원래대로 이동
      onClickCapture: (e: React.MouseEvent) => {
        if (!dragged.current) return;
        e.preventDefault();
        e.stopPropagation();
      },
      onContextMenu: (e: React.MouseEvent) => press.current?.touch && e.preventDefault(),
      onDragStart: (e: React.DragEvent) => e.preventDefault(), // 링크 끌기(브라우저 기본) 대신 순서 바꾸기
      onKeyDown: (e: React.KeyboardEvent) => e.altKey && keyMove(id, e),
    }),
  };
}
