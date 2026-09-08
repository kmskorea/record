import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export interface RemoteConfig {
  url: string
  anonKey: string
}

const CONFIG_KEY = 'record.remote.config.v1'

/**
 * 접속 정보는 빌드 시 주입된 값을 먼저 쓰고, 없으면 사용자가 앱에서 입력한 값을 쓴다.
 * (anon 키는 공개되어도 되는 값이다. 실제 접근 제어는 DB의 RLS가 한다.)
 */
export function loadConfig(): RemoteConfig | null {
  const url = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (url && anonKey) return { url, anonKey }
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as RemoteConfig
    return parsed.url && parsed.anonKey ? parsed : null
  } catch {
    return null
  }
}

export function saveConfig(config: RemoteConfig) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
}

export function clearConfig() {
  localStorage.removeItem(CONFIG_KEY)
}

/** 빌드에 값이 박혀 있으면 사용자가 따로 입력할 필요가 없다. */
export function configFromBuild(): boolean {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)
}

let client: SupabaseClient | null = null
let clientUrl: string | null = null

export function getClient(): SupabaseClient | null {
  const config = loadConfig()
  if (!config) return null
  if (client && clientUrl === config.url) return client
  client = createClient(config.url, config.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // 이메일 확인 링크·비밀번호 재설정 링크는 세션 토큰을 URL에 담아 앱으로
      // 돌아온다. false로 두면 그 토큰을 무시해서 로그인이 안 된 채로 뜬다.
      detectSessionInUrl: true,
    },
  })
  clientUrl = config.url
  return client
}

export function resetClient() {
  client = null
  clientUrl = null
}

/** Supabase 오류 메시지를 사람이 읽을 만한 한국어로 바꾼다. */
export function describeError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err ?? '')
  const lower = message.toLowerCase()
  if (lower.includes('invalid login credentials')) return '이메일 또는 비밀번호가 맞지 않습니다.'
  if (lower.includes('user already registered')) return '이미 가입된 이메일입니다. 로그인해 주세요.'
  if (lower.includes('password should be at least'))
    return '비밀번호는 6자 이상이어야 합니다.'
  if (lower.includes('email not confirmed'))
    return '이메일 인증이 필요합니다. 받은 편지함의 확인 링크를 눌러주세요.'
  if (lower.includes('failed to fetch') || lower.includes('networkerror'))
    return '서버에 연결하지 못했습니다. 네트워크를 확인해 주세요.'
  if (lower.includes('relation') && lower.includes('does not exist'))
    return '데이터베이스 테이블이 없습니다. supabase/schema.sql을 실행했는지 확인해 주세요.'
  return message || '알 수 없는 오류'
}
