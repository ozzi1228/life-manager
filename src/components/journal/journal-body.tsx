"use client";

// 일기 본문 편집(블로그처럼): 글 사이에 사진이 놓이고, 사진을 끌어 옮김(PC) · ↑↓로 옮김(휴대폰) · ×로 빼기
// 사진 넣기: 아래 버튼, 붙여 넣기(Ctrl+V), 파일 끌어 놓기 — 지금 글자 칸 바로 아래에 들어감
// 저장 형식은 글자 그대로 + 사진 줄 ![](photo:id)(src/lib/journal-body.ts). 붙여 넣은 글은 서식 없이 글자만
// ponytail: contenteditable + DOM을 직접 다룸(RichNote와 같은 방식). 서식·표 같은 게 필요해지면 편집기 라이브러리로
import { ImagePlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { uploadPhoto, type Photo } from "@/components/app/photo-picker";
import { Spinner } from "@/components/ui/spinner";
import { photoLine, photoOf } from "@/lib/journal-body";

const MAX = 10;
const DRAG = "application/x-oona-photo";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const tool = "flex size-8 items-center justify-center rounded-md bg-foreground/70 text-background text-sm hover:bg-foreground";

/** 사진 한 장(글자 편집 안 되는 덩어리). 버튼은 본문에서 한꺼번에 받음(data-act) */
function figure(p: Photo) {
  const el = document.createElement("figure");
  el.contentEditable = "false";
  el.draggable = true;
  el.dataset.photo = p.id;
  el.className = "group relative my-3 w-fit max-w-full cursor-grab select-none active:cursor-grabbing";
  el.innerHTML = `<img src="/api/v1/attachments/${p.id}?v=body" alt="" draggable="false" class="max-h-[60vh] max-w-full rounded-lg object-contain" />
<span class="absolute top-2 right-2 flex gap-1 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
<button type="button" data-act="up" aria-label="사진 위로" class="${tool}">↑</button>
<button type="button" data-act="down" aria-label="사진 아래로" class="${tool}">↓</button>
<button type="button" data-act="del" aria-label="사진 빼기" class="${tool}">×</button>
</span>`;
  return el;
}
const line = (text = "") => {
  const el = document.createElement("div");
  el.innerHTML = text ? esc(text) : "<br>";
  return el;
};

/** 편집 칸 → 저장 글자. 줄마다: 사진이면 사진 줄, 글이면 그 글(빈 줄은 빈 줄) */
function serialize(root: HTMLElement) {
  const out: string[] = [];
  let cur: string | null = null; // 본문 바로 아래의 글자 조각(첫 줄 등)
  const flush = () => cur !== null && (out.push(cur), (cur = null));
  for (const n of root.childNodes) {
    if (n.nodeType === Node.TEXT_NODE) {
      cur = (cur ?? "") + n.textContent;
      continue;
    }
    const el = n as HTMLElement;
    if (el.tagName === "BR") {
      out.push(cur ?? "");
      cur = null;
      continue;
    }
    flush();
    if (el.dataset.photo) out.push(photoLine(el.dataset.photo));
    else out.push(...el.innerText.replace(/\n$/, "").split("\n"));
  }
  flush();
  return out.join("\n").replace(/\s+$/, "");
}

/** 본문 바로 아래 칸(줄·사진) 중 node가 든 것 */
const blockOf = (root: HTMLElement, node: Node | null) => {
  let n = node;
  while (n && n.parentNode !== root) n = n.parentNode;
  return n && n !== root ? (n as HTMLElement) : null;
};

export function JournalBody({ initial, photos: initialPhotos, onChange, onBusy, placeholder }: { initial: string; photos: Photo[]; onChange: (v: { body: string; photos: Photo[] }) => void; onBusy?: (b: boolean) => void; placeholder: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const known = useRef(new Map(initialPhotos.map((p) => [p.id, p])));
  const saved = useRef<Range | null>(null); // 마지막 커서(사진 넣기 버튼을 누르면 포커스가 빠지므로)
  const file = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [empty, setEmpty] = useState(!initial.trim() && !initialPhotos.length);
  useEffect(() => onBusy?.(uploading > 0), [uploading, onBusy]);

  const emit = () => {
    const root = ref.current!;
    const body = serialize(root);
    const ids = [...root.querySelectorAll<HTMLElement>("[data-photo]")].map((f) => f.dataset.photo!);
    setEmpty(!body.trim());
    onChange({ body, photos: ids.flatMap((id) => known.current.get(id) ?? []) });
  };

  // 처음 한 번 그림(그 뒤로는 브라우저가 편집). 본문에 자리가 없는 사진은 맨 아래에
  useEffect(() => {
    const root = ref.current!;
    root.replaceChildren(); // 개발 모드는 effect를 두 번 부름 → 비우고 그려야 두 번 안 쌓임
    const placed = new Set<string>();
    for (const l of initial.split("\n")) {
      const id = photoOf(l);
      const p = id && known.current.get(id);
      if (p) {
        root.append(figure(p));
        placed.add(p.id);
      } else if (!id) root.append(line(l));
    }
    for (const p of initialPhotos) if (!placed.has(p.id)) root.append(figure(p));
    if (root.lastElementChild?.hasAttribute("data-photo")) root.append(line());
    const keep = () => {
      const s = getSelection();
      if (s?.rangeCount && root.contains(s.anchorNode)) saved.current = s.getRangeAt(0).cloneRange();
    };
    document.addEventListener("selectionchange", keep);
    return () => document.removeEventListener("selectionchange", keep);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 처음 내용은 한 번만(다시 그리려면 부모가 key를 바꿈)
  }, []);

  /** 사진 칸을 at(줄) 바로 아래에 넣음. 맨 끝이면 이어 쓸 빈 줄도 */
  function place(fig: HTMLElement, at: HTMLElement | null, before = false) {
    const root = ref.current!;
    if (!at) root.append(fig);
    else if (before) root.insertBefore(fig, at);
    else at.after(fig);
    if (!fig.nextSibling) root.append(line());
  }

  async function addFiles(files: File[], at: HTMLElement | null) {
    const room = MAX - ref.current!.querySelectorAll("[data-photo]").length - uploading;
    if (files.length > room) toast(`사진은 ${MAX}장까지 넣을 수 있어요`);
    const list = files.slice(0, Math.max(0, room));
    setUploading((n) => n + list.length);
    let after = at;
    for (const f of list) {
      const p = await uploadPhoto(f, "journal_photo");
      setUploading((n) => n - 1);
      if (!p) continue;
      known.current.set(p.id, p);
      const fig = figure(p);
      place(fig, after);
      after = fig; // 여러 장이면 차례로 아래에
      emit();
    }
  }
  const here = () => blockOf(ref.current!, saved.current?.startContainer ?? null);

  return (
    <div className="space-y-3">
      <div className="relative">
        {empty && <span className="text-muted-foreground pointer-events-none absolute top-0 left-0 text-base leading-7 md:text-body">{placeholder}</span>}
        <div
          ref={ref}
          role="textbox"
          aria-multiline="true"
          aria-label="본문"
          contentEditable
          suppressContentEditableWarning
          className="min-h-[28vh] text-base leading-7 break-words whitespace-pre-wrap outline-none md:min-h-[40vh] md:text-body"
          onInput={emit}
          onClick={(e) => {
            // 사진 위 버튼: 위로·아래로·빼기
            const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-act]");
            const fig = btn?.closest<HTMLElement>("[data-photo]");
            if (!btn || !fig) return;
            e.preventDefault();
            const act = btn.dataset.act;
            if (act === "del") fig.remove();
            if (act === "up" && fig.previousElementSibling) fig.previousElementSibling.before(fig);
            if (act === "down" && fig.nextElementSibling) fig.nextElementSibling.after(fig);
            if (!ref.current!.lastElementChild || ref.current!.lastElementChild.hasAttribute("data-photo")) ref.current!.append(line());
            emit();
          }}
          onPaste={(e) => {
            const images = [...e.clipboardData.files].filter((f) => f.type.startsWith("image/"));
            e.preventDefault();
            if (images.length) return void addFiles(images, here());
            // 글은 서식 없이 글자만
            document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
          }}
          onDragStart={(e) => {
            const fig = (e.target as HTMLElement).closest<HTMLElement>("[data-photo]");
            if (fig) e.dataTransfer.setData(DRAG, fig.dataset.photo!);
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            const root = ref.current!;
            const id = e.dataTransfer.getData(DRAG);
            const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith("image/"));
            if (!id && !files.length) return; // 글자 끌어 옮기기는 브라우저에 맡김
            e.preventDefault();
            // 놓은 자리의 줄: 그 줄의 위쪽 절반이면 위에, 아래쪽 절반이면 아래에
            const r = document.caretRangeFromPoint?.(e.clientX, e.clientY);
            const at = blockOf(root, r?.startContainer ?? (e.target as Node));
            const before = !!at && e.clientY < at.getBoundingClientRect().top + at.getBoundingClientRect().height / 2;
            if (id) {
              const fig = root.querySelector<HTMLElement>(`[data-photo="${id}"]`);
              if (!fig || fig === at) return;
              place(fig, at, before);
              emit();
            } else addFiles(files, at);
          }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => file.current?.click()} className="text-muted-foreground hover:bg-accent flex h-10 items-center gap-1.5 rounded-md border border-dashed px-3 text-sm">
          <ImagePlus className="size-4" /> 사진 넣기
        </button>
        {uploading > 0 && <Spinner />}
        <span className="text-muted-foreground text-caption">글 사이에 들어가요. 끌어서 옮기거나 붙여 넣어도 돼요</span>
        <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => (addFiles([...(e.target.files ?? [])], here()), (e.target.value = ""))} />
      </div>
    </div>
  );
}
