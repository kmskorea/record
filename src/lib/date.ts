import type { ISODate } from './types'

const pad = (n: number) => String(n).padStart(2, '0')

/** Date → 'YYYY-MM-DD' (로컬 타임존 기준. toISOString은 UTC라 하루가 밀릴 수 있어 쓰지 않는다) */
export function toKey(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function fromKey(key: ISODate): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function todayKey(): ISODate {
  return toKey(new Date())
}

export function addDays(key: ISODate, n: number): ISODate {
  const d = fromKey(key)
  d.setDate(d.getDate() + n)
  return toKey(d)
}

export function addMonths(key: ISODate, n: number): ISODate {
  const d = fromKey(key)
  d.setDate(1)
  d.setMonth(d.getMonth() + n)
  return toKey(d)
}

export function diffDays(a: ISODate, b: ISODate): number {
  const ms = fromKey(a).getTime() - fromKey(b).getTime()
  return Math.round(ms / 86400000)
}

export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const

export function weekday(key: ISODate): number {
  return fromKey(key).getDay()
}

/** '3월 14일 (금)' */
export function formatKorean(key: ISODate): string {
  const d = fromKey(key)
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`
}

/** '2026년 3월' */
export function formatMonth(key: ISODate): string {
  const d = fromKey(key)
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월`
}

export function formatTime(at: number): string {
  const d = new Date(at)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 오늘 기준 상대 표기: 오늘 / 어제 / 3일 전 / 2주 전 */
export function formatRelative(key: ISODate): string {
  const delta = diffDays(key, todayKey())
  if (delta === 0) return '오늘'
  if (delta === -1) return '어제'
  if (delta === 1) return '내일'
  const abs = Math.abs(delta)
  const suffix = delta < 0 ? '전' : '후'
  if (abs < 7) return `${abs}일 ${suffix}`
  if (abs < 28) return `${Math.round(abs / 7)}주 ${suffix}`
  if (abs < 365) return `${Math.round(abs / 30)}개월 ${suffix}`
  return `${Math.round(abs / 365)}년 ${suffix}`
}

/** 해당 월 달력 그리드용 날짜 배열. 필요한 주(5~6줄)만 만들어 빈 줄이 남지 않게 한다. */
export function monthGrid(anchor: ISODate): ISODate[] {
  const d = fromKey(anchor)
  const first = new Date(d.getFullYear(), d.getMonth(), 1)
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  const weeks = Math.ceil((first.getDay() + daysInMonth) / 7)
  const start = new Date(first)
  start.setDate(first.getDate() - first.getDay())
  return Array.from({ length: weeks * 7 }, (_, i) => {
    const cur = new Date(start)
    cur.setDate(start.getDate() + i)
    return toKey(cur)
  })
}

export function isSameMonth(a: ISODate, b: ISODate): boolean {
  return a.slice(0, 7) === b.slice(0, 7)
}

/** end(포함)에서 거슬러 올라간 length일의 날짜 키 배열, 오래된 순. */
export function rangeEndingAt(end: ISODate, length: number): ISODate[] {
  return Array.from({ length }, (_, i) => addDays(end, i - length + 1))
}

/** 'HH:MM' → 자정부터의 분 */
export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}
