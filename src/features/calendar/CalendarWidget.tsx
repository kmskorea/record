import { useMemo } from 'react'
import { Card } from '../../components/ui'
import { ChevronLeft, ChevronRight } from '../../components/icons'
import {
  WEEKDAYS,
  addMonths,
  formatMonth,
  isSameMonth,
  monthGrid,
  todayKey,
} from '../../lib/date'
import { dayScore, hasContent, scoreStep } from '../../lib/metrics'
import { ScoreScaleLegend } from '../../components/StarRating'
import type { DayRecord, ISODate } from '../../lib/types'

interface Props {
  anchor: ISODate
  selected: ISODate | null
  days: Record<ISODate, DayRecord>
  onSelect: (date: ISODate) => void
  onAnchorChange: (date: ISODate) => void
}

export function CalendarWidget({ anchor, selected, days, onSelect, onAnchorChange }: Props) {
  const grid = useMemo(() => monthGrid(anchor), [anchor])
  const today = todayKey()

  const summary = useMemo(() => {
    let scored = 0
    let none = 0
    let total = 0
    for (const key of grid) {
      if (!isSameMonth(key, anchor)) continue
      const score = dayScore(days[key])
      if (score === null) none++
      else {
        scored++
        total += score
      }
    }
    return { scored, none, avg: scored ? total / scored : null }
  }, [grid, anchor, days])

  return (
    <Card>
      <div className="cal-head">
        <h2 className="cal-month">{formatMonth(anchor)}</h2>
        <div className="cal-nav">
          <button
            type="button"
            className="icon-btn"
            aria-label="이전 달"
            onClick={() => onAnchorChange(addMonths(anchor, -1))}
          >
            <ChevronLeft />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="이번 달"
            onClick={() => onAnchorChange(today)}
          >
            <span style={{ fontSize: 11, fontWeight: 800 }}>오늘</span>
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="다음 달"
            onClick={() => onAnchorChange(addMonths(anchor, 1))}
          >
            <ChevronRight />
          </button>
        </div>
      </div>

      <div className="cal-grid">
        {WEEKDAYS.map((d, i) => (
          <div className="cal-dow" key={d} data-sun={i === 0}>
            {d}
          </div>
        ))}
        {grid.map((key) => {
          const day = days[key]
          const score = dayScore(day)
          const step = score === null ? null : scoreStep(score)
          const outside = !isSameMonth(key, anchor)
          return (
            <button
              key={key}
              type="button"
              className="cal-cell"
              data-outside={outside}
              data-today={key === today}
              data-selected={key === selected}
              data-scored={step !== null}
              style={
                step
                  ? ({ '--cell-color': step.bg, '--cell-ink': step.ink } as React.CSSProperties)
                  : undefined
              }
              aria-label={`${key}${score !== null ? ` · ${score}점` : ''}`}
              onClick={() => {
                onSelect(key)
                if (outside) onAnchorChange(key)
              }}
            >
              {Number(key.slice(8))}
              {step === null && hasContent(day) && <i className="dot" />}
            </button>
          )
        })}
      </div>

      <div className="cal-legend">
        <span style={{ gap: 7 }}>
          0
          <ScoreScaleLegend />5
        </span>
        <span>
          <i style={{ background: 'var(--surface-3)' }} />
          기록 없음 {summary.none}
        </span>
        {summary.avg !== null && (
          <span>
            이 달 평균 <strong style={{ color: 'var(--ink)' }}>{summary.avg.toFixed(1)}</strong>점 ·{' '}
            {summary.scored}일
          </span>
        )}
      </div>
    </Card>
  )
}
