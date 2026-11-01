"use client";

// 화면 폭에 따라 그릇을 바꾸는 공통 래퍼 (docs/planning/03 §4.3, §11)
// - ResponsiveModal: PC·태블릿 Dialog ↔ 모바일 Drawer. 짧은 추가·수정, 가이드(size="lg")
// - ResponsiveDetail: PC 오른쪽 Sheet ↔ 모바일 Drawer. 목록을 보며 상세 보기
// 열려 있을 때 휴대폰 뒤로가기는 페이지 이동 대신 창을 닫음(03 §6.4)
import { useEffect, useRef, type ReactNode } from "react";
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

/** 열리면 기록 한 칸을 쌓고, 뒤로가기가 오면 닫음. UI로 닫으면 쌓은 칸을 되돌림 */
function useBackToClose(open: boolean, close: () => void) {
  const pushed = useRef(false);
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });
  useEffect(() => {
    if (!open) return;
    history.pushState({ ...history.state, oonaModal: true }, "");
    pushed.current = true;
    const onPop = () => {
      pushed.current = false;
      closeRef.current();
    };
    addEventListener("popstate", onPop);
    return () => {
      removeEventListener("popstate", onPop);
      if (pushed.current) {
        pushed.current = false;
        history.back();
      }
    };
  }, [open]);
}

const WIDTH = { sm: "sm:max-w-[400px]", md: "sm:max-w-[520px]", lg: "sm:max-w-[720px]" };

export function ResponsiveModal({ open, onOpenChange, title, description, footer, children, size = "md" }: Props & { size?: keyof typeof WIDTH }) {
  const mobile = useIsMobile();
  useBackToClose(open, () => onOpenChange(false));
  if (mobile)
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[90vh]">
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(WIDTH[size], "max-h-[85vh] overflow-y-auto")}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
        {footer && <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}

export function ResponsiveDetail({ open, onOpenChange, title, description, footer, children, wide }: Props & { wide?: boolean }) {
  const mobile = useIsMobile();
  useBackToClose(open, () => onOpenChange(false));
  if (mobile)
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
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
    <Sheet open={open} onOpenChange={onOpenChange}>
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
