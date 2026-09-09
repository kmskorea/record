import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * 목록을 끌어서 순서를 바꾼다.
 *
 * 손잡이에서만 끌리게 해서 체크박스·삭제 버튼과 부딪히지 않는다.
 * 끄는 동안에는 화면에서만 자리를 바꿔 보여주고, 손을 뗄 때 한 번 저장한다.
 * (시계와 같은 이유다. 움직일 때마다 저장하면 앱 전체가 다시 그려져
 * 손가락을 따라오지 못한다.)
 */
export function useDragOrder(keys: string[], onCommit: (keys: string[]) => void) {
  const listEl = useRef<HTMLUListElement | null>(null)
  const detach = useRef<(() => void) | null>(null)
  const [order, setOrder] = useState<string[] | null>(null)
  const [draggingKey, setDraggingKey] = useState<string | null>(null)
  const dragging = useRef<{ key: string; keys: string[] } | null>(null)

  /**
   * 콜백 ref로 붙인다. 목록은 할 일이 하나도 없으면 아예 그려지지 않아서,
   * 처음 한 번만 도는 효과로는 나중에 생긴 목록을 놓친다.
   *
   * 끄는 동안 페이지가 스크롤되면 손을 놓친다. React가 붙이는 리스너는
   * passive라 preventDefault가 통하지 않으므로 직접 단다.
   */
  const listRef = useCallback((node: HTMLUListElement | null) => {
    detach.current?.()
    detach.current = null
    listEl.current = node
    if (!node) return
    const block = (e: TouchEvent) => {
      if (dragging.current) e.preventDefault()
    }
    node.addEventListener('touchmove', block, { passive: false })
    detach.current = () => node.removeEventListener('touchmove', block)
  }, [])

  useEffect(() => () => detach.current?.(), [])

  /** 지금 손가락이 몇 번째 줄 위에 있는지. */
  const indexAt = (clientY: number): number | null => {
    const el = listEl.current
    if (!el) return null
    const items = [...el.children] as HTMLElement[]
    for (let i = 0; i < items.length; i++) {
      const r = items[i].getBoundingClientRect()
      if (clientY < r.bottom) return i
    }
    return items.length - 1
  }

  const start = useCallback(
    (key: string, e: React.PointerEvent) => {
      dragging.current = { key, keys: [...keys] }
      setOrder([...keys])
      setDraggingKey(key)
      try {
        ;(e.target as Element).setPointerCapture(e.pointerId)
      } catch {
        /* 지원하지 않으면 그냥 진행 */
      }
    },
    [keys],
  )

  const move = useCallback((clientY: number) => {
    const d = dragging.current
    if (!d) return
    const to = indexAt(clientY)
    if (to === null) return
    const from = d.keys.indexOf(d.key)
    if (from === -1 || from === to) return
    const next = [...d.keys]
    next.splice(to, 0, ...next.splice(from, 1))
    d.keys = next
    setOrder(next)
  }, [])

  const end = useCallback(() => {
    const d = dragging.current
    dragging.current = null
    setDraggingKey(null)
    setOrder(null)
    // 순서가 실제로 바뀌었을 때만 저장한다.
    if (d && d.keys.join() !== keys.join()) onCommit(d.keys)
  }, [keys, onCommit])

  return { listRef, order, draggingKey, start, move, end }
}
