import { useMemo } from 'react'
import { Card, Empty, initial } from '../../components/ui'
import { WEEKDAYS, rangeEndingAt } from '../../lib/date'
import {
  BAND_COLOR,
  BAND_LABEL,
  METRIC_BY_ID,
  buildSeries,
  correlationLabel,
  dayScore,
  findDiscoveries,
  hasContent,
  recordStreak,
  scoreBand,
  todoRate,
  weekdayAverages,
} from '../../lib/metrics'
import { PROFILE_COLORS, type DayRecord, type ISODate, type TimeCategory } from '../../lib/types'
import { TimeScoreWidget, TimeShareWidget, UpcomingWidget } from './TimeInsights'

const WINDOW = 30

/** 요일별 에너지 막대는 1~5 척도라 하루 점수 색과 별개로 쓴다. */
const ENERGY_BAR = { good: '#3D5AFE', ok: '#E8B93B', bad: '#E4572E' }

function avg(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v !== null)
  if (!nums.length) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

export function InsightsPanel({
  today,
  days,
  people,
  timeCategories,
  onOpenPerson,
  onOpenDate,
}: {
  today: ISODate
  days: Record<ISODate, DayRecord>
  people: { id: string; name: string; relation: string; colorIndex: number }[]
  timeCategories: TimeCategory[]
  onOpenPerson: (id: string) => void
  onOpenDate: (date: ISODate) => void
}) {
  const dates = useMemo(() => rangeEndingAt(today, WINDOW), [today])

  const stats = useMemo(() => {
    const energySeries = buildSeries(METRIC_BY_ID.energy, dates, days)
    const sleepSeries = buildSeries(METRIC_BY_ID.sleep, dates, days)
    const todoValues = dates.map((d) => todoRate(days[d]))
    const scoreValues = dates.map((d) => dayScore(days[d]))

    const dist = { good: 0, ok: 0, bad: 0 }
    let recorded = 0
    let workoutDays = 0
    for (const date of dates) {
      const day = days[date]
      if (hasContent(day)) recorded++
      if (day?.workout.did) workoutDays++
      const s = dayScore(day)
      if (s !== null) dist[scoreBand(s)]++
    }

    return {
      streak: recordStreak(days, today),
      recorded,
      workoutDays,
      avgScore: avg(scoreValues),
      avgEnergy: avg(energySeries.map((p) => p.value)),
      avgSleep: avg(sleepSeries.map((p) => p.value)),
      avgTodo: avg(todoValues),
      dist,
      weekday: weekdayAverages(energySeries),
    }
  }, [dates, days, today])

  const discoveries = useMemo(() => findDiscoveries(dates, days), [dates, days])

  const topPeople = useMemo(() => {
    const counts = new Map<string, number>()
    for (const date of dates) {
      for (const it of days[date]?.interactions ?? []) {
        counts.set(it.personId, (counts.get(it.personId) ?? 0) + 1)
      }
    }
    return [...counts.entries()]
      .map(([id, count]) => ({ person: people.find((p) => p.id === id), count }))
      .filter((x): x is { person: (typeof people)[number]; count: number } => Boolean(x.person))
      .sort((a, b) => b.count - a.count)
      .slice(0, 4)
  }, [dates, days, people])

  const distTotal = stats.dist.good + stats.dist.ok + stats.dist.bad
  // 요일 간 컨디션 차이는 대개 작아서, 최소~최대를 25~100%로 펼쳐야 패턴이 눈에 보인다.
  const weekdayAvgs = stats.weekday.map((w) => w.avg).filter((v): v is number => v !== null)
  const wMin = weekdayAvgs.length ? Math.min(...weekdayAvgs) : 0
  const wMax = weekdayAvgs.length ? Math.max(...weekdayAvgs) : 1
  const barHeight = (avgValue: number) =>
    wMax === wMin ? 70 : 25 + ((avgValue - wMin) / (wMax - wMin)) * 75

  return (
    <>
      <UpcomingWidget days={days} today={today} people={people} onOpenDate={onOpenDate} />

      <Card title="인사이트" mark="var(--green)" note={`최근 ${WINDOW}일`}>
        <div className="tiles">
          <div className="tile filled" style={{ background: 'var(--accent)' }}>
            <span className="value">
              {stats.streak}
              <span className="unit">일</span>
            </span>
            <span className="label">연속 기록</span>
          </div>
          <div className="tile">
            <span className="value">
              {stats.avgScore !== null ? stats.avgScore.toFixed(1) : '—'}
              <span className="unit">/ 5</span>
            </span>
            <span className="label">평균 하루 점수</span>
          </div>
          <div className="tile">
            <span className="value">
              {stats.avgSleep ? stats.avgSleep.toFixed(1) : '—'}
              <span className="unit">h</span>
            </span>
            <span className="label">평균 수면</span>
            <span className="sub">
              에너지 {stats.avgEnergy ? stats.avgEnergy.toFixed(1) : '—'} / 5
            </span>
          </div>
          <div className="tile">
            <span className="value">
              {stats.workoutDays}
              <span className="unit">일</span>
            </span>
            <span className="label">운동한 날</span>
            <span className="sub">{stats.recorded}일 기록 중</span>
          </div>
          {stats.avgTodo !== null && (
            <div className="tile wide" style={{ minHeight: 0 }}>
              <span className="label">할일 완수율</span>
              <span className="value">
                {Math.round(stats.avgTodo)}
                <span className="unit">%</span>
              </span>
            </div>
          )}
        </div>

        {distTotal > 0 && (
          <div style={{ marginTop: 16 }}>
            <span className="field-label">
              하루 점수 분포 · 좋음 3.5↑ / 보통 2~3 / 별로 1.5↓
            </span>
            <div className="distbar">
              {(['good', 'ok', 'bad'] as const).map((k) =>
                stats.dist[k] > 0 ? (
                  <div
                    key={k}
                    title={BAND_LABEL[k]}
                    style={{
                      background: BAND_COLOR[k],
                      flex: stats.dist[k],
                      color: k === 'ok' ? '#17150f' : '#fff',
                    }}
                  >
                    {stats.dist[k]}
                  </div>
                ) : null,
              )}
            </div>
          </div>
        )}
      </Card>

      <TimeShareWidget
        dates={dates}
        days={days}
        categories={timeCategories}
        windowDays={WINDOW}
      />

      <TimeScoreWidget
        dates={dates}
        days={days}
        categories={timeCategories}
        windowDays={WINDOW}
      />

      <Card title="요일별 에너지" mark="var(--yellow)" note={`최근 ${WINDOW}일 평균`}>
        {stats.weekday.every((w) => w.avg === null) ? (
          <Empty>내면 상태를 며칠 기록하면 요일 패턴이 보여요.</Empty>
        ) : (
          <>
            <div className="weekbars">
              {stats.weekday.map((w) => (
                <div className="weekbar" key={w.weekday}>
                  <div
                    className="bar"
                    style={{
                      height: `${w.avg === null ? 4 : barHeight(w.avg)}%`,
                      background: w.avg
                        ? w.avg >= 4
                          ? ENERGY_BAR.good
                          : w.avg >= 3
                            ? ENERGY_BAR.ok
                            : ENERGY_BAR.bad
                        : 'var(--surface-3)',
                    }}
                    title={w.avg ? `${w.avg.toFixed(1)} / 5 (${w.count}일)` : '기록 없음'}
                  />
                  <span className="day">{WEEKDAYS[w.weekday]}</span>
                </div>
              ))}
            </div>
            <p className="card-note" style={{ marginTop: 10 }}>
              {bestWorstSentence(stats.weekday)}
            </p>
          </>
        )}
      </Card>

      <Card title="발견" mark="var(--purple)" note="자동으로 찾은 관계">
        {discoveries.length === 0 ? (
          <Empty>며칠 더 기록하면 항목들 사이의 관계를 찾아드려요.</Empty>
        ) : (
          <div className="stack">
            {discoveries.map((d) => (
              <div className="discovery" key={`${d.a.id}-${d.b.id}`}>
                <span className="r" style={{ color: d.r > 0 ? 'var(--blue)' : 'var(--accent)' }}>
                  {(d.r > 0 ? '+' : '') + d.r.toFixed(2)}
                </span>
                <span>
                  <span className="pair">
                    {d.a.label} × {d.b.label}
                  </span>
                  <span className="desc" style={{ display: 'block' }}>
                    {correlationLabel(d.r)} · 겹친 날 {d.n}일
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {topPeople.length > 0 && (
        <Card title="자주 만난 사람" mark="var(--blue)" note={`최근 ${WINDOW}일`}>
          <div className="stack">
            {topPeople.map(({ person, count }) => (
              <button
                key={person.id}
                type="button"
                className="person-row"
                onClick={() => onOpenPerson(person.id)}
              >
                <span
                  className="avatar"
                  style={{ background: PROFILE_COLORS[person.colorIndex % PROFILE_COLORS.length] }}
                >
                  {initial(person.name)}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="name" style={{ display: 'block' }}>
                    {person.name}
                  </span>
                  <span className="rel">{person.relation || '관계 미입력'}</span>
                </span>
                <span style={{ fontWeight: 800, letterSpacing: '-0.03em' }}>{count}회</span>
              </button>
            ))}
          </div>
        </Card>
      )}
    </>
  )
}

function bestWorstSentence(stats: { weekday: number; avg: number | null }[]): string {
  const withData = stats.filter((s) => s.avg !== null) as { weekday: number; avg: number }[]
  if (withData.length < 2) return '요일별 비교는 기록이 더 쌓이면 정확해져요.'
  const best = withData.reduce((a, b) => (b.avg > a.avg ? b : a))
  const worst = withData.reduce((a, b) => (b.avg < a.avg ? b : a))
  if (best.weekday === worst.weekday) return '아직 요일 간 차이가 뚜렷하지 않아요.'
  return `${WEEKDAYS[best.weekday]}요일이 가장 좋고, ${WEEKDAYS[worst.weekday]}요일이 가장 힘들었어요.`
}
