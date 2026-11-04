"use client";

// 화면 폭에 따라 그릇을 바꾸는 공통 래퍼 (docs/planning/03 §4.3, §11)
// - ResponsiveModal: PC·태블릿 Dialog ↔ 모바일 Drawer. 짧은 추가·수정, 가이드(size="lg")
// - ResponsiveDetail: PC 오른쪽 Sheet ↔ 모바일 Drawer. 목록을 보며 상세 보기
// 열려 있을 때 휴대폰 뒤로가기는 페이지 이동 대신 창을 닫음(03 §6.4)
import { useEffect, useId, useRef, type ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
};

/**
 * 열리면 기록(history)에 한 칸을 쌓고, 뒤로가기가 오면 닫음. UI로 닫을 때는 쌓은 칸을 되돌림.
 * 정리(cleanup)에서는 기록을 건드리지 않음 — 개발 모드에서 효과가 두 번 실행되면 열자마자 닫히던 문제(2026-11-01)
 */
export function useBackToClose(open: boolean, onOpenChange: (open: boolean) => void) {
  const id = useId();
  const latest = useRef({ open, onOpenChange });
  useEffect(() => {
    latest.current = { open, onOpenChange };
  });
  const pushed = useRef(false);
  useEffect(() => {
    if (open && history.state?.oonaModal !== id) {
      history.pushState({ ...history.state, oonaModal: id }, "");
      pushed.current = true;
    }
    // 코드가 직접 닫은 경우(저장 후 등)에도 쌓은 칸을 한 번만 되돌림
    if (!open && pushed.current) {
      pushed.current = false;
      if (history.state?.oonaModal === id) history.back();
    }
  }, [open, id]);
  useEffect(() => {
    const onPop = () => {
      if (history.state?.oonaModal !== id) pushed.current = false;
      if (latest.current.open && history.state?.oonaModal !== id) latest.current.onOpenChange(false);
    };
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, [id]);
  return (next: boolean) => {
    onOpenChange(next); // 닫히면 위 효과가 쌓은 칸을 되돌림
  };
}

const WIDTH = { sm: "sm:max-w-[400px]", md: "sm:max-w-[520px]", lg: "sm:max-w-[720px]" };

export function ResponsiveModal({ open, onOpenChange, title, description, footer, children, size = "md" }: Props & { size?: keyof typeof WIDTH }) {
  const mobile = useIsMobile();
  const change = useBackToClose(open, onOpenChange);
  if (mobile)
    return (
      <Drawer open={open} onOpenChange={change} repositionInputs={false}>
        {/* 열 때 첫 칸으로 저절로 가지 않게(휴대폰 키보드가 갑자기 뜨지 않게). autoFocus를 준 칸은 그대로 */}
        <DrawerContent className="max-h-[90vh]" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DrawerHeader className="text-left">
            <DrawerTitle>{title}</DrawerTitle>
            {description && <DrawerDescription>{description}</DrawerDescription>}
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-2">{children}</div>
          {/* 모바일은 저장이 위, 취소가 아래(03 §4.4): footer 안 버튼 순서를 세로로 뒤집음 */}
          {footer && <DrawerFooter className="flex-col-reverse pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</DrawerFooter>}
        </DrawerContent>
      </Drawer>
    );
  return (
    <Dialog open={open} onOpenChange={change}>
      {/* 본문만 스크롤, 저장 버튼(footer)은 늘 보이게 */}
      <DialogContent className={cn(WIDTH[size], "flex max-h-[85vh] flex-col")}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="-mx-4 -my-1 min-h-0 flex-1 overflow-y-auto px-4 py-1">{children}</div>
        {footer && <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}

export function ResponsiveDetail({ open, onOpenChange, title, description, footer, children, wide }: Props & { wide?: boolean }) {
  const mobile = useIsMobile();
  const change = useBackToClose(open, onOpenChange);
  if (mobile)
    return (
      <Drawer open={open} onOpenChange={change} repositionInputs={false}>
        <DrawerContent className="max-h-[90vh]">
          <DrawerHeader className="text-left">
            <DrawerTitle>{title}</DrawerTitle>
            {description && <DrawerDescription>{description}</DrawerDescription>}
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-4">{children}</div>
          {footer && <DrawerFooter className="pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</DrawerFooter>}
        </DrawerContent>
      </Drawer>
    );
  return (
    <Sheet open={open} onOpenChange={change}>
      <SheetContent className={cn("flex flex-col", wide ? "sm:max-w-[560px]" : "sm:max-w-[400px]")}>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4">{children}</div>
        {footer && <SheetFooter>{footer}</SheetFooter>}
      </SheetContent>
    </Sheet>
  );
}
