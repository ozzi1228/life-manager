"use client";

// 펫 설정(오늘의 펫, 펫 보이기)을 기기에 저장해 브라우저를 다시 열어도 유지.
// ponytail: 지금은 기기(localStorage)에만. 계정이 생기면 pet_preferences(14 §4.9)에 저장해 기기 간 동기화
import { useEffect, useState } from "react";

const KEY = "oona.pet-prefs";
// motion: 기기 설정 따르기(움직임 줄이기면 멈춤, 11 §6) / 움직이기 / 멈추기(11 §9 "움직임")
export type PetPrefs = { petId: string; visible: boolean; motion: "system" | "on" | "off" };
const DEFAULTS: PetPrefs = { petId: "meongi", visible: true, motion: "system" };

export function usePetPrefs() {
  const [prefs, setPrefs] = useState<PetPrefs>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const load = () => {
      try {
        const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
        if (saved) setPrefs({ ...DEFAULTS, ...saved });
      } catch {
        // 저장소를 쓸 수 없으면 기본값
      }
      setLoaded(true);
    };
    // 서버 렌더 결과와 어긋나지 않게 첫 그리기 뒤에 불러옴
    queueMicrotask(load);
    // 설정 화면에서 바꾸면 화면에 떠 있는 펫도 바로 바뀌게(같은 창 이벤트 + 다른 탭 storage)
    addEventListener(KEY, load);
    addEventListener("storage", load);
    return () => {
      removeEventListener(KEY, load);
      removeEventListener("storage", load);
    };
  }, []);

  const update = (patch: Partial<PetPrefs>) =>
    setPrefs((p) => {
      const next = { ...p, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
        queueMicrotask(() => dispatchEvent(new Event(KEY)));
      } catch {
        // 저장 실패해도 화면은 동작
      }
      return next;
    });

  return { prefs, update, loaded };
}
