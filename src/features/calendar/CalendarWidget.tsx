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
import { isRunning, isStrength } from '../../lib/types'
import type { DayRecord, ISODate, Workout } from '../../lib/types'

/**
 * 그 날 무슨 운동을 했는지. 달력 칸 왼쪽 위에 색으로 찍는다.
 * '했음'이라고만 하고 부위를 안 고른 날은 근력으로 본다 — 표시가
 * 아예 없는 것보다는 낫고, 초록은 이 앱에서 계속 운동을 뜻해왔다.
 */
function workoutMarks(workout: Workout | undefined): { strength: boolean; run: boolean } {
  if (!workout || workout.did !== true) return { strength: false, run: false }
  const run = isRunning(workout.parts)
  return { strength: isStrength(workout.parts) || !run, run }
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

  const summary = useMemo(() => {
    let scored = 0
    let none = 0
    let total = 0
    let strengthDays = 0
    let runDays = 0
    for (const key of grid) {
      if (!isSameMonth(key, anchor)) continue
      const score = dayScore(days[key])
      if (score === null) none++
      else {
        scored++
        total += score
      }
      const mark = workoutMarks(days[key]?.workout)
      if (mark.strength) strengthDays++
      if (mark.run) runDays++
    }
    return { scored, none, avg: scored ? total / scored : null, strengthDays, runDays }
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
          const mark = workoutMarks(day?.workout)
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
              aria-label={`${key}${score !== null ? ` · ${score}점` : ''}${
                mark.strength ? ' · 근력' : ''
              }${mark.run ? ' · 러닝' : ''}`}
              onClick={() => {
                onSelect(key)
                if (outside) onAnchorChange(key)
              }}
            >
              {Number(key.slice(8))}
              {(mark.strength || mark.run) && (
                <span className="wo">
                  {mark.strength && <i className="wo-strength" />}
                  {mark.run && <i className="wo-run" />}
                </span>
              )}
              {step === null && hasContent(day) && <i className="dot" />}
              {day?.events.some((e) => !e.done) && <i className="ev" />}
            </button>
          )
        })}
      </div>

      {(summary.avg !== null || summary.strengthDays > 0 || summary.runDays > 0) && (
        <div className="cal-legend">
          {summary.avg !== null && (
            <span>
              이 달 평균 <strong style={{ color: 'var(--ink)' }}>{summary.avg.toFixed(1)}</strong>점
              · {summary.scored}일 기록
            </span>
          )}
          {summary.strengthDays > 0 && (
            <span>
              <i className="wo-key wo-strength" />
              근력 {summary.strengthDays}일
            </span>
          )}
          {summary.runDays > 0 && (
            <span>
              <i className="wo-key wo-run" />
              러닝 {summary.runDays}일
            </span>
          )}
        </div>
      )}

    </Card>
  )
}
