"use client";

// 사진 올리기 칸(일기·작품 표지·위시): 고르면 바로 올리고(/api/v1/uploads) 썸네일로 보여 줌
import { ImagePlus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export type Photo = { id: string; width: number; height: number };

export function PhotoPicker({
  value,
  onChange,
  onBusy,
  max = 10,
  purpose,
  label = "사진",
  tall,
}: {
  value: Photo[];
  onChange: (fn: (p: Photo[]) => Photo[]) => void;
  onBusy?: (uploading: boolean) => void;
  max?: number;
  purpose: "journal_photo" | "media_cover" | "wish_image";
  label?: string;
  tall?: boolean; // 표지(2:3)
}) {
  const [uploading, setUploading] = useState(0);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => onBusy?.(uploading > 0), [uploading, onBusy]);
  const box = cn("rounded-lg", tall ? "h-36 w-24" : "size-24");

  async function upload(files: FileList | null) {
    const list = [...(files ?? [])].slice(0, max - value.length);
    if (files && files.length > list.length) toast(`${label}은 ${max}장까지 넣을 수 있어요`);
    setUploading((n) => n + list.length);
    for (const f of list) {
      const form = new FormData();
      form.set("file", f);
      form.set("purpose", purpose);
      try {
        const r = await fetch("/api/v1/uploads", { method: "POST", body: form, headers: { "idempotency-key": crypto.randomUUID() } });
        const j = await r.json();
        if (!r.ok) toast(j.error?.message ?? "사진을 올리지 못했어요");
        else onChange((p) => [...p, j.data]);
      } catch {
        toast("사진을 올리지 못했어요. 연결을 확인해 주세요");
      }
      setUploading((n) => n - 1);
    }
  }

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
      <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" multiple={max > 1} hidden onChange={(e) => (upload(e.target.files), (e.target.value = ""))} />
    </div>
  );
}
