import { useEffect, useRef } from 'react'
import type { ISODate, NotificationSettings } from './types'
import { timeToMinutes, todayKey } from './date'

export type Slot = 'morning' | 'night'

export const SLOT_COPY: Record<Slot, { title: string; body: string }> = {
  morning: {
    title: '오늘 할 일을 정리할 시간',
    body: '오늘 뭘 할지 적어두고 시작해요.',
  },
  night: {
    title: '하루를 정리할 시간',
    body: '내면 상태, 운동, 오늘 있었던 일을 남겨두세요.',
  },
}

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

export function permission(): NotificationPermission {
  return notificationsSupported() ? Notification.permission : 'denied'
}

export async function requestPermission(): Promise<NotificationPermission> {
  if (!notificationsSupported()) return 'denied'
  try {
    return await Notification.requestPermission()
  } catch {
    return 'denied'
  }
}

async function show(slot: Slot) {
  const { title, body } = SLOT_COPY[slot]
  const options: NotificationOptions = {
    body,
    tag: `record-${slot}`,
    icon: './icon-192.png',
    badge: './icon-192.png',
    data: { slot },
  }
  // 설치형(PWA)에서는 서비스 워커를 통해야 알림이 표시된다.
  if ('serviceWorker' in navigator) {
    const reg = await navigator.serviceWorker.getRegistration()
    if (reg) {
      await reg.showNotification(title, options)
      return
    }
  }
  new Notification(title, options)
}

function due(time: string, nowMinutes: number): boolean {
  const target = timeToMinutes(time)
  // 예약 시각을 지났고, 2시간 안쪽이면 발송한다(오래 지난 알림은 건너뛴다).
  return nowMinutes >= target && nowMinutes - target < 120
}

/**
 * 앱이 열려 있는 동안 예약 시각을 감시한다.
 * 브라우저 특성상 앱(또는 설치된 PWA)이 완전히 종료된 상태에서는 울리지 않는다.
 */
export function useNotificationScheduler(
  settings: NotificationSettings,
  markFired: (slot: Slot, date: ISODate) => void,
) {
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  useEffect(() => {
    const check = () => {
      const s = settingsRef.current
      if (!s.enabled || permission() !== 'granted') return
      const now = new Date()
      const minutes = now.getHours() * 60 + now.getMinutes()
      const date = todayKey()
      const slots: [Slot, boolean, string][] = [
        ['morning', s.morningEnabled, s.morningTime],
        ['night', s.nightEnabled, s.nightTime],
      ]
      for (const [slot, on, time] of slots) {
        if (!on) continue
        if (s.lastFired[slot] === date) continue
        if (!due(time, minutes)) continue
        markFired(slot, date)
        void show(slot)
      }
    }
    check()
    const id = window.setInterval(check, 30_000)
    document.addEventListener('visibilitychange', check)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', check)
    }
  }, [markFired])
}

export async function sendTestNotification() {
  if (permission() !== 'granted') return false
  await show('morning')
  return true
}
