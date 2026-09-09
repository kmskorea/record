import type { Book, DayRecord, ISODate, Person, Reading } from './types'

export type HitKind =
  | '할일'
  | '아이디어'
  | '컨디션'
  | '운동'
  | '식사'
  | '관계'
  | '독서'
  | '일기'
  | '한 줄 평'

export interface SearchHit {
  id: string
  date: ISODate
  kind: HitKind
  text: string
  /** 관계 기록이면 어떤 사람인지 */
  personId?: string
  /** 독서 기록이면 어떤 책인지 */
  bookId?: string
}

function matches(text: string, query: string): boolean {
  return text.toLowerCase().includes(query)
}

/** 모든 기록을 훑어 검색어가 든 조각을 최신순으로 돌려준다. */
export function searchAll(
  days: Record<ISODate, DayRecord>,
  people: Person[],
  books: Book[],
  rawQuery: string,
): SearchHit[] {
  const query = rawQuery.trim().toLowerCase()
  if (!query) return []

  const personName = new Map(people.map((p) => [p.id, p.name]))
  const bookTitle = new Map(books.map((b) => [b.id, b.title]))
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
    for (const r of day.readings) {
      const title = bookTitle.get(r.bookId) ?? ''
      // 책 이름으로 검색해도 그 책에 남긴 기록이 걸려야 한다.
      const byTitle = matches(title, query)
      // 구절과 생각은 성격이 달라서 따로 걸린다. 어느 쪽이 맞았는지
      // 결과에 그대로 보이는 편이 다시 찾을 때 빠르다.
      if (r.quote && (byTitle || matches(r.quote, query))) {
        hits.push({
          id: `${day.date}-quote-${r.id}`,
          date: day.date,
          kind: '독서',
          text: r.quote,
          bookId: r.bookId,
        })
      }
      if (r.thought && (byTitle || matches(r.thought, query))) {
        hits.push({
          id: `${day.date}-thought-${r.id}`,
          date: day.date,
          kind: '독서',
          text: r.thought,
          bookId: r.bookId,
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

export function searchBooks(books: Book[], rawQuery: string): Book[] {
  const query = rawQuery.trim().toLowerCase()
  if (!query) return books
  return books.filter((b) => matches(b.title, query) || matches(b.author, query))
}

export interface BookEntry extends Reading {
  date: ISODate
}

/** 특정 책에 대한 모든 기록을 최신순으로. */
export function bookTimeline(
  days: Record<ISODate, DayRecord>,
  bookId: string,
): BookEntry[] {
  const out: BookEntry[] = []
  for (const day of Object.values(days)) {
    for (const r of day.readings) {
      if (r.bookId === bookId) out.push({ ...r, date: day.date })
    }
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.at - a.at))
}

/** 그 책에 대해 지금까지 읽은 쪽수 합계. 안 적은 날은 빼고 센다. */
export function bookPages(entries: BookEntry[]): number {
  return entries.reduce((sum, e) => sum + (e.pages ?? 0), 0)
}

/**
 * 그 책을 펼친 날 수. 기록 개수가 아니라 날짜 수다 —
 * 하루에 구절을 두 개 옮겨 적었다고 이틀 읽은 것이 되면 안 된다.
 */
export function bookDays(entries: BookEntry[]): number {
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
