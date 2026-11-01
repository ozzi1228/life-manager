import * as React from "react"

const MOBILE_BREAKPOINT = 768
const query = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

const subscribe = (cb: () => void) => {
  const mql = window.matchMedia(query)
  mql.addEventListener("change", cb)
  return () => mql.removeEventListener("change", cb)
}

// 화면 폭 < 768px(03 §6.1 모바일). 서버에서는 PC로 가정
export function useIsMobile() {
  return React.useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false)
}
