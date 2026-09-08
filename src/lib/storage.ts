import type { AppData } from './types'
import { DEFAULT_NOTIFICATIONS } from './types'

const KEY = 'record.app.v1'
const VERSION = 1

export function emptyData(): AppData {
  return {
    version: VERSION,
    days: {},
    people: [],
    notifications: { ...DEFAULT_NOTIFICATIONS, lastFired: {} },
    customWorkoutParts: [],
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
  return {
    version: VERSION,
    days: raw.days && typeof raw.days === 'object' ? raw.days : base.days,
    people: Array.isArray(raw.people) ? raw.people : base.people,
    notifications: { ...base.notifications, ...(raw.notifications ?? {}) },
    customWorkoutParts: Array.isArray(raw.customWorkoutParts) ? raw.customWorkoutParts : [],
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

export function exportJSON(data: AppData): string {
  return JSON.stringify(data, null, 2)
}

export function parseImport(text: string): AppData {
  return migrate(JSON.parse(text))
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}
