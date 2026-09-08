import { useState } from 'react'
import { Sheet } from '../../components/ui'
import { EventSection } from '../today/EventSection'
import { TimeUseSection } from '../today/TimeUseSection'
import {
  BodySection,
  ConditionSection,
  DietSection,
  IdeaSection,
  PeopleSection,
  ReflectionSection,
  ScoreSection,
  SleepSection,
  TodoSection,
  WorkoutSection,
} from '../today/sections'
import { formatKorean, formatRelative } from '../../lib/date'
import { dayScore, hasContent, scoreStep } from '../../lib/metrics'
import { useStore } from '../../lib/store'
import type { ISODate } from '../../lib/types'

export function DayDetailSheet({
  date,
  onClose,
  onOpenPerson,
}: {
  date: ISODate
  onClose: () => void
  onOpenPerson: (id: string) => void
}) {
  const { getDay } = useStore()
  const day = getDay(date)
  const score = dayScore(day)
  const step = score === null ? null : scoreStep(score)
  const [expanded, setExpanded] = useState(false)
  const empty = !hasContent(day)

  return (
    <Sheet
      title={formatKorean(date)}
      subtitle={formatRelative(date)}
      onClose={onClose}
      headExtra={
        step && (
          <span
            style={{
              background: step.bg,
              color: step.ink,
              border: '1px solid var(--line-strong)',
              borderRadius: 'var(--r-pill)',
              padding: '5px 12px',
              fontSize: 12,
              fontWeight: 800,
            }}
          >
            {score?.toFixed(1)}점
          </span>
        )
      }
    >
      {empty && !expanded ? (
        <>
          <EventSection date={date} />
          <p className="empty">이 날은 아직 기록이 없어요.</p>
          <button type="button" className="btn primary block" onClick={() => setExpanded(true)}>
            지금 기록하기
          </button>
        </>
      ) : (
        <>
          <EventSection date={date} />
          <ScoreSection date={date} />
          <TodoSection date={date} />
          <SleepSection date={date} />
          <ConditionSection date={date} />
          <IdeaSection date={date} />
          <WorkoutSection date={date} />
          <BodySection date={date} />
          <DietSection date={date} />
          <PeopleSection date={date} onOpenPerson={onOpenPerson} />
          <ReflectionSection date={date} />
          <TimeUseSection date={date} />
        </>
      )}
    </Sheet>
  )
}
