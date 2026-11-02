"use client";

// 손잡이를 끌어 순서 바꾸기(마우스·터치 공용, 포인터 이벤트). 키보드는 손잡이에서 ↑↓
// 쓰는 법: const d = useDragSort(ids, save); 행에 ref={d.rowRef(id)}, 손잡이에 {...d.handle(id)}, 그리는 순서는 d.order
import { useRef, useState } from "react";

const move = <T,>(list: T[], from: number, to: number) => {
  const next = [...list];
  next.splice(to, 0, ...next.splice(from, 1));
  return next;
};

export function useDragSort(ids: string[], save: (ids: string[]) => void) {
  const [order, setOrder] = useState(ids);
  const [seen, setSeen] = useState(ids);
  // 서버 목록이 바뀌면(추가·삭제·새로 고침) 다시 맞춤
  if (seen.join() !== ids.join()) {
    setSeen(ids);
    setOrder(ids);
  }
  const [dragging, setDragging] = useState<string | null>(null);
  const rows = useRef(new Map<string, HTMLElement>());

  const commit = (next: string[]) => {
    setOrder(next);
    if (next.join() !== ids.join()) save(next);
  };

  return {
    order,
    dragging,
    rowRef: (id: string) => (el: HTMLElement | null) => void (el ? rows.current.set(id, el) : rows.current.delete(id)),
    handle: (id: string) => ({
      "aria-label": "끌어서 순서 바꾸기",
      title: "끌어서 순서 바꾸기 (키보드: ↑↓)",
      style: { touchAction: "none" } as const,
      onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(id);
      },
      onPointerMove: (e: React.PointerEvent) => {
        if (dragging !== id) return;
        // 포인터가 올라간 행 자리로 옮김(그리는 순서가 바로 바뀌어 손가락을 따라감)
        const to = order.findIndex((o) => {
          const r = rows.current.get(o)?.getBoundingClientRect();
          return r && e.clientY < r.bottom;
        });
        const from = order.indexOf(id);
        const target = to < 0 ? order.length - 1 : to;
        if (target !== from) setOrder(move(order, from, target));
      },
      onPointerUp: () => {
        if (dragging !== id) return;
        setDragging(null);
        commit(order);
      },
      onPointerCancel: () => (setDragging(null), setOrder(ids)),
      onKeyDown: (e: React.KeyboardEvent) => {
        const from = order.indexOf(id);
        const to = e.key === "ArrowUp" ? from - 1 : e.key === "ArrowDown" ? from + 1 : -1;
        if (to < 0 || to >= order.length) return;
        e.preventDefault();
        commit(move(order, from, to));
      },
    }),
  };
}
