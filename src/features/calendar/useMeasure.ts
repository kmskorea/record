import { useEffect, useRef, useState } from 'react'

/** 컨테이너 실제 픽셀 너비를 재서 차트를 또렷하게 그린다(viewBox 확대는 글자가 흐려진다). */
export function useMeasure<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      setWidth(Math.round(entry.contentRect.width))
    })
    ro.observe(el)
    setWidth(Math.round(el.getBoundingClientRect().width))
    return () => ro.disconnect()
  }, [])

  return [ref, width] as const
}
