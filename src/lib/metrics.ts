import type { DayRecord, ISODate } from './types'
import { weekday } from './date'

export type MetricId =
  | 'sleep'
  | 'condition'
  | 'workout'
  | 'meal'
  | 'weight'
  | 'protein'
  | 'water'
  | 'creatine'
  | 'sugar'
  | 'todo'

export interface MetricDef {
  id: MetricId
  label: string
  short: string
  color: string
  unit: string
  /** 고정 축 범위. 없으면 화면에 보이는 데이터로 자동 계산한다(몸무게 등). */
  domain?: [number, number]
  get(day: DayRecord): number | null
  format(v: number): string
}

const round1 = (v: number) => (Math.round(v * 10) / 10).toString()

export const METRICS: MetricDef[] = [
  {
    id: 'sleep',
    label: '수면시간',
    short: '수면',
    color: '#3D5AFE',
    unit: 'h',
    domain: [0, 12],
    get: (d) => d.sleep.hours,
    format: (v) => `${round1(v)}시간`,
  },
  {
    id: 'condition',
    label: '컨디션',
    short: '컨디션',
    color: '#E4572E',
    unit: '',
    domain: [1, 5],
    get: (d) => d.condition.score,
    format: (v) => `${round1(v)} / 5`,
  },
  {
    id: 'workout',
    label: '운동량',
    short: '운동',
    color: '#3E8E7E',
    unit: '',
    domain: [0, 3],
    get: (d) => {
      if (d.workout.did === null) return null
      if (d.workout.did === false) return 0
      if (d.workout.intensity === 'low') return 1
      if (d.workout.intensity === 'mid') return 2
      if (d.workout.intensity === 'high') return 3
      return 2
    },
    format: (v) => ['안 함', '낮음', '보통', '높음'][Math.round(v)] ?? round1(v),
  },
  {
    id: 'meal',
    label: '식사량',
    short: '식사',
    color: '#E8B93B',
    unit: '점',
    domain: [0, 15],
    get: (d) =>
      d.diet.meals.length === 0 ? null : d.diet.meals.reduce((s, m) => s + m.amount, 0),
    format: (v) => `${round1(v)}점`,
  },
  {
    id: 'weight',
    label: '몸무게',
    short: '몸무게',
    color: '#8E6BB5',
    unit: 'kg',
    get: (d) => d.weight,
    format: (v) => `${round1(v)}kg`,
  },
  {
    id: 'protein',
    label: '단백질',
    short: '단백질',
    color: '#C25A7B',
    unit: '',
    domain: [1, 5],
    get: (d) => d.diet.protein,
    format: (v) => `${round1(v)} / 5`,
  },
  {
    id: 'water',
    label: '수분',
    short: '수분',
    color: '#4F7CAC',
    unit: '',
    domain: [1, 5],
    get: (d) => d.diet.water,
    format: (v) => `${round1(v)} / 5`,
  },
  {
    id: 'creatine',
    label: '크레아틴',
    short: '크레아틴',
    color: '#7A9E3F',
    unit: '',
    domain: [1, 5],
    get: (d) => d.diet.creatine,
    format: (v) => `${round1(v)} / 5`,
  },
  {
    id: 'sugar',
    label: '당분',
    short: '당분',
    color: '#B8763E',
    unit: '',
    domain: [1, 5],
    get: (d) => d.diet.sugar,
    format: (v) => `${round1(v)} / 5`,
  },
  {
    id: 'todo',
    label: '할일 완수율',
    short: '할일',
    color: '#5B6670',
    unit: '%',
    domain: [0, 100],
    get: (d) =>
      d.todos.length === 0 ? null : (d.todos.filter((t) => t.done).length / d.todos.length) * 100,
    format: (v) => `${Math.round(v)}%`,
  },
]

export const METRIC_BY_ID = Object.fromEntries(METRICS.map((m) => [m.id, m])) as Record<
  MetricId,
  MetricDef
>

// ─── 하루 점수 ────────────────────────────────────────────────────────────────

export type DayScore = 'good' | 'ok' | 'bad'

export const SCORE_COLOR: Record<DayScore, string> = {
  good: '#3D5AFE',
  ok: '#E8B93B',
  bad: '#E4572E',
}

export const SCORE_LABEL: Record<DayScore, string> = {
  good: '좋음',
  ok: '보통',
  bad: '별로',
}

/** 달력 색을 결정하는 하루 점수. 컨디션 기록이 기준이다. */
export function dayScore(day: DayRecord | undefined): DayScore | null {
  const s = day?.condition.score
  if (!s) return null
  if (s >= 4) return 'good'
  if (s === 3) return 'ok'
  return 'bad'
}

/** 컨디션 말고도 뭐라도 적혀 있으면 '기록한 날'로 본다. */
export function hasContent(day: DayRecord | undefined): boolean {
  if (!day) return false
  return (
    day.todos.length > 0 ||
    day.ideas.length > 0 ||
    day.interactions.length > 0 ||
    day.reflection.trim() !== '' ||
    day.condition.score !== null ||
    day.condition.reason.trim() !== '' ||
    day.sleep.hours !== null ||
    day.workout.did !== null ||
    day.weight !== null ||
    day.diet.meals.length > 0 ||
    day.diet.protein !== null ||
    day.diet.water !== null ||
    day.diet.creatine !== null ||
    day.diet.sugar !== null
  )
}

// ─── 통계 ────────────────────────────────────────────────────────────────────

/** 피어슨 상관계수. 두 값이 모두 있는 날만 사용한다. */
export function pearson(xs: (number | null)[], ys: (number | null)[]): { r: number; n: number } {
  const pairs: [number, number][] = []
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i]
    const y = ys[i]
    if (x !== null && y !== null && Number.isFinite(x) && Number.isFinite(y)) pairs.push([x, y])
  }
  const n = pairs.length
  if (n < 3) return { r: NaN, n }
  const mx = pairs.reduce((s, p) => s + p[0], 0) / n
  const my = pairs.reduce((s, p) => s + p[1], 0) / n
  let num = 0
  let dx = 0
  let dy = 0
  for (const [x, y] of pairs) {
    num += (x - mx) * (y - my)
    dx += (x - mx) ** 2
    dy += (y - my) ** 2
  }
  const den = Math.sqrt(dx * dy)
  if (den === 0) return { r: NaN, n }
  return { r: num / den, n }
}

export function correlationLabel(r: number): string {
  const a = Math.abs(r)
  const dir = r > 0 ? '같이 오르내림' : '반대로 움직임'
  if (a >= 0.7) return `강하게 ${dir}`
  if (a >= 0.4) return `어느 정도 ${dir}`
  if (a >= 0.2) return `약하게 ${dir}`
  return '뚜렷한 관계 없음'
}

export interface SeriesPoint {
  date: ISODate
  value: number | null
}

export function buildSeries(
  metric: MetricDef,
  dates: ISODate[],
  days: Record<ISODate, DayRecord>,
): SeriesPoint[] {
  return dates.map((date) => {
    const day = days[date]
    return { date, value: day ? metric.get(day) : null }
  })
}

/** 시리즈 값의 표시 범위. 고정 도메인이 없으면 데이터에서 여유 있게 뽑는다. */
export function seriesDomain(metric: MetricDef, points: SeriesPoint[]): [number, number] {
  if (metric.domain) return metric.domain
  const values = points.map((p) => p.value).filter((v): v is number => v !== null)
  if (values.length === 0) return [0, 1]
  const min = Math.min(...values)
  const max = Math.max(...values)
  if (min === max) return [min - 1, max + 1]
  const pad = (max - min) * 0.15
  return [min - pad, max + pad]
}

export interface WeekdayStat {
  weekday: number
  avg: number | null
  count: number
}

export function weekdayAverages(points: SeriesPoint[]): WeekdayStat[] {
  const buckets: number[][] = Array.from({ length: 7 }, () => [])
  for (const p of points) {
    if (p.value !== null) buckets[weekday(p.date)].push(p.value)
  }
  return buckets.map((vals, i) => ({
    weekday: i,
    avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null,
    count: vals.length,
  }))
}

/** 오늘(또는 어제)부터 거꾸로 이어지는 연속 기록일 수. */
export function recordStreak(days: Record<ISODate, DayRecord>, today: ISODate): number {
  const step = (key: ISODate, n: number) => {
    const [y, m, d] = key.split('-').map(Number)
    const dt = new Date(y, m - 1, d)
    dt.setDate(dt.getDate() + n)
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(
      dt.getDate(),
    ).padStart(2, '0')}`
  }
  let cursor = today
  // 오늘 아직 안 적었으면 어제부터 센다 (하루 종일 0으로 보이는 걸 막는다)
  if (!hasContent(days[cursor])) cursor = step(cursor, -1)
  let streak = 0
  while (hasContent(days[cursor])) {
    streak++
    cursor = step(cursor, -1)
  }
  return streak
}

export interface Discovery {
  a: MetricDef
  b: MetricDef
  r: number
  n: number
}

/** 데이터가 충분한 지표쌍 중 상관이 뚜렷한 것을 찾아준다. */
export function findDiscoveries(
  dates: ISODate[],
  days: Record<ISODate, DayRecord>,
  minPairs = 5,
): Discovery[] {
  const series = new Map<MetricId, (number | null)[]>()
  for (const m of METRICS) {
    series.set(
      m.id,
      dates.map((d) => (days[d] ? m.get(days[d]) : null)),
    )
  }
  const out: Discovery[] = []
  for (let i = 0; i < METRICS.length; i++) {
    for (let j = i + 1; j < METRICS.length; j++) {
      const a = METRICS[i]
      const b = METRICS[j]
      const { r, n } = pearson(series.get(a.id)!, series.get(b.id)!)
      if (!Number.isFinite(r) || n < minPairs) continue
      if (Math.abs(r) < 0.35) continue
      out.push({ a, b, r, n })
    }
  }
  return out.sort((x, y) => Math.abs(y.r) - Math.abs(x.r)).slice(0, 3)
}
