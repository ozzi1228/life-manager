"use client";

// 사진 올리기 칸(일기·위시): 고르면 바로 올리고(/api/v1/uploads) 썸네일로 보여 줌. paste면 화면 어디서든 붙여 넣은 사진도(Ctrl+V)
import { ImagePlus, X } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export type Photo = { id: string; width: number; height: number };
type Purpose = "journal_photo" | "media_cover" | "wish_image";

/** 사진 한 장 올리기(/api/v1/uploads). 실패하면 안내하고 null */
export async function uploadPhoto(f: File, purpose: Purpose): Promise<Photo | null> {
  const form = new FormData();
  form.set("file", f);
  form.set("purpose", purpose);
  try {
    const r = await fetch("/api/v1/uploads", { method: "POST", body: form, headers: { "idempotency-key": crypto.randomUUID() } });
    const j = await r.json();
    if (r.ok) return j.data;
    toast(j.error?.message ?? "사진을 올리지 못했어요");
  } catch {
    toast("사진을 올리지 못했어요. 연결을 확인해 주세요");
  }
  return null;
}

export function PhotoPicker({
  value,
  onChange,
  onBusy,
  max = 10,
  purpose,
  label = "사진",
  tall,
  paste,
}: {
  value: Photo[];
  onChange: (fn: (p: Photo[]) => Photo[]) => void;
  onBusy?: (uploading: boolean) => void;
  max?: number;
  purpose: Purpose;
  label?: string;
  tall?: boolean; // 표지(2:3)
  paste?: boolean; // 붙여 넣은 사진도 올림(이 칸이 있는 동안 화면 전체에서)
}) {
  const [uploading, setUploading] = useState(0);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => onBusy?.(uploading > 0), [uploading, onBusy]);
  const box = cn("rounded-lg", tall ? "h-36 w-24" : "size-24");

  async function upload(files: File[]) {
    const list = files.slice(0, max - value.length - uploading);
    if (files.length > list.length) toast(`${label}은 ${max}장까지 넣을 수 있어요`);
    setUploading((n) => n + list.length);
    for (const f of list) {
      const p = await uploadPhoto(f, purpose);
      if (p) onChange((list) => [...list, p]);
      setUploading((n) => n - 1);
    }
  }

  // 붙여 넣기: 클립보드에 사진 파일이 있으면 올림. 글자도 함께면(웹 페이지 복사 등) 글자는 그대로 붙음
  const onPaste = useEffectEvent((e: ClipboardEvent) => {
    const images = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
    if (!images.length) return;
    if (!e.clipboardData?.types.includes("text/plain")) e.preventDefault();
    upload(images);
  });
  useEffect(() => {
    if (!paste) return;
    const h = (e: ClipboardEvent) => onPaste(e);
    document.addEventListener("paste", h);
    return () => document.removeEventListener("paste", h);
  }, [paste]);

  return (
    <div className="flex flex-wrap gap-2">
      {value.map((p) => (
        <div key={p.id} className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element -- 로그인한 본인만 보는 사진(이 서버가 직접 보냄) */}
          <img src={`/api/v1/attachments/${p.id}?v=thumb`} alt="" className={cn(box, "object-cover")} />
          <button
            type="button"
            aria-label={`${label} 빼기`}
            className="bg-foreground/70 text-background absolute top-1 right-1 flex size-6 items-center justify-center rounded-full"
            onClick={() => onChange((list) => list.filter((x) => x.id !== p.id))}
          >
            <X className="size-4" />
          </button>
        </div>
      ))}
      {Array.from({ length: uploading }, (_, i) => (
        <div key={i} className={cn(box, "bg-muted flex items-center justify-center")}>
          <Spinner />
        </div>
      ))}
      {value.length + uploading < max && (
        <button type="button" onClick={() => file.current?.click()} className={cn(box, "text-muted-foreground hover:bg-accent flex flex-col items-center justify-center gap-1 border border-dashed text-caption")}>
          <ImagePlus className="size-6" /> {max > 1 ? `${label} ${value.length}/${max}` : `${label} 넣기`}
        </button>
      )}
      {paste && value.length + uploading < max && <p className="text-muted-foreground w-full text-caption">사진을 복사해 붙여 넣어도 돼요</p>}
      <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" multiple={max > 1} hidden onChange={(e) => (upload([...(e.target.files ?? [])]), (e.target.value = ""))} />
    </div>
  );
}
