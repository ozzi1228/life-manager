"use client";

// 설정 홈 (SCR-SET-01): 계정, 알림, 화면 모드, 펫, AI 연결, 휴지통·보안 기록, 운영(주인만), 로그아웃
// ponytail: 외부 캘린더(C-08)·건강 잠금(C-15)·내보내기·탈퇴(C-14)는 그 작업에서
import { ChevronRight, Lock, LogOut, ShieldCheck, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Page } from "@/components/app/page-shell";
import { PRESET_PETS, petSrc } from "@/components/pet/pet-layer";
import { AccountSection } from "@/components/settings/account";
import { NotifySection, OpsSection } from "@/components/settings/notify";
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
        <h2 className="text-subtitle font-semibold">계정</h2>
        <AccountSection />
      </section>

      <section className="space-y-3">
        <h2 className="text-subtitle font-semibold">알림</h2>
        <NotifySection />
      </section>

      <section className="space-y-3">
        <h2 className="text-subtitle font-semibold">화면</h2>
        <ToggleGroup type="single" variant="outline" value={mounted ? theme : undefined} onValueChange={(v) => v && setTheme(v)} aria-label="화면 모드" className="w-full max-w-md">
          {/* 세 칸을 같은 폭으로 나누고, 글씨가 크면 칸 안에서 줄바꿈(화면 밖으로 넘치지 않게) */}
          <ToggleGroupItem value="system" className="h-auto min-h-9 min-w-0 flex-1 py-1.5 whitespace-normal">
            기기 설정 따라가기
          </ToggleGroupItem>
          <ToggleGroupItem value="light" className="h-auto min-h-9 min-w-0 flex-1 py-1.5 whitespace-normal">
            밝게
          </ToggleGroupItem>
          <ToggleGroupItem value="dark" className="h-auto min-h-9 min-w-0 flex-1 py-1.5 whitespace-normal">
            어둡게
          </ToggleGroupItem>
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
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
          <span>
            <span className="block font-medium">움직임</span>
            <span className="text-muted-foreground text-sm">멈추면 그 자리에 가만히 있어요</span>
          </span>
          <ToggleGroup type="single" variant="outline" size="sm" value={prefs.motion} disabled={!loaded} onValueChange={(v) => v && update({ motion: v as typeof prefs.motion })} aria-label="펫 움직임">
            <ToggleGroupItem value="on">움직이기</ToggleGroupItem>
            <ToggleGroupItem value="off">멈추기</ToggleGroupItem>
          </ToggleGroup>
        </div>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-5" role="radiogroup" aria-label="오늘의 펫">
          {PRESET_PETS.map(petButton)}
        </div>
        {mine.length > 0 && (
          <>
            <h3 className="text-muted-foreground flex items-center gap-1 text-sm font-medium">
              내 펫 <Lock className="size-3.5" aria-label="내 계정에서만 보여요" />
            </h3>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-5" role="radiogroup" aria-label="내 펫">
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

      <section className="space-y-3">
        <h2 className="text-subtitle font-semibold">데이터</h2>
        {[
          { href: "/settings/trash", icon: Trash2, title: "휴지통", desc: "지운 항목 되살리기·영구 삭제 (90일 보관)" },
          { href: "/settings/security", icon: ShieldCheck, title: "보안 기록", desc: "로그인·비밀번호 변경·영구 삭제 기록" },
        ].map((l) => (
          <Link key={l.href} href={l.href} className="hover:bg-accent flex items-center gap-3 rounded-lg border p-4">
            <l.icon className="text-muted-foreground size-5" />
            <span className="flex-1">
              <span className="block font-medium">{l.title}</span>
              <span className="text-muted-foreground text-sm">{l.desc}</span>
            </span>
            <ChevronRight className="text-muted-foreground size-5" />
          </Link>
        ))}
        <p className="text-muted-foreground text-caption">건강 기록은 암호화해 저장하고 홈·검색·AI에는 보이지 않아요.</p>
      </section>

      <OpsSection />

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
