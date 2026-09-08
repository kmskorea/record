import type { DayRecord, ISODate, Person } from './types'

export type HitKind = '할일' | '아이디어' | '컨디션' | '운동' | '식사' | '관계' | '일기'

export interface SearchHit {
  id: string
  date: ISODate
  kind: HitKind
  text: string
  /** 관계 기록이면 어떤 사람인지 */
  personId?: string
}

function matches(text: string, query: string): boolean {
  return text.toLowerCase().includes(query)
}

/** 모든 기록을 훑어 검색어가 든 조각을 최신순으로 돌려준다. */
export function searchAll(
  days: Record<ISODate, DayRecord>,
  people: Person[],
  rawQuery: string,
): SearchHit[] {
  const query = rawQuery.trim().toLowerCase()
  if (!query) return []

  const personName = new Map(people.map((p) => [p.id, p.name]))
  const hits: SearchHit[] = []

  for (const day of Object.values(days)) {
    const push = (kind: HitKind, text: string, id: string, personId?: string) => {
      if (matches(text, query)) hits.push({ id, date: day.date, kind, text, personId })
    }

    for (const todo of day.todos) push('할일', todo.text, `${day.date}-todo-${todo.id}`)
    for (const idea of day.ideas) push('아이디어', idea.text, `${day.date}-idea-${idea.id}`)
    if (day.condition.reason) push('컨디션', day.condition.reason, `${day.date}-condition`)
    if (day.workout.memo) push('운동', day.workout.memo, `${day.date}-workout`)
    for (const meal of day.diet.meals) push('식사', meal.label, `${day.date}-meal-${meal.id}`)
    for (const it of day.interactions) {
      const name = personName.get(it.personId) ?? ''
      // 사람 이름으로 검색해도 그 사람과의 기록이 걸리도록 이름을 같이 본다.
      if (matches(it.note, query) || matches(name, query)) {
        hits.push({
          id: `${day.date}-rel-${it.id}`,
          date: day.date,
          kind: '관계',
          text: it.note,
          personId: it.personId,
        })
      }
    }
    if (day.reflection) push('일기', day.reflection, `${day.date}-reflection`)
  }

  return hits.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

export function searchPeople(people: Person[], rawQuery: string): Person[] {
  const query = rawQuery.trim().toLowerCase()
  if (!query) return people
  return people.filter((p) => matches(p.name, query) || matches(p.relation, query))
}

/** 특정 사람에 대한 모든 기록을 최신순으로. */
export function personTimeline(
  days: Record<ISODate, DayRecord>,
  personId: string,
): { date: ISODate; note: string; id: string; at: number }[] {
  const out: { date: ISODate; note: string; id: string; at: number }[] = []
  for (const day of Object.values(days)) {
    for (const it of day.interactions) {
      if (it.personId === personId) out.push({ date: day.date, note: it.note, id: it.id, at: it.at })
    }
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.at - a.at))
}

/** 검색어에 맞춰 텍스트를 [일반, 매치, 일반...] 조각으로 나눈다. */
export function splitHighlight(text: string, rawQuery: string): { text: string; hit: boolean }[] {
  const query = rawQuery.trim()
  if (!query) return [{ text, hit: false }]
  const lower = text.toLowerCase()
  const needle = query.toLowerCase()
  const parts: { text: string; hit: boolean }[] = []
  let i = 0
  while (i < text.length) {
    const found = lower.indexOf(needle, i)
    if (found === -1) {
      parts.push({ text: text.slice(i), hit: false })
      break
    }
    if (found > i) parts.push({ text: text.slice(i, found), hit: false })
    parts.push({ text: text.slice(found, found + needle.length), hit: true })
    i = found + needle.length
  }
  return parts
}
