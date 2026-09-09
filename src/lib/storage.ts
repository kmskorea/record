import type { AppData, DayEvent, DayRecord, ISODate, Person, TimeCategory, Todo } from './types'
import { DEFAULT_NOTIFICATIONS, SLOT_COUNT, emptyDay } from './types'

const KEY = 'record.app.v1'
const SYNC_KEY = 'record.sync.v1'
const SNAPSHOT_KEY = 'record.snapshot.v1'
const VERSION = 1

export function emptyData(): AppData {
  return {
    version: VERSION,
    days: {},
    people: [],
    notifications: { ...DEFAULT_NOTIFICATIONS, lastFired: {} },
    customWorkoutParts: [],
    timeCategories: [],
    deletedPeople: {},
    settingsUpdatedAt: 0,
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
    sleep: { ...base.sleep, ...(d.sleep ?? {}) },
    condition: { ...base.condition, ...(d.condition ?? {}) },
    workout: {
      ...base.workout,
      ...(d.workout ?? {}),
      parts: Array.isArray(d.workout?.parts) ? d.workout.parts : base.workout.parts,
    },
    diet: {
      ...base.diet,
      ...(d.diet ?? {}),
      meals: Array.isArray(d.diet?.meals) ? d.diet.meals : base.diet.meals,
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

  return {
    version: VERSION,
    days,
    people,
    notifications: { ...base.notifications, ...(raw.notifications ?? {}) },
    customWorkoutParts: Array.isArray(raw.customWorkoutParts) ? raw.customWorkoutParts : [],
    timeCategories: Array.isArray(raw.timeCategories)
      ? (raw.timeCategories.filter(
          (c) => c && typeof c.id === 'string' && typeof c.label === 'string',
        ) as TimeCategory[])
      : [],
    deletedPeople:
      raw.deletedPeople && typeof raw.deletedPeople === 'object' ? raw.deletedPeople : {},
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
  settingsDirty: boolean
  /** 증분 조회 커서 (서버 시각) */
  cursor: string | null
  lastSyncedAt: number | null
}

export function emptySyncState(): SyncState {
  return { dirtyDays: {}, dirtyPeople: {}, settingsDirty: false, cursor: null, lastSyncedAt: null }
}

export function loadSyncState(): SyncState {
  try {
    const raw = localStorage.getItem(SYNC_KEY)
    if (!raw) return emptySyncState()
    return { ...emptySyncState(), ...(JSON.parse(raw) as Partial<SyncState>) }
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
