"use client";

// 앱 셸 (docs/planning/02 §5, 03 §3.6·§6): PC·태블릿 사이드바 / 모바일 상단바 + 하단 탭 + 빠른 추가(+), 오프라인 띠, 펫
import { LogOut, PawPrint, Plus, Settings, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { HintsProvider } from "@/components/app/help";
import { activeNav, MAIN_NAV, QUICK_ADD, titleFor } from "@/components/app/nav";
import { ConnectionBanner } from "@/components/app/pwa";
import { ExpenseDialogProvider, useExpenseDialog } from "@/components/money/expense-dialog";
import { PetLayer } from "@/components/pet/pet-layer";
import { usePetPrefs } from "@/components/pet/use-pet-prefs";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

type Props = { name: string; seenHints: string[]; children: ReactNode };

export function AppFrame(props: Props) {
  return (
    <ExpenseDialogProvider>
      <Frame {...props} />
    </ExpenseDialogProvider>
  );
}

function Frame({ name, seenHints, children }: Props) {
  const openExpense = useExpenseDialog();
  const path = usePathname();
  const router = useRouter();
  const active = activeNav(path);
  const [quickOpen, setQuickOpen] = useState(false); // PC는 추가 메뉴, 모바일은 아래 창
  const mobile = useIsMobile();
  const { prefs, loaded: petLoaded } = usePetPrefs();

  // PC 단축키: N = 빠른 추가(입력 중이 아닐 때, 02 §5.3)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key.toLowerCase() !== "n" || e.metaKey || e.ctrlKey || e.altKey || t.closest("input, textarea, select, [contenteditable=true]")) return;
      e.preventDefault();
      setQuickOpen(true);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  const signOut = async () => {
    await authClient.signOut();
    router.replace("/login");
  };

  const profile = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="내 메뉴">
          <UserRound />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel className="truncate">{name}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings /> 설정
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={signOut}>
          <LogOut /> 로그아웃
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <HintsProvider seen={seenHints}>
      <SidebarProvider>
        {/* PC·태블릿 사이드바(모바일은 하단 탭) */}
        <Sidebar collapsible="icon" className="max-md:hidden">
          <SidebarHeader>
            <Link href="/" className="flex h-10 items-center gap-2 px-2 font-bold">
              {/* eslint-disable-next-line @next/next/no-img-element -- 작은 로고(정적 파일) */}
              <img src="/icon.png" alt="" width={24} height={24} className="rounded" />
              <span className="group-data-[collapsible=icon]:hidden">우나</span>
            </Link>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarMenu>
                {MAIN_NAV.map((n) => (
                  <SidebarMenuItem key={n.href}>
                    <SidebarMenuButton asChild isActive={active?.href === n.href} tooltip={n.label}>
                      <Link href={n.href}>
                        <n.icon />
                        <span>{n.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="펫">
                  <Link href="/settings#pet">
                    <PawPrint />
                    <span>펫</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="설정" isActive={path.startsWith("/settings")}>
                  <Link href="/settings">
                    <Settings />
                    <span>설정</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
          <SidebarRail />
        </Sidebar>

        <SidebarInset className="min-w-0">
          {/* 상단바 */}
          <header data-pet-avoid className="bg-background/95 sticky top-0 z-10 flex h-14 items-center gap-2 border-b px-4 backdrop-blur md:px-6">
            <SidebarTrigger className="-ml-1 max-md:hidden" />
            <h1 className="text-title flex-1 truncate font-semibold">{titleFor(path)}</h1>
            <DropdownMenu open={quickOpen && !mobile} onOpenChange={setQuickOpen}>
              <DropdownMenuTrigger asChild>
                <Button size="sm" className="max-md:hidden">
                  <Plus /> 추가
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {QUICK_ADD.map((q) =>
                  q.dialog ? (
                    <DropdownMenuItem key={q.label} onSelect={() => openExpense()}>
                      {q.label}
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem key={q.label} asChild>
                      <Link href={q.href}>{q.label}</Link>
                    </DropdownMenuItem>
                  ),
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            {profile}
          </header>

          <ConnectionBanner />

          <div className="flex-1 pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">{children}</div>
        </SidebarInset>

        {/* 모바일 빠른 추가(+): 하단 탭 위 오른쪽. 글 쓰는 화면에서는 저장 버튼을 가리지 않게 숨김 */}
        {!/^\/(records\/journal|career\/exp)\//.test(path) && <Button
          data-pet-avoid
          size="icon-lg"
          aria-label="빠른 추가"
          className="fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 size-14 rounded-full shadow-xl md:hidden"
          onClick={() => setQuickOpen(true)}
        >
          <Plus className="size-6" />
        </Button>}
        <Drawer open={quickOpen && mobile} onOpenChange={setQuickOpen}>
          <DrawerContent>
            <DrawerHeader className="text-left">
              <DrawerTitle>빠른 추가</DrawerTitle>
            </DrawerHeader>
            <div className="grid gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {QUICK_ADD.map((q) =>
                q.dialog ? (
                  <Button key={q.label} variant="outline" size="lg" className="h-12 justify-start" onClick={() => (setQuickOpen(false), openExpense())}>
                    {q.label}
                  </Button>
                ) : (
                  <Button key={q.label} asChild variant="outline" size="lg" className="h-12 justify-start" onClick={() => setQuickOpen(false)}>
                    <Link href={q.href}>{q.label}</Link>
                  </Button>
                ),
              )}
            </div>
          </DrawerContent>
        </Drawer>

        {/* 모바일 하단 탭 */}
        <nav data-pet-avoid aria-label="주 메뉴" className="bg-background/95 fixed inset-x-0 bottom-0 z-10 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
          <ul className="grid h-16 grid-cols-6">
            {MAIN_NAV.map((n) => {
              const on = active?.href === n.href;
              return (
                <li key={n.href}>
                  <Link
                    href={n.href}
                    aria-current={on ? "page" : undefined}
                    className={cn("flex h-full flex-col items-center justify-center gap-0.5 text-xs", on ? "text-link font-semibold" : "text-muted-foreground")}
                  >
                    <n.icon className="size-6" strokeWidth={on ? 2.4 : 2} />
                    {n.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {petLoaded && prefs.visible && <PetLayer petId={prefs.petId} reducedMotion={prefs.motion === "off"} />}
      </SidebarProvider>
    </HintsProvider>
  );
}
