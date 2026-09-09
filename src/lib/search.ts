import type { ContentItem, ContentLog, DayRecord, ISODate, Person } from './types'

export type HitKind =
  | '할일'
  | '아이디어'
  | '컨디션'
  | '운동'
  | '식사'
  | '관계'
  | '콘텐츠'
  | '일기'
  | '한 줄 평'

export interface SearchHit {
  id: string
  date: ISODate
  kind: HitKind
  text: string
  /** 관계 기록이면 어떤 사람인지 */
  personId?: string
  /** 콘텐츠 기록이면 어떤 작품인지 */
  itemId?: string
}

function matches(text: string, query: string): boolean {
  return text.toLowerCase().includes(query)
}

/** 모든 기록을 훑어 검색어가 든 조각을 최신순으로 돌려준다. */
export function searchAll(
  days: Record<ISODate, DayRecord>,
  people: Person[],
  content: ContentItem[],
  rawQuery: string,
): SearchHit[] {
  const query = rawQuery.trim().toLowerCase()
  if (!query) return []

  const personName = new Map(people.map((p) => [p.id, p.name]))
  const itemTitle = new Map(content.map((c) => [c.id, c.title]))
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
    for (const r of day.contentLogs) {
      const title = itemTitle.get(r.itemId) ?? ''
      // 작품 이름으로 검색해도 거기에 남긴 기록이 걸려야 한다.
      const byTitle = matches(title, query)
      // 구절과 소감은 성격이 달라서 따로 걸린다. 어느 쪽이 맞았는지
      // 결과에 그대로 보이는 편이 다시 찾을 때 빠르다.
      if (r.quote && (byTitle || matches(r.quote, query))) {
        hits.push({
          id: `${day.date}-quote-${r.id}`,
          date: day.date,
          kind: '콘텐츠',
          text: r.quote,
          itemId: r.itemId,
        })
      }
      if (r.note && (byTitle || matches(r.note, query))) {
        hits.push({
          id: `${day.date}-note-${r.id}`,
          date: day.date,
          kind: '콘텐츠',
          text: r.note,
          itemId: r.itemId,
        })
      }
    }
    if (day.reflection) push('일기', day.reflection, `${day.date}-reflection`)
    if (day.scoreNote) push('한 줄 평', day.scoreNote, `${day.date}-scorenote`)
  }

  return hits.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

export function searchPeople(people: Person[], rawQuery: string): Person[] {
  const query = rawQuery.trim().toLowerCase()
  if (!query) return people
  return people.filter((p) => matches(p.name, query) || matches(p.relation, query))
}

export function searchContent(content: ContentItem[], rawQuery: string): ContentItem[] {
  const query = rawQuery.trim().toLowerCase()
  if (!query) return content
  return content.filter((c) => matches(c.title, query) || matches(c.byline, query))
}

export interface ContentEntry extends ContentLog {
  date: ISODate
}

/** 특정 작품에 대한 모든 기록을 최신순으로. */
export function contentTimeline(
  days: Record<ISODate, DayRecord>,
  itemId: string,
): ContentEntry[] {
  const out: ContentEntry[] = []
  for (const day of Object.values(days)) {
    for (const r of day.contentLogs) {
      if (r.itemId === itemId) out.push({ ...r, date: day.date })
    }
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.at - a.at))
}

/** 그 작품에서 지금까지 읽은 쪽수 합계. 안 적은 날은 빼고 센다. */
export function contentPages(entries: ContentEntry[]): number {
  return entries.reduce((sum, e) => sum + (e.pages ?? 0), 0)
}

/** 매긴 별점의 평균. 한 번도 안 매겼으면 null. */
export function contentRating(entries: ContentEntry[]): number | null {
  const rated = entries.filter((e) => e.rating !== null)
  if (rated.length === 0) return null
  return rated.reduce((sum, e) => sum + (e.rating ?? 0), 0) / rated.length
}

/**
 * 그 작품을 펼친 날 수. 기록 개수가 아니라 날짜 수다 —
 * 하루에 구절을 두 개 옮겨 적었다고 이틀 읽은 것이 되면 안 된다.
 */
export function contentDays(entries: ContentEntry[]): number {
  return new Set(entries.map((e) => e.date)).size
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
