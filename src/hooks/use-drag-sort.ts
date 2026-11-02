"use client";

// 끌어 순서 바꾸기(마우스·터치 공용, 포인터 이벤트)
// - handle(id): 손잡이를 바로 끌기(목표 트래커). 키보드는 손잡이에서 ↑↓(가로면 ←→)
// - item(id): 항목 자체를 끌기(메뉴·탭). 마우스는 6px 넘게 끌면, 터치는 길게(0.4초) 누른 뒤 끌면 시작 — 그냥 누르면 원래대로 이동
//   키보드는 Alt+↑↓(가로면 Alt+←→). 끌고 난 뒤의 클릭(이동)은 막음
// 쓰는 법: const d = useDragSort(ids, save, "x"); 항목에 ref={d.rowRef(id)} + {...d.item(id)}, 그리는 순서는 d.order
import { useEffect, useRef, useState } from "react";

const move = <T,>(list: T[], from: number, to: number) => {
  const next = [...list];
  next.splice(to, 0, ...next.splice(from, 1));
  return next;
};

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
  const dragged = useRef(false);

  const commit = (next: string[]) => {
    setOrder(next);
    if (next.join() !== live.current.ids.join()) live.current.save(next);
  };
  // 포인터가 올라간 항목 자리로 옮김(그리는 순서가 바로 바뀌어 손가락을 따라감)
  const follow = (id: string, x: number, y: number) => {
    const cur = live.current.order;
    const to = cur.findIndex((o) => {
      const r = rows.current.get(o)?.getBoundingClientRect();
      return r && (axis === "x" ? x < r.right : y < r.bottom);
    });
    const from = cur.indexOf(id);
    const target = to < 0 ? cur.length - 1 : to;
    if (target !== from) setOrder((live.current.order = move(cur, from, target)));
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
      if (dragging === p.id) return follow(p.id, e.clientX, e.clientY);
      const far = Math.hypot(e.clientX - p.x, e.clientY - p.y);
      if (!p.touch && far > 6) setDragging(p.id);
      else if (p.touch && far > 8) {
        clearTimeout(p.t); // 스크롤하려는 것
        press.current = null;
      }
    };
    const onUp = () => {
      const p = press.current;
      press.current = null;
      if (!p) return;
      clearTimeout(p.t);
      if (dragging !== p.id) return;
      setDragging(null);
      dragged.current = true;
      setTimeout(() => (dragged.current = false), 50);
      commit(live.current.order);
    };
    const onCancel = () => {
      if (press.current) clearTimeout(press.current.t);
      press.current = null;
      if (!dragging) return;
      setDragging(null);
      setOrder(live.current.ids);
    };
    const noScroll = (e: TouchEvent) => dragging && e.preventDefault();
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
        setDragging(id);
      },
      onPointerMove: (e: React.PointerEvent) => dragging === id && follow(id, e.clientX, e.clientY),
      onPointerUp: () => {
        if (dragging !== id) return;
        setDragging(null);
        commit(order);
      },
      onPointerCancel: () => (setDragging(null), setOrder(ids)),
      onKeyDown: (e: React.KeyboardEvent) => keyMove(id, e),
    }),
    item: (id: string) => ({
      style: { WebkitTouchCallout: "none" } as const,
      onPointerDown: (e: React.PointerEvent) => {
        if (e.button !== 0) return;
        const touch = e.pointerType !== "mouse";
        const p: NonNullable<typeof press.current> = { id, x: e.clientX, y: e.clientY, touch };
        if (touch) p.t = setTimeout(() => (setDragging(id), navigator.vibrate?.(10)), 400);
        press.current = p;
      },
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
