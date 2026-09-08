import { useState } from 'react'
import { Sheet } from '../../components/ui'
import {
  BodySection,
  ConditionSection,
  DietSection,
  IdeaSection,
  PeopleSection,
  ReflectionSection,
  SleepSection,
  TodoSection,
  WorkoutSection,
} from '../today/sections'
import { formatKorean, formatRelative } from '../../lib/date'
import { SCORE_COLOR, SCORE_LABEL, dayScore, hasContent } from '../../lib/metrics'
import { useStore } from '../../lib/store'
import type { ISODate } from '../../lib/types'

const CHIP_INK: Record<string, string> = { good: '#fff', ok: '#17150f', bad: '#fff' }

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
  const [expanded, setExpanded] = useState(false)
  const empty = !hasContent(day)

  return (
    <Sheet
      title={formatKorean(date)}
      subtitle={formatRelative(date)}
      onClose={onClose}
      headExtra={
        score && (
          <span
            style={{
              background: SCORE_COLOR[score],
              color: CHIP_INK[score],
              borderRadius: 'var(--r-pill)',
              padding: '5px 12px',
              fontSize: 12,
              fontWeight: 750,
            }}
          >
            {SCORE_LABEL[score]}
          </span>
        )
      }
    >
      {empty && !expanded ? (
        <>
          <p className="empty">이 날은 아직 기록이 없어요.</p>
          <button type="button" className="btn primary block" onClick={() => setExpanded(true)}>
            지금 기록하기
          </button>
        </>
      ) : (
        <>
          <TodoSection date={date} />
          <SleepSection date={date} />
          <ConditionSection date={date} />
          <IdeaSection date={date} />
          <WorkoutSection date={date} />
          <BodySection date={date} />
          <DietSection date={date} />
          <PeopleSection date={date} onOpenPerson={onOpenPerson} />
          <ReflectionSection date={date} />
        </>
      )}
    </Sheet>
  )
}
