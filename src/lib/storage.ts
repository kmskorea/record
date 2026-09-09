import type {
  AppData,
  ContentItem,
  ContentLog,
  Drink,
  DayEvent,
  DayRecord,
  ISODate,
  InnerState,
  Level,
  Person,
  Todo,
  Workout,
} from './types'
import type { TimeCategory } from './types'
import {
  DEFAULT_NOTIFICATIONS,
  DRINK_UNITS,
  TIME_COLORS,
  LEGACY_RUNNING_PART,
  RUNNING_PART,
  SLOT_COUNT,
  WORKOUT_PARTS,
  emptyDay,
} from './types'

const KEY = 'record.app.v1'
const SYNC_KEY = 'record.sync.v1'
const SNAPSHOT_KEY = 'record.snapshot.v1'
const VERSION = 1

export function emptyData(): AppData {
  return {
    version: VERSION,
    days: {},
    people: [],
    content: [],
    notifications: { ...DEFAULT_NOTIFICATIONS, lastFired: {} },
    customWorkoutParts: [],
    timeCategories: [],
    deletedPeople: {},
    deletedContent: {},
    deletedTimeCategories: {},
    deletedContentKinds: {},
    customContentKinds: [],
    settingsUpdatedAt: 0,
  }
}

/**
 * 그날의 감상 한 줄. 어떤 칸을 쓰는지는 유형마다 다르므로 대부분 비어 있다.
 * 없더라도 빈 문자열·null이어야 화면에서 undefined가 새지 않는다.
 *
 * 독서만 있던 시절의 이름도 여기서 받는다(bookId → itemId, thought → note).
 */
function normalizeLog(raw: unknown): ContentLog {
  const r = (raw ?? {}) as Partial<ContentLog> & { bookId?: string; thought?: string }
  return {
    id: typeof r.id === 'string' ? r.id : newId(),
    itemId: typeof r.itemId === 'string' ? r.itemId : (r.bookId ?? ''),
    pages: positive(r.pages),
    quote: typeof r.quote === 'string' ? r.quote : '',
    rating: positive(r.rating),
    note: typeof r.note === 'string' ? r.note : (r.thought ?? ''),
    at: typeof r.at === 'number' ? r.at : 0,
  }
}

function level(v: unknown): Level | null {
  return v === 1 || v === 2 || v === 3 || v === 4 || v === 5 ? v : null
}

/**
 * 내면 상태. 에너지는 '컨디션'이라는 이름으로 score에 들어 있던 값이다.
 * 이름만 바뀌었으므로 옛 기록의 숫자를 그대로 물려받는다.
 */
function normalizeInnerState(raw: unknown, base: InnerState): InnerState {
  const c = (raw ?? {}) as Partial<InnerState> & { score?: unknown }
  return {
    energy: level(c.energy ?? c.score),
    anxiety: level(c.anxiety),
    reason: typeof c.reason === 'string' ? c.reason : base.reason,
  }
}

/**
 * 시간표 칸에는 유형 id만 들어 있어서, 유형 목록이 비면 칠해둔 시간이
 * 통째로 안 보인다. 지워진 게 아니라 색을 못 찾는 것뿐이므로, 목록에 없는
 * id를 발견하면 자리라도 만들어 되살린다.
 *
 * 같은 id로 만들기 때문에, 진짜 유형이 서버에서 내려오면 이름과 색까지
 * 제자리로 돌아온다. updatedAt이 0이라 항상 진짜 쪽이 이긴다.
 *
 * 일부러 지운 유형은 칸도 같이 비우므로(deleteTimeCategory) 되살아나지 않는다.
 */
export function recoverOrphanCategories(
  days: Record<ISODate, DayRecord>,
  categories: TimeCategory[],
): TimeCategory[] {
  const known = new Set(categories.map((c) => c.id))
  const orphans: string[] = []
  for (const day of Object.values(days)) {
    for (const id of day.timeSlots) {
      if (id && !known.has(id)) {
        known.add(id)
        orphans.push(id)
      }
    }
  }
  if (orphans.length === 0) return categories
  console.warn(`시간 유형 ${orphans.length}개를 칸에서 되살렸습니다`, orphans)
  return [
    ...categories,
    ...orphans.map((id, i) => ({
      id,
      label: `이름 없는 유형 ${i + 1}`,
      colorIndex: (categories.length + i) % TIME_COLORS.length,
      updatedAt: 0,
    })),
  ]
}

function pickTombstones(raw: unknown): Record<string, number> {
  return raw && typeof raw === 'object' ? (raw as Record<string, number>) : {}
}

/** 주종이 없으면 무엇을 마신 줄인지 알 수 없으므로 버린다. */
function normalizeDrink(raw: unknown): Drink | null {
  const d = (raw ?? {}) as Partial<Drink>
  if (typeof d.kind !== 'string' || !d.kind) return null
  const amount = typeof d.amount === 'number' && Number.isFinite(d.amount) ? d.amount : 1
  return {
    id: typeof d.id === 'string' ? d.id : newId(),
    kind: d.kind,
    amount: Math.max(0, amount),
    unit: typeof d.unit === 'string' && d.unit ? d.unit : DRINK_UNITS[0],
  }
}

/** 0이나 음수, NaN은 '안 적었다'로 본다. 0km 러닝은 기록이 아니다. */
function positive(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null
}

/**
 * 부위 목록의 '유산소'를 '러닝'으로 옮긴다. 옛 기록이 아무 부위도 없는 것처럼
 * 보이면 안 된다. 둘 다 들어있는 기록이 생길 수 있어 중복도 함께 걷어낸다.
 */
function normalizeWorkout(raw: Partial<Workout> | undefined, base: Workout): Workout {
  const source = Array.isArray(raw?.parts) ? raw.parts : base.parts
  const parts: string[] = []
  for (const p of source) {
    if (typeof p !== 'string') continue
    const name = p === LEGACY_RUNNING_PART ? RUNNING_PART : p
    if (!parts.includes(name)) parts.push(name)
  }
  const running = (raw?.running ?? {}) as Partial<Workout['running']>
  return {
    ...base,
    ...(raw ?? {}),
    parts,
    running: { km: positive(running.km), paceSec: positive(running.paceSec) },
  }
}

/**
 * 저장된 하루 기록을 현재 모델 모양으로 맞춘다.
 * 나중에 항목을 추가해도 예전 기록에서 그 값이 undefined가 되지 않게 하는 자리다.
 */
export function normalizeDay(date: ISODate, raw: unknown): DayRecord {
  const base = emptyDay(date)
  if (!raw || typeof raw !== 'object') return base
  const d = raw as Partial<DayRecord>
  const { todos, events } = withOrder(
    Array.isArray(d.todos) ? d.todos : base.todos,
    Array.isArray(d.events) ? d.events : base.events,
  )
  return {
    ...base,
    ...d,
    date,
    todos,
    ideas: Array.isArray(d.ideas) ? d.ideas : base.ideas,
    interactions: Array.isArray(d.interactions) ? d.interactions : base.interactions,
    contentLogs: Array.isArray(d.contentLogs)
      ? d.contentLogs.map(normalizeLog)
      : // 독서만 있던 시절의 이름
        Array.isArray((d as { readings?: unknown[] }).readings)
        ? (d as { readings: unknown[] }).readings.map(normalizeLog)
        : base.contentLogs,
    sleep: { ...base.sleep, ...(d.sleep ?? {}) },
    condition: normalizeInnerState(d.condition, base.condition),
    workout: normalizeWorkout(d.workout, base.workout),
    diet: {
      ...base.diet,
      ...(d.diet ?? {}),
      meals: Array.isArray(d.diet?.meals) ? d.diet.meals : base.diet.meals,
      alcohol: typeof d.diet?.alcohol === 'boolean' ? d.diet.alcohol : base.diet.alcohol,
      drinks: Array.isArray(d.diet?.drinks)
        ? d.diet.drinks.map(normalizeDrink).filter((x): x is Drink => x !== null)
        : base.diet.drinks,
      // 크레아틴은 예전에 1~5 척도였다. 옛 기록의 숫자는 '먹었다/안 먹었다'로 옮긴다.
      creatine:
        typeof d.diet?.creatine === 'number'
          ? d.diet.creatine >= 3
          : (d.diet?.creatine ?? base.diet.creatine),
    },
    reflection: typeof d.reflection === 'string' ? d.reflection : base.reflection,
    score: typeof d.score === 'number' ? d.score : base.score,
    scoreNote: typeof d.scoreNote === 'string' ? d.scoreNote : base.scoreNote,
    events,
    // 칸 수는 항상 48이어야 한다. 모자라거나 남으면 잘라 맞춘다.
    timeSlots: Array.from({ length: SLOT_COUNT }, (_, i) => {
      const v = Array.isArray(d.timeSlots) ? d.timeSlots[i] : null
      return typeof v === 'string' ? v : null
    }),
    screenTime:
      d.screenTime && typeof d.screenTime === 'object'
        ? Object.fromEntries(
            Object.entries(d.screenTime).filter(
              ([, v]) => typeof v === 'number' && Number.isFinite(v) && v >= 0,
            ),
          )
        : base.screenTime,
    updatedAt: typeof d.updatedAt === 'number' ? d.updatedAt : base.updatedAt,
  }
}

/**
 * 자리 번호가 없는 옛 기록에 번호를 매긴다.
 * 예전에 화면이 쓰던 순서(시각이 정해진 것부터, 그다음 만든 순)를 그대로
 * 이어받아야, 앱을 새로 열었을 때 목록이 제멋대로 뒤바뀌지 않는다.
 */
function withOrder(rawTodos: Todo[], rawEvents: DayEvent[]): { todos: Todo[]; events: DayEvent[] } {
  const hasAll =
    rawTodos.every((t) => typeof t?.order === 'number') &&
    rawEvents.every((e) => typeof e?.order === 'number')
  if (hasAll) return { todos: rawTodos, events: rawEvents }

  const combined = [
    ...rawEvents.map((e) => ({ kind: 'event' as const, id: e.id, time: e.time, createdAt: e.createdAt })),
    ...rawTodos.map((t) => ({ kind: 'todo' as const, id: t.id, time: null, createdAt: t.createdAt })),
  ].sort((a, b) => {
    if (a.time && b.time) return a.time.localeCompare(b.time)
    if (a.time) return -1
    if (b.time) return 1
    return (a.createdAt ?? 0) - (b.createdAt ?? 0)
  })
  const rank = new Map(combined.map((x, i) => [`${x.kind}:${x.id}`, i]))

  return {
    todos: rawTodos.map((t) => ({ ...t, order: t.order ?? rank.get(`todo:${t.id}`) ?? 0 })),
    events: rawEvents.map((e) => ({ ...e, order: e.order ?? rank.get(`event:${e.id}`) ?? 0 })),
  }
}

/**
 * 작품 한 편. 유형이 없으면 독서로 본다 — 콘텐츠가 독서뿐이던 시절에
 * 만든 항목은 kind가 없고 지은이가 author에 들어 있다.
 */
function normalizeContentItem(raw: unknown): ContentItem | null {
  if (!raw || typeof raw !== 'object') return null
  const b = raw as Partial<ContentItem> & { author?: string }
  if (!b.id || typeof b.id !== 'string') return null
  return {
    id: b.id,
    kind: typeof b.kind === 'string' && b.kind ? b.kind : 'book',
    title: typeof b.title === 'string' ? b.title : '',
    byline: typeof b.byline === 'string' ? b.byline : (b.author ?? ''),
    url: typeof b.url === 'string' ? b.url : '',
    colorIndex: typeof b.colorIndex === 'number' ? b.colorIndex : 0,
    createdAt: typeof b.createdAt === 'number' ? b.createdAt : Date.now(),
    updatedAt: typeof b.updatedAt === 'number' ? b.updatedAt : (b.createdAt ?? Date.now()),
  }
}

function normalizePerson(raw: unknown): Person | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as Partial<Person>
  if (!p.id || typeof p.id !== 'string') return null
  return {
    id: p.id,
    name: typeof p.name === 'string' ? p.name : '',
    relation: typeof p.relation === 'string' ? p.relation : '',
    colorIndex: typeof p.colorIndex === 'number' ? p.colorIndex : 0,
    createdAt: typeof p.createdAt === 'number' ? p.createdAt : Date.now(),
    updatedAt:
      typeof p.updatedAt === 'number'
        ? p.updatedAt
        : typeof p.createdAt === 'number'
          ? p.createdAt
          : Date.now(),
  }
}

/** 저장된 데이터를 읽어온다. 형태가 깨져 있으면 기본값으로 메운다. */
export function load(): AppData {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return emptyData()
    return migrate(JSON.parse(raw))
  } catch (err) {
    console.error('저장된 기록을 읽지 못했습니다', err)
    return emptyData()
  }
}

export function migrate(input: unknown): AppData {
  const base = emptyData()
  if (!input || typeof input !== 'object') return base
  const raw = input as Partial<AppData>

  const days: Record<ISODate, DayRecord> = {}
  if (raw.days && typeof raw.days === 'object') {
    for (const [date, day] of Object.entries(raw.days)) days[date] = normalizeDay(date, day)
  }

  const people = Array.isArray(raw.people)
    ? raw.people.map(normalizePerson).filter((p): p is Person => p !== null)
    : base.people

  const rawContent = Array.isArray(raw.content)
    ? raw.content
    : // 독서만 있던 시절의 이름
      ((raw as { books?: unknown[] }).books ?? [])
  const content = rawContent
    .map(normalizeContentItem)
    .filter((b): b is ContentItem => b !== null)

  return {
    version: VERSION,
    days,
    people,
    content,
    notifications: { ...base.notifications, ...(raw.notifications ?? {}) },
    // 예전에 직접 추가해둔 이름이 기본 부위가 되는 일이 있다('러닝'). 칩이 두 번
    // 나오지 않게 기본 목록과 겹치는 건 여기서 걷어낸다.
    customWorkoutParts: Array.isArray(raw.customWorkoutParts)
      ? raw.customWorkoutParts.filter(
          (c): c is string =>
            typeof c === 'string' && !(WORKOUT_PARTS as readonly string[]).includes(c),
        )
      : [],
    timeCategories: recoverOrphanCategories(
      days,
      Array.isArray(raw.timeCategories)
        ? raw.timeCategories
            .filter((c) => c && typeof c.id === 'string' && typeof c.label === 'string')
            // 시각이 없는 옛 유형은 1로 둔다. 0은 칸에서 되살린 빈 자리 몫이라,
            // 진짜 유형이 내려오면 그 자리를 이길 수 있어야 한다.
            .map((c) => ({ ...c, updatedAt: typeof c.updatedAt === 'number' ? c.updatedAt : 1 }))
        : [],
    ),
    deletedPeople:
      raw.deletedPeople && typeof raw.deletedPeople === 'object' ? raw.deletedPeople : {},
    deletedContent: pickTombstones(raw.deletedContent ?? (raw as { deletedBooks?: unknown }).deletedBooks),
    deletedTimeCategories: pickTombstones(raw.deletedTimeCategories),
    deletedContentKinds: pickTombstones(raw.deletedContentKinds),
    customContentKinds: Array.isArray(raw.customContentKinds)
      ? raw.customContentKinds
          .filter((k) => k && typeof k.id === 'string' && typeof k.label === 'string')
          .map((k) => ({ ...k, updatedAt: typeof k.updatedAt === 'number' ? k.updatedAt : 1 }))
      : [],
    settingsUpdatedAt: typeof raw.settingsUpdatedAt === 'number' ? raw.settingsUpdatedAt : 0,
  }
}

let saveTimer: number | undefined

/** 입력 중 매 글자마다 직렬화하지 않도록 살짝 미뤄서 저장한다. */
export function save(data: AppData) {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => flush(data), 250)
}

export function flush(data: AppData) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data))
  } catch (err) {
    console.error('기록을 저장하지 못했습니다', err)
    alert('저장 공간이 부족해 기록을 저장하지 못했습니다. 설정에서 백업 후 정리해 주세요.')
  }
}

// ─── 동기화 상태 ──────────────────────────────────────────────────────────────

export interface SyncState {
  /** 아직 서버에 올리지 못한 날짜/사람. 앱이 꺼졌다 켜져도 남아야 하므로 따로 저장한다. */
  dirtyDays: Record<ISODate, true>
  dirtyPeople: Record<string, true>
  dirtyContent: Record<string, true>
  dirtyTimeCategories: Record<string, true>
  dirtyContentKinds: Record<string, true>
  settingsDirty: boolean
  /** 증분 조회 커서 (서버 시각) */
  cursor: string | null
  lastSyncedAt: number | null
}

export function emptySyncState(): SyncState {
  return {
    dirtyDays: {},
    dirtyPeople: {},
    dirtyContent: {},
    dirtyTimeCategories: {},
    dirtyContentKinds: {},
    settingsDirty: false,
    cursor: null,
    lastSyncedAt: null,
  }
}

export function loadSyncState(): SyncState {
  try {
    const raw = localStorage.getItem(SYNC_KEY)
    if (!raw) return emptySyncState()
    const parsed = JSON.parse(raw) as Partial<SyncState> & { dirtyBooks?: Record<string, true> }
    const state = { ...emptySyncState(), ...parsed }
    // 아직 못 올린 책이 남아 있는 채로 이름이 바뀌었을 수 있다. 그대로 이어받는다.
    if (parsed.dirtyBooks) state.dirtyContent = { ...parsed.dirtyBooks, ...state.dirtyContent }
    return state
  } catch {
    return emptySyncState()
  }
}

export function saveSyncState(state: SyncState) {
  try {
    localStorage.setItem(SYNC_KEY, JSON.stringify(state))
  } catch (err) {
    console.error('동기화 상태를 저장하지 못했습니다', err)
  }
}

// ─── 되돌리기용 스냅샷 ────────────────────────────────────────────────────────

/**
 * 기록을 통째로 갈아엎기 직전(불러오기 등)의 상태를 한 벌 보관한다.
 * 실수로 남의 백업을 불러왔을 때 되돌아갈 곳이 있어야 한다.
 */
export function saveSnapshot(data: AppData) {
  try {
    localStorage.setItem(
      SNAPSHOT_KEY,
      JSON.stringify({ at: Date.now(), days: Object.keys(data.days).length, data }),
    )
  } catch (err) {
    console.warn('스냅샷을 남기지 못했습니다', err)
  }
}

export function loadSnapshot(): { at: number; days: number; data: AppData } | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return { at: parsed.at, days: parsed.days, data: migrate(parsed.data) }
  } catch {
    return null
  }
}

export function exportJSON(data: AppData): string {
  return JSON.stringify(data, null, 2)
}

export function parseImport(text: string): AppData {
  return migrate(JSON.parse(text))
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}
