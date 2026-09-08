import { useCallback, useRef, useState } from 'react'

/**
 * 컨테이너 실제 픽셀 너비를 재서 차트를 또렷하게 그린다(viewBox 확대는 글자가 흐려진다).
 *
 * ref 객체 대신 콜백 ref를 쓴다. 이유가 있다.
 * 관찰 대상이 화면에서 잠깐 사라졌다 다시 나타나면(항목을 전부 껐다 켜는 경우),
 * ref 객체 방식에서는 관찰자가 떨어져 나간 옛 노드를 계속 보게 된다. 그 노드의
 * 너비는 0으로 보고되고, 다시 나타난 차트가 영영 그려지지 않는다.
 */
export function useMeasure<T extends HTMLElement>() {
  const [width, setWidth] = useState(0)
  const observer = useRef<ResizeObserver | null>(null)

  const ref = useCallback((node: T | null) => {
    observer.current?.disconnect()
    if (!node) return
    const ro = new ResizeObserver(([entry]) => {
      const next = Math.round(entry.contentRect.width)
      // 화면에서 빠지는 순간의 0은 무시한다. 진짜 너비만 반영한다.
      if (next > 0) setWidth(next)
    })
    ro.observe(node)
    observer.current = ro
    const initial = Math.round(node.getBoundingClientRect().width)
    if (initial > 0) setWidth(initial)
  }, [])

  return [ref, width] as const
}
