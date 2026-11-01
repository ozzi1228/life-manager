"use client";

// 설정 홈 (SCR-SET-01) 1차: 화면 모드, 펫, AI 연결, 로그아웃. 나머지 하위 설정은 M-19
import { ChevronRight, Lock, LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Page } from "@/components/app/page-shell";
import { PRESET_PETS, petSrc } from "@/components/pet/pet-layer";
import { usePetPrefs } from "@/components/pet/use-pet-prefs";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { authClient } from "@/lib/auth-client";

const noop = () => () => {};

export default function SettingsPage() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  // 화면 모드는 브라우저에서만 알 수 있어 첫 그리기 뒤에 표시
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const { prefs, update, loaded } = usePetPrefs();
  const [mine, setMine] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    fetch("/api/v1/pets")
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((b) => setMine(b.data))
      .catch(() => {});
  }, []);
  const petButton = (p: { id: string; name: string }) => (
    <button
      key={p.id}
      type="button"
      role="radio"
      aria-checked={prefs.petId === p.id}
      onClick={() => update({ petId: p.id })}
      className="aria-checked:border-primary aria-checked:bg-accent flex flex-col items-center gap-1 rounded-lg border p-2 text-sm"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- 작은 펫 그림 */}
      <img src={petSrc(p.id, "idle")} alt="" width={56} height={56} />
      <span className="w-full truncate text-center">{p.name}</span>
    </button>
  );

  return (
    <Page narrow>
      <section className="space-y-3">
        <h2 className="text-subtitle font-semibold">화면</h2>
        <ToggleGroup type="single" variant="outline" value={mounted ? theme : undefined} onValueChange={(v) => v && setTheme(v)} aria-label="화면 모드">
          <ToggleGroupItem value="system">기기 설정 따라가기</ToggleGroupItem>
          <ToggleGroupItem value="light">밝게</ToggleGroupItem>
          <ToggleGroupItem value="dark">어둡게</ToggleGroupItem>
        </ToggleGroup>
      </section>

      <section id="pet" className="space-y-3">
        <h2 className="text-subtitle font-semibold">펫</h2>
        <label className="flex items-center justify-between gap-4 rounded-lg border p-4">
          <span>
            <span className="block font-medium">펫 보이기</span>
            <span className="text-muted-foreground text-sm">끄면 화면에 펫이 나타나지 않아요</span>
          </span>
          <Switch checked={prefs.visible} disabled={!loaded} onCheckedChange={(v) => update({ visible: v })} />
        </label>
        <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label="오늘의 펫">
          {PRESET_PETS.map(petButton)}
        </div>
        {mine.length > 0 && (
          <>
            <h3 className="text-muted-foreground flex items-center gap-1 text-sm font-medium">
              내 펫 <Lock className="size-3.5" aria-label="내 계정에서만 보여요" />
            </h3>
            <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label="내 펫">
              {mine.map(petButton)}
            </div>
          </>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-subtitle font-semibold">연결</h2>
        <Link href="/dev/ai" className="hover:bg-accent flex items-center justify-between rounded-lg border p-4">
          <span>
            <span className="block font-medium">AI 연결</span>
            <span className="text-muted-foreground text-sm">구독·API 키, 사용 순서</span>
          </span>
          <ChevronRight className="text-muted-foreground size-5" />
        </Link>
      </section>

      <Button
        variant="outline"
        onClick={async () => {
          await authClient.signOut();
          router.replace("/login");
        }}
      >
        <LogOut /> 로그아웃
      </Button>
    </Page>
  );
}
