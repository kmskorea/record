import { useRef } from 'react'
import { SLOT_COUNT, TIME_COLORS, slotLabel, type TimeCategory } from '../lib/types'

// 바깥 원 밖에 시각 숫자를 두므로 그만큼 여백을 두고 그린다
const SIZE = 292
const CENTER = SIZE / 2
const OUTER = 118
const INNER = 62
const LABEL_R = OUTER + 15

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

  // 드래그로 여러 칸을 한 번에 칠한다. 시작할 때 칠할지 지울지 정하고 끝까지 유지한다.
  const painting = useRef<{ value: string | null; touched: Set<number> } | null>(null)

  const begin = (index: number) => {
    const value = slots[index] === activeId ? null : activeId
    painting.current = { value, touched: new Set([index]) }
    onPaint([index], value)
  }

  const extend = (index: number) => {
    const p = painting.current
    if (!p || p.touched.has(index)) return
    p.touched.add(index)
    onPaint([index], p.value)
  }

  const indexFromPoint = (clientX: number, clientY: number, svg: SVGSVGElement): number | null => {
    const rect = svg.getBoundingClientRect()
    const scale = SIZE / rect.width
    const x = (clientX - rect.left) * scale - CENTER
    const y = (clientY - rect.top) * scale - CENTER
    const dist = Math.hypot(x, y)
    if (dist < INNER - 6 || dist > OUTER + 6) return null
    let angle = Math.atan2(y, x) + Math.PI / 2
    if (angle < 0) angle += Math.PI * 2
    return Math.floor((angle / (Math.PI * 2)) * SLOT_COUNT) % SLOT_COUNT
  }

  const filled = slots.filter(Boolean).length

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
        onPointerUp={() => {
          painting.current = null
        }}
        onPointerCancel={() => {
          painting.current = null
        }}
      >
        {SECTORS.map((d, i) => {
          const color = colorOf(slots[i])
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
                {slots[i]
                  ? ` · ${categories.find((c) => c.id === slots[i])?.label ?? ''}`
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
