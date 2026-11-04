"use client";

// 위시(쇼핑)·작품 분류 칩 줄: 전체 + 내 분류(순서대로) + 분류 편집(추가·이름·순서·지우기·기록 방식)
// 기록 방식(type)은 편집 창의 칸 하나만 체크(라디오처럼). 규칙은 src/server/item-categories.ts
import { addItemCat, removeItemCat, renameItemCat, reorderItemCats, setItemCatType } from "@/app/actions/wish";
import { useState } from "react";
import { CategoryEditor } from "@/components/app/category-editor";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ItemCategory } from "@/server/item-categories";

const TYPES = {
  wish: [
    { key: "need", label: "필요" },
    { key: "want", label: "갖고싶음" },
    { key: "like", label: "관심" },
  ],
  media: [
    { key: "book", label: "책" },
    { key: "movie", label: "영화" },
    { key: "drama", label: "드라마" },
  ],
};
const ok = Promise.resolve({ ok: true as const });

export function CategoryChips({ scope, categories, value, onChange }: { scope: "wish" | "media"; categories: ItemCategory[]; value: string; onChange: (v: string) => void }) {
  // 누른 칸만 바로 체크된 것처럼(라디오). 실패하면 되돌리고, 목록이 새로 오면 비움
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [seen, setSeen] = useState(categories);
  if (seen !== categories) {
    setSeen(categories);
    setPicked({});
  }
  const setType = async (id: string, type: string) => {
    setPicked((p) => ({ ...p, [id]: type }));
    const r = await setItemCatType(id, type);
    if (!r.ok) setPicked((p) => ({ ...p, [id]: "" }));
    return r;
  };
  return (
    <div className="-mx-4 flex items-center gap-1 overflow-x-auto px-4 md:mx-0 md:px-0">
      <ToggleGroup type="single" variant="outline" size="sm" value={value} onValueChange={(x) => x && onChange(x)} aria-label="분류">
        <ToggleGroupItem value="all">전체</ToggleGroupItem>
        {categories.map((c) => (
          <ToggleGroupItem key={c.id} value={c.id} className="whitespace-nowrap">
            {c.name}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <CategoryEditor
        title={scope === "wish" ? "위시 분류 편집" : "작품 분류 편집"}
        description={scope === "wish" ? "바꾸면 바로 저장돼요. 이 순서대로 보여요. 체크한 칸이 그 분류의 구분이에요(참은 소비 후보는 '갖고싶음·관심')" : "바꾸면 바로 저장돼요. 이 순서대로 보여요. 체크한 칸대로 기록해요(영화는 본 날 하나, 책·드라마는 시작·끝)"}
        items={categories.map((c) => ({ key: c.id, name: c.name, count: c.count }))}
        onAdd={(name) => addItemCat(scope, name)}
        onRename={(it, name) => renameItemCat(it.key, name)}
        onRemove={(it) => removeItemCat(it.key)}
        onReorder={reorderItemCats}
        columns={TYPES[scope]}
        isOn={(it, col) => (picked[it.key] || categories.find((c) => c.id === it.key)?.type) === col}
        onToggle={(it, col, on) => (on ? setType(it.key, col) : ok)}
        removeNote={scope === "wish" ? "담긴 위시는 '전체'에서 보여요" : "기록한 작품은 '전체'에서 보여요"}
        countLabel="개"
        className="shrink-0"
      />
    </div>
  );
}
