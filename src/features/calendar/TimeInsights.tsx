import { useMemo } from 'react'
import { Card, Empty } from '../../components/ui'
import { formatRelative } from '../../lib/date'
import { dayScore } from '../../lib/metrics'
import {
  EVENT_KIND_COLOR,
  EVENT_KIND_LABEL,
  TIME_COLORS,
  type DayRecord,
  type ISODate,
} from '../../lib/types'

/**
 * 최근 기간의 시간 사용 비중.
 * 하루 단위 시계만으로는 "요즘 내가 어디에 시간을 쏟고 있나"가 안 보인다.
 */
export function TimeShareWidget({
  dates,
  days,
  categories,
  windowDays,
}: {
  dates: ISODate[]
  days: Record<ISODate, DayRecord>
  categories: { id: string; label: string; colorIndex: number }[]
  windowDays: number
}) {
  const rows = useMemo(() => {
    const counts = new Map<string, number>()
    let recordedDays = 0
    for (const date of dates) {
      const slots = days[date]?.timeSlots
      if (!slots?.some(Boolean)) continue
      recordedDays++
      for (const id of slots) if (id) counts.set(id, (counts.get(id) ?? 0) + 1)
    }
    const total = [...counts.values()].reduce((a, b) => a + b, 0)
    return {
      recordedDays,
      total,
      items: categories
        .filter((c) => counts.has(c.id))
        .map((c) => ({
          category: c,
          slots: counts.get(c.id)!,
          share: (counts.get(c.id)! / total) * 100,
          perDay: counts.get(c.id)! / 2 / recordedDays,
        }))
        .sort((a, b) => b.slots - a.slots),
    }
  }, [dates, days, categories])

  return (
    <Card title="시간을 어디에 썼나" mark="var(--green)" note={`최근 ${windowDays}일`}>
      {rows.items.length === 0 ? (
        <Empty>오늘 탭의 하루 시간표를 며칠 채우면 여기에 쌓입니다.</Empty>
      ) : (
        <>
          <div className="share-bar">
            {rows.items.map((r) => (
              <div
                key={r.category.id}
                style={{
                  flex: r.slots,
                  background: TIME_COLORS[r.category.colorIndex % TIME_COLORS.length],
                }}
                title={`${r.category.label} ${r.share.toFixed(0)}%`}
              />
            ))}
          </div>
          <div className="stack" style={{ marginTop: 12 }}>
            {rows.items.map((r) => (
              <div key={r.category.id} className="time-row">
                <i style={{ background: TIME_COLORS[r.category.colorIndex % TIME_COLORS.length] }} />
                <span className="label">{r.category.label}</span>
                <span className="per-day">하루 평균 {r.perDay.toFixed(1)}시간</span>
                <span className="share">{r.share.toFixed(0)}%</span>
              </div>
            ))}
          </div>
          <p className="card-note" style={{ marginTop: 10 }}>
            {rows.recordedDays}일치 시간표 기준
          </p>
        </>
      )}
    </Card>
  )
}

/**
 * 어떤 시간을 많이 쓴 날에 점수가 높았나.
 * 상관계수 대신 '많이 쓴 날 vs 적게 쓴 날'의 평균 점수 차로 보여준다.
 * 숫자 하나보다 "이 활동을 한 날이 0.8점 높았다"가 훨씬 직관적이다.
 */
export function TimeScoreWidget({
  dates,
  days,
  categories,
  windowDays,
}: {
  dates: ISODate[]
  days: Record<ISODate, DayRecord>
  categories: { id: string; label: string; colorIndex: number }[]
  windowDays: number
}) {
  const rows = useMemo(() => {
    const out: { label: string; colorIndex: number; diff: number; withDays: number }[] = []
    for (const c of categories) {
      const withScores: number[] = []
      const withoutScores: number[] = []
      for (const date of dates) {
        const day = days[date]
        const score = dayScore(day)
        if (score === null || !day?.timeSlots.some(Boolean)) continue
        // 1시간(2칸) 이상 쓴 날을 '한 날'로 본다
        const slots = day.timeSlots.filter((v) => v === c.id).length
        ;(slots >= 2 ? withScores : withoutScores).push(score)
      }
      if (withScores.length < 2 || withoutScores.length < 2) continue
      const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
      out.push({
        label: c.label,
        colorIndex: c.colorIndex,
        diff: avg(withScores) - avg(withoutScores),
        withDays: withScores.length,
      })
    }
    return out.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).slice(0, 4)
  }, [dates, days, categories])

  return (
    <Card title="점수를 가른 시간" mark="var(--blue)" note={`최근 ${windowDays}일`}>
      {rows.length === 0 ? (
        <Empty>
          시간표와 하루 감상평을 며칠 함께 남기면, 어떤 시간이 하루를 좌우했는지 알려드려요.
        </Empty>
      ) : (
        <div className="stack">
          {rows.map((r) => (
            <div className="discovery" key={r.label}>
              <span
                className="r"
                style={{ color: r.diff > 0 ? 'var(--blue)' : 'var(--accent)' }}
              >
                {r.diff > 0 ? '+' : ''}
                {r.diff.toFixed(1)}
              </span>
              <span>
                <span className="pair">
                  <i
                    style={{
                      display: 'inline-block',
                      width: 8,
                      height: 8,
                      borderRadius: 3,
                      marginRight: 6,
                      background: TIME_COLORS[r.colorIndex % TIME_COLORS.length],
                    }}
                  />
                  {r.label}
                </span>
                <span className="desc" style={{ display: 'block' }}>
                  1시간 이상 쓴 {r.withDays}일이 그렇지 않은 날보다{' '}
                  {r.diff > 0 ? '높았어요' : '낮았어요'}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

/** 앞으로 걸려 있는 약속·마감. 달력을 일일이 넘기지 않아도 보이게 한다. */
export function UpcomingWidget({
  days,
  today,
  people,
  onOpenDate,
}: {
  days: Record<ISODate, DayRecord>
  today: ISODate
  people: { id: string; name: string }[]
  onOpenDate: (date: ISODate) => void
}) {
  const upcoming = useMemo(() => {
    const nameById = new Map(people.map((p) => [p.id, p.name]))
    const out: {
      date: ISODate
      id: string
      title: string
      kind: keyof typeof EVENT_KIND_LABEL
      time: string | null
      who: string
    }[] = []
    for (const [date, day] of Object.entries(days)) {
      if (date < today) continue
      for (const ev of day.events) {
        if (ev.done) continue
        out.push({
          date,
          id: ev.id,
          title: ev.title,
          kind: ev.kind,
          time: ev.time,
          who: ev.personIds
            .map((id) => nameById.get(id))
            .filter(Boolean)
            .join(', '),
        })
      }
    }
    return out
      .sort((a, b) =>
        a.date === b.date ? (a.time ?? '99').localeCompare(b.time ?? '99') : a.date < b.date ? -1 : 1,
      )
      .slice(0, 6)
  }, [days, today, people])

  return (
    <Card title="다가오는 일정" mark="var(--purple)" note={upcoming.length ? `${upcoming.length}건` : ''}>
      {upcoming.length === 0 ? (
        <Empty>달력에서 날짜를 눌러 약속이나 마감을 걸어두세요.</Empty>
      ) : (
        <div className="stack">
          {upcoming.map((ev) => (
            <button
              key={`${ev.date}-${ev.id}`}
              type="button"
              className="event-item"
              style={{ width: '100%', textAlign: 'left' }}
              onClick={() => onOpenDate(ev.date)}
            >
              <span className="event-kind" style={{ background: EVENT_KIND_COLOR[ev.kind] }}>
                {EVENT_KIND_LABEL[ev.kind]}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="event-title" style={{ display: 'block' }}>
                  {ev.title}
                </span>
                <span className="event-meta">
                  <span>{formatRelative(ev.date)}</span>
                  {ev.time && <span>{ev.time}</span>}
                  {ev.who && <span>· {ev.who}</span>}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </Card>
  )
}
