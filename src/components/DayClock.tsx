import { useRef, useState } from 'react'
import { SLOT_COUNT, TIME_COLORS, slotLabel, type TimeCategory } from '../lib/types'

// 바깥 원 밖에 시각 숫자를 두므로 그만큼 여백을 두고 그린다
const SIZE = 292
const CENTER = SIZE / 2
// 손가락으로 문지르기 좋게 고리를 두껍게 잡았다
const OUTER = 122
const INNER = 54
const LABEL_R = OUTER + 14
/** 고리 밖으로 조금 벗어나도 받아준다 */
const TOLERANCE = 16

/** a에서 b까지 원을 따라 가는 짧은 쪽 경로의 칸 번호들 (a는 빼고 b는 포함). */
function arcBetween(a: number, b: number): number[] {
  const forward = (b - a + SLOT_COUNT) % SLOT_COUNT
  const backward = (a - b + SLOT_COUNT) % SLOT_COUNT
  const span = Math.min(forward, backward)
  // 한 번에 원의 1/4을 넘게 건너뛰었다면 손이 튄 것으로 보고 끝점만 칠한다
  if (span > SLOT_COUNT / 4) return [b]
  const step = forward <= backward ? 1 : -1
  const out: number[] = []
  for (let k = 1; k <= span; k++) out.push((a + step * k + SLOT_COUNT) % SLOT_COUNT)
  return out
}

/** 0시를 12시 방향에 두고 시계 방향으로 하루를 한 바퀴 돈다. */
function sectorPath(index: number): string {
  const per = (Math.PI * 2) / SLOT_COUNT
  const gap = per * 0.06
  const a0 = -Math.PI / 2 + index * per + gap / 2
  const a1 = -Math.PI / 2 + (index + 1) * per - gap / 2
  const p = (r: number, a: number) => `${CENTER + r * Math.cos(a)},${CENTER + r * Math.sin(a)}`
  return [
    `M${p(OUTER, a0)}`,
    `A${OUTER},${OUTER} 0 0 1 ${p(OUTER, a1)}`,
    `L${p(INNER, a1)}`,
    `A${INNER},${INNER} 0 0 0 ${p(INNER, a0)}`,
    'Z',
  ].join(' ')
}

const SECTORS = Array.from({ length: SLOT_COUNT }, (_, i) => sectorPath(i))

export function DayClock({
  slots,
  categories,
  activeId,
  onPaint,
}: {
  slots: (string | null)[]
  categories: TimeCategory[]
  /** 지금 칠할 유형. null이면 지우개 */
  activeId: string | null
  onPaint: (indexes: number[], value: string | null) => void
}) {
  const colorOf = (id: string | null) => {
    if (!id) return null
    const c = categories.find((x) => x.id === id)
    return c ? TIME_COLORS[c.colorIndex % TIME_COLORS.length] : null
  }

  /**
   * 드래그하는 동안은 화면에만 먼저 반영하고, 손을 뗄 때 한 번에 저장한다.
   * 칸마다 저장하면 매번 앱 전체가 다시 그려져서 손가락을 못 따라온다.
   */
  const [draft, setDraft] = useState<Map<number, string | null> | null>(null)
  const painting = useRef<{ value: string | null; last: number; map: Map<number, string | null> } | null>(
    null,
  )

  const valueAt = (i: number) => (draft?.has(i) ? draft.get(i)! : slots[i])

  const begin = (index: number) => {
    // 문지르는 동안에는 고른 유형을 그대로 칠한다.
    // 시작 칸의 상태에 따라 지우개로 바뀌면, 이어 칠하려다 지워버리게 된다.
    const map = new Map<number, string | null>([[index, activeId]])
    painting.current = { value: activeId, last: index, map }
    setDraft(new Map(map))
  }

  const extend = (index: number) => {
    const p = painting.current
    if (!p || p.last === index) return
    // 손가락은 이벤트가 듬성듬성 들어온다. 사이에 빠진 칸을 채워야 끊기지 않는다.
    for (const i of arcBetween(p.last, index)) p.map.set(i, p.value)
    p.last = index
    setDraft(new Map(p.map))
  }

  const finish = () => {
    const p = painting.current
    painting.current = null
    if (p && p.map.size > 0) onPaint([...p.map.keys()], p.value)
    setDraft(null)
  }

  const indexFromPoint = (clientX: number, clientY: number, svg: SVGSVGElement): number | null => {
    const rect = svg.getBoundingClientRect()
    const scale = SIZE / rect.width
    const x = (clientX - rect.left) * scale - CENTER
    const y = (clientY - rect.top) * scale - CENTER
    const dist = Math.hypot(x, y)
    if (dist < INNER - TOLERANCE || dist > OUTER + TOLERANCE) return null
    let angle = Math.atan2(y, x) + Math.PI / 2
    if (angle < 0) angle += Math.PI * 2
    return Math.floor((angle / (Math.PI * 2)) * SLOT_COUNT) % SLOT_COUNT
  }

  const filled = slots.map((_, i) => valueAt(i)).filter(Boolean).length

  return (
    <div className="clock-wrap">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="clock"
        role="group"
        aria-label="하루 시간표"
        onPointerDown={(e) => {
          const i = indexFromPoint(e.clientX, e.clientY, e.currentTarget)
          if (i === null) return
          e.currentTarget.setPointerCapture(e.pointerId)
          begin(i)
        }}
        onPointerMove={(e) => {
          if (!painting.current) return
          const i = indexFromPoint(e.clientX, e.clientY, e.currentTarget)
          if (i !== null) extend(i)
        }}
        onPointerUp={finish}
        onPointerCancel={finish}
      >
        {SECTORS.map((d, i) => {
          const color = colorOf(valueAt(i))
          return (
            <path
              key={i}
              d={d}
              fill={color ?? 'var(--surface-2)'}
              stroke={i % 2 === 0 ? 'var(--surface)' : 'transparent'}
              strokeWidth={0.5}
            >
              <title>
                {slotLabel(i)}
                {valueAt(i)
                  ? ` · ${categories.find((c) => c.id === valueAt(i))?.label ?? ''}`
                  : ' · 비어 있음'}
              </title>
            </path>
          )
        })}

        {/* 3시간마다 시각 안내 */}
        {[0, 3, 6, 9, 12, 15, 18, 21].map((h) => {
          const a = -Math.PI / 2 + (h / 24) * Math.PI * 2
          return (
            <text
              key={h}
              x={CENTER + LABEL_R * Math.cos(a)}
              y={CENTER + LABEL_R * Math.sin(a) + 3.5}
              textAnchor="middle"
              fontSize={10}
              fontWeight={700}
              fill="var(--ink-3)"
            >
              {h}
            </text>
          )
        })}

        <text
          x={CENTER}
          y={CENTER - 4}
          textAnchor="middle"
          fontSize={26}
          fontWeight={820}
          letterSpacing="-1"
          fill="var(--ink)"
        >
          {(filled / 2).toFixed(1)}
        </text>
        <text
          x={CENTER}
          y={CENTER + 14}
          textAnchor="middle"
          fontSize={11}
          fontWeight={650}
          fill="var(--ink-3)"
        >
          시간 기록
        </text>
      </svg>
    </div>
  )
}

/** 유형별 시간 비중을 가로 막대 하나로 보여준다. */
export function TimeShareBar({
  slots,
  categories,
}: {
  slots: (string | null)[]
  categories: TimeCategory[]
}) {
  const counts = new Map<string, number>()
  for (const id of slots) if (id) counts.set(id, (counts.get(id) ?? 0) + 1)
  const total = [...counts.values()].reduce((a, b) => a + b, 0)

  if (total === 0) {
    return <p className="empty">시계를 눌러 시간을 칠하면 비중이 여기에 나옵니다.</p>
  }

  const rows = categories
    .filter((c) => counts.has(c.id))
    .map((c) => ({
      category: c,
      slots: counts.get(c.id)!,
      share: (counts.get(c.id)! / total) * 100,
    }))
    .sort((a, b) => b.slots - a.slots)

  return (
    <div>
      <div className="share-bar">
        {rows.map((r) => (
          <div
            key={r.category.id}
            style={{
              flex: r.slots,
              background: TIME_COLORS[r.category.colorIndex % TIME_COLORS.length],
            }}
            title={`${r.category.label} ${r.share.toFixed(0)}%`}
          />
        ))}
      </div>
      <div className="share-list">
        {rows.map((r) => (
          <span key={r.category.id}>
            <i style={{ background: TIME_COLORS[r.category.colorIndex % TIME_COLORS.length] }} />
            {r.category.label}
            <b>{(r.slots / 2).toFixed(1)}h</b>
            <em>{r.share.toFixed(0)}%</em>
          </span>
        ))}
      </div>
    </div>
  )
}
