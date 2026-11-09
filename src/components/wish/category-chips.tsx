"use client";

// 위시 분류 칩 줄: 전체 + 내 분류(순서대로) + 분류 편집(추가·이름·순서·지우기). 분류는 이름만
import { addItemCat, removeItemCat, renameItemCat, reorderItemCats } from "@/app/actions/wish";
import { CategoryEditor } from "@/components/app/category-editor";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ItemCategory } from "@/server/item-categories";

export function CategoryChips({ categories, value, onChange }: { categories: ItemCategory[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="no-scrollbar -mx-4 flex items-center gap-1 overflow-x-auto px-4 md:mx-0 md:px-0">
      <ToggleGroup type="single" variant="outline" size="sm" value={value} onValueChange={(x) => x && onChange(x)} aria-label="분류">
        <ToggleGroupItem value="all">전체</ToggleGroupItem>
        {categories.map((c) => (
          <ToggleGroupItem key={c.id} value={c.id} className="whitespace-nowrap">
            {c.name}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <CategoryEditor
        title="위시 분류 편집"
        description="드라마·영화·애니·뮤지컬·옷처럼 마음대로 만들어요. 이 순서대로 보여요"
        items={categories.map((c) => ({ key: c.id, name: c.name, count: c.count }))}
        onAdd={(name) => addItemCat(name)}
        onRename={(it, name) => renameItemCat(it.key, name)}
        onRemove={(it) => removeItemCat(it.key)}
        onReorder={reorderItemCats}
        removeNote="담긴 위시는 '전체'에서 보여요"
        countLabel="개"
        className="shrink-0"
      />
    </div>
  );
}
