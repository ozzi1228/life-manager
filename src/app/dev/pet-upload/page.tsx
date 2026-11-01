"use client";

// 0단계 V-06: 펫 업로드 변환 시험(GIF·움직이는 WebP·PNG → 스프라이트 시트)
import { useState } from "react";

type Result = { sheet: string; bytes: number; inputBytes: number; frames: number; fps: number; loop: boolean; warnings: string[] };

const kb = (n: number) => `${(n / 1024).toFixed(0)}KB`;

export default function PetUploadTest() {
  const [res, setRes] = useState<Result | null>(null);
  const [msg, setMsg] = useState("");

  async function upload(file: File | undefined) {
    if (!file) return;
    setMsg("바꾸는 중…");
    setRes(null);
    const body = new FormData();
    body.set("file", file);
    const r = await fetch("/dev/pet-upload/convert", { method: "POST", body });
    const json = await r.json();
    if (!r.ok) return setMsg(json.error ?? "바꾸지 못했어요.");
    setMsg("");
    setRes(json);
  }

  const show = 128; // 미리보기 크기(앱에서는 80px)
  const anim = res && res.frames > 1 ? `pet-play ${res.frames / res.fps}s steps(${res.frames}) ${res.loop ? "infinite" : "1 forwards"}` : undefined;

  return (
    <main className="mx-auto w-full max-w-2xl space-y-5 p-6">
      <h1 className="text-2xl font-bold">펫 업로드 변환 시험</h1>
      <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
        <li>PNG·WebP(한 장), GIF·움직이는 WebP(동작)를 올리면 앱용 그림 띠로 바꿔요. 저장하지는 않아요.</li>
        <li>파일 하나에 2MB, 가로세로 2048px, 움직이는 그림은 24장까지예요.</li>
      </ul>

      <input
        type="file"
        accept="image/png,image/webp,image/gif"
        onChange={(e) => upload(e.target.files?.[0])}
        className="file:bg-primary file:text-primary-foreground block text-sm file:mr-3 file:rounded-md file:border-0 file:px-3 file:py-2"
      />
      {msg && <p className="text-sm">{msg}</p>}

      {res && (
        <section className="space-y-4">
          {res.warnings.map((w) => (
            <p key={w} className="rounded-md border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">
              {w}
            </p>
          ))}
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
            <dt>프레임</dt>
            <dd>{res.frames}장{res.frames > 1 && ` · 초당 ${res.fps}장 · ${res.loop ? "반복" : "한 번"}`}</dd>
            <dt>용량</dt>
            <dd>
              올린 파일 {kb(res.inputBytes)} → 바꾼 그림 {kb(res.bytes)}
            </dd>
          </dl>

          <style>{`@keyframes pet-play { to { background-position-x: -${res.frames * show}px } }`}</style>
          <div className="flex gap-4">
            {["#ffffff", "#1e2329"].map((bg) => (
              <div key={bg} className="rounded-md border p-3" style={{ background: bg }}>
                <div
                  style={{
                    width: show,
                    height: show,
                    backgroundImage: `url(${res.sheet})`,
                    backgroundSize: `${res.frames * show}px ${show}px`,
                    animation: anim,
                  }}
                />
              </div>
            ))}
          </div>

          <div className="overflow-x-auto rounded-md border bg-[repeating-conic-gradient(#e5e7eb_0_25%,#fff_0_50%)] bg-[length:16px_16px]">
            {/* eslint-disable-next-line @next/next/no-img-element -- 변환 결과(data URL)를 그대로 보여 줌 */}
            <img src={res.sheet} alt="바꾼 그림 띠" height={128} style={{ height: 128, maxWidth: "none" }} />
          </div>
        </section>
      )}
    </main>
  );
}
