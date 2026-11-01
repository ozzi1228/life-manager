"use client";

// 펫 렌더러 + 상태 머신 (docs/planning/11-pet-system.md §4)
// 그림: 캐릭터 시트(D-053)를 참고해 만든 동작별 한 장(assets/pets-hd → scripts/fit-pets.mjs). 움직임은 앱 효과(11 §5.1 대체 효과)
// D-055: 커서 따라오기 없음. 끌어서 옮길 수 있음. 걸어다니지 않고 놓은 자리에서 쉼·앉기·두리번(사용자 피드백 2026-11-01)
// 원칙: rAF 루프 1개, transform만 매 프레임 변경(리플로우 없음), 그림은 동작이 바뀔 때만 교체
import { useEffect, useRef } from "react";

const POSES = ["idle", "sit", "surprised", "happy", "sleep", "hover", "discover"] as const;
type Pose = (typeof POSES)[number];

export const PRESET_PETS = [
  { id: "pomong", name: "포몽" },
  { id: "komong", name: "코몽" },
  { id: "piyo", name: "삐요" },
  { id: "meongi", name: "멍이" },
  { id: "hoya", name: "호야" },
] as const;

export type PetStats = { fps: number; avgMs: number; maxMs: number; state: string; overlaps: number };

type Props = {
  petId: string;
  size?: number;
  reducedMotion?: boolean; // 테스트용 강제. 기본은 시스템 설정을 따름
  sleepAfterMs?: number;
  onClick?: () => void;
  onStats?: (s: PetStats) => void;
};

const DRAG_THRESHOLD = 6;
const JUMP_TIME = 0.45;

type Rect = { l: number; t: number; r: number; b: number };
const hit = (a: Rect, b: Rect) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;

export function PetLayer({ petId, size = 80, reducedMotion, sleepAfterMs = 60_000, onClick, onStats }: Props) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const cb = useRef({ onClick, onStats });
  useEffect(() => {
    cb.current = { onClick, onStats };
  });

  useEffect(() => {
    const box = outer.current!;
    const art = inner.current!;
    const src = (p: Pose) => `/pets/${petId}/${p}.png`;
    // 미리 불러와 디코딩해 두고 참조를 붙잡아 둠(휴대폰에서 그림을 바꿀 때 앞뒤 그림이 겹쳐 보이지 않게)
    const preloaded = POSES.map((p) => {
      const img = new Image();
      img.src = src(p);
      img.decode().catch(() => {});
      return img;
    });
    const reduce = reducedMotion ?? matchMedia("(prefers-reduced-motion: reduce)").matches;
    const maxX = () => innerWidth - size;
    const maxY = () => innerHeight - size - 8;

    const s = {
      x: innerWidth * 0.7,
      y: maxY(),
      pose: "" as Pose | "",
      t: 0,
      restPose: "idle" as Pose,
      rest: 3,
      hover: false,
      jumpLeft: 0,
      drag: null as null | { dx: number; dy: number; sx: number; sy: number; moved: boolean },
      lastInput: performance.now(),
    };
    const setPose = (p: Pose) => {
      if (s.pose === p) return;
      s.pose = p;
      s.t = 0;
      art.style.backgroundImage = `url(${src(p)})`;
    };
    const newRest = (sec: number) => {
      const r = Math.random();
      s.restPose = r < 0.6 ? "idle" : r < 0.9 ? "sit" : "discover";
      s.rest = sec;
    };

    // 안전 영역: [data-pet-avoid] + 입력 중인 칸. 0.5초마다 갱신
    let avoid: Rect[] = [];
    const refreshAvoid = () => {
      const list = [...document.querySelectorAll<HTMLElement>("[data-pet-avoid]")];
      const a = document.activeElement;
      if (a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement) list.push(a);
      avoid = list.map((e) => {
        const r = e.getBoundingClientRect();
        return { l: r.left - 8, t: r.top - 8, r: r.right + 8, b: r.bottom + 8 };
      });
    };
    refreshAvoid();
    const avoidTimer = setInterval(refreshAvoid, 500);
    const blocked = (x: number, y: number) => avoid.some((r) => hit({ l: x, t: y, r: x + size, b: y + size }, r));
    // 모달·입력칸 위에 있게 되면 가까운 빈자리로 깡충 비켜 감(걸어다니지 않음, 사용자 피드백 2026-11-01)
    const freeSpot = () => {
      // 하단 탭 위 가장자리가 주 활동 영역(02 §5.1): 먼저 바로 위로, 안 되면 주변 아무 빈자리
      for (let up = 16; up <= 320; up += 16) if (!blocked(s.x, Math.max(0, s.y - up))) return { x: s.x, y: Math.max(0, s.y - up) };
      for (let i = 0; i < 24; i++) {
        const reach = 80 + i * 30; // 가까운 곳부터
        const a = Math.random() * Math.PI * 2;
        const x = Math.max(0, Math.min(maxX(), s.x + Math.cos(a) * reach));
        const y = Math.max(0, Math.min(maxY(), s.y + Math.sin(a) * reach));
        if (!blocked(x, y)) return { x, y };
      }
      return null;
    };

    const markInput = () => (s.lastInput = performance.now());
    addEventListener("pointermove", markInput, { passive: true });
    addEventListener("keydown", markInput);
    const onResize = () => {
      s.x = Math.min(s.x, maxX());
      s.y = Math.min(s.y, maxY());
    };
    addEventListener("resize", onResize);

    // ── 끌어서 옮기기 (마우스·터치 공통) ──
    const down = (e: PointerEvent) => {
      try {
        box.setPointerCapture(e.pointerId);
      } catch {
        // 합성 포인터 등 캡처할 수 없는 경우에도 끌기는 동작
      }
      s.drag = { dx: e.clientX - s.x, dy: e.clientY - s.y, sx: e.clientX, sy: e.clientY, moved: false };
    };
    const move = (e: PointerEvent) => {
      const d = s.drag;
      if (!d) return;
      if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < DRAG_THRESHOLD) return;
      d.moved = true;
      s.x = Math.max(0, Math.min(maxX(), e.clientX - d.dx));
      s.y = Math.max(0, Math.min(maxY(), e.clientY - d.dy));
    };
    const up = () => {
      const d = s.drag;
      s.drag = null;
      if (!d) return;
      if (d.moved) {
        newRest(4 + Math.random() * 8); // 놓은 자리에서 쉼
      } else {
        s.jumpLeft = JUMP_TIME;
        cb.current.onClick?.();
      }
    };
    // 애교는 마우스를 올렸을 때만. 터치는 손이 닿자마자 끌기·누르기로 이어져 그림이 연달아 바뀌므로 생략
    const enter = (e: PointerEvent) => {
      if (e.pointerType === "mouse") s.hover = true;
    };
    const leave = () => (s.hover = false);
    box.addEventListener("pointerdown", down);
    box.addEventListener("pointermove", move);
    box.addEventListener("pointerup", up);
    box.addEventListener("pointercancel", up);
    box.addEventListener("pointerenter", enter);
    box.addEventListener("pointerleave", leave);

    let frames = 0;
    let workSum = 0;
    let workMax = 0;
    let overlaps = 0;
    let last = performance.now();
    let statsAt = last;
    let raf = 0;
    let mode = "rest";

    const tick = (now: number) => {
      const t0 = performance.now();
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      s.t += dt;
      let fx = ""; // 그림에 줄 효과(아래 가운데 기준)

      if (reduce) {
        mode = "reduced";
        setPose("idle");
      } else if (s.drag?.moved) {
        mode = "drag";
        setPose("surprised");
        fx = `rotate(${Math.sin(s.t * 8) * 6}deg)`;
      } else if (s.jumpLeft > 0) {
        mode = "surprised";
        setPose("surprised");
        s.jumpLeft -= dt;
        const p = 1 - Math.max(0, s.jumpLeft) / JUMP_TIME;
        fx = `translateY(${-14 * Math.sin(Math.PI * p)}px)`;
        if (s.jumpLeft <= 0) newRest(2);
      } else if (s.hover) {
        mode = "hover";
        setPose("hover");
        fx = `rotate(${Math.sin(s.t * 9) * 5}deg)`;
      } else if (s.pose === "sleep" || now - s.lastInput > sleepAfterMs) {
        mode = "sleep";
        if (now - s.lastInput < 500) newRest(2); // 사용자가 움직이면 깸
        else {
          setPose("sleep");
          fx = `scaleY(${1 + Math.sin(s.t * 1.6) * 0.025})`;
        }
      } else {
        mode = "rest";
        setPose(s.restPose);
        fx = `scaleY(${1 + Math.sin(s.t * 2.2) * 0.02})`;
        const spot = blocked(s.x, s.y) ? freeSpot() : null;
        if (spot) {
          s.x = spot.x;
          s.y = spot.y;
          s.jumpLeft = JUMP_TIME;
        }
        s.rest -= dt;
        if (s.rest <= 0) newRest(5 + Math.random() * 12); // 대기·앉기·두리번을 번갈아

      }

      box.style.transform = `translate3d(${s.x}px, ${s.y}px, 0)`;
      art.style.transform = reduce ? "" : fx;
      if (!s.drag && blocked(s.x, s.y)) overlaps++;

      const work = performance.now() - t0;
      frames++;
      workSum += work;
      workMax = Math.max(workMax, work);
      if (now - statsAt >= 1000) {
        cb.current.onStats?.({
          fps: Math.round((frames * 1000) / (now - statsAt)),
          avgMs: workSum / frames,
          maxMs: workMax,
          state: `${mode} / ${s.pose}`,
          overlaps,
        });
        frames = 0;
        workSum = 0;
        workMax = 0;
        statsAt = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick); // 탭이 숨겨지면 rAF가 멈춤(배터리 절약)

    return () => {
      preloaded.length = 0;
      cancelAnimationFrame(raf);
      clearInterval(avoidTimer);
      removeEventListener("pointermove", markInput);
      removeEventListener("keydown", markInput);
      removeEventListener("resize", onResize);
      box.removeEventListener("pointerdown", down);
      box.removeEventListener("pointermove", move);
      box.removeEventListener("pointerup", up);
      box.removeEventListener("pointercancel", up);
      box.removeEventListener("pointerenter", enter);
      box.removeEventListener("pointerleave", leave);
    };
  }, [petId, size, reducedMotion, sleepAfterMs]);

  return (
    <div
      ref={outer}
      aria-hidden
      className="fixed top-0 left-0 z-30 cursor-grab touch-none select-none active:cursor-grabbing"
      style={{ width: size, height: size, willChange: "transform" }}
    >
      <div
        ref={inner}
        className="h-full w-full bg-contain bg-bottom bg-no-repeat"
        style={{ transformOrigin: "50% 100%", filter: "drop-shadow(0 1px 1px rgb(0 0 0 / 0.12))" }}
      />
    </div>
  );
}
