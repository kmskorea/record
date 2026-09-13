import { useRef, useState } from 'react'
import { Sheet, Switch } from '../../components/ui'
import { DownloadIcon, UploadIcon } from '../../components/icons'
import { useStore } from '../../lib/store'
import {
  blockedIdeas,
  exportJSON,
  loadDailyBackups,
  loadSnapshot,
  parseImport,
} from '../../lib/storage'
import { AccountSection } from './AccountSection'
import {
  notificationsSupported,
  permission,
  requestPermission,
  sendTestNotification,
} from '../../lib/notifications'
import { formatKorean, toKey, todayKey } from '../../lib/date'

export function SettingsSheet({ onClose }: { onClose: () => void }) {
  const { data, setNotifications, replaceAll, reviveIdeas, repullAll, republishAll, session } =
    useStore()
  const n = data.notifications
  const [perm, setPerm] = useState<NotificationPermission>(() => permission())
  const [message, setMessage] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const dayCount = Object.keys(data.days).length

  const toggleEnabled = async (on: boolean) => {
    if (!on) {
      setNotifications({ enabled: false })
      return
    }
    let p = permission()
    if (p === 'default') p = await requestPermission()
    setPerm(p)
    if (p !== 'granted') {
      setMessage('브라우저에서 알림 권한이 허용되지 않았습니다. 사이트 설정에서 알림을 허용해 주세요.')
      return
    }
    // 이미 지난 시각의 알림이 켜자마자 울리지 않도록 오늘 몫은 발송 처리해 둔다.
    setNotifications({ enabled: true, lastFired: { morning: todayKey(), night: todayKey() } })
    setMessage('알림을 켰습니다. 내일부터 예약한 시각에 알려드릴게요.')
  }

  const doExport = () => {
    const blob = new Blob([exportJSON(data)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `record-backup-${todayKey()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const doImport = async (file: File) => {
    try {
      const next = parseImport(await file.text())
      const count = Object.keys(next.days).length
      if (!confirm(`${count}일치 기록을 불러옵니다. 지금 기기의 기록은 덮어써집니다. 계속할까요?`))
        return
      replaceAll(next)
      setMessage(`${count}일치 기록을 불러왔습니다.`)
    } catch {
      setMessage('파일을 읽지 못했습니다. 이 앱에서 내보낸 JSON 파일인지 확인해 주세요.')
    }
  }

  // 시트를 열 때 한 번만 읽는다. 매 렌더마다 통째로 파싱할 것은 아니다.
  const [snapshot] = useState(loadSnapshot)
  const [backups] = useState(loadDailyBackups)
  // 되살릴 거리가 있을 때만 물어본다
  const blocked = blockedIdeas(data.days, data.deletedThoughts).length

  return (
    <Sheet title="설정" subtitle={`${dayCount}일 기록 · ${data.people.length}명`} onClose={onClose}>
      <AccountSection />

      <section className="card">
        <header className="card-head">
          <h2 className="card-title">
            <i className="mark" style={{ background: 'var(--green)' }} />
            알림
          </h2>
          <Switch checked={n.enabled} onChange={toggleEnabled} label="알림 켜기" />
        </header>

        {!notificationsSupported() && (
          <div className="banner">이 브라우저는 알림을 지원하지 않습니다.</div>
        )}

        {perm === 'denied' && (
          <div className="banner">
            알림이 차단되어 있습니다. 브라우저 주소창의 자물쇠 아이콘 → 알림 → 허용으로 바꿔주세요.
          </div>
        )}

        <div className="setting-row">
          <div>
            <div className="title">아침 정리</div>
            <div className="desc">하루 시작 전 할 일 정리</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="time"
              className="time-input"
              value={n.morningTime}
              onChange={(e) => setNotifications({ morningTime: e.target.value })}
            />
            <Switch
              checked={n.morningEnabled}
              onChange={(v) => setNotifications({ morningEnabled: v })}
              label="아침 알림"
            />
          </div>
        </div>

        <div className="setting-row">
          <div>
            <div className="title">저녁 정리</div>
            <div className="desc">하루 마무리 기록</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="time"
              className="time-input"
              value={n.nightTime}
              onChange={(e) => setNotifications({ nightTime: e.target.value })}
            />
            <Switch
              checked={n.nightEnabled}
              onChange={(v) => setNotifications({ nightEnabled: v })}
              label="저녁 알림"
            />
          </div>
        </div>

        <button
          type="button"
          className="btn ghost block"
          style={{ marginTop: 12 }}
          disabled={perm !== 'granted'}
          onClick={async () => {
            const ok = await sendTestNotification()
            setMessage(ok ? '테스트 알림을 보냈습니다.' : '알림 권한이 필요합니다.')
          }}
        >
          테스트 알림 보내기
        </button>

        <div className="banner" style={{ marginTop: 12 }}>
          알림은 앱이 열려 있거나 백그라운드에 살아 있을 때 울립니다. 홈 화면에 설치해두면 더
          안정적으로 도착합니다.
        </div>
      </section>

      <section className="card">
        <header className="card-head">
          <h2 className="card-title">
            <i className="mark" style={{ background: 'var(--blue)' }} />
            데이터
          </h2>
        </header>
        <div className="banner" style={{ marginBottom: 12 }}>
          동기화와 별개로, 파일로 받아두면 어떤 사고에도 기록이 남습니다. 가끔 내보내 두세요.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn ghost" style={{ flex: 1 }} onClick={doExport}>
            <DownloadIcon className="btn-icon" /> 내보내기
          </button>
          <button
            type="button"
            className="btn ghost"
            style={{ flex: 1 }}
            onClick={() => fileRef.current?.click()}
          >
            <UploadIcon className="btn-icon" /> 불러오기
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void doImport(file)
            e.target.value = ''
          }}
        />

        {blocked > 0 && (
          <>
            <div className="banner" style={{ marginTop: 12 }}>
              반추가 비었는데 하루 기록 안에는 옛 아이디어 {blocked}개의 글이 그대로 남아 있습니다.
              반추에서 일부러 지웠던 것도 같이 돌아옵니다.
            </div>
            <button
              type="button"
              className="btn ghost block"
              style={{ marginTop: 8 }}
              onClick={() => {
                const n = reviveIdeas()
                setMessage(`옛 아이디어 ${n}개를 반추의 문장으로 되살렸습니다.`)
              }}
            >
              옛 아이디어 {blocked}개 반추로 되살리기
            </button>
          </>
        )}

        {backups.length > 0 && (
          <>
            <div className="banner" style={{ marginTop: 12 }}>
              앱을 열 때 하루에 한 벌씩 이 기기에 예비를 남겨둡니다. 기록이 갑자기 비었다면 여기서
              되돌리세요.
            </div>
            {backups.map((b) => (
              <button
                key={b.date}
                type="button"
                className="btn ghost block"
                style={{ marginTop: 8 }}
                onClick={() => {
                  if (
                    confirm(
                      `${formatKorean(b.date)}에 남긴 예비(${b.days}일치, 반추 ${b.data.thoughts.length}개)로 되돌립니다. 지금 기기의 기록은 덮어써집니다. 계속할까요?`,
                    )
                  ) {
                    replaceAll(b.data)
                    setMessage(`${formatKorean(b.date)}의 예비로 되돌렸습니다.`)
                  }
                }}
              >
                {formatKorean(b.date)} 예비로 되돌리기 ({b.days}일치)
              </button>
            ))}
          </>
        )}

        {snapshot && (
          <>
            <div className="banner" style={{ marginTop: 12 }}>
              불러오기 직전 상태가 한 벌 남아 있습니다 ({snapshot.days}일치, {formatKorean(
                toKey(new Date(snapshot.at)),
              )}). 잘못 불러왔다면 되돌릴 수 있습니다.
            </div>
            <button
              type="button"
              className="btn ghost block"
              style={{ marginTop: 8 }}
              onClick={() => {
                if (confirm(`${snapshot.days}일치였던 이전 상태로 되돌립니다. 계속할까요?`)) {
                  replaceAll(snapshot.data)
                  setMessage('이전 상태로 되돌렸습니다.')
                }
              }}
            >
              이전 상태로 되돌리기
            </button>
          </>
        )}
      </section>

      {session && (
        <section className="card">
          <header className="card-head">
            <h2 className="card-title">
              <i className="mark" style={{ background: 'var(--brown)' }} />
              기록 되찾기
            </h2>
          </header>
          <p className="card-note" style={{ marginBottom: 12 }}>
            어느 한쪽에서만 기록이 사라졌을 때 씁니다. 어느 쪽이 성한지 보고 고르세요.
          </p>
          <button
            type="button"
            className="btn ghost block"
            onClick={() => {
              repullAll()
              setMessage('서버에 있는 것을 처음부터 다시 받고 있습니다.')
            }}
          >
            서버에서 전부 다시 받기
          </button>
          <p className="card-note" style={{ margin: '6px 0 12px' }}>
            이 기기에서만 빠졌을 때. 올리는 것이 없어 다른 기기는 그대로입니다.
          </p>
          <button
            type="button"
            className="btn ghost block"
            onClick={() => {
              if (
                confirm(
                  '이 기기의 기록을 서버에 다시 세웁니다.\n\n' +
                    '다른 기기에 더 새로 적은 것이 있으면 그쪽이 밀립니다. 이 기기의 기록이 성할 때만 누르세요.',
                )
              ) {
                republishAll()
                setMessage('이 기기의 기록을 서버에 다시 올리고 있습니다.')
              }
            }}
          >
            이 기기 기록을 서버에 다시 세우기
          </button>
          <p className="card-note" style={{ marginTop: 6 }}>
            서버에서 사라졌을 때. 이 기기의 기록이 다른 기기의 것을 덮습니다.
          </p>
        </section>
      )}

      {message && <div className="banner">{message}</div>}

      <p className="card-note" style={{ textAlign: 'center', paddingBottom: 4 }}>
        빌드 {__BUILD_ID__} (UTC)
      </p>
    </Sheet>
  )
}
