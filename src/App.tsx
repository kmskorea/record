import { useState } from 'react'
import { CalendarScreen } from './features/calendar/CalendarScreen'
import { TodayScreen } from './features/today/TodayScreen'
import { SearchScreen } from './features/search/SearchScreen'
import { PersonSheet } from './features/search/PersonSheet'
import { BookSheet } from './features/search/BookSheet'
import { DayDetailSheet } from './features/calendar/DayDetailSheet'
import { CalendarIcon, SearchIcon, TodayIcon } from './components/icons'
import { useStore } from './lib/store'
import { useNotificationScheduler } from './lib/notifications'
import type { ISODate } from './lib/types'

type Tab = 'flow' | 'today' | 'search'

const TABS: { id: Tab; label: string; Icon: (p: { className?: string }) => JSX.Element }[] = [
  { id: 'flow', label: '흐름', Icon: CalendarIcon },
  { id: 'today', label: '오늘', Icon: TodayIcon },
  { id: 'search', label: '검색', Icon: SearchIcon },
]

export function App() {
  const { data, markNotificationFired } = useStore()
  const [tab, setTab] = useState<Tab>('today')
  const [personId, setPersonId] = useState<string | null>(null)
  const [bookId, setBookId] = useState<string | null>(null)
  const [dayDate, setDayDate] = useState<ISODate | null>(null)

  useNotificationScheduler(data.notifications, markNotificationFired)

  return (
    <div className="app">
      {tab === 'flow' && <CalendarScreen onOpenPerson={setPersonId} onOpenBook={setBookId} />}
      {tab === 'today' && <TodayScreen onOpenPerson={setPersonId} onOpenBook={setBookId} />}
      {tab === 'search' && (
        <SearchScreen
          onOpenPerson={setPersonId}
          onOpenBook={setBookId}
          onOpenDate={setDayDate}
        />
      )}

      <nav className="nav" role="tablist" aria-label="주요 메뉴">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            className="nav-btn"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
          >
            <Icon />
            {label}
          </button>
        ))}
      </nav>

      {personId && (
        <PersonSheet
          personId={personId}
          onClose={() => setPersonId(null)}
          onOpenDate={(date) => {
            setPersonId(null)
            setDayDate(date)
          }}
        />
      )}

      {bookId && (
        <BookSheet
          bookId={bookId}
          onClose={() => setBookId(null)}
          onOpenDate={(date) => {
            setBookId(null)
            setDayDate(date)
          }}
        />
      )}

      {dayDate && (
        <DayDetailSheet
          date={dayDate}
          onClose={() => setDayDate(null)}
          onOpenPerson={(id) => {
            setDayDate(null)
            setPersonId(id)
          }}
          onOpenBook={(id) => {
            setDayDate(null)
            setBookId(id)
          }}
        />
      )}
    </div>
  )
}
