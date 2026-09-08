import { useMemo, useState } from 'react'
import { useMeasure } from './useMeasure'
import { formatKorean, rangeEndingAt } from '../../lib/date'
import {
  METRICS,
  buildSeries,
  correlationLabel,
  pearson,
  seriesDomain,
  type MetricDef,
  type MetricId,
  type SeriesPoint,
} from '../../lib/metrics'
import type { DayRecord, ISODate } from '../../lib/types'
import { Card, Chip } from '../../components/ui'

const RANGES = [
  { days: 7, label: '7일' },
  { days: 30, label: '30일' },
  { days: 90, label: '90일' },
]

const PAD = { top: 12, right: 14, bottom: 24, left: 38 }
const HEIGHT = 190

interface Props {
  end: ISODate
  days: Record<ISODate, DayRecord>
  selected: MetricId[]
  onToggle: (id: MetricId) => void
}

export function TrackingChart({ end, days, selected, onToggle }: Props) {
  const [rangeDays, setRangeDays] = useState(30)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const [wrapRef, width] = useMeasure<HTMLDivElement>()

  const dates = useMemo(() => rangeEndingAt(end, rangeDays), [end, rangeDays])
  const metrics = useMemo(
    () => METRICS.filter((m) => selected.includes(m.id)),
    [selected],
  )
  const multi = metrics.length > 1

  const series = useMemo(
    () => metrics.map((m) => ({ metric: m, points: buildSeries(m, dates, days) })),
    [metrics, dates, days],
  )

  const left = multi ? 14 : PAD.left
  const innerW = Math.max(0, width - left - PAD.right)
  const innerH = HEIGHT - PAD.top - PAD.bottom

  const xAt = (i: number) =>
    left + (dates.length <= 1 ? innerW / 2 : (i / (dates.length - 1)) * innerW)

  /** 다중 선택일 때는 각 지표를 자기 범위로 정규화해 '모양'을 겹쳐 본다. */
  const scaleFor = (metric: MetricDef, points: SeriesPoint[]) => {
    const [lo, hi] = multi ? autoDomain(points) : seriesDomain(metric, points)
    const span = hi - lo || 1
    return (v: number) => PAD.top + innerH - ((v - lo) / span) * innerH
  }

  const correlations = useMemo(() => {
    if (metrics.length < 2) return []
    const out: { a: MetricDef; b: MetricDef; r: number; n: number }[] = []
    for (let i = 0; i < series.length; i++) {
      for (let j = i + 1; j < series.length; j++) {
        const { r, n } = pearson(
          series[i].points.map((p) => p.value),
          series[j].points.map((p) => p.value),
        )
        out.push({ a: series[i].metric, b: series[j].metric, r, n })
      }
    }
    return out
  }, [series, metrics.length])

  const activeIndex = hoverIndex ?? dates.length - 1
  const hasAnyData = series.some((s) => s.points.some((p) => p.value !== null))

  const pickIndex = (clientX: number, rect: DOMRect) => {
    if (dates.length <= 1) return 0
    const x = clientX - rect.left - left
    const ratio = x / (innerW || 1)
    return Math.max(0, Math.min(dates.length - 1, Math.round(ratio * (dates.length - 1))))
  }

  const singleMetric = metrics.length === 1 ? metrics[0] : null
  const axisTicks = useMemo(() => {
    if (!singleMetric) return []
    const [lo, hi] = seriesDomain(singleMetric, series[0].points)
    return [hi, (hi + lo) / 2, lo].map((v) => ({
      value: v,
      y: PAD.top + innerH - ((v - lo) / (hi - lo || 1)) * innerH,
    }))
  }, [singleMetric, series, innerH])

  return (
    <Card
      title="트래킹"
      mark="var(--blue)"
      action={
        <div className="seg" style={{ width: 168 }}>
          {RANGES.map((r) => (
            <button
              key={r.days}
              type="button"
              className="seg-btn"
              aria-pressed={rangeDays === r.days}
              onClick={() => {
                setRangeDays(r.days)
                setHoverIndex(null)
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      }
    >
      <div className="chips" style={{ marginBottom: 14 }}>
        {METRICS.map((m) => (
          <Chip
            key={m.id}
            active={selected.includes(m.id)}
            color={m.color}
            onClick={() => onToggle(m.id)}
          >
            {m.short}
          </Chip>
        ))}
      </div>

      {metrics.length === 0 ? (
        <p className="empty">위에서 보고 싶은 항목을 골라주세요. 여러 개를 고르면 겹쳐서 비교합니다.</p>
      ) : (
        <>
          <div className="readout">
            <span className="date">{formatKorean(dates[activeIndex])}</span>
            {series.map(({ metric, points }) => (
              <span className="val" key={metric.id}>
                <i style={{ background: metric.color }} />
                {metric.short}{' '}
                {points[activeIndex]?.value === null || points[activeIndex] === undefined ? (
                  <span style={{ color: 'var(--ink-3)' }}>—</span>
                ) : (
                  metric.format(points[activeIndex].value!)
                )}
              </span>
            ))}
          </div>

          <div className="chart-wrap" ref={wrapRef}>
            {width > 0 && (
              <svg
                width={width}
                height={HEIGHT}
                role="img"
                aria-label={`${metrics.map((m) => m.label).join(', ')} 추이 그래프`}
                onPointerMove={(e) =>
                  setHoverIndex(pickIndex(e.clientX, e.currentTarget.getBoundingClientRect()))
                }
                onPointerLeave={() => setHoverIndex(null)}
              >
                {/* 가로 눈금 */}
                {(singleMetric ? axisTicks : [0, 0.5, 1].map((t) => ({ value: NaN, y: PAD.top + innerH * t }))).map(
                  (tick, i) => (
                    <g key={i}>
                      <line
                        x1={left}
                        x2={left + innerW}
                        y1={tick.y}
                        y2={tick.y}
                        stroke="var(--line)"
                        strokeWidth={1}
                      />
                      {singleMetric && (
                        <text
                          x={left - 7}
                          y={tick.y + 3.5}
                          textAnchor="end"
                          fontSize={10}
                          fontWeight={600}
                          fill="var(--ink-3)"
                        >
                          {formatTick(tick.value)}
                        </text>
                      )}
                    </g>
                  ),
                )}

                {/* 선택 지점 안내선 */}
                {hasAnyData && (
                  <line
                    x1={xAt(activeIndex)}
                    x2={xAt(activeIndex)}
                    y1={PAD.top}
                    y2={PAD.top + innerH}
                    stroke="var(--line-strong)"
                    strokeWidth={1.5}
                    strokeDasharray="3 3"
                  />
                )}

                {series.map(({ metric, points }) => {
                  const y = scaleFor(metric, points)
                  const segments = toSegments(points)
                  const active = points[activeIndex]
                  return (
                    <g key={metric.id}>
                      {!multi && segments.length > 0 && (
                        <path
                          d={areaPath(segments, xAt, y, PAD.top + innerH)}
                          fill={metric.color}
                          opacity={0.1}
                        />
                      )}
                      {segments.map((seg, i) =>
                        seg.length === 1 ? (
                          <circle
                            key={i}
                            cx={xAt(seg[0].index)}
                            cy={y(seg[0].value)}
                            r={3}
                            fill={metric.color}
                          />
                        ) : (
                          <path
                            key={i}
                            d={linePath(seg, xAt, y)}
                            fill="none"
                            stroke={metric.color}
                            strokeWidth={2.25}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        ),
                      )}
                      {active?.value !== null && active !== undefined && (
                        <circle
                          cx={xAt(activeIndex)}
                          cy={y(active.value!)}
                          r={4.5}
                          fill="var(--surface)"
                          stroke={metric.color}
                          strokeWidth={2.5}
                        />
                      )}
                    </g>
                  )
                })}

                {/* 날짜 눈금 */}
                {tickIndices(dates.length).map((i) => (
                  <text
                    key={i}
                    x={xAt(i)}
                    y={HEIGHT - 6}
                    textAnchor={i === 0 ? 'start' : i === dates.length - 1 ? 'end' : 'middle'}
                    fontSize={10}
                    fontWeight={600}
                    fill="var(--ink-3)"
                  >
                    {shortDate(dates[i])}
                  </text>
                ))}
              </svg>
            )}
          </div>

          {!hasAnyData && (
            <p className="empty">이 기간에 기록된 값이 없습니다.</p>
          )}

          <div className="chart-legend">
            {series.map(({ metric }) => (
              <span key={metric.id}>
                <i style={{ background: metric.color }} />
                {metric.label}
              </span>
            ))}
          </div>

          {multi && (
            <div className="stack" style={{ marginTop: 12 }}>
              <div className="card-note">
                여러 항목은 각자의 범위로 맞춰 겹쳐 그립니다. 아래는 실제 상관 정도예요.
              </div>
              {correlations.map(({ a, b, r, n }) => (
                <div className="discovery" key={`${a.id}-${b.id}`}>
                  <span
                    className="r"
                    style={{ color: Number.isFinite(r) ? tone(r) : 'var(--ink-3)' }}
                  >
                    {Number.isFinite(r) ? (r > 0 ? '+' : '') + r.toFixed(2) : '—'}
                  </span>
                  <span>
                    <span className="pair">
                      {a.short} × {b.short}
                    </span>
                    <span className="desc" style={{ display: 'block' }}>
                      {n < 3
                        ? '겹치는 기록이 부족해요'
                        : `${correlationLabel(r)} · 겹친 날 ${n}일`}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  )
}

// ── 그리기 도우미 ────────────────────────────────────────────────────────────

interface Pt {
  index: number
  value: number
}

/** 값이 있는 구간만 이어 그리도록 끊어준다(기록 없는 날은 선을 잇지 않는다). */
function toSegments(points: SeriesPoint[]): Pt[][] {
  const segs: Pt[][] = []
  let cur: Pt[] = []
  points.forEach((p, index) => {
    if (p.value === null) {
      if (cur.length) segs.push(cur)
      cur = []
    } else {
      cur.push({ index, value: p.value })
    }
  })
  if (cur.length) segs.push(cur)
  return segs
}

function linePath(seg: Pt[], x: (i: number) => number, y: (v: number) => number): string {
  return seg.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.index)},${y(p.value)}`).join(' ')
}

function areaPath(
  segs: Pt[][],
  x: (i: number) => number,
  y: (v: number) => number,
  baseline: number,
): string {
  return segs
    .filter((s) => s.length > 1)
    .map(
      (seg) =>
        `${linePath(seg, x, y)} L${x(seg[seg.length - 1].index)},${baseline} L${x(
          seg[0].index,
        )},${baseline} Z`,
    )
    .join(' ')
}

function autoDomain(points: SeriesPoint[]): [number, number] {
  const vals = points.map((p) => p.value).filter((v): v is number => v !== null)
  if (vals.length === 0) return [0, 1]
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  if (min === max) return [min - 0.5, max + 0.5]
  const pad = (max - min) * 0.12
  return [min - pad, max + pad]
}

function tickIndices(n: number): number[] {
  if (n <= 1) return [0]
  if (n <= 8) return Array.from({ length: n }, (_, i) => i)
  return [0, Math.floor((n - 1) / 3), Math.floor(((n - 1) * 2) / 3), n - 1]
}

function shortDate(key: ISODate): string {
  const [, m, d] = key.split('-')
  return `${Number(m)}/${Number(d)}`
}

function formatTick(v: number): string {
  if (!Number.isFinite(v)) return ''
  return Math.abs(v) >= 100 || Number.isInteger(v) ? String(Math.round(v)) : v.toFixed(1)
}

function tone(r: number): string {
  if (Math.abs(r) < 0.2) return 'var(--ink-3)'
  return r > 0 ? 'var(--blue)' : 'var(--accent)'
}
