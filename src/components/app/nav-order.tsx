"use client";

// 메뉴·탭 순서: 사용자 설정(user_settings.nav_order)에서 읽고, 끌어 바꾸면 바로 반영 후 저장
import { createContext, useContext, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { saveNavOrder } from "@/app/actions/settings";
import { useDragSort } from "@/hooks/use-drag-sort";

type Orders = Record<string, string[]>;
const Ctx = createContext<{ orders: Orders; set: (key: string, hrefs: string[]) => void }>({ orders: {}, set: () => {} });

export function NavOrderProvider({ initial, children }: { initial: Orders; children: ReactNode }) {
  const [orders, setOrders] = useState(initial);
  const set = (key: string, hrefs: string[]) => {
    const prev = orders;
    setOrders({ ...orders, [key]: hrefs });
    saveNavOrder(key, hrefs).then((r) => {
      if (r.ok) return;
      setOrders(prev);
      toast.error("순서를 저장하지 못했어요");
    });
  };
  return <Ctx value={{ orders, set }}>{children}</Ctx>;
}

/** 저장된 순서대로(새로 생긴 항목은 원래 자리 순서로 뒤에) 놓고, 끌어 바꾸기 손잡이를 줌 */
export function useNavOrder<T extends { href: string }>(key: string, items: T[], axis: "x" | "y") {
  const { orders, set } = useContext(Ctx);
  const saved = orders[key] ?? [];
  const rank = (h: string) => (saved.includes(h) ? saved.indexOf(h) : saved.length + items.findIndex((i) => i.href === h));
  const ids = items.map((i) => i.href).sort((a, b) => rank(a) - rank(b));
  const drag = useDragSort(ids, (next) => set(key, next), axis);
  return { ...drag, items: drag.order.map((h) => items.find((i) => i.href === h)!) };
}
