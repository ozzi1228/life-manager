"use client";

// 펫 렌더러 + 상태 머신 (docs/planning/11-pet-system.md §4)
// 그림: 사용자 캐릭터 시트(D-053)에서 잘라낸 동작별 한 장(scripts/cut-pets.mjs). 움직임은 앱 효과(11 §5.1 대체 효과)
// D-055: 커서 따라오기 없음. 끌어서 옮길 수 있고, 놓은 자리에서 다시 스스로 천천히 돌아다님
// 원칙: rAF 루프 1개, transform만 매 프레임 변경(리플로우 없음), 그림은 동작이 바뀔 때만 교체
import { useEffect, useRef } from "react";

const POSES = ["idle", "walk", "sit", "surprised", "happy", "sleep", "hover", "discover"] as const;
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

const WALK_SPEED = 22; // px/s — 천천히 (D-055)
const STEP_HZ = 2.8; // 초당 걸음 수(아장아장)
const WADDLE_DEG = 6; // 걸음마다 디딘 발 쪽으로 기우는 각도
// 펫별 그림 바꿔 끼우기(사용자 피드백 2026-11-01, docs/planning/11 §3.1)
// - 걷기: 시트의 "걷기"는 옆·네 발 그림이 많아 뒷걸음질·네 발 걸음으로 보임 → 정면으로 선 그림으로 두 발 걸음
// - 포몽 "애교"는 귀가 처져 강아지처럼 보임 → "기뻐하기"
// - 멍이 "앉기"·"무언가 발견"은 곰처럼, "따라오기"는 머리에 덩어리가 보임 → "대기"
const ART: Record<string, Partial<Record<Pose, string>>> = { // 값 = public/pets/<id>/의 그림 파일 이름
  pomong: { walk: "follow", hover: "happy" },
  komong: { walk: "follow" },
  piyo: { walk: "follow" },
  meongi: { walk: "hover", sit: "idle", discover: "idle" },
  hoya: { walk: "follow" },
};
const FEET_LINE = 86; // 그림 높이의 이 % 아래를 발로 보고 좌우로 나눠 따로 움직임
const DRAG_THRESHOLD = 6;
const JUMP_TIME = 0.45;

type Rect = { l: number; t: number; r: number; b: number };
const hit = (a: Rect, b: Rect) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;

export function PetLayer({ petId, size = 80, reducedMotion, sleepAfterMs = 60_000, onClick, onStats }: Props) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const layers = useRef<HTMLDivElement[]>([]); // [몸통, 왼발, 오른발] — 같은 그림을 잘라 보이는 영역만 다름
  const cb = useRef({ onClick, onStats });
  useEffect(() => {
    cb.current = { onClick, onStats };
  });

  useEffect(() => {
    const box = outer.current!;
    const art = inner.current!;
    const [, footL, footR] = layers.current;
    const src = (p: Pose) => `/pets/${petId}/${ART[petId]?.[p] ?? p}.png`;
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
      target: null as null | { x: number; y: number },
      hover: false,
      jumpLeft: 0,
      drag: null as null | { dx: number; dy: number; sx: number; sy: number; moved: boolean },
      lastInput: performance.now(),
    };
    const setPose = (p: Pose) => {
      if (s.pose === p) return;
      s.pose = p;
      s.t = 0;
      for (const l of layers.current) l.style.backgroundImage = `url(${src(p)})`;
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
    // 가고 싶은 곳: 지금 서 있는 높이에서 좌우로만 걷는다(땅 위를 걷는 느낌, 떠다니지 않게).
    // 모달·입력칸 위에 놓인 경우에만 위아래로도 비켜 감
    const pickTarget = () => {
      const escaping = blocked(s.x, s.y);
      for (let i = 0; i < 16; i++) {
        const reach = i < 8 ? 1 : 2.5; // 가까운 곳이 없으면 더 멀리
        const dir = Math.random() < 0.5 ? -1 : 1;
        const x = Math.max(0, Math.min(maxX(), s.x + dir * (80 + Math.random() * 180) * reach));
        const y = escaping ? Math.max(0, Math.min(maxY(), s.y + (Math.random() - 0.5) * 260 * reach)) : s.y;
        if (!blocked(x, y) && Math.abs(x - s.x) > 20) return { x, y };
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
      s.target = null;
      if (d.moved) {
        newRest(2 + Math.random() * 4); // 놓은 자리에 고정하지 않음: 쉬었다가 다시 스스로 움직임
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
      let feet = [0, 0]; // 왼발·오른발 들어 올림(px, 음수가 위)
      let origin = "50% 100%"; // 기울기 중심(걸을 때는 디딘 발)

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
      } else if (s.target) {
        mode = "walk";
        setPose("walk");
        // 두 발로 아장아장(사용자 피드백): 정면 그림으로, 한 발을 들면 디딘 발을 축으로 몸이 그쪽으로 뒤뚱 기움.
        // 발을 드는 동안만 앞으로 나아가고, 디딜 때 살짝 눌림. 정면 그림이라 방향을 뒤집지 않음(뒷걸음질 없음)
        const ph = s.t * STEP_HZ;
        const lift = Math.sin(Math.PI * (ph % 1)); // 0(디딤) → 1(발 듦) → 0
        const leftStep = Math.floor(ph) % 2 === 0; // 왼발을 드는 걸음
        const squash = 0.04 * (1 - lift);
        origin = leftStep ? "68% 100%" : "32% 100%"; // 디딘 발 위치
        fx = `rotate(${(leftStep ? 1 : -1) * WADDLE_DEG * lift}deg) translateY(${-1.5 * lift}px) scale(${1 + squash}, ${1 - squash})`;
        feet = [leftStep ? -3 * lift : 0, leftStep ? 0 : -3 * lift];
        const dx = s.target.x - s.x;
        const dy = s.target.y - s.y;
        const dist = Math.hypot(dx, dy);
        const step = Math.min(dist, WALK_SPEED * 1.57 * lift * dt); // 평균 속도는 WALK_SPEED
        const nx = s.x + (dx / (dist || 1)) * step;
        const ny = s.y + (dy / (dist || 1)) * step;
        // 이미 안전 영역 안이면(그 위에 놓인 경우) 빠져나가는 걸음은 막지 않음
        if (dist < 1 || (blocked(nx, ny) && !blocked(s.x, s.y))) {
          s.target = null;
          newRest(5 + Math.random() * 12); // 오래 쉬다가 가끔 움직임
        } else {
          s.x = nx;
          s.y = ny;
        }
      } else {
        mode = "rest";
        setPose(s.restPose);
        fx = `scaleY(${1 + Math.sin(s.t * 2.2) * 0.02})`;
        if (blocked(s.x, s.y)) s.rest = Math.min(s.rest, 1); // 모달·입력칸 위에 놓였으면 곧 비켜 감
        s.rest -= dt;
        if (s.rest <= 0) {
          s.target = pickTarget();
          if (!s.target) newRest(3);
        }
      }

      box.style.transform = `translate3d(${s.x}px, ${s.y}px, 0)`;
      art.style.transformOrigin = origin;
      art.style.transform = reduce ? "" : fx;
      footL.style.transform = feet[0] ? `translateY(${feet[0]}px)` : "";
      footR.style.transform = feet[1] ? `translateY(${feet[1]}px)` : "";
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
        className="relative h-full w-full"
        style={{ transformOrigin: "50% 100%", filter: "drop-shadow(0 1px 1px rgb(0 0 0 / 0.12))" }}
      >
        {[
          `inset(0 0 ${100 - FEET_LINE}% 0)`, // 몸통
          `inset(${FEET_LINE}% 50% 0 0)`, // 왼발
          `inset(${FEET_LINE}% 0 0 50%)`, // 오른발
        ].map((clip, i) => (
          <div
            key={i}
            ref={(e) => {
              if (e) layers.current[i] = e;
            }}
            className="absolute inset-0 bg-contain bg-bottom bg-no-repeat"
            style={{ clipPath: clip }}
          />
        ))}
      </div>
    </div>
  );
}
