"use client";

// 앱 셸 (docs/planning/02 §5, 03 §3.6·§6): PC·태블릿 사이드바 / 모바일 상단바 + 펼치는 메뉴(같은 사이드바가 왼쪽 창으로) + 빠른 추가(+), 오프라인 띠, 펫
import { History, LogOut, Menu, PanelLeftClose, PanelLeftOpen, PawPrint, Plus, Search, Settings, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { HintsProvider } from "@/components/app/help";
import { useBackToClose } from "@/components/app/responsive";
import { activeNav, MAIN_NAV, QUICK_ADD, titleFor } from "@/components/app/nav";
import { NavOrderProvider, useNavOrder } from "@/components/app/nav-order";
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
  useSidebar,
} from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

type Props = { menuOpen: boolean; name: string; seenHints: string[]; navOrder: Record<string, string[]>; children: ReactNode };

export function AppFrame(props: Props) {
  return (
    <NavOrderProvider initial={props.navOrder}>
      <ExpenseDialogProvider>
        <Frame {...props} />
      </ExpenseDialogProvider>
    </NavOrderProvider>
  );
}

function Frame({ menuOpen, name, seenHints, children }: Props) {
  const openExpense = useExpenseDialog();
  const path = usePathname();
  const router = useRouter();
  const active = activeNav(path);
  const [quickOpen, setQuickOpen] = useState(false); // 모바일 빠른 추가 아래 창
  const mobile = useIsMobile();
  const { prefs, loaded: petLoaded } = usePetPrefs();
  // 주 메뉴 순서: 끌어서 바꿈(위아래)
  const side = useNavOrder("main", MAIN_NAV, "y");


  const signOut = async () => {
    await authClient.signOut();
    router.replace("/login");
  };

  const profile = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="max-md:size-11" aria-label="내 메뉴">
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
      <SidebarProvider defaultOpen={menuOpen}>
        {/* PC·태블릿 사이드바. 모바일은 상단바 메뉴 버튼으로 펼치는 왼쪽 창 */}
        <CloseOnNavigate path={path} />
        <Sidebar collapsible="icon">
          <SidebarHeader>
            <Link href="/" className="flex h-10 items-center gap-2 px-2 font-bold">
              {/* eslint-disable-next-line @next/next/no-img-element -- 작은 로고(정적 파일) */}
              <img src="/icon.png" alt="" width={24} height={24} className="rounded" />
              <span className="group-data-[collapsible=icon]:hidden">
                우나 <span className="text-muted-foreground font-medium">oona</span>
              </span>
            </Link>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarMenu>
                {side.items.map((n) => (
                  <SidebarMenuItem key={n.href} ref={side.rowRef(n.href)} {...side.item(n.href)} className={cn("select-none", side.dragging === n.href && "bg-sidebar-accent rounded-md")}>
                    <SidebarMenuButton asChild isActive={active?.href === n.href} tooltip={n.label} className="max-md:h-11 max-md:text-base max-md:[&>svg]:size-5">
                      <MenuLink href={n.href}>
                        <n.icon />
                        <span>{n.label}</span>
                      </MenuLink>
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
                  <MenuLink href="/settings#pet">
                    <PawPrint />
                    <span>펫</span>
                  </MenuLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="작업 기록" isActive={path.startsWith("/activity")}>
                  <MenuLink href="/activity">
                    <History />
                    <span>작업 기록</span>
                  </MenuLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="설정" isActive={path.startsWith("/settings")}>
                  <MenuLink href="/settings">
                    <Settings />
                    <span>설정</span>
                  </MenuLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <MenuFold />
            </SidebarMenu>
          </SidebarFooter>
          <SidebarRail />
        </Sidebar>

        <SidebarInset className="min-w-0">
          {/* 상단바 */}
          <header data-pet-avoid className="bg-background/95 sticky top-0 z-10 flex h-14 items-center gap-2 border-b px-4 backdrop-blur md:px-6">
            <MenuButton />
            {/* PC 상단의 빠른 추가는 없앰(화면마다 추가 버튼이 있음). 모바일은 오른쪽 아래 + */}
            <h1 className="text-title flex-1 truncate font-semibold">{titleFor(path)}</h1>
            {/* 전체 검색(일기·일정·지출·목표·메모·위시·커리어) */}
            <Button variant="ghost" size="icon" className="max-md:size-11" aria-label="검색" title="검색" asChild>
              <Link href="/search">
                <Search />
              </Link>
            </Button>
            {profile}
          </header>

          <ConnectionBanner />

          <div className="flex-1 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-0">{children}</div>
        </SidebarInset>

        {/* 모바일 빠른 추가(+): 오른쪽 아래. 글 쓰는 화면에서는 저장 버튼을 가리지 않게 숨김 */}
        {!/^\/(records\/journal|career\/exp)\//.test(path) && <Button
          data-pet-avoid
          size="icon-lg"
          aria-label="빠른 추가"
          className="fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-20 size-14 rounded-full shadow-xl md:hidden"
          onClick={() => setQuickOpen(true)}
        >
          <Plus className="size-6" />
        </Button>}
        <Drawer open={quickOpen && mobile} onOpenChange={setQuickOpen}>
          <DrawerContent>
            <DrawerHeader className="text-left">
              <DrawerTitle>빠른 추가</DrawerTitle>
            </DrawerHeader>
            <div className="grid grid-cols-1 gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {QUICK_ADD.map((q) =>
                q.dialog ? (
                  <Button key={q.label} variant="outline" size="lg" className="h-12 justify-start" onClick={() => (setQuickOpen(false), openExpense())}>
                    <q.icon /> {q.label}
                  </Button>
                ) : (
                  <Button key={q.label} asChild variant="outline" size="lg" className="h-12 justify-start" onClick={() => setQuickOpen(false)}>
                    <Link href={q.href}>
                      <q.icon /> {q.label}
                    </Link>
                  </Button>
                ),
              )}
            </div>
          </DrawerContent>
        </Drawer>

        {petLoaded && prefs.visible && <PetLayer petId={prefs.petId} reducedMotion={prefs.motion === "off"} />}
      </SidebarProvider>
    </HintsProvider>
  );
}

/** PC 메뉴 접기·펼치기: 접으면 아이콘만 남고 내용이 넓어짐. 상태는 쿠키로 기억(새로 고침해도 그대로) */
/** 상단바 메뉴 버튼: PC는 사이드바 접기·펼치기, 모바일은 ☰로 메뉴 창 열기 */
function MenuButton() {
  const { isMobile, setOpenMobile } = useSidebar();
  if (!isMobile) return <SidebarTrigger className="-ml-1" title="메뉴 접기·펼치기 (Ctrl+B)" />;
  return (
    <Button variant="ghost" size="icon" className="-ml-2.5 size-11" aria-label="메뉴 열기" onClick={() => setOpenMobile(true)}>
      <Menu className="size-5" />
    </Button>
  );
}

/** 모바일 메뉴 창: 메뉴를 고르면(주소가 바뀌면) 닫히고, 휴대폰 뒤로 가기로도 닫힘(다른 창들과 같게) */
function CloseOnNavigate({ path }: { path: string }) {
  const { isMobile, openMobile, setOpenMobile } = useSidebar();
  useEffect(() => setOpenMobile(false), [path, setOpenMobile]);
  useBackToClose(isMobile && openMobile, setOpenMobile);
  return null;
}

/** 메뉴 링크: 모바일 메뉴 창이 열려 있으면 창이 쌓은 기록 칸을 이동할 곳으로 바꿈(뒤로 가기 한 번에 이전 화면) */
function MenuLink(props: ComponentProps<typeof Link>) {
  const { isMobile, openMobile } = useSidebar();
  return <Link {...props} replace={isMobile && openMobile} />;
}

function MenuFold() {
  const { open, toggleSidebar, isMobile } = useSidebar();
  if (isMobile) return null;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton tooltip="메뉴 펼치기" onClick={toggleSidebar} className="text-muted-foreground">
        {open ? <PanelLeftClose /> : <PanelLeftOpen />}
        <span>메뉴 접기</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
