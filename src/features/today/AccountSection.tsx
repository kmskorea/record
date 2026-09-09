import { useState } from 'react'
import { useStore } from '../../lib/store'
import { syncLook } from '../../components/SyncBadge'
import { configFromBuild } from '../../lib/supabase'
import { formatTime } from '../../lib/date'

/** 로그인·동기화 상태를 다루는 설정 카드. */
export function AccountSection() {
  const { sync, session, remoteConfigured, setRemoteConfig, signIn, signUp, signOut, syncNow, data } =
    useStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [url, setUrl] = useState('')
  const [anonKey, setAnonKey] = useState('')

  const look = syncLook(sync)
  const dayCount = Object.keys(data.days).length

  const submit = async () => {
    setBusy(true)
    setMessage(null)
    const run = mode === 'signin' ? signIn : signUp
    const error = await run(email, password)
    setBusy(false)
    if (error) {
      setMessage(error)
    } else if (mode === 'signup') {
      setMessage(
        '가입 요청을 보냈습니다. 메일함의 확인 링크를 누른 뒤 로그인해 주세요. (확인 메일이 꺼져 있으면 바로 로그인됩니다.)',
      )
    } else {
      setPassword('')
    }
  }

  // 접속 정보가 아직 없으면 그것부터 받는다.
  if (!remoteConfigured && !configFromBuild()) {
    return (
      <section className="card">
        <header className="card-head">
          <h2 className="card-title">
            <i className="mark" style={{ background: 'var(--ink-3)' }} />
            기기 간 동기화
          </h2>
        </header>
        <div className="banner" style={{ marginBottom: 12 }}>
          지금은 이 기기에만 저장됩니다. Supabase 접속 정보를 넣으면 노트북과 휴대폰이 같은 기록을
          보게 됩니다. 값은 Supabase 프로젝트의 Settings → API에서 복사할 수 있습니다.
        </div>
        <div className="stack">
          <label className="field">
            <span className="field-label">Project URL</span>
            <input
              className="input"
              placeholder="https://xxxx.supabase.co"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              autoCapitalize="off"
              autoCorrect="off"
            />
          </label>
          <label className="field">
            <span className="field-label">anon public key</span>
            <input
              className="input"
              placeholder="eyJ..."
              value={anonKey}
              onChange={(e) => setAnonKey(e.target.value)}
              autoCapitalize="off"
              autoCorrect="off"
            />
          </label>
          <button
            type="button"
            className="btn primary block"
            disabled={!url.trim() || !anonKey.trim()}
            onClick={() => setRemoteConfig({ url: url.trim(), anonKey: anonKey.trim() })}
          >
            연결
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="card">
      <header className="card-head">
        <h2 className="card-title">
          <i className="mark" style={{ background: 'var(--green)' }} />
          계정과 동기화
        </h2>
        <span
          className="sync-badge"
          style={{ background: look.bg, color: look.color, pointerEvents: 'none' }}
        >
          <i className="sync-dot" data-spin={sync.phase === 'syncing'} />
          {look.label}
        </span>
      </header>

      {session ? (
        <>
          <div className="setting-row">
            <div style={{ minWidth: 0 }}>
              <div className="title" style={{ wordBreak: 'break-all' }}>
                {session.user.email}
              </div>
              <div className="desc">
                {dayCount}일 기록
                {sync.lastSyncedAt ? ` · 마지막 동기화 ${formatTime(sync.lastSyncedAt)}` : ''}
              </div>
            </div>
          </div>

          {sync.error && (
            <div className="banner" style={{ marginTop: 12, color: 'var(--accent)' }}>
              {sync.error}
              <br />
              아직 못 올린 기록 {sync.pending}건은 이 기기에 그대로 있습니다. 연결이 돌아오면 다시
              올립니다.
            </div>
          )}

          {/*
            서버 스키마를 아직 안 돌린 계정에서도 하루 기록은 계속 오간다.
            사람·콘텐츠만 못 올라간다는 사실과 할 일을 바로 알려준다.
            (스키마를 한 번 돌리면 앞으로 다시 볼 일이 없는 안내다.)
          */}
          {sync.schemaOutdated && (
            <div className="banner" style={{ marginTop: 12, color: 'var(--brown)' }}>
              사람·콘텐츠를 올릴 자리가 서버에 아직 없습니다. Supabase의 SQL Editor에서{' '}
              <a
                href="https://github.com/kmskorea/record/blob/main/supabase/schema.sql"
                target="_blank"
                rel="noreferrer"
                style={{ textDecoration: 'underline' }}
              >
                schema.sql
              </a>
              을 통째로 붙여넣고 한 번 실행해 주세요. 그때까지 이 기록들은 이 기기에 안전하게
              남아 있다가 그대로 올라갑니다. (하루 기록은 지금도 정상으로 오가고 있습니다.)
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              type="button"
              className="btn ghost"
              style={{ flex: 1 }}
              onClick={syncNow}
              disabled={sync.phase === 'syncing'}
            >
              지금 동기화
            </button>
            <button
              type="button"
              className="btn ghost"
              style={{ flex: 1 }}
              onClick={() => {
                if (confirm('로그아웃해도 이 기기의 기록은 남습니다. 계속할까요?')) void signOut()
              }}
            >
              로그아웃
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="banner" style={{ marginBottom: 12 }}>
            로그인하면 이 기기의 기록 {dayCount}일치가 서버로 올라가고, 다른 기기의 기록도 함께
            내려받습니다. 어느 쪽 기록도 지워지지 않고 합쳐집니다.
          </div>
          <div className="seg" style={{ marginBottom: 12 }}>
            <button
              type="button"
              className="seg-btn"
              aria-pressed={mode === 'signin'}
              onClick={() => setMode('signin')}
            >
              로그인
            </button>
            <button
              type="button"
              className="seg-btn"
              aria-pressed={mode === 'signup'}
              onClick={() => setMode('signup')}
            >
              가입
            </button>
          </div>
          <div className="stack">
            <input
              className="input"
              type="email"
              placeholder="이메일"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="email"
            />
            <input
              className="input"
              type="password"
              placeholder="비밀번호 (6자 이상)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submit()
              }}
            />
            <button
              type="button"
              className="btn primary block"
              disabled={busy || !email.trim() || password.length < 6}
              onClick={() => void submit()}
            >
              {busy ? '처리 중…' : mode === 'signin' ? '로그인' : '가입하기'}
            </button>
          </div>
        </>
      )}

      {message && (
        <div className="banner" style={{ marginTop: 12 }}>
          {message}
        </div>
      )}
    </section>
  )
}
