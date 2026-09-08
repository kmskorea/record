import { useState } from 'react'
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
} from './sections'
import { SettingsSheet } from './SettingsSheet'
import { SettingsIcon } from '../../components/icons'
import { useStore } from '../../lib/store'
import { formatKorean } from '../../lib/date'

export function TodayScreen({ onOpenPerson }: { onOpenPerson: (id: string) => void }) {
  const { today } = useStore()
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <div className="screen">
      <header className="screen-head">
        <div>
          <h1 className="screen-title">
            오늘
            <span className="dim">{formatKorean(today)}</span>
          </h1>
        </div>
        <button
          type="button"
          className="icon-btn"
          onClick={() => setSettingsOpen(true)}
          aria-label="설정"
        >
          <SettingsIcon />
        </button>
      </header>

      <div className="section-label">사전 관리</div>
      <div className="masonry">
        <TodoSection date={today} />
        <SleepSection date={today} />
        <ConditionSection date={today} />
      </div>

      <div className="section-label">하루 중</div>
      <IdeaSection date={today} />

      <div className="section-label">사후 관리</div>
      <div className="masonry">
        <WorkoutSection date={today} />
        <BodySection date={today} />
        <DietSection date={today} />
        <PeopleSection date={today} onOpenPerson={onOpenPerson} />
        <ReflectionSection date={today} />
      </div>

      {settingsOpen && <SettingsSheet onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
