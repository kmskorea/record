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
import type {
  AppData,
  DayRecord,
  ISODate,
  NotificationSettings,
  Person,
} from './types'
import { emptyDay, PERSON_COLORS } from './types'
import { flush, load, newId, save } from './storage'
import { todayKey } from './date'

interface StoreValue {
  data: AppData
  today: ISODate
  getDay: (date: ISODate) => DayRecord
  /** updater가 돌려준 조각을 해당 날짜 기록에 얕게 병합한다. */
  updateDay: (date: ISODate, updater: (day: DayRecord) => Partial<DayRecord>) => void
  addPerson: (name: string, relation: string) => Person
  updatePerson: (id: string, patch: Partial<Omit<Person, 'id'>>) => void
  /** 사람과 그 사람에 대한 모든 기록을 지운다. */
  deletePerson: (id: string) => void
  setNotifications: (patch: Partial<NotificationSettings>) => void
  /** 알림 슬롯의 마지막 발송일을 기록한다(같은 날 중복 발송 방지). */
  markNotificationFired: (slot: string, date: ISODate) => void
  addCustomWorkoutPart: (part: string) => void
  replaceAll: (next: AppData) => void
}

const StoreContext = createContext<StoreValue | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(() => load())
  const [today, setToday] = useState<ISODate>(() => todayKey())
  const dataRef = useRef(data)
  dataRef.current = data

  // 자정을 넘기거나 앱을 다시 열었을 때 '오늘'을 갱신한다.
  useEffect(() => {
    const tick = () => setToday(todayKey())
    const id = window.setInterval(tick, 30_000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [])

  // 탭을 닫거나 백그라운드로 갈 때 남은 변경분을 즉시 기록한다.
  useEffect(() => {
    const persist = () => flush(dataRef.current)
    window.addEventListener('pagehide', persist)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') persist()
    })
    return () => window.removeEventListener('pagehide', persist)
  }, [])

  const commit = useCallback((next: AppData) => {
    setData(next)
    save(next)
  }, [])

  const getDay = useCallback(
    (date: ISODate) => dataRef.current.days[date] ?? emptyDay(date),
    [],
  )

  const updateDay = useCallback<StoreValue['updateDay']>(
    (date, updater) => {
      setData((prev) => {
        const current = prev.days[date] ?? emptyDay(date)
        const next: AppData = {
          ...prev,
          days: {
            ...prev.days,
            [date]: { ...current, ...updater(current), updatedAt: Date.now() },
          },
        }
        save(next)
        return next
      })
    },
    [],
  )

  const addPerson = useCallback<StoreValue['addPerson']>((name, relation) => {
    const person: Person = {
      id: newId(),
      name: name.trim(),
      relation: relation.trim(),
      colorIndex: Math.floor(Math.random() * PERSON_COLORS.length),
      createdAt: Date.now(),
    }
    setData((prev) => {
      const next = { ...prev, people: [...prev.people, person] }
      save(next)
      return next
    })
    return person
  }, [])

  const updatePerson = useCallback<StoreValue['updatePerson']>((id, patch) => {
    setData((prev) => {
      const next = {
        ...prev,
        people: prev.people.map((p) => (p.id === id ? { ...p, ...patch } : p)),
      }
      save(next)
      return next
    })
  }, [])

  const deletePerson = useCallback<StoreValue['deletePerson']>((id) => {
    setData((prev) => {
      const days: Record<ISODate, DayRecord> = {}
      for (const [date, day] of Object.entries(prev.days)) {
        days[date] = day.interactions.some((i) => i.personId === id)
          ? { ...day, interactions: day.interactions.filter((i) => i.personId !== id) }
          : day
      }
      const next = { ...prev, days, people: prev.people.filter((p) => p.id !== id) }
      save(next)
      return next
    })
  }, [])

  const setNotifications = useCallback<StoreValue['setNotifications']>((patch) => {
    setData((prev) => {
      const next = { ...prev, notifications: { ...prev.notifications, ...patch } }
      save(next)
      return next
    })
  }, [])

  const markNotificationFired = useCallback<StoreValue['markNotificationFired']>(
    (slot, date) => {
      setData((prev) => {
        if (prev.notifications.lastFired[slot] === date) return prev
        const next = {
          ...prev,
          notifications: {
            ...prev.notifications,
            lastFired: { ...prev.notifications.lastFired, [slot]: date },
          },
        }
        save(next)
        return next
      })
    },
    [],
  )

  const addCustomWorkoutPart = useCallback<StoreValue['addCustomWorkoutPart']>((part) => {
    const clean = part.trim()
    if (!clean) return
    setData((prev) => {
      if (prev.customWorkoutParts.includes(clean)) return prev
      const next = { ...prev, customWorkoutParts: [...prev.customWorkoutParts, clean] }
      save(next)
      return next
    })
  }, [])

  const replaceAll = useCallback<StoreValue['replaceAll']>(
    (next) => {
      commit(next)
    },
    [commit],
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
      replaceAll,
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
      replaceAll,
    ],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore는 StoreProvider 안에서만 쓸 수 있습니다')
  return ctx
}
