import { useState } from 'react'
import { Sheet } from '../../components/ui'
import { TimeUseSection } from '../today/TimeUseSection'
import {
  BodySection,
  ContentSection,
  DietSection,
  InnerStateSection,
  PeopleSection,
  ReflectionSection,
  ScoreSection,
  ScreenTimeSection,
  SleepSection,
  TodoSection,
  WorkoutSection,
} from '../today/sections'
import { formatKorean, formatRelative, todayKey } from '../../lib/date'
import { dayScore, hasContent, scoreStep } from '../../lib/metrics'
import { useStore } from '../../lib/store'
import type { ISODate } from '../../lib/types'

export function DayDetailSheet({
  date,
  onClose,
  onOpenPerson,
  onOpenContent,
}: {
  date: ISODate
  onClose: () => void
  onOpenPerson: (id: string) => void
  onOpenContent: (id: string) => void
}) {
  const { getDay } = useStore()
  const day = getDay(date)
  const score = dayScore(day)
  const step = score === null ? null : scoreStep(score)
  const [expanded, setExpanded] = useState(false)
  const empty = !hasContent(day)
  // 아직 오지 않은 날에 '오늘 어땠나'를 묻는 칸들은 의미가 없다.
  // 미리 잡아둘 수 있는 것, 곧 일정과 할 일만 남긴다.
  const future = date > todayKey()

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
      {future ? (
        <>
          <TodoSection date={date} onOpenPerson={onOpenPerson} />
          <p className="card-note" style={{ textAlign: 'center' }}>
            지난 뒤에 열면 그날 기록을 남길 수 있어요.
          </p>
        </>
      ) : empty && !expanded ? (
        <>
          <TodoSection date={date} onOpenPerson={onOpenPerson} />
          <p className="empty">이 날은 아직 기록이 없어요.</p>
          <button type="button" className="btn primary block" onClick={() => setExpanded(true)}>
            지금 기록하기
          </button>
        </>
      ) : (
        <>
          <ScoreSection date={date} />
          <TodoSection date={date} onOpenPerson={onOpenPerson} />
          <SleepSection date={date} />
          <InnerStateSection date={date} />
          <WorkoutSection date={date} />
          <BodySection date={date} />
          <DietSection date={date} />
          <PeopleSection date={date} onOpenPerson={onOpenPerson} />
          <ContentSection date={date} onOpenContent={onOpenContent} />
          <ScreenTimeSection date={date} />
          <ReflectionSection date={date} />
          <TimeUseSection date={date} />
        </>
      )}
    </Sheet>
  )
}
