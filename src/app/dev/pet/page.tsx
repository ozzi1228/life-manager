"use client";

// 0단계 V-05: 펫 렌더러 시험 (기본 펫 5종, 끌어서 옮기기, 펫 끄기)
import { useState } from "react";
import { PetLayer, PRESET_PETS, type PetStats } from "@/components/pet/pet-layer";
import { usePetPrefs } from "@/components/pet/use-pet-prefs";
import { Button } from "@/components/ui/button";

export default function PetTest() {
  const { prefs, update, loaded } = usePetPrefs();
  const { petId, visible } = prefs;
  const [reduce, setReduce] = useState(false);
  const [fastSleep, setFastSleep] = useState(false);
  const [stats, setStats] = useState<PetStats | null>(null);
  const [clicks, setClicks] = useState(0);

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">펫 렌더러 시험</h1>
      <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
        <li>펫은 혼자 쉬거나 천천히 돌아다녀요.</li>
        <li>끌어서 옮길 수 있어요. 놓은 자리에서 다시 가고 싶은 곳으로 가요.</li>
        <li>펫 위에 올리면 애교, 누르면 놀라요. 한동안 아무것도 안 하면 잠들어요.</li>
        <li>아래 상자와 입력 중인 칸 위로는 들어오지 않아요.</li>
      </ul>

      <section className="space-y-2">
        <p className="text-sm font-semibold">오늘의 펫</p>
        <div className="flex flex-wrap gap-2">
          {PRESET_PETS.map((p) => (
            <Button key={p.id} variant={p.id === petId ? "default" : "outline"} onClick={() => update({ petId: p.id })}>
              {p.name}
            </Button>
          ))}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span>입력 중인 칸 위로는 오지 않아요</span>
          <input className="w-full rounded-md border px-3 py-2" placeholder="여기에 써 보세요" />
        </label>
        <div data-pet-avoid className="bg-card rounded-xl border p-4 text-sm shadow-sm">
          <p className="font-semibold">모달 흉내 상자</p>
          <p className="text-muted-foreground">펫이 이 상자 위로 들어오지 않아야 해요.</p>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant={visible ? "default" : "outline"} onClick={() => update({ visible: !visible })}>
          펫 보이기 {visible ? "켜짐" : "꺼짐"}
        </Button>
        <Button variant={reduce ? "default" : "outline"} onClick={() => setReduce((r) => !r)}>
          움직임 줄이기 {reduce ? "켜짐" : "꺼짐"}
        </Button>
        <Button variant={fastSleep ? "default" : "outline"} onClick={() => setFastSleep((f) => !f)}>
          10초 뒤 잠들기 {fastSleep ? "켜짐" : "꺼짐"}
        </Button>
        <span className="text-sm">펫 누른 횟수: {clicks}</span>
      </div>

      <table className="text-sm">
        <tbody className="tabular-nums">
          <tr><td className="text-muted-foreground pr-6">초당 프레임</td><td>{stats?.fps ?? "…"}</td></tr>
          <tr><td className="text-muted-foreground pr-6">프레임당 계산 평균</td><td>{stats ? `${stats.avgMs.toFixed(3)}ms` : "…"}</td></tr>
          <tr><td className="text-muted-foreground pr-6">프레임당 계산 최대(1초)</td><td>{stats ? `${stats.maxMs.toFixed(3)}ms` : "…"}</td></tr>
          <tr><td className="text-muted-foreground pr-6">상태</td><td>{stats?.state ?? "…"}</td></tr>
          <tr><td className="text-muted-foreground pr-6">안전 영역 겹침(누적 프레임)</td><td>{stats?.overlaps ?? "…"}</td></tr>
        </tbody>
      </table>

      {loaded && visible && (
        <PetLayer
          petId={petId}
          reducedMotion={reduce}
          sleepAfterMs={fastSleep ? 10_000 : 60_000}
          onStats={setStats}
          onClick={() => setClicks((c) => c + 1)}
        />
      )}
    </main>
  );
}
