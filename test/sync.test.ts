import { syncOnce, markEverythingDirty, pendingCount } from '../src/lib/sync'
import { emptySyncState, migrate, type SyncState } from '../src/lib/storage'
import { emptyDay, type AppData, type Person } from '../src/lib/types'

let pass = 0
let fail = 0
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  << ' + extra}`)
  ok ? pass++ : fail++
}

// ── 가짜 Supabase 클라이언트 ────────────────────────────────────────────────
interface Store {
  days: any[]
  people: any[]
  settings: any | null
}

let serverClock = 0
const nextServerTime = () => new Date(1800000000000 + ++serverClock * 1000).toISOString()

function fakeClient(store: Store, opts: { failRpc?: string } = {}) {
  const client: any = {
    // supabase/schema.sql의 merge_* 함수와 같은 규칙: 더 새것일 때만 내용을 바꾸고,
    // 바꾸지 않더라도 server_updated_at은 항상 올린다.
    rpc(fn: string, args: any) {
      if (opts.failRpc === fn) return Promise.resolve({ error: new Error(`${fn} 실패`) })
      if (fn === 'merge_settings') {
        const incoming = { data: args.payload, updated_at: args.at }
        const cur = store.settings
        store.settings = {
          data: !cur || incoming.updated_at > cur.updated_at ? incoming.data : cur.data,
          updated_at: Math.max(incoming.updated_at, cur?.updated_at ?? 0),
          server_updated_at: nextServerTime(),
        }
        return Promise.resolve({ error: null })
      }
      const table = fn === 'merge_days' ? 'days' : 'people'
      const key = table === 'days' ? 'date' : 'id'
      const arr = (store as any)[table] as any[]
      for (const row of args.rows) {
        const at = arr.findIndex((r) => r[key] === row[key])
        if (at < 0) {
          arr.push({ ...row, server_updated_at: nextServerTime() })
        } else {
          const cur = arr[at]
          const newer = row.updated_at > cur.updated_at
          arr[at] = {
            ...cur,
            data: newer ? row.data : cur.data,
            deleted: newer ? (row.deleted ?? false) : cur.deleted,
            updated_at: Math.max(row.updated_at, cur.updated_at),
            server_updated_at: nextServerTime(),
          }
        }
      }
      return Promise.resolve({ error: null })
    },
    from(table: string) {
      return {
        select() {
          const rowsFor = () =>
            table === 'settings' ? store.settings : ((store as any)[table] as any[])
          const builder: any = {
            gt(_col: string, value: string) {
              const rows = (rowsFor() as any[]).filter((r) => r.server_updated_at > value)
              return Promise.resolve({ data: rows, error: null })
            },
            maybeSingle() {
              return Promise.resolve({ data: store.settings, error: null })
            },
            then(resolve: any) {
              return Promise.resolve({ data: rowsFor(), error: null }).then(resolve)
            },
          }
          return builder
        },
      }
    },
  }
  return client
}

function makeData(partial: Partial<AppData> = {}): AppData {
  return migrate({ ...partial })
}

function day(date: string, reflection: string, updatedAt: number) {
  return { ...emptyDay(date), reflection, updatedAt }
}

function person(id: string, name: string, updatedAt: number): Person {
  return { id, name, relation: '친구', colorIndex: 0, createdAt: updatedAt, updatedAt }
}


// ── 1. 서버가 비어 있어도 로컬 기록이 사라지지 않고 올라간다 ──────────────────
{
  const local = makeData({
    days: { '2026-09-01': day('2026-09-01', '로컬만 있는 기록', 1000) },
    people: [person('p1', '지현', 1000)],
  })
  const store: Store = { days: [], people: [], settings: null }
  const client = fakeClient(store)
  const state = markEverythingDirty(local, emptySyncState())
  const out = await syncOnce(client, local, state)

  check('서버가 비어도 로컬 기록이 남는다', out.data.days['2026-09-01']?.reflection === '로컬만 있는 기록')
  check('로컬 기록이 서버로 올라간다', store.days.length === 1 && store.days[0].date === '2026-09-01')
  check('사람도 올라간다', store.people.length === 1 && store.people[0].id === 'p1')
  check('올린 뒤 대기열이 비워진다', pendingCount(out.state) === 0, JSON.stringify(out.state))
}

// ── 2. 서버에만 있는 날은 로컬로 내려온다 ──────────────────────────────────
{
  const local = makeData({ days: { '2026-09-01': day('2026-09-01', '로컬', 1000) } })
  const store: Store = {
    days: [
      {
        date: '2026-09-02',
        data: day('2026-09-02', '다른 기기에서 쓴 것', 2000),
        updated_at: 2000,
        server_updated_at: '2026-09-02T00:00:00.000Z',
      },
    ],
    people: [],
    settings: null,
  }
  const out = await syncOnce(fakeClient(store), local, emptySyncState())
  check('서버에만 있는 날이 내려온다', out.data.days['2026-09-02']?.reflection === '다른 기기에서 쓴 것')
  check('그 와중에 기존 로컬 날짜도 그대로', out.data.days['2026-09-01']?.reflection === '로컬')
}

// ── 3. 같은 날 충돌 — 최신본이 이긴다 ──────────────────────────────────────
{
  const local = makeData({ days: { '2026-09-01': day('2026-09-01', '로컬이 최신', 5000) } })
  const store: Store = {
    days: [
      {
        date: '2026-09-01',
        data: day('2026-09-01', '서버는 옛것', 1000),
        updated_at: 1000,
        server_updated_at: '2026-09-01T00:00:00.000Z',
      },
    ],
    people: [],
    settings: null,
  }
  const out = await syncOnce(fakeClient(store), local, emptySyncState())
  check('로컬이 최신이면 로컬이 이긴다', out.data.days['2026-09-01'].reflection === '로컬이 최신')
}
{
  const local = makeData({ days: { '2026-09-01': day('2026-09-01', '로컬은 옛것', 1000) } })
  const store: Store = {
    days: [
      {
        date: '2026-09-01',
        data: day('2026-09-01', '서버가 최신', 9000),
        updated_at: 9000,
        server_updated_at: '2026-09-01T00:00:00.000Z',
      },
    ],
    people: [],
    settings: null,
  }
  const out = await syncOnce(fakeClient(store), local, emptySyncState())
  check('서버가 최신이면 서버가 이긴다', out.data.days['2026-09-01'].reflection === '서버가 최신')
}

// ── 4. 방금 쓴(=더 최신인) 수정은 아직 못 올렸어도 지켜진다 ────────────────
{
  const now = Date.now()
  const local = makeData({ days: { '2026-09-01': day('2026-09-01', '방금 쓴 것', now) } })
  const store: Store = {
    days: [
      {
        date: '2026-09-01',
        data: day('2026-09-01', '서버의 옛 값', now - 60_000),
        updated_at: now - 60_000,
        server_updated_at: nextServerTime(),
      },
    ],
    people: [],
    settings: null,
  }
  const state: SyncState = { ...emptySyncState(), dirtyDays: { '2026-09-01': true } }
  const out = await syncOnce(fakeClient(store), local, state)
  check('방금 쓴 수정이 서버 값에 덮이지 않는다', out.data.days['2026-09-01'].reflection === '방금 쓴 것', out.data.days['2026-09-01'].reflection)
  check('방금 쓴 수정이 서버에 반영된다', store.days[0].data.reflection === '방금 쓴 것', store.days[0].data.reflection)
}

// ── 4b. 올리기가 실패하면 대기열에 남고 로컬 기록은 그대로다 ────────────────
{
  const now = Date.now()
  const local = makeData({ days: { '2026-09-01': day('2026-09-01', '못 올린 기록', now) } })
  const store: Store = { days: [], people: [], settings: null }
  const state: SyncState = { ...emptySyncState(), dirtyDays: { '2026-09-01': true } }
  let threw = false
  try {
    await syncOnce(fakeClient(store, { failRpc: 'merge_days' }), local, state)
  } catch {
    threw = true
  }
  check('올리기 실패는 조용히 넘어가지 않는다', threw)
  check('실패해도 대기열이 남는다', state.dirtyDays['2026-09-01'] === true)
  check('실패해도 로컬 기록은 그대로', local.days['2026-09-01'].reflection === '못 올린 기록')

  // 연결이 돌아오면 다시 올라간다
  const retry = await syncOnce(fakeClient(store), local, state)
  check('재시도하면 올라간다', store.days.length === 1 && store.days[0].data.reflection === '못 올린 기록')
  check('재시도 후 대기열이 비워진다', pendingCount(retry.state) === 0)
}

// ── 5. 사람 삭제가 다른 기기로 전파된다 ────────────────────────────────────
{
  const local = makeData({ people: [], deletedPeople: { p1: 5000 } })
  const store: Store = {
    days: [],
    people: [
      { id: 'p1', data: person('p1', '지현', 1000), deleted: false, updated_at: 1000, server_updated_at: '2026-09-01T00:00:00.000Z' },
    ],
    settings: null,
  }
  const state: SyncState = { ...emptySyncState(), dirtyPeople: { p1: true } }
  const out = await syncOnce(fakeClient(store), local, state)
  check('지운 사람이 되살아나지 않는다', out.data.people.length === 0, JSON.stringify(out.data.people))
  check('서버에 묘비가 남는다', store.people[0].deleted === true)
}
{
  // 반대 방향: 다른 기기에서 지운 사람이 여기서도 사라진다
  const local = makeData({ people: [person('p1', '지현', 1000)] })
  const store: Store = {
    days: [],
    people: [
      { id: 'p1', data: { id: 'p1' }, deleted: true, updated_at: 7000, server_updated_at: '2026-09-03T00:00:00.000Z' },
    ],
    settings: null,
  }
  const out = await syncOnce(fakeClient(store), local, emptySyncState())
  check('다른 기기의 삭제가 반영된다', out.data.people.length === 0)
}

// ── 6. 서버에 없는 로컬 날짜는 절대 지워지지 않는다 ────────────────────────
{
  const local = makeData({
    days: {
      '2026-09-01': day('2026-09-01', 'A', 1000),
      '2026-09-02': day('2026-09-02', 'B', 1000),
      '2026-09-03': day('2026-09-03', 'C', 1000),
    },
  })
  const store: Store = {
    days: [
      { date: '2026-09-02', data: day('2026-09-02', 'B-서버', 9000), updated_at: 9000, server_updated_at: '2026-09-02T00:00:00.000Z' },
    ],
    people: [],
    settings: null,
  }
  const out = await syncOnce(fakeClient(store), local, emptySyncState())
  check('서버에 없는 날도 전부 남는다', Object.keys(out.data.days).length === 3, JSON.stringify(Object.keys(out.data.days)))
  check('겹치는 날만 갱신된다', out.data.days['2026-09-02'].reflection === 'B-서버')
}

// ── 7. 옛 기록에 새 항목이 없어도 깨지지 않는다 ────────────────────────────
{
  const old = migrate({
    days: { '2026-01-01': { date: '2026-01-01', reflection: '옛날 기록', updatedAt: 1 } },
    people: [{ id: 'p9', name: '옛사람', relation: '', colorIndex: 0, createdAt: 1 }],
  })
  const d = old.days['2026-01-01']
  check('없던 필드가 기본값으로 채워진다', Array.isArray(d.todos) && d.diet.meals.length === 0 && d.workout.did === null)
  check('옛 사람에 updatedAt이 생긴다', typeof old.people[0].updatedAt === 'number')
  check('옛 내용은 그대로', d.reflection === '옛날 기록')
}

// ── 8. 오래 안 켠 기기가 서버의 최신본을 덮어쓰지 못한다 ────────────────────
{
  // 기기 B: 예전에 받아둔 옛 버전을 들고 있다가 이제야 로그인
  const stale = makeData({ days: { '2026-09-01': day('2026-09-01', '기기B의 옛 기록', 1000) } })
  const store: Store = {
    days: [
      {
        date: '2026-09-01',
        data: day('2026-09-01', '기기A가 나중에 쓴 최신 기록', 8000),
        updated_at: 8000,
        server_updated_at: nextServerTime(),
      },
    ],
    people: [],
    settings: null,
  }
  const state = markEverythingDirty(stale, emptySyncState())
  const out = await syncOnce(fakeClient(store), stale, state)

  check(
    '옛 기기가 서버 최신본을 덮지 않는다',
    store.days[0].data.reflection === '기기A가 나중에 쓴 최신 기록',
    store.days[0].data.reflection,
  )
  check(
    '옛 기기도 최신본을 받아간다',
    out.data.days['2026-09-01'].reflection === '기기A가 나중에 쓴 최신 기록',
    out.data.days['2026-09-01'].reflection,
  )
}

// ── 9. 두 기기가 서로 다른 날을 쓰면 둘 다 살아남는다 ──────────────────────
{
  const deviceA = makeData({ days: { '2026-09-01': day('2026-09-01', 'A가 쓴 날', 1000) } })
  const store: Store = { days: [], people: [], settings: null }
  await syncOnce(fakeClient(store), deviceA, markEverythingDirty(deviceA, emptySyncState()))

  const deviceB = makeData({ days: { '2026-09-05': day('2026-09-05', 'B가 쓴 날', 2000) } })
  const outB = await syncOnce(
    fakeClient(store),
    deviceB,
    markEverythingDirty(deviceB, emptySyncState()),
  )

  check('B에 두 날이 모두 있다', Object.keys(outB.data.days).sort().join(',') === '2026-09-01,2026-09-05')
  check('서버에도 두 날이 모두 있다', store.days.length === 2)

  // A가 다시 동기화하면 B의 날도 받는다
  const outA = await syncOnce(fakeClient(store), deviceA, emptySyncState())
  check('A도 B의 날을 받아온다', outA.data.days['2026-09-05']?.reflection === 'B가 쓴 날')
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
