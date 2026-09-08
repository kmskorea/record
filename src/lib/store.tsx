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
  DayRecord,
  ISODate,
  NotificationSettings,
  Person,
  TimeCategory,
} from './types'
import { emptyDay, PERSON_COLORS, TIME_COLORS } from './types'
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
        colorIndex: Math.floor(Math.random() * PERSON_COLORS.length),
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
      }
      const nextData: AppData = {
        ...dataRef.current,
        timeCategories: [...dataRef.current.timeCategories, category],
        settingsUpdatedAt: Date.now(),
      }
      dataRef.current = nextData
      commit(nextData, (s) => ({ ...s, settingsDirty: true }))
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
          c.id === id ? { ...c, label: clean } : c,
        ),
        settingsUpdatedAt: Date.now(),
      }
      dataRef.current = nextData
      commit(nextData, (s) => ({ ...s, settingsDirty: true }))
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
        settingsUpdatedAt: now,
      }
      dataRef.current = nextData
      commit(nextData, (s) => {
        const dirtyDays = { ...s.dirtyDays }
        for (const date of touched) dirtyDays[date] = true
        return { ...s, dirtyDays, settingsDirty: true }
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
    }),
    [phase, syncState, syncError],
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
