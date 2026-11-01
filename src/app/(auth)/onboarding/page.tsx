"use client";

// 온보딩 (SCR-AUTH-04, 04 §2.4): 최대 3단계, 모두 건너뛸 수 있음
import { CalendarDays, HeartPulse, NotebookPen, Target, Wallet } from "lucide-react";
import { useState } from "react";
import { completeOnboarding } from "@/app/actions/onboarding";
import { PRESET_PETS } from "@/components/pet/pet-layer";
import { usePetPrefs } from "@/components/pet/use-pet-prefs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

const AREAS = [
  { id: "goals", label: "목표", icon: Target },
  { id: "money", label: "돈", icon: Wallet },
  { id: "calendar", label: "일정", icon: CalendarDays },
  { id: "records", label: "기록", icon: NotebookPen },
  { id: "health", label: "건강", icon: HeartPulse },
];

export default function OnboardingPage() {
  const { data: session } = authClient.useSession();
  const { update: updatePet } = usePetPrefs();
  const [step, setStep] = useState(0);
  const [name, setName] = useState<string | null>(null); // null = 아직 안 고침(세션 이름을 보여 줌)
  const [areas, setAreas] = useState<string[]>([]);
  const [pet, setPet] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const finish = async () => {
    setBusy(true);
    const display = name?.trim();
    if (display && display !== session?.user.name) await authClient.updateUser({ name: display.slice(0, 20) });
    if (pet) updatePet({ petId: pet, visible: true });
    const r = await completeOnboarding(areas);
    if (!r.ok) {
      setBusy(false);
      setMsg(r.error.message);
      return;
    }
    // 로그인 화면 묶음 → 앱 화면 묶음으로 넘어갈 때 클라이언트 이동이 중간에 끊기는 일이 있어(운영에서 멈춤) 새로 불러옴
    location.replace("/");
  };
  const nextStep = () => (step < 2 ? setStep(step + 1) : finish());

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex gap-1.5" aria-label={`3단계 중 ${step + 1}단계`}>
          {[0, 1, 2].map((i) => (
            <span key={i} className={cn("size-2 rounded-full", i <= step ? "bg-primary" : "bg-muted")} />
          ))}
        </div>
        <Button variant="ghost" size="sm" disabled={busy} onClick={finish}>
          건너뛰기
        </Button>
      </div>

      {step === 0 && (
        <section className="space-y-4">
          <h1 className="text-title font-bold">뭐라고 불러 드릴까요?</h1>
          <Input
            aria-label="표시 이름"
            autoFocus
            maxLength={20}
            className="h-11 text-base md:h-9 md:text-sm"
            value={name ?? session?.user.name ?? ""}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && nextStep()}
          />
        </section>
      )}

      {step === 1 && (
        <section className="space-y-4">
          <h1 className="text-title font-bold">주로 무엇을 관리하실 건가요?</h1>
          <p className="text-muted-foreground text-sm">여러 개 고를 수 있어요. 고른 것이 홈에 먼저 보여요.</p>
          <ToggleGroup type="multiple" value={areas} onValueChange={setAreas} className="grid w-full grid-cols-3 gap-2">
            {AREAS.map((a) => (
              <ToggleGroupItem key={a.id} value={a.id} variant="outline" className="data-[state=on]:border-primary data-[state=on]:bg-accent flex h-20 flex-col gap-1 rounded-lg">
                <a.icon className="size-6" />
                {a.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-4">
          <h1 className="text-title font-bold">함께할 펫을 골라 주세요</h1>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="펫">
            {PRESET_PETS.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={pet === p.id}
                onClick={() => setPet(p.id)}
                className="aria-checked:border-primary aria-checked:bg-accent flex flex-col items-center gap-1 rounded-lg border p-3"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- 펫 미리보기(정적 파일) */}
                <img src={`/pets/${p.id}/${pet === p.id ? "happy" : "idle"}.png`} alt="" width={72} height={72} />
                {p.name}
              </button>
            ))}
          </div>
          <p className="text-muted-foreground text-sm">펫은 설정에서 언제든 바꾸거나 끌 수 있어요.</p>
        </section>
      )}

      {msg && <p className="text-destructive-text text-sm">{msg}</p>}

      <div className="flex gap-2">
        {step > 0 && (
          <Button variant="outline" size="lg" className="h-12" disabled={busy} onClick={() => setStep(step - 1)}>
            이전
          </Button>
        )}
        <Button size="lg" className="h-12 flex-1" disabled={busy} onClick={nextStep}>
          {busy && <Spinner />} {step < 2 ? "다음" : "시작하기"}
        </Button>
      </div>
    </div>
  );
}
