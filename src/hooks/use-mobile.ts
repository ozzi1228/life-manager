import * as React from "react"

const MOBILE_BREAKPOINT = 768
// CSS(md: 768px 미만)와 같은 기준. max-width: 767px로 쓰면 767.2px 같은 소수점 폭에서 둘이 엇갈려 메뉴가 사라짐(2026-11-04)
const query = `(width < ${MOBILE_BREAKPOINT}px)`

const subscribe = (cb: () => void) => {
  const mql = window.matchMedia(query)
  mql.addEventListener("change", cb)
  return () => mql.removeEventListener("change", cb)
}

// 화면 폭 < 768px(03 §6.1 모바일). 서버에서는 PC로 가정
export function useIsMobile() {
  return React.useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false)
}
