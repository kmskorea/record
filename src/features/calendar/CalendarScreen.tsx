import { useState } from 'react'
import { CalendarWidget } from './CalendarWidget'
import { TrackingChart } from './TrackingChart'
import { InsightsPanel } from './InsightsPanel'
import { DayDetailSheet } from './DayDetailSheet'
import { useStore } from '../../lib/store'
import type { MetricId } from '../../lib/metrics'
import type { ISODate } from '../../lib/types'

export function CalendarScreen({
  onOpenPerson,
  onOpenContent,
}: {
  onOpenPerson: (id: string) => void
  onOpenContent: (id: string) => void
}) {
  const { data, today } = useStore()
  const [anchor, setAnchor] = useState<ISODate>(today)
  const [selected, setSelected] = useState<ISODate | null>(null)
  const [metrics, setMetrics] = useState<MetricId[]>(['score', 'sleep'])

  const toggleMetric = (id: MetricId) =>
    setMetrics((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]))

  return (
    <div className="screen">
      <header className="screen-head">
        <div>
          <h1 className="screen-title">
            흐름
            <span className="dim">지금까지의 나</span>
          </h1>
          <p className="screen-sub">날짜를 누르면 그날 기록을 보고 고칠 수 있어요.</p>
        </div>
      </header>

      <div className="two-col">
        <div className="col">
          <CalendarWidget
            anchor={anchor}
            selected={selected}
            days={data.days}
            onSelect={setSelected}
            onAnchorChange={setAnchor}
          />
          <TrackingChart
            end={today}
            days={data.days}
            selected={metrics}
            onToggle={toggleMetric}
          />
        </div>
        <div className="col">
          <InsightsPanel
            today={today}
            days={data.days}
            people={data.people}
            timeCategories={data.timeCategories}
            onOpenPerson={onOpenPerson}
            onOpenDate={setSelected}
          />
        </div>
      </div>

      {selected && (
        <DayDetailSheet
          date={selected}
          onClose={() => setSelected(null)}
          onOpenPerson={(id) => {
            setSelected(null)
            onOpenPerson(id)
          }}
          onOpenContent={(id) => {
            setSelected(null)
            onOpenContent(id)
          }}
        />
      )}
    </div>
  )
}
