import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import type {
  AppData,
  ContentItem,
  ContentKindDef,
  DayRecord,
  ISODate,
  NotificationSettings,
  Person,
  Routine,
  Thought,
  ThoughtLevel,
  TimeCategory,
} from './types'
import {
  BUILTIN_CONTENT_KINDS,
  CONTENT_COLORS,
  emptyDay,
  PROFILE_COLORS,
  THOUGHT_LEVEL,
  TIME_COLORS,
} from './types'
import {
  flush,
  load,
  loadSyncState,
  newId,
  save,
  saveSnapshot,
  saveSyncState,
  type SyncState,
} from './storage'
import { todayKey } from './date'
import { describeError, getClient, loadConfig, resetClient, saveConfig, type RemoteConfig } from './supabase'
import { markEverythingDirty, pendingCount, syncOnce, type SyncReport } from './sync'

interface StoreValue {
  data: AppData
  today: ISODate
  getDay: (date: ISODate) => DayRecord
  updateDay: (date: ISODate, updater: (day: DayRecord) => Partial<DayRecord>) => void
  addPerson: (name: string, relation: string) => Person
  updatePerson: (id: string, patch: Partial<Omit<Person, 'id'>>) => void
  deletePerson: (id: string) => void
  addContent: (kind: string, title: string, byline: string, url: string) => ContentItem
  updateContent: (id: string, patch: Partial<Omit<ContentItem, 'id'>>) => void
  deleteContent: (id: string) => void
  addContentKind: (label: string, fields: ContentKindDef['fields']) => ContentKindDef | null

  // 반추
  addThought: (text: string) => Thought | null
  updateThought: (id: string, patch: Partial<Omit<Thought, 'id'>>) => void
  deleteThought: (id: string) => void
  /** 고른 것들을 한 단계 위로 묶는다. 묶인 것은 재료로 그대로 남는다 */
  groupThoughts: (ids: string[], title: string) => Thought | null
  setThoughtParent: (id: string, parentId: string | null) => void

  // 루틴 — 날마다 등록하지 않아도 서 있는 할 일
  addRoutine: (title: string, time: string | null) => Routine | null
  deleteRoutine: (id: string) => void
  setNotifications: (patch: Partial<NotificationSettings>) => void
  markNotificationFired: (slot: string, date: ISODate) => void
  addCustomWorkoutPart: (part: string) => void
  addTimeCategory: (label: string) => TimeCategory | null
  renameTimeCategory: (id: string, label: string) => void
  deleteTimeCategory: (id: string) => void
  replaceAll: (next: AppData) => void

  // 동기화 / 계정
  sync: SyncReport
  session: Session | null
  remoteConfigured: boolean
  setRemoteConfig: (config: RemoteConfig) => void
  signIn: (email: string, password: string) => Promise<string | null>
  signUp: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
  syncNow: () => void
}

const StoreContext = createContext<StoreValue | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(() => load())
  const [syncState, setSyncState] = useState<SyncState>(() => loadSyncState())
  const [session, setSession] = useState<Session | null>(null)
  const [today, setToday] = useState<ISODate>(() => todayKey())
  const [phase, setPhase] = useState<SyncReport['phase']>(() =>
    loadConfig() ? 'signed-out' : 'unconfigured',
  )
  const [syncError, setSyncError] = useState<string | null>(null)
  const [schemaOutdated, setSchemaOutdated] = useState(false)
  const [configVersion, setConfigVersion] = useState(0)

  const dataRef = useRef(data)
  dataRef.current = data
  const syncStateRef = useRef(syncState)
  syncStateRef.current = syncState
  const sessionRef = useRef(session)
  sessionRef.current = session
  const runningRef = useRef(false)
  const timerRef = useRef<number | undefined>(undefined)

  // ── 로컬 저장 ──────────────────────────────────────────────────────────────

  const commitState = useCallback((next: SyncState) => {
    setSyncState(next)
    saveSyncState(next)
  }, [])

  useEffect(() => {
    const tick = () => setToday(todayKey())
    const id = window.setInterval(tick, 30_000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [])

  useEffect(() => {
    const persist = () => {
      flush(dataRef.current)
      saveSyncState(syncStateRef.current)
    }
    window.addEventListener('pagehide', persist)
    const onHide = () => {
      if (document.visibilityState === 'hidden') persist()
    }
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('pagehide', persist)
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [])

  // ── 동기화 ────────────────────────────────────────────────────────────────

  const runSync = useCallback(async () => {
    if (runningRef.current) return
    const client = getClient()
    const activeSession = sessionRef.current
    if (!client || !activeSession) return
    if (!navigator.onLine) {
      setPhase('offline')
      return
    }

    runningRef.current = true
    setPhase('syncing')
    const baseData = dataRef.current
    const baseState = syncStateRef.current
    try {
      const outcome = await syncOnce(client, baseData, baseState)
      if (dataRef.current !== baseData) {
        // 동기화 도중에 사용자가 뭔가 고쳤다. 어중간하게 섞지 않고 통째로 버린 뒤
        // 다시 돌린다. 올리기는 upsert라서 두 번 해도 결과가 같다.
        runningRef.current = false
        setPhase('idle')
        window.setTimeout(() => void runSync(), 200)
        return
      }
      setData(outcome.data)
      save(outcome.data)
      commitState(outcome.state)
      setSyncError(null)
      setSchemaOutdated(outcome.schemaOutdated)
      setPhase('idle')
    } catch (err) {
      console.error('동기화 실패', err)
      setSyncError(describeError(err))
      setPhase(navigator.onLine ? 'error' : 'offline')
    } finally {
      runningRef.current = false
    }
  }, [commitState])

  /** 편집 직후마다 서버를 두드리지 않도록 잠깐 모았다가 보낸다. */
  const requestSync = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => void runSync(), 1500)
  }, [runSync])

  // 로그인 상태를 따라간다.
  useEffect(() => {
    const client = getClient()
    if (!client) {
      setPhase('unconfigured')
      return
    }
    let alive = true
    void client.auth.getSession().then(({ data: got }) => {
      if (alive) setSession(got.session)
    })
    const { data: listener } = client.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })
    return () => {
      alive = false
      listener.subscription.unsubscribe()
    }
  }, [configVersion])

  // 로그인되면 이 기기의 기록을 전부 올릴 대상으로 잡고 첫 동기화를 돈다.
  const signedInUser = session?.user.id ?? null
  useEffect(() => {
    if (!signedInUser) {
      setPhase(loadConfig() ? 'signed-out' : 'unconfigured')
      return
    }
    const next = markEverythingDirty(dataRef.current, syncStateRef.current)
    syncStateRef.current = next
    commitState(next)
    void runSync()
  }, [signedInUser, commitState, runSync])

  // 주기적으로, 그리고 다시 보이거나 온라인이 될 때 맞춘다.
  useEffect(() => {
    if (!signedInUser) return
    const id = window.setInterval(() => void runSync(), 60_000)
    const wake = () => {
      if (document.visibilityState === 'visible') void runSync()
    }
    document.addEventListener('visibilitychange', wake)
    window.addEventListener('online', wake)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', wake)
      window.removeEventListener('online', wake)
    }
  }, [signedInUser, runSync])

  // ── 변경 ──────────────────────────────────────────────────────────────────

  /** 로컬에 먼저 확실히 쓰고, 올릴 목록에 표시한 다음, 나중에 올린다. */
  const commit = useCallback(
    (nextData: AppData, mark: (state: SyncState) => SyncState) => {
      setData(nextData)
      save(nextData)
      const nextState = mark(syncStateRef.current)
      syncStateRef.current = nextState
      commitState(nextState)
      requestSync()
    },
    [commitState, requestSync],
  )

  const getDay = useCallback((date: ISODate) => dataRef.current.days[date] ?? emptyDay(date), [])

  const updateDay = useCallback<StoreValue['updateDay']>(
    (date, updater) => {
      const current = dataRef.current.days[date] ?? emptyDay(date)
      const nextData: AppData = {
        ...dataRef.current,
        days: {
          ...dataRef.current.days,
          [date]: { ...current, ...updater(current), updatedAt: Date.now() },
        },
      }
      dataRef.current = nextData
      commit(nextData, (s) => ({ ...s, dirtyDays: { ...s.dirtyDays, [date]: true } }))
    },
    [commit],
  )

  const addPerson = useCallback<StoreValue['addPerson']>(
    (name, relation) => {
      const now = Date.now()
      const person: Person = {
        id: newId(),
        name: name.trim(),
        relation: relation.trim(),
        colorIndex: Math.floor(Math.random() * PROFILE_COLORS.length),
        createdAt: now,
        updatedAt: now,
      }
      const nextData = { ...dataRef.current, people: [...dataRef.current.people, person] }
      dataRef.current = nextData
      commit(nextData, (s) => ({ ...s, dirtyPeople: { ...s.dirtyPeople, [person.id]: true } }))
      return person
    },
    [commit],
  )

  const updatePerson = useCallback<StoreValue['updatePerson']>(
    (id, patch) => {
      const nextData = {
        ...dataRef.current,
        people: dataRef.current.people.map((p) =>
          p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p,
        ),
      }
      dataRef.current = nextData
      commit(nextData, (s) => ({ ...s, dirtyPeople: { ...s.dirtyPeople, [id]: true } }))
    },
    [commit],
  )

  const deletePerson = useCallback<StoreValue['deletePerson']>(
    (id) => {
      const now = Date.now()
      const days: Record<ISODate, DayRecord> = {}
      const touched: ISODate[] = []
      for (const [date, day] of Object.entries(dataRef.current.days)) {
        if (day.interactions.some((i) => i.personId === id)) {
          days[date] = {
            ...day,
            interactions: day.interactions.filter((i) => i.personId !== id),
            updatedAt: now,
          }
          touched.push(date)
        } else {
          days[date] = day
        }
      }
      const nextData: AppData = {
        ...dataRef.current,
        days,
        people: dataRef.current.people.filter((p) => p.id !== id),
        deletedPeople: { ...dataRef.current.deletedPeople, [id]: now },
      }
      dataRef.current = nextData
      commit(nextData, (s) => {
        const dirtyDays = { ...s.dirtyDays }
        for (const date of touched) dirtyDays[date] = true
        return { ...s, dirtyDays, dirtyPeople: { ...s.dirtyPeople, [id]: true } }
      })
    },
    [commit],
  )

  const addContent = useCallback<StoreValue['addContent']>(
    (kind, title, byline, url) => {
      const now = Date.now()
      const item: ContentItem = {
        id: newId(),
        kind,
        title: title.trim(),
        byline: byline.trim(),
        url: url.trim(),
        colorIndex: Math.floor(Math.random() * PROFILE_COLORS.length),
        createdAt: now,
        updatedAt: now,
      }
      const nextData = { ...dataRef.current, content: [...dataRef.current.content, item] }
      dataRef.current = nextData
      commit(nextData, (s) => ({ ...s, dirtyContent: { ...s.dirtyContent, [item.id]: true } }))
      return item
    },
    [commit],
  )

  const updateContent = useCallback<StoreValue['updateContent']>(
    (id, patch) => {
      const nextData = {
        ...dataRef.current,
        content: dataRef.current.content.map((c) =>
          c.id === id ? { ...c, ...patch, updatedAt: Date.now() } : c,
        ),
      }
      dataRef.current = nextData
      commit(nextData, (s) => ({ ...s, dirtyContent: { ...s.dirtyContent, [id]: true } }))
    },
    [commit],
  )

  const deleteContent = useCallback<StoreValue['deleteContent']>(
    (id) => {
      const now = Date.now()
      const days: Record<ISODate, DayRecord> = {}
      const touched: ISODate[] = []
      for (const [date, day] of Object.entries(dataRef.current.days)) {
        if (day.contentLogs.some((r) => r.itemId === id)) {
          days[date] = {
            ...day,
            contentLogs: day.contentLogs.filter((r) => r.itemId !== id),
            updatedAt: now,
          }
          touched.push(date)
        } else {
          days[date] = day
        }
      }
      const nextData: AppData = {
        ...dataRef.current,
        days,
        content: dataRef.current.content.filter((c) => c.id !== id),
        deletedContent: { ...dataRef.current.deletedContent, [id]: now },
      }
      dataRef.current = nextData
      commit(nextData, (s) => {
        const dirtyDays = { ...s.dirtyDays }
        for (const date of touched) dirtyDays[date] = true
        return { ...s, dirtyDays, dirtyContent: { ...s.dirtyContent, [id]: true } }
      })
    },
    [commit],
  )

  const addContentKind = useCallback<StoreValue['addContentKind']>(
    (label, fields) => {
      const clean = label.trim()
      if (!clean) return null
      const all = [...BUILTIN_CONTENT_KINDS, ...dataRef.current.customContentKinds]
      const existing = all.find((k) => k.label === clean)
      if (existing) return existing
      const kind: ContentKindDef = {
        id: newId(),
        label: clean,
        bylineLabel: '만든 사람',
        noteLabel: '소감',
        notePlaceholder: '보고 나서 남은 것',
        newLabel: `새 ${clean}`,
        fields,
        colorIndex: all.length % CONTENT_COLORS.length,
        updatedAt: Date.now(),
      }
      const nextData: AppData = {
        ...dataRef.current,
        customContentKinds: [...dataRef.current.customContentKinds, kind],
      }
      dataRef.current = nextData
      commit(nextData, (s) => ({
        ...s,
        dirtyContentKinds: { ...s.dirtyContentKinds, [kind.id]: true },
      }))
      return kind
    },
    [commit],
  )

  // ── 반추 ──────────────────────────────────────────────────────────────────

  const touchThoughts = useCallback(
    (next: Thought[], ids: string[], extra?: (s: SyncState) => SyncState) => {
      const nextData: AppData = { ...dataRef.current, thoughts: next }
      dataRef.current = nextData
      commit(nextData, (s) => {
        const dirtyThoughts = { ...s.dirtyThoughts }
        for (const id of ids) dirtyThoughts[id] = true
        return extra ? extra({ ...s, dirtyThoughts }) : { ...s, dirtyThoughts }
      })
    },
    [commit],
  )

  const addThought = useCallback<StoreValue['addThought']>(
    (text) => {
      const clean = text.trim()
      if (!clean) return null
      const now = Date.now()
      const thought: Thought = {
        id: newId(),
        level: 'sentence',
        title: '',
        text: clean,
        parentId: null,
        createdAt: now,
        updatedAt: now,
      }
      touchThoughts([...dataRef.current.thoughts, thought], [thought.id])
      return thought
    },
    [touchThoughts],
  )

  const updateThought = useCallback<StoreValue['updateThought']>(
    (id, patch) => {
      touchThoughts(
        dataRef.current.thoughts.map((t) =>
          t.id === id ? { ...t, ...patch, updatedAt: Date.now() } : t,
        ),
        [id],
      )
    },
    [touchThoughts],
  )

  const deleteThought = useCallback<StoreValue['deleteThought']>(
    (id) => {
      const now = Date.now()
      // 단락을 지워도 재료가 된 문장은 남긴다. 다듬은 결과가 아니라
      // 원래 생각이 아까운 것이다. 묶임만 풀어 위로 올려 둔다.
      const freed: string[] = []
      const next = dataRef.current.thoughts
        .filter((t) => t.id !== id)
        .map((t) => {
          if (t.parentId !== id) return t
          freed.push(t.id)
          return { ...t, parentId: null, updatedAt: now }
        })
      const nextData: AppData = {
        ...dataRef.current,
        thoughts: next,
        deletedThoughts: { ...dataRef.current.deletedThoughts, [id]: now },
      }
      dataRef.current = nextData
      commit(nextData, (s) => {
        const dirtyThoughts = { ...s.dirtyThoughts, [id]: true as const }
        for (const child of freed) dirtyThoughts[child] = true
        return { ...s, dirtyThoughts }
      })
    },
    [commit],
  )

  const groupThoughts = useCallback<StoreValue['groupThoughts']>(
    (ids, title) => {
      const picked = dataRef.current.thoughts.filter((t) => ids.includes(t.id))
      if (picked.length === 0) return null
      // 같은 단계끼리만 묶는다. 문장과 단락을 섞으면 어느 단계로 올릴지
      // 정할 수 없다.
      const level = picked[0].level
      if (picked.some((t) => t.level !== level)) return null
      const up = THOUGHT_LEVEL[level].up
      if (!up) return null

      const now = Date.now()
      const parent: Thought = {
        id: newId(),
        level: up as ThoughtLevel,
        title: title.trim(),
        text: '',
        parentId: null,
        createdAt: now,
        updatedAt: now,
      }
      const next = [
        ...dataRef.current.thoughts.map((t) =>
          ids.includes(t.id) ? { ...t, parentId: parent.id, updatedAt: now } : t,
        ),
        parent,
      ]
      touchThoughts(next, [parent.id, ...ids])
      return parent
    },
    [touchThoughts],
  )

  const setThoughtParent = useCallback<StoreValue['setThoughtParent']>(
    (id, parentId) => {
      touchThoughts(
        dataRef.current.thoughts.map((t) =>
          t.id === id ? { ...t, parentId, updatedAt: Date.now() } : t,
        ),
        [id],
      )
    },
    [touchThoughts],
  )

  const addRoutine = useCallback<StoreValue['addRoutine']>(
    (title, time) => {
      const clean = title.trim()
      if (!clean) return null
      const now = Date.now()
      const routine: Routine = { id: newId(), title: clean, time: time || null, createdAt: now, updatedAt: now }
      const nextData: AppData = {
        ...dataRef.current,
        routines: [...dataRef.current.routines, routine],
      }
      dataRef.current = nextData
      commit(nextData, (s) => ({ ...s, dirtyRoutines: { ...s.dirtyRoutines, [routine.id]: true } }))
      return routine
    },
    [commit],
  )

  const deleteRoutine = useCallback<StoreValue['deleteRoutine']>(
    (id) => {
      const now = Date.now()
      // 체크해둔 기록까지 뒤지지는 않는다. 루틴이 없어지면 그 체크는 어디에도
      // 안 쓰이고, 하루 기록을 전부 건드리면 괜히 충돌만 늘어난다.
      const nextData: AppData = {
        ...dataRef.current,
        routines: dataRef.current.routines.filter((r) => r.id !== id),
        deletedRoutines: { ...dataRef.current.deletedRoutines, [id]: now },
      }
      dataRef.current = nextData
      commit(nextData, (s) => ({ ...s, dirtyRoutines: { ...s.dirtyRoutines, [id]: true } }))
    },
    [commit],
  )

  const setNotifications = useCallback<StoreValue['setNotifications']>(
    (patch) => {
      const nextData: AppData = {
        ...dataRef.current,
        notifications: { ...dataRef.current.notifications, ...patch },
        settingsUpdatedAt: Date.now(),
      }
      dataRef.current = nextData
      commit(nextData, (s) => ({ ...s, settingsDirty: true }))
    },
    [commit],
  )

  /** 알림 발송 이력은 기기별 상태라 서버에 올리지 않는다. */
  const markNotificationFired = useCallback<StoreValue['markNotificationFired']>((slot, date) => {
    setData((prev) => {
      if (prev.notifications.lastFired[slot] === date) return prev
      const next: AppData = {
        ...prev,
        notifications: {
          ...prev.notifications,
          lastFired: { ...prev.notifications.lastFired, [slot]: date },
        },
      }
      dataRef.current = next
      save(next)
      return next
    })
  }, [])

  const addCustomWorkoutPart = useCallback<StoreValue['addCustomWorkoutPart']>(
    (part) => {
      const clean = part.trim()
      if (!clean || dataRef.current.customWorkoutParts.includes(clean)) return
      const nextData: AppData = {
        ...dataRef.current,
        customWorkoutParts: [...dataRef.current.customWorkoutParts, clean],
        settingsUpdatedAt: Date.now(),
      }
      dataRef.current = nextData
      commit(nextData, (s) => ({ ...s, settingsDirty: true }))
    },
    [commit],
  )

  const addTimeCategory = useCallback<StoreValue['addTimeCategory']>(
    (label) => {
      const clean = label.trim()
      if (!clean) return null
      const existing = dataRef.current.timeCategories.find((c) => c.label === clean)
      if (existing) return existing
      const category: TimeCategory = {
        id: newId(),
        label: clean,
        colorIndex: dataRef.current.timeCategories.length % TIME_COLORS.length,
        updatedAt: Date.now(),
      }
      const nextData: AppData = {
        ...dataRef.current,
        timeCategories: [...dataRef.current.timeCategories, category],
      }
      dataRef.current = nextData
      commit(nextData, (s) => ({
        ...s,
        dirtyTimeCategories: { ...s.dirtyTimeCategories, [category.id]: true },
      }))
      return category
    },
    [commit],
  )

  const renameTimeCategory = useCallback<StoreValue['renameTimeCategory']>(
    (id, label) => {
      const clean = label.trim()
      if (!clean) return
      const nextData: AppData = {
        ...dataRef.current,
        timeCategories: dataRef.current.timeCategories.map((c) =>
          c.id === id ? { ...c, label: clean, updatedAt: Date.now() } : c,
        ),
      }
      dataRef.current = nextData
      commit(nextData, (s) => ({
        ...s,
        dirtyTimeCategories: { ...s.dirtyTimeCategories, [id]: true },
      }))
    },
    [commit],
  )

  const deleteTimeCategory = useCallback<StoreValue['deleteTimeCategory']>(
    (id) => {
      const now = Date.now()
      // 유형을 지우면 그 유형으로 칠해둔 시간칸도 같이 비운다.
      const days: Record<ISODate, DayRecord> = {}
      const touched: ISODate[] = []
      for (const [date, day] of Object.entries(dataRef.current.days)) {
        if (day.timeSlots.includes(id)) {
          days[date] = {
            ...day,
            timeSlots: day.timeSlots.map((v) => (v === id ? null : v)),
            updatedAt: now,
          }
          touched.push(date)
        } else {
          days[date] = day
        }
      }
      const nextData: AppData = {
        ...dataRef.current,
        days,
        timeCategories: dataRef.current.timeCategories.filter((c) => c.id !== id),
        deletedTimeCategories: { ...dataRef.current.deletedTimeCategories, [id]: now },
      }
      dataRef.current = nextData
      commit(nextData, (s) => {
        const dirtyDays = { ...s.dirtyDays }
        for (const date of touched) dirtyDays[date] = true
        return { ...s, dirtyDays, dirtyTimeCategories: { ...s.dirtyTimeCategories, [id]: true } }
      })
    },
    [commit],
  )

  const replaceAll = useCallback<StoreValue['replaceAll']>(
    (next) => {
      // 통째로 갈아엎기 전에 되돌아갈 지점을 남긴다.
      saveSnapshot(dataRef.current)
      dataRef.current = next
      commit(next, (s) => markEverythingDirty(next, s))
    },
    [commit],
  )

  // ── 계정 ──────────────────────────────────────────────────────────────────

  const setRemoteConfig = useCallback<StoreValue['setRemoteConfig']>((config) => {
    saveConfig(config)
    resetClient()
    setConfigVersion((v) => v + 1)
    setPhase('signed-out')
  }, [])

  const signIn = useCallback<StoreValue['signIn']>(async (email, password) => {
    const client = getClient()
    if (!client) return '서버 접속 정보가 설정되지 않았습니다.'
    const { error } = await client.auth.signInWithPassword({ email: email.trim(), password })
    return error ? describeError(error) : null
  }, [])

  const signUp = useCallback<StoreValue['signUp']>(async (email, password) => {
    const client = getClient()
    if (!client) return '서버 접속 정보가 설정되지 않았습니다.'
    const { error } = await client.auth.signUp({ email: email.trim(), password })
    return error ? describeError(error) : null
  }, [])

  const signOut = useCallback<StoreValue['signOut']>(async () => {
    const client = getClient()
    // 로그아웃해도 이 기기의 기록은 남긴다. 지우는 건 사용자만 할 수 있어야 한다.
    await client?.auth.signOut()
    setSession(null)
  }, [])

  const syncNow = useCallback(() => void runSync(), [runSync])

  const sync = useMemo<SyncReport>(
    () => ({
      phase,
      lastSyncedAt: syncState.lastSyncedAt,
      pending: pendingCount(syncState),
      error: syncError,
      schemaOutdated,
    }),
    [phase, syncState, syncError, schemaOutdated],
  )

  const value = useMemo<StoreValue>(
    () => ({
      data,
      today,
      getDay,
      updateDay,
      addPerson,
      updatePerson,
      deletePerson,
      addContent,
      updateContent,
      deleteContent,
      addContentKind,
      addThought,
      updateThought,
      deleteThought,
      groupThoughts,
      setThoughtParent,
      addRoutine,
      deleteRoutine,
      setNotifications,
      markNotificationFired,
      addCustomWorkoutPart,
      addTimeCategory,
      renameTimeCategory,
      deleteTimeCategory,
      replaceAll,
      sync,
      session,
      remoteConfigured: Boolean(loadConfig()),
      setRemoteConfig,
      signIn,
      signUp,
      signOut,
      syncNow,
    }),
    [
      data,
      today,
      getDay,
      updateDay,
      addPerson,
      updatePerson,
      deletePerson,
      addContent,
      updateContent,
      deleteContent,
      addContentKind,
      addThought,
      updateThought,
      deleteThought,
      groupThoughts,
      setThoughtParent,
      addRoutine,
      deleteRoutine,
      setNotifications,
      markNotificationFired,
      addCustomWorkoutPart,
      addTimeCategory,
      renameTimeCategory,
      deleteTimeCategory,
      replaceAll,
      sync,
      session,
      setRemoteConfig,
      signIn,
      signUp,
      signOut,
      syncNow,
    ],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore는 StoreProvider 안에서만 쓸 수 있습니다')
  return ctx
}
