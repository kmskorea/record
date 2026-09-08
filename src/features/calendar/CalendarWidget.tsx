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
import { SCORE_COLOR, SCORE_LABEL, dayScore, hasContent } from '../../lib/metrics'
import type { DayRecord, ISODate } from '../../lib/types'

/** 파랑/빨강 칸 위에는 흰 글씨, 노랑 칸 위에는 검은 글씨가 읽기 좋다. */
const CELL_INK: Record<string, string> = {
  good: '#ffffff',
  ok: '#17150f',
  bad: '#ffffff',
}

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

  const counts = useMemo(() => {
    const c = { good: 0, ok: 0, bad: 0, none: 0 }
    for (const key of grid) {
      if (!isSameMonth(key, anchor)) continue
      const score = dayScore(days[key])
      if (score) c[score]++
      else c.none++
    }
    return c
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
          const outside = !isSameMonth(key, anchor)
          return (
            <button
              key={key}
              type="button"
              className="cal-cell"
              data-outside={outside}
              data-today={key === today}
              data-selected={key === selected}
              data-scored={score !== null}
              style={
                score
                  ? ({
                      '--cell-color': SCORE_COLOR[score],
                      '--cell-ink': CELL_INK[score],
                    } as React.CSSProperties)
                  : undefined
              }
              aria-label={`${key}${score ? ` · ${SCORE_LABEL[score]}` : ''}`}
              onClick={() => {
                onSelect(key)
                if (outside) onAnchorChange(key)
              }}
            >
              {Number(key.slice(8))}
              {!score && hasContent(day) && <i className="dot" />}
            </button>
          )
        })}
      </div>

      <div className="cal-legend">
        <span>
          <i style={{ background: SCORE_COLOR.good }} />
          좋음 {counts.good}
        </span>
        <span>
          <i style={{ background: SCORE_COLOR.ok }} />
          보통 {counts.ok}
        </span>
        <span>
          <i style={{ background: SCORE_COLOR.bad }} />
          별로 {counts.bad}
        </span>
        <span>
          <i style={{ background: 'var(--surface-3)' }} />
          기록 없음 {counts.none}
        </span>
      </div>
    </Card>
  )
}
