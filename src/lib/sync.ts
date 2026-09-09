import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  AppData,
  ContentItem,
  DayRecord,
  ISODate,
  NotificationSettings,
  Person,
} from './types'
import { normalizeDay, type SyncState } from './storage'

export type SyncPhase = 'unconfigured' | 'signed-out' | 'idle' | 'syncing' | 'offline' | 'error'

export interface SyncReport {
  phase: SyncPhase
  lastSyncedAt: number | null
  /** 아직 서버에 못 올린 건수 */
  pending: number
  error: string | null
  /** 서버에 content 테이블이 아직 없다. schema.sql을 다시 실행해야 한다. */
  schemaOutdated: boolean
}

export function pendingCount(state: SyncState): number {
  return (
    Object.keys(state.dirtyDays).length +
    Object.keys(state.dirtyPeople).length +
    Object.keys(state.dirtyContent).length +
    (state.settingsDirty ? 1 : 0)
  )
}

/**
 * content 테이블·함수가 아직 없는 계정인지 본다.
 *
 * 저장할 것이 늘어 테이블이 추가될 때마다, 앱만 새로 받고 Supabase 스키마를
 * 아직 다시 실행하지 않은 시기가 반드시 생긴다. 그때 예외를 그냥 위로 던지면
 * 하루 기록·사람까지 통째로 동기화가 멈춘다. 새 것만 미루고 나머지는 계속
 * 오가게 하려고 이 오류만 따로 알아본다.
 */
function isMissingSchema(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  // 42P01 테이블 없음, 42883 함수 없음, PGRST202/205 PostgREST 스키마 캐시에 없음
  if (['42P01', '42883', 'PGRST202', 'PGRST205'].includes(error.code ?? '')) return true
  return /could not find (the )?(table|function)/i.test(error.message ?? '')
}

interface DayRow {
  date: string
  data: DayRecord
  updated_at: number
  server_updated_at: string
}

interface PersonRow {
  id: string
  data: Person
  deleted: boolean
  updated_at: number
  server_updated_at: string
}

interface ContentRow {
  id: string
  data: ContentItem
  deleted: boolean
  updated_at: number
  server_updated_at: string
}

interface SettingsRow {
  data: {
    notifications?: unknown
    customWorkoutParts?: string[]
    timeCategories?: AppData['timeCategories']
    customContentKinds?: AppData['customContentKinds']
  }
  updated_at: number
}

/** 알림 발송 이력은 기기마다 다르므로 올리지 않는다. */
function settingsPayload(data: AppData) {
  const { lastFired: _lastFired, ...notifications } = data.notifications
  return {
    notifications,
    customWorkoutParts: data.customWorkoutParts,
    timeCategories: data.timeCategories,
    customContentKinds: data.customContentKinds,
  }
}

export interface SyncOutcome {
  data: AppData
  state: SyncState
  /** 서버에서 받아와 로컬이 실제로 바뀌었는지 */
  changed: boolean
  /** content 테이블이 없어서 콘텐츠 기록만 못 올렸는지 */
  schemaOutdated: boolean
}

/**
 * 한 번의 동기화.
 *
 * 순서가 중요하다. **올리기를 먼저** 하고 내려받는다. 반대로 하면 아직 못 올린
 * 로컬 수정이 오래된 서버 값에 덮여 사라진다.
 *
 * 병합 규칙은 '기록 단위 최신본 우선'이다. 하루 기록은 통째로 한 덩어리라
 * 같은 날을 두 기기에서 고치면 나중에 고친 쪽이 남는다. 서로 다른 날이나
 * 다른 사람 기록은 양쪽 것이 모두 살아남는다.
 *
 * 어떤 경우에도 서버에 없다는 이유로 로컬 기록을 지우지 않는다.
 */
export async function syncOnce(
  client: SupabaseClient,
  data: AppData,
  state: SyncState,
): Promise<SyncOutcome> {
  let next = data
  let nextState: SyncState = { ...state }

  // ── 1. 올리기 ──────────────────────────────────────────────────────────────
  const dirtyDates = Object.keys(state.dirtyDays)
  if (dirtyDates.length > 0) {
    const rows = dirtyDates
      .filter((date) => next.days[date])
      .map((date) => ({
        date,
        data: next.days[date],
        updated_at: next.days[date].updatedAt || Date.now(),
      }))
    if (rows.length > 0) {
      // 그냥 upsert하면 오래 안 켠 기기가 서버의 최신본을 덮어쓴다.
      // 서버 함수가 '더 새것일 때만' 내용을 바꿔준다.
      const { error } = await client.rpc('merge_days', { rows })
      if (error) throw error
    }
    // 올리기에 성공한 것만 지운다. 실패하면 그대로 두고 다음에 다시 시도한다.
    const remaining = { ...nextState.dirtyDays }
    for (const date of dirtyDates) delete remaining[date]
    nextState.dirtyDays = remaining
  }

  const dirtyPeople = Object.keys(state.dirtyPeople)
  if (dirtyPeople.length > 0) {
    const byId = new Map(next.people.map((p) => [p.id, p]))
    const rows = dirtyPeople.map((id) => {
      const person = byId.get(id)
      if (person) {
        return { id, data: person, deleted: false, updated_at: person.updatedAt || Date.now() }
      }
      // 목록에 없으면 지운 사람이다. 줄을 없애지 말고 지웠다고 표시한다.
      return {
        id,
        data: { id },
        deleted: true,
        updated_at: next.deletedPeople[id] ?? Date.now(),
      }
    })
    const { error } = await client.rpc('merge_people', { rows })
    if (error) throw error
    const remaining = { ...nextState.dirtyPeople }
    for (const id of dirtyPeople) delete remaining[id]
    nextState.dirtyPeople = remaining
  }

  if (state.settingsDirty) {
    const { error } = await client.rpc('merge_settings', {
      payload: settingsPayload(next),
      at: next.settingsUpdatedAt || Date.now(),
    })
    if (error) throw error
    nextState.settingsDirty = false
  }

  // 콘텐츠는 맨 뒤에 올린다. 스키마가 아직 없는 계정이라도 앞의 것들은
  // 이미 서버에 닿은 뒤라 하루 기록이 발이 묶이지 않는다.
  let schemaOutdated = false
  const dirtyContent = Object.keys(state.dirtyContent)
  if (dirtyContent.length > 0) {
    const byId = new Map(next.content.map((c) => [c.id, c]))
    const rows = dirtyContent.map((id) => {
      const item = byId.get(id)
      if (item) {
        return { id, data: item, deleted: false, updated_at: item.updatedAt || Date.now() }
      }
      return { id, data: { id }, deleted: true, updated_at: next.deletedContent[id] ?? Date.now() }
    })
    const { error } = await client.rpc('merge_content', { rows })
    if (error && !isMissingSchema(error)) throw error
    if (error) {
      // 못 올렸으니 표시를 지우지 않는다. 스키마를 실행하면 그대로 올라간다.
      schemaOutdated = true
    } else {
      const remaining = { ...nextState.dirtyContent }
      for (const id of dirtyContent) delete remaining[id]
      nextState.dirtyContent = remaining
    }
  }

  // ── 2. 내려받기 ────────────────────────────────────────────────────────────
  // 커서에서 살짝 뒤로 물러나 조회한다. 몇 건 겹쳐 받는 편이,
  // 시계 오차로 한 건이라도 놓치는 것보다 낫다.
  const since = state.cursor
    ? new Date(new Date(state.cursor).getTime() - 5 * 60_000).toISOString()
    : null

  let dayQuery = client.from('days').select('date, data, updated_at, server_updated_at')
  if (since) dayQuery = dayQuery.gt('server_updated_at', since)
  const { data: dayRows, error: dayErr } = await dayQuery
  if (dayErr) throw dayErr

  let personQuery = client.from('people').select('id, data, deleted, updated_at, server_updated_at')
  if (since) personQuery = personQuery.gt('server_updated_at', since)
  const { data: personRows, error: personErr } = await personQuery
  if (personErr) throw personErr

  const { data: settingsRow, error: settingsErr } = await client
    .from('settings')
    .select('data, updated_at')
    .maybeSingle()
  if (settingsErr) throw settingsErr

  let contentQuery = client.from('content').select('id, data, deleted, updated_at, server_updated_at')
  if (since) contentQuery = contentQuery.gt('server_updated_at', since)
  const { data: contentRows, error: contentErr } = await contentQuery
  if (contentErr && !isMissingSchema(contentErr)) throw contentErr
  if (contentErr) schemaOutdated = true

  // ── 3. 병합 ────────────────────────────────────────────────────────────────
  let changed = false
  let cursor = state.cursor

  const days: Record<ISODate, DayRecord> = { ...next.days }
  for (const row of (dayRows ?? []) as DayRow[]) {
    if (row.server_updated_at && (!cursor || row.server_updated_at > cursor)) {
      cursor = row.server_updated_at
    }
    // 아직 못 올린 로컬 수정이 있으면 건드리지 않는다.
    if (nextState.dirtyDays[row.date]) continue
    const local = days[row.date]
    if (!local || row.updated_at > local.updatedAt) {
      days[row.date] = normalizeDay(row.date, row.data)
      changed = true
    }
  }

  const people = [...next.people]
  const deletedPeople = { ...next.deletedPeople }
  const indexById = new Map(people.map((p, i) => [p.id, i]))
  for (const row of (personRows ?? []) as PersonRow[]) {
    if (row.server_updated_at && (!cursor || row.server_updated_at > cursor)) {
      cursor = row.server_updated_at
    }
    if (nextState.dirtyPeople[row.id]) continue
    const at = indexById.get(row.id)
    const local = at === undefined ? undefined : people[at]
    const localAt = local?.updatedAt ?? deletedPeople[row.id] ?? 0
    if (row.updated_at <= localAt) continue

    if (row.deleted) {
      if (at !== undefined) {
        people.splice(at, 1)
        indexById.clear()
        people.forEach((p, i) => indexById.set(p.id, i))
        changed = true
      }
      deletedPeople[row.id] = row.updated_at
    } else {
      const person: Person = { ...row.data, id: row.id, updatedAt: row.updated_at }
      if (at === undefined) {
        indexById.set(row.id, people.length)
        people.push(person)
      } else {
        people[at] = person
      }
      delete deletedPeople[row.id]
      changed = true
    }
  }

  // 콘텐츠는 사람과 같은 규칙으로 합친다. 지운 것은 묘비를 남기고,
  // 서버에 없다는 이유만으로 로컬에서 지우지 않는다.
  const content = [...next.content]
  const deletedContent = { ...next.deletedContent }
  const contentIndex = new Map(content.map((c, i) => [c.id, i]))
  for (const row of (contentRows ?? []) as ContentRow[]) {
    if (row.server_updated_at && (!cursor || row.server_updated_at > cursor)) {
      cursor = row.server_updated_at
    }
    if (nextState.dirtyContent[row.id]) continue
    const at = contentIndex.get(row.id)
    const localAt =
      (at === undefined ? undefined : content[at]?.updatedAt) ?? deletedContent[row.id] ?? 0
    if (row.updated_at <= localAt) continue

    if (row.deleted) {
      if (at !== undefined) {
        content.splice(at, 1)
        contentIndex.clear()
        content.forEach((c, i) => contentIndex.set(c.id, i))
        changed = true
      }
      deletedContent[row.id] = row.updated_at
    } else {
      const item: ContentItem = { ...row.data, id: row.id, updatedAt: row.updated_at }
      if (at === undefined) {
        contentIndex.set(row.id, content.length)
        content.push(item)
      } else {
        content[at] = item
      }
      delete deletedContent[row.id]
      changed = true
    }
  }

  let notifications = next.notifications
  let customWorkoutParts = next.customWorkoutParts
  let timeCategories = next.timeCategories
  let customContentKinds = next.customContentKinds
  let settingsUpdatedAt = next.settingsUpdatedAt
  const remoteSettings = settingsRow as SettingsRow | null
  if (
    remoteSettings &&
    !nextState.settingsDirty &&
    remoteSettings.updated_at > next.settingsUpdatedAt
  ) {
    const incoming = remoteSettings.data ?? {}
    notifications = {
      ...next.notifications,
      ...((incoming.notifications ?? {}) as Partial<NotificationSettings>),
      // 발송 이력은 기기별로 유지한다.
      lastFired: next.notifications.lastFired,
    }
    if (Array.isArray(incoming.customWorkoutParts)) {
      customWorkoutParts = incoming.customWorkoutParts
    }
    if (Array.isArray(incoming.timeCategories)) {
      timeCategories = incoming.timeCategories
    }
    if (Array.isArray(incoming.customContentKinds)) {
      customContentKinds = incoming.customContentKinds
    }
    settingsUpdatedAt = remoteSettings.updated_at
    changed = true
  }

  next = {
    ...next,
    days,
    people,
    content,
    deletedPeople,
    deletedContent,
    notifications,
    customWorkoutParts,
    timeCategories,
    customContentKinds,
    settingsUpdatedAt,
  }
  nextState = { ...nextState, cursor, lastSyncedAt: Date.now() }

  return { data: next, state: nextState, changed, schemaOutdated }
}

/**
 * 처음 로그인했을 때, 이 기기에 있던 기록을 전부 올릴 대상으로 표시한다.
 * 서버가 비어 있어도 로컬 기록이 사라지지 않게 하는 장치다.
 */
export function markEverythingDirty(data: AppData, state: SyncState): SyncState {
  const dirtyDays: Record<string, true> = { ...state.dirtyDays }
  for (const date of Object.keys(data.days)) dirtyDays[date] = true
  const dirtyPeople: Record<string, true> = { ...state.dirtyPeople }
  for (const person of data.people) dirtyPeople[person.id] = true
  for (const id of Object.keys(data.deletedPeople)) dirtyPeople[id] = true
  const dirtyContent: Record<string, true> = { ...state.dirtyContent }
  for (const item of data.content) dirtyContent[item.id] = true
  for (const id of Object.keys(data.deletedContent)) dirtyContent[id] = true
  return { ...state, dirtyDays, dirtyPeople, dirtyContent, settingsDirty: true }
}
