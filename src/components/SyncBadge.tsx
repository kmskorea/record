import type { SyncReport } from '../lib/sync'

interface Look {
  label: string
  color: string
  bg: string
}

export function syncLook(sync: SyncReport): Look {
  switch (sync.phase) {
    case 'unconfigured':
      return { label: '이 기기에만 저장', color: 'var(--ink-3)', bg: 'var(--surface-2)' }
    case 'signed-out':
      return { label: '로그인하면 동기화', color: 'var(--ink-2)', bg: 'var(--surface-2)' }
    case 'syncing':
      return { label: '동기화 중', color: 'var(--blue)', bg: 'var(--surface-2)' }
    case 'offline':
      return {
        label: sync.pending > 0 ? `오프라인 · ${sync.pending}건 대기` : '오프라인',
        color: 'var(--ink-2)',
        bg: 'var(--surface-2)',
      }
    case 'error':
      return { label: '동기화 실패', color: '#fff', bg: 'var(--accent)' }
    default:
      return sync.pending > 0
        ? { label: `${sync.pending}건 올리는 중`, color: 'var(--ink-2)', bg: 'var(--surface-2)' }
        : { label: '동기화됨', color: '#fff', bg: 'var(--green)' }
  }
}

export function SyncBadge({ sync, onClick }: { sync: SyncReport; onClick: () => void }) {
  const look = syncLook(sync)
  return (
    <button type="button" className="sync-badge" onClick={onClick} style={{ background: look.bg, color: look.color }}>
      <i className="sync-dot" data-spin={sync.phase === 'syncing'} />
      {look.label}
    </button>
  )
}
