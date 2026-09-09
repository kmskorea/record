import { syncOnce, markEverythingDirty, pendingCount } from '../src/lib/sync'
import { emptySyncState, migrate, type SyncState } from '../src/lib/storage'
import { emptyDay, type AppData, type ContentItem, type Person } from '../src/lib/types'

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
  content: any[]
  settings: any | null
}

let serverClock = 0
const nextServerTime = () => new Date(1800000000000 + ++serverClock * 1000).toISOString()

/** Supabase가 없는 테이블·함수에 내는 오류. 스키마를 아직 안 돌린 계정. */
const missingSchema = (what: string) => ({
  code: '42P01',
  message: `Could not find the table 'public.${what}' in the schema cache`,
})

function fakeClient(store: Store, opts: { failRpc?: string; noContent?: boolean } = {}) {
  const client: any = {
    // supabase/schema.sql의 merge_* 함수와 같은 규칙: 더 새것일 때만 내용을 바꾸고,
    // 바꾸지 않더라도 server_updated_at은 항상 올린다.
    rpc(fn: string, args: any) {
      if (opts.failRpc === fn) return Promise.resolve({ error: new Error(`${fn} 실패`) })
      if (opts.noContent && fn === 'merge_content') {
        return Promise.resolve({ error: missingSchema('merge_content') })
      }
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
      const table = fn === 'merge_days' ? 'days' : fn === 'merge_content' ? 'content' : 'people'
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
      const gone = opts.noContent && table === 'content'
      return {
        select() {
          const rowsFor = () =>
            table === 'settings' ? store.settings : ((store as any)[table] as any[])
          const builder: any = {
            gt(_col: string, value: string) {
              if (gone) return Promise.resolve({ data: null, error: missingSchema('content') })
              const rows = (rowsFor() as any[]).filter((r) => r.server_updated_at > value)
              return Promise.resolve({ data: rows, error: null })
            },
            maybeSingle() {
              return Promise.resolve({ data: store.settings, error: null })
            },
            then(resolve: any) {
              const result = gone
                ? { data: null, error: missingSchema('content') }
                : { data: rowsFor(), error: null }
              return Promise.resolve(result).then(resolve)
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

function item(id: string, title: string, updatedAt: number, kind = 'book'): ContentItem {
  return { id, kind, title, byline: '', url: '', colorIndex: 0, createdAt: updatedAt, updatedAt }
}

function contentDay(date: string, itemId: string, quote: string, updatedAt: number) {
  return {
    ...emptyDay(date),
    contentLogs: [
      { id: `r-${date}`, itemId, pages: 30, quote, rating: null, note: '', at: updatedAt },
    ],
    updatedAt,
  }
}


// ── 1. 서버가 비어 있어도 로컬 기록이 사라지지 않고 올라간다 ──────────────────
{
  const local = makeData({
    days: { '2026-09-01': day('2026-09-01', '로컬만 있는 기록', 1000) },
    people: [person('p1', '지현', 1000)],
  })
  const store: Store = { days: [], people: [], content: [], settings: null }
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
    content: [],
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
    content: [],
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
    content: [],
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
    content: [],
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
  const store: Store = { days: [], people: [], content: [], settings: null }
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
    content: [],
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
    content: [],
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
    content: [],
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
    content: [],
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
  const store: Store = { days: [], people: [], content: [], settings: null }
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

// ── 10. 콘텐츠도 기기 사이를 오간다 ────────────────────────────────────────
{
  const store: Store = { days: [], people: [], content: [], settings: null }
  const deviceA = makeData({
    content: [item('b1', '사피엔스', 1000)],
    days: { '2026-09-01': contentDay('2026-09-01', 'b1', '역사는 소수의 이야기', 1000) },
  })
  await syncOnce(fakeClient(store), deviceA, markEverythingDirty(deviceA, emptySyncState()))
  check('작품이 서버로 올라간다', store.content.length === 1 && store.content[0].id === 'b1')

  const deviceB = makeData({})
  const outB = await syncOnce(fakeClient(store), deviceB, emptySyncState())
  check('다른 기기가 작품을 받아온다', outB.data.content[0]?.title === '사피엔스')
  check(
    '거기 적은 구절도 같이 온다',
    outB.data.days['2026-09-01']?.contentLogs[0]?.quote === '역사는 소수의 이야기',
  )
}

// ── 11. 지운 작품은 다른 기기에서 되살아나지 않는다 ────────────────────────
{
  const store: Store = { days: [], people: [], content: [], settings: null }
  const deviceA = makeData({ content: [item('b1', '지울 책', 1000)] })
  await syncOnce(fakeClient(store), deviceA, markEverythingDirty(deviceA, emptySyncState()))

  // B가 먼저 받아 가진 뒤에, A에서 지운다
  const deviceB = makeData({})
  const gotB = await syncOnce(fakeClient(store), deviceB, emptySyncState())
  check('B가 작품을 한 번 받았다', gotB.data.content.length === 1)

  const deletedOnA = makeData({ content: [], deletedContent: { b1: 5000 } })
  await syncOnce(fakeClient(store), deletedOnA, {
    ...emptySyncState(),
    dirtyContent: { b1: true },
  })
  check('서버에 지웠다고 남는다', store.content[0].deleted === true)

  const afterB = await syncOnce(fakeClient(store), gotB.data, gotB.state)
  check('B에서도 사라진다', afterB.data.content.length === 0, JSON.stringify(afterB.data.content))
  check('묘비가 B에도 남는다', afterB.data.deletedContent.b1 === 5000)
}

// ── 12. 옛 기기가 새 제목을 옛 제목으로 되돌리지 못한다 ────────────────────
{
  const store: Store = { days: [], people: [], content: [], settings: null }
  const fresh = makeData({ content: [item('b1', '고친 제목', 9000)] })
  await syncOnce(fakeClient(store), fresh, markEverythingDirty(fresh, emptySyncState()))

  const stale = makeData({ content: [item('b1', '옛 제목', 1000)] })
  const out = await syncOnce(fakeClient(store), stale, markEverythingDirty(stale, emptySyncState()))
  check('서버가 옛 제목으로 덮이지 않는다', store.content[0].data.title === '고친 제목')
  check('옛 기기도 새 제목을 받아간다', out.data.content[0].title === '고친 제목')
}

// ── 13. content 테이블이 아직 없어도 나머지 동기화는 멈추지 않는다 ─────────
//
// 앱을 먼저 받고 Supabase 스키마를 나중에 실행하는 시기가 반드시 생긴다.
// 그 사이에 하루 기록까지 못 올리면 안 된다.
{
  const store: Store = { days: [], people: [], content: [], settings: null }
  const local = makeData({
    days: { '2026-09-01': day('2026-09-01', '스키마 없어도 올라가야 할 기록', 1000) },
    people: [person('p1', '지현', 1000)],
    content: [item('b1', '아직 못 올릴 책', 1000)],
  })
  const state = markEverythingDirty(local, emptySyncState())
  const out = await syncOnce(fakeClient(store, { noContent: true }), local, state)

  check('하루 기록은 그대로 올라간다', store.days.length === 1)
  check('사람도 올라간다', store.people.length === 1)
  check('콘텐츠만 못 올라간 것을 알려준다', out.schemaOutdated === true)
  check(
    '못 올린 작품은 대기열에 남는다',
    out.state.dirtyContent.b1 === true,
    JSON.stringify(out.state.dirtyContent),
  )
  check('로컬의 작품은 그대로 있다', out.data.content[0]?.title === '아직 못 올릴 책')

  // 스키마를 실행한 뒤 다시 돌리면 남아 있던 것이 그대로 올라간다
  const after = await syncOnce(fakeClient(store), out.data, out.state)
  check(
    '스키마를 만든 뒤 밀린 작품이 올라간다',
    store.content.length === 1 && store.content[0].id === 'b1',
  )
  check('그 뒤로는 경고가 사라진다', after.schemaOutdated === false)
  check('대기열도 비워진다', pendingCount(after.state) === 0, JSON.stringify(after.state))
}

// ── 14. 독서만 있던 시절의 저장본을 콘텐츠로 옮겨 읽는다 ────────────────────
//
// 이름이 바뀌었다고 이미 적어둔 것이 사라지면 안 된다.
{
  const old = migrate({
    books: [
      { id: 'b1', title: '사피엔스', author: '유발 하라리', colorIndex: 3, createdAt: 1, updatedAt: 7 },
    ],
    deletedBooks: { b9: 4000 },
    days: {
      '2026-09-01': {
        date: '2026-09-01',
        readings: [
          { id: 'r1', bookId: 'b1', pages: 42, quote: '옮겨 적은 문장', thought: '그때 든 생각', at: 5 },
        ],
        updatedAt: 5,
      },
    },
  })

  const moved = old.content[0]
  check('책이 콘텐츠 목록으로 옮겨진다', old.content.length === 1 && moved.id === 'b1')
  check("유형이 없으면 '독서'로 본다", moved.kind === 'book', moved.kind)
  check('지은이가 byline으로 옮겨진다', moved.byline === '유발 하라리', moved.byline)
  check('색과 시각은 그대로', moved.colorIndex === 3 && moved.updatedAt === 7)
  check('묘비도 그대로 이어진다', old.deletedContent.b9 === 4000)

  const log = old.days['2026-09-01'].contentLogs[0]
  check('독서 기록이 콘텐츠 기록이 된다', old.days['2026-09-01'].contentLogs.length === 1)
  check('bookId가 itemId로 옮겨진다', log.itemId === 'b1', log.itemId)
  check('구절은 그대로', log.quote === '옮겨 적은 문장')
  check('생각이 소감(note)으로 옮겨진다', log.note === '그때 든 생각', log.note)
  check('쪽수도 그대로', log.pages === 42)
  check('별점 칸은 비어서 생긴다', log.rating === null)

  // 옮긴 뒤에도 동기화는 평소대로 돈다
  const store: Store = { days: [], people: [], content: [], settings: null }
  const out = await syncOnce(fakeClient(store), old, markEverythingDirty(old, emptySyncState()))
  const uploaded = store.content.find((r) => r.id === 'b1')
  check('옮긴 작품이 서버로 올라간다', uploaded?.data.title === '사피엔스', JSON.stringify(store.content))
  // 옛 묘비도 같이 올라가야 다른 기기가 지워진 책을 되살리지 않는다
  check('옮긴 묘비도 같이 올라간다', store.content.find((r) => r.id === 'b9')?.deleted === true)
  check('올린 뒤 대기열이 비워진다', pendingCount(out.state) === 0, JSON.stringify(out.state))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
