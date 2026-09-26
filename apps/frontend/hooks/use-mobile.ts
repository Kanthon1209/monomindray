import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}

/**
 * null = 尚未判定（SSR/首屏）；true = ≥ md。
 * 用于避免手机端挂载地图，并避免桌面端先按手机逻辑请求再重拉。
 */
export function useIsDesktop() {
  const [isDesktop, setIsDesktop] = React.useState<boolean | null>(null)

  React.useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${MOBILE_BREAKPOINT}px)`)
    const onChange = () => setIsDesktop(mql.matches)
    onChange()
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return isDesktop
}
