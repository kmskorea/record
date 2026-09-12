import { syncOnce, markEverythingDirty, pendingCount } from '../src/lib/sync'
import { emptySyncState, migrate, type SyncState } from '../src/lib/storage'
import { todoRate } from '../src/lib/metrics'
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
  /** 사람·콘텐츠가 kind로 섞여 들어간다 */
  objects: any[]
  settings: any | null
}

let serverClock = 0
const nextServerTime = () => new Date(1800000000000 + ++serverClock * 1000).toISOString()

/** Supabase가 없는 테이블·함수에 내는 오류. 스키마를 아직 안 돌린 계정. */
const missingSchema = (what: string) => ({
  code: '42P01',
  message: `Could not find the table 'public.${what}' in the schema cache`,
})

function fakeClient(store: Store, opts: { failRpc?: string; noObjects?: boolean } = {}) {
  const client: any = {
    // supabase/schema.sql의 merge_* 함수와 같은 규칙: 더 새것일 때만 내용을 바꾸고,
    // 바꾸지 않더라도 server_updated_at은 항상 올린다.
    rpc(fn: string, args: any) {
      if (opts.failRpc === fn) return Promise.resolve({ error: new Error(`${fn} 실패`) })
      if (opts.noObjects && fn === 'merge_objects') {
        return Promise.resolve({ error: missingSchema('merge_objects') })
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
      const table = fn === 'merge_days' ? 'days' : 'objects'
      const arr = (store as any)[table] as any[]
      const same = (a: any, b: any) =>
        table === 'days' ? a.date === b.date : a.kind === b.kind && a.id === b.id
      for (const row of args.rows) {
        const at = arr.findIndex((r) => same(r, row))
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
      const gone = opts.noObjects && table === 'objects'
      return {
        select() {
          const rowsFor = () =>
            table === 'settings' ? store.settings : ((store as any)[table] as any[])
          const builder: any = {
            gt(_col: string, value: string) {
              if (gone) return Promise.resolve({ data: null, error: missingSchema('objects') })
              const rows = (rowsFor() as any[]).filter((r) => r.server_updated_at > value)
              return Promise.resolve({ data: rows, error: null })
            },
            maybeSingle() {
              return Promise.resolve({ data: store.settings, error: null })
            },
            then(resolve: any) {
              const result = gone
                ? { data: null, error: missingSchema('objects') }
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

/** 서버에 올라간 줄 하나를 종류·id로 찾는다. */
const row = (store: Store, kind: string, id: string) =>
  store.objects.find((r) => r.kind === kind && r.id === id)

const rowsOf = (store: Store, kind: string) => store.objects.filter((r) => r.kind === kind)

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
  const store: Store = { days: [], objects: [], settings: null }
  const client = fakeClient(store)
  const state = markEverythingDirty(local, emptySyncState())
  const out = await syncOnce(client, local, state)

  check('서버가 비어도 로컬 기록이 남는다', out.data.days['2026-09-01']?.reflection === '로컬만 있는 기록')
  check('로컬 기록이 서버로 올라간다', store.days.length === 1 && store.days[0].date === '2026-09-01')
  check('사람도 올라간다', rowsOf(store, 'person').length === 1 && row(store, 'person', 'p1'))
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
    objects: [],
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
    objects: [],
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
    objects: [],
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
    objects: [],
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
  const store: Store = { days: [], objects: [], settings: null }
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
    objects: [
      { kind: 'person', id: 'p1', data: person('p1', '지현', 1000), deleted: false, updated_at: 1000, server_updated_at: '2026-09-01T00:00:00.000Z' },
    ],
    settings: null,
  }
  const state: SyncState = { ...emptySyncState(), dirtyPeople: { p1: true } }
  const out = await syncOnce(fakeClient(store), local, state)
  check('지운 사람이 되살아나지 않는다', out.data.people.length === 0, JSON.stringify(out.data.people))
  check('서버에 묘비가 남는다', row(store, 'person', 'p1')?.deleted === true)
}
{
  // 반대 방향: 다른 기기에서 지운 사람이 여기서도 사라진다
  const local = makeData({ people: [person('p1', '지현', 1000)] })
  const store: Store = {
    days: [],
    objects: [
      { kind: 'person', id: 'p1', data: { id: 'p1' }, deleted: true, updated_at: 7000, server_updated_at: '2026-09-03T00:00:00.000Z' },
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
    objects: [],
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
    objects: [],
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
  const store: Store = { days: [], objects: [], settings: null }
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
  const store: Store = { days: [], objects: [], settings: null }
  const deviceA = makeData({
    content: [item('b1', '사피엔스', 1000)],
    days: { '2026-09-01': contentDay('2026-09-01', 'b1', '역사는 소수의 이야기', 1000) },
  })
  await syncOnce(fakeClient(store), deviceA, markEverythingDirty(deviceA, emptySyncState()))
  check('작품이 서버로 올라간다', rowsOf(store, 'content').length === 1 && row(store, 'content', 'b1'))

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
  const store: Store = { days: [], objects: [], settings: null }
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
  check('서버에 지웠다고 남는다', row(store, 'content', 'b1')?.deleted === true)

  const afterB = await syncOnce(fakeClient(store), gotB.data, gotB.state)
  check('B에서도 사라진다', afterB.data.content.length === 0, JSON.stringify(afterB.data.content))
  check('묘비가 B에도 남는다', afterB.data.deletedContent.b1 === 5000)
}

// ── 12. 옛 기기가 새 제목을 옛 제목으로 되돌리지 못한다 ────────────────────
{
  const store: Store = { days: [], objects: [], settings: null }
  const fresh = makeData({ content: [item('b1', '고친 제목', 9000)] })
  await syncOnce(fakeClient(store), fresh, markEverythingDirty(fresh, emptySyncState()))

  const stale = makeData({ content: [item('b1', '옛 제목', 1000)] })
  const out = await syncOnce(fakeClient(store), stale, markEverythingDirty(stale, emptySyncState()))
  check('서버가 옛 제목으로 덮이지 않는다', row(store, 'content', 'b1')?.data.title === '고친 제목')
  check('옛 기기도 새 제목을 받아간다', out.data.content[0].title === '고친 제목')
}

// ── 13. objects 테이블이 아직 없어도 하루 기록은 멈추지 않는다 ────────────
//
// 앱을 먼저 받고 Supabase 스키마를 나중에 실행하는 시기가 반드시 생긴다.
// 그 사이에 하루 기록까지 못 올리면 안 된다.
{
  const store: Store = { days: [], objects: [], settings: null }
  const local = makeData({
    days: { '2026-09-01': day('2026-09-01', '스키마 없어도 올라가야 할 기록', 1000) },
    people: [person('p1', '지현', 1000)],
    content: [item('b1', '아직 못 올릴 책', 1000)],
  })
  const state = markEverythingDirty(local, emptySyncState())
  const out = await syncOnce(fakeClient(store, { noObjects: true }), local, state)

  check('하루 기록은 그대로 올라간다', store.days.length === 1)
  check('스키마가 없다고 알려준다', out.schemaOutdated === true)
  check('사람도 대기열에 남는다', out.state.dirtyPeople.p1 === true)
  check('로컬의 사람은 그대로 있다', out.data.people[0]?.name === '지현')
  check(
    '못 올린 작품은 대기열에 남는다',
    out.state.dirtyContent.b1 === true,
    JSON.stringify(out.state.dirtyContent),
  )
  check('로컬의 작품은 그대로 있다', out.data.content[0]?.title === '아직 못 올릴 책')

  // 스키마를 실행한 뒤 다시 돌리면 남아 있던 것이 그대로 올라간다
  const after = await syncOnce(fakeClient(store), out.data, out.state)
  check('밀린 사람도 함께 올라간다', Boolean(row(store, 'person', 'p1')))
  check(
    '스키마를 만든 뒤 밀린 작품이 올라간다',
    rowsOf(store, 'content').length === 1 && Boolean(row(store, 'content', 'b1')),
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
  const store: Store = { days: [], objects: [], settings: null }
  const out = await syncOnce(fakeClient(store), old, markEverythingDirty(old, emptySyncState()))
  check(
    '옮긴 작품이 서버로 올라간다',
    row(store, 'content', 'b1')?.data.title === '사피엔스',
    JSON.stringify(store.objects),
  )
  // 옛 묘비도 같이 올라가야 다른 기기가 지워진 책을 되살리지 않는다
  check('옮긴 묘비도 같이 올라간다', row(store, 'content', 'b9')?.deleted === true)
  check('올린 뒤 대기열이 비워진다', pendingCount(out.state) === 0, JSON.stringify(out.state))
}

// ── 15. 사람과 콘텐츠가 한 테이블에 있어도 서로 섞이지 않는다 ──────────────
//
// 종류별 테이블을 없애고 objects 하나로 합쳤으므로, id가 우연히 같아도
// 서로를 덮어쓰지 않아야 한다.
{
  const store: Store = { days: [], objects: [], settings: null }
  const local = makeData({
    people: [person('same', '지현', 1000)],
    content: [item('same', '사피엔스', 1000)],
  })
  const out = await syncOnce(fakeClient(store), local, markEverythingDirty(local, emptySyncState()))
  check('둘 다 서버에 올라간다', store.objects.length === 2, JSON.stringify(store.objects))
  check('사람 줄이 따로 있다', row(store, 'person', 'same')?.data.name === '지현')
  check('콘텐츠 줄이 따로 있다', row(store, 'content', 'same')?.data.title === '사피엔스')
  check('올린 뒤 대기열이 비워진다', pendingCount(out.state) === 0, JSON.stringify(out.state))

  // 새 기기가 받아가도 각자 제자리로 간다
  const fresh = await syncOnce(fakeClient(store), makeData({}), emptySyncState())
  check('받는 쪽에서도 사람은 사람으로', fresh.data.people[0]?.name === '지현')
  check('받는 쪽에서도 콘텐츠는 콘텐츠로', fresh.data.content[0]?.title === '사피엔스')
  check('사람 목록에 콘텐츠가 안 섞인다', fresh.data.people.length === 1)
  check('콘텐츠 목록에 사람이 안 섞인다', fresh.data.content.length === 1)
}

// ── 16. 컨디션이 에너지로 이름만 바뀌어도 숫자는 그대로 남는다 ─────────────
{
  const moved = migrate({
    days: {
      '2026-09-01': {
        date: '2026-09-01',
        condition: { score: 4, reason: '푹 잤다' },
        updatedAt: 1,
      },
      // 이미 새 이름으로 적힌 날은 그대로
      '2026-09-02': {
        date: '2026-09-02',
        condition: { energy: 2, anxiety: 5, reason: '마감' },
        updatedAt: 1,
      },
    },
  })

  const a = moved.days['2026-09-01'].condition
  check('옛 컨디션 점수가 에너지로 옮겨진다', a.energy === 4, JSON.stringify(a))
  check('이유는 그대로', a.reason === '푹 잤다')
  check('없던 불안 칸은 비어서 생긴다', a.anxiety === null, JSON.stringify(a))

  const b = moved.days['2026-09-02'].condition
  check('새 이름으로 적힌 날은 건드리지 않는다', b.energy === 2 && b.anxiety === 5, JSON.stringify(b))

  // 1~5 밖의 값은 안 적은 것으로 본다
  const junk = migrate({
    days: { '2026-09-03': { date: '2026-09-03', condition: { score: 9, anxiety: 'x' } } },
  }).days['2026-09-03'].condition
  check('척도를 벗어난 값은 비운다', junk.energy === null && junk.anxiety === null, JSON.stringify(junk))
}

// ── 17. 한 기기의 옛 목록이 다른 기기의 시간 유형을 지우지 않는다 ─────────
//
// 실제로 겪은 사고다. 설정을 통째로 덮어쓰던 시절, 휴대폰이 알림만 켜도
// 노트북의 시간 유형이 서버에서 통째로 사라졌고, 그러면 칠해둔 시간표가
// 유형 id를 못 찾아 전부 안 칠해진 것처럼 보였다.
{
  const cat = (id: string, label: string, colorIndex: number, updatedAt = 1000) => ({
    id,
    label,
    colorIndex,
    updatedAt,
  })
  const painted = (date: string, id: string, updatedAt: number) => {
    const d = emptyDay(date)
    return {
      ...d,
      timeSlots: d.timeSlots.map((_, i) => (i >= 18 && i < 30 ? id : null)),
      updatedAt,
    }
  }

  const store: Store = { days: [], objects: [], settings: null }
  const laptop = makeData({
    timeCategories: [cat('c1', '연구실', 0), cat('c2', '휴식', 1)],
    days: { '2026-09-01': painted('2026-09-01', 'c1', 1000) },
  })
  await syncOnce(fakeClient(store), laptop, markEverythingDirty(laptop, emptySyncState()))
  check('시간 유형이 서버로 올라간다', rowsOf(store, 'timeCategory').length === 2)

  // 휴대폰: 유형을 아직 못 받은 채로 설정만 최신이다(알림을 켰다든지)
  const phone = makeData({ timeCategories: [], settingsUpdatedAt: 5000 })
  const afterPhone = await syncOnce(fakeClient(store), phone, {
    ...emptySyncState(),
    settingsDirty: true,
  })
  check('휴대폰이 유형을 지우지 않는다', rowsOf(store, 'timeCategory').length === 2)
  check(
    '오히려 휴대폰이 유형을 받아간다',
    afterPhone.data.timeCategories.map((c) => c.label).sort().join(',') === '연구실,휴식',
    JSON.stringify(afterPhone.data.timeCategories),
  )

  const afterLaptop = await syncOnce(fakeClient(store), laptop, emptySyncState())
  check('노트북의 유형도 그대로', afterLaptop.data.timeCategories.length === 2)
  check(
    '칠해둔 시간표도 그대로',
    afterLaptop.data.days['2026-09-01'].timeSlots.filter(Boolean).length === 12,
  )
}

// ── 18. 지운 시간 유형은 다른 기기에서 되살아나지 않는다 ───────────────────
{
  const store: Store = { days: [], objects: [], settings: null }
  const a = makeData({ timeCategories: [{ id: 'c1', label: '연구실', colorIndex: 0, updatedAt: 1000 }] })
  await syncOnce(fakeClient(store), a, markEverythingDirty(a, emptySyncState()))
  const b = await syncOnce(fakeClient(store), makeData({}), emptySyncState())
  check('B가 유형을 받았다', b.data.timeCategories.length === 1)

  const deleted = makeData({ timeCategories: [], deletedTimeCategories: { c1: 5000 } })
  await syncOnce(fakeClient(store), deleted, {
    ...emptySyncState(),
    dirtyTimeCategories: { c1: true },
  })
  const afterB = await syncOnce(fakeClient(store), b.data, b.state)
  check('B에서도 사라진다', afterB.data.timeCategories.length === 0, JSON.stringify(afterB.data.timeCategories))
}

// ── 19. 유형을 잃어도 칠해둔 시간은 화면에서 사라지지 않는다 ───────────────
//
// 마지막 방어선. 어떤 이유로든 목록이 비면, 칸에 남은 id로 자리를 되살린다.
{
  const orphaned = migrate({
    timeCategories: [],
    days: {
      '2026-09-01': {
        date: '2026-09-01',
        timeSlots: Array.from({ length: 48 }, (_, i) => (i >= 10 && i < 20 ? 'gone-1' : null)),
        updatedAt: 1,
      },
    },
  })
  check('없어진 유형의 자리가 생긴다', orphaned.timeCategories.length === 1, JSON.stringify(orphaned.timeCategories))
  check('id는 칸이 가리키던 그대로', orphaned.timeCategories[0].id === 'gone-1')
  check('칸은 손대지 않는다', orphaned.days['2026-09-01'].timeSlots.filter(Boolean).length === 10)
  check(
    '되살린 자리는 언제나 진짜에게 진다',
    orphaned.timeCategories[0].updatedAt === 0,
    JSON.stringify(orphaned.timeCategories[0]),
  )

  // 진짜 유형이 서버에서 내려오면 이름과 색까지 제자리로
  const store: Store = { days: [], objects: [], settings: null }
  store.objects.push({
    kind: 'timeCategory',
    id: 'gone-1',
    data: { id: 'gone-1', label: '연구실', colorIndex: 3, updatedAt: 9000 },
    deleted: false,
    updated_at: 9000,
    server_updated_at: '2026-09-09T00:00:00.000Z',
  })
  const healed = await syncOnce(fakeClient(store), orphaned, emptySyncState())
  check('이름이 제자리로 돌아온다', healed.data.timeCategories[0].label === '연구실', JSON.stringify(healed.data.timeCategories))
  check('자리가 중복되지 않는다', healed.data.timeCategories.length === 1)

  // 시각이 없는 옛 유형도 되살린 자리를 이겨야 한다
  const legacyWins = await syncOnce(
    fakeClient({
      days: [],
      objects: [
        {
          kind: 'timeCategory',
          id: 'gone-1',
          data: { id: 'gone-1', label: '옛 유형', colorIndex: 2 },
          deleted: false,
          updated_at: 1,
          server_updated_at: '2026-09-09T00:00:00.000Z',
        },
      ],
      settings: null,
    }),
    migrate({
      timeCategories: [],
      days: {
        '2026-09-01': {
          date: '2026-09-01',
          timeSlots: Array.from({ length: 48 }, (_, i) => (i < 4 ? 'gone-1' : null)),
          updatedAt: 1,
        },
      },
    }),
    emptySyncState(),
  )
  check(
    '시각 없는 옛 유형도 빈 자리를 이긴다',
    legacyWins.data.timeCategories[0]?.label === '옛 유형',
    JSON.stringify(legacyWins.data.timeCategories),
  )

  // 일부러 지운 유형은 칸도 함께 비므로 되살아나지 않는다
  const cleanly = migrate({ timeCategories: [], days: { '2026-09-02': { date: '2026-09-02', updatedAt: 1 } } })
  check('빈 시간표는 아무것도 되살리지 않는다', cleanly.timeCategories.length === 0)
}

// ── 20. 운동 부위는 합집합으로 합쳐 어느 기기 것도 안 잃는다 ───────────────
{
  const store: Store = { days: [], objects: [], settings: null }
  const a = makeData({ customWorkoutParts: ['스트레칭'], settingsUpdatedAt: 1000 })
  await syncOnce(fakeClient(store), a, { ...emptySyncState(), settingsDirty: true })

  const b = makeData({ customWorkoutParts: ['필라테스'], settingsUpdatedAt: 5000 })
  await syncOnce(fakeClient(store), b, { ...emptySyncState(), settingsDirty: true })

  const back = await syncOnce(fakeClient(store), a, emptySyncState())
  check(
    '두 기기의 부위가 모두 남는다',
    back.data.customWorkoutParts.sort().join(',') === '스트레칭,필라테스',
    JSON.stringify(back.data.customWorkoutParts),
  )
}

// ── 21. 옛 아이디어가 반추의 문장이 되고, 중복되지 않는다 ──────────────────
{
  const raw = {
    days: {
      '2026-09-01': {
        date: '2026-09-01',
        ideas: [{ id: 'i1', text: '스친 생각', at: 1700 }],
        updatedAt: 1,
      },
    },
  }
  const once = migrate(raw)
  check('아이디어가 문장이 된다', once.thoughts.length === 1, JSON.stringify(once.thoughts))
  check('id를 물려받는다', once.thoughts[0].id === 'i1')
  check("단계는 '문장'", once.thoughts[0].level === 'sentence')
  check('적은 시각도 그대로', once.thoughts[0].createdAt === 1700)
  check('하루 기록의 아이디어는 그대로 둔다', once.days['2026-09-01'].ideas.length === 1)

  // 이미 옮긴 상태를 다시 지나가도 늘어나지 않는다
  const twice = migrate({ ...raw, thoughts: once.thoughts })
  check('두 번 지나가도 하나', twice.thoughts.length === 1, JSON.stringify(twice.thoughts))

  // 반추에서 지운 것은 되살아나지 않는다
  const deleted = migrate({ ...raw, thoughts: [], deletedThoughts: { i1: 9000 } })
  check('지운 문장은 되살아나지 않는다', deleted.thoughts.length === 0, JSON.stringify(deleted.thoughts))
}

// ── 22. 반추도 기기 사이를 오간다 ──────────────────────────────────────────
{
  const store: Store = { days: [], objects: [], settings: null }
  const now = 5000
  const a = makeData({
    thoughts: [
      { id: 's1', level: 'sentence', title: '', text: '스친 문장', parentId: 'p1', createdAt: now, updatedAt: now },
      { id: 'p1', level: 'paragraph', title: '기록에 대하여', text: '다듬은 단락', parentId: null, createdAt: now, updatedAt: now },
    ],
  })
  await syncOnce(fakeClient(store), a, markEverythingDirty(a, emptySyncState()))
  check('반추가 서버로 올라간다', rowsOf(store, 'thought').length === 2)

  const b = await syncOnce(fakeClient(store), makeData({}), emptySyncState())
  check('다른 기기가 받아온다', b.data.thoughts.length === 2, JSON.stringify(b.data.thoughts))
  check(
    '묶인 관계도 그대로 온다',
    b.data.thoughts.find((t) => t.id === 's1')?.parentId === 'p1',
    JSON.stringify(b.data.thoughts),
  )

  // 지운 생각은 되살아나지 않는다
  const gone = makeData({ thoughts: [], deletedThoughts: { p1: 9000 } })
  await syncOnce(fakeClient(store), gone, { ...emptySyncState(), dirtyThoughts: { p1: true } })
  const afterB = await syncOnce(fakeClient(store), b.data, b.state)
  check('B에서도 사라진다', !afterB.data.thoughts.some((t) => t.id === 'p1'), JSON.stringify(afterB.data.thoughts))
  check('묘비가 남는다', afterB.data.deletedThoughts.p1 === 9000)
}

// ── 23. 루틴은 날짜에 매달리지 않고 기기 사이를 오간다 ────────────────────
{
  const store: Store = { days: [], objects: [], settings: null }
  const a = makeData({
    routines: [{ id: 'r1', title: '아침 스트레칭', time: '07:30', createdAt: 1000, updatedAt: 1000 }],
    days: { '2026-09-01': { ...emptyDay('2026-09-01'), routineDone: { r1: true }, updatedAt: 1000 } },
  })
  await syncOnce(fakeClient(store), a, markEverythingDirty(a, emptySyncState()))
  check('루틴이 서버로 올라간다', rowsOf(store, 'routine').length === 1)
  check('루틴은 하루 기록이 아니다', row(store, 'routine', 'r1')?.data.title === '아침 스트레칭')

  const b = await syncOnce(fakeClient(store), makeData({}), emptySyncState())
  check('다른 기기가 루틴을 받아온다', b.data.routines[0]?.title === '아침 스트레칭', JSON.stringify(b.data.routines))
  check('체크는 그날 기록으로 온다', b.data.days['2026-09-01']?.routineDone.r1 === true)

  // 지운 루틴은 되살아나지 않는다
  const gone = makeData({ routines: [], deletedRoutines: { r1: 9000 } })
  await syncOnce(fakeClient(store), gone, { ...emptySyncState(), dirtyRoutines: { r1: true } })
  const afterB = await syncOnce(fakeClient(store), b.data, b.state)
  check('B에서도 사라진다', afterB.data.routines.length === 0, JSON.stringify(afterB.data.routines))
  check('묘비가 남는다', afterB.data.deletedRoutines.r1 === 9000)
}

// ── 24. 완수율은 그날 서 있던 루틴까지 센다 ────────────────────────────────
{
  const day = {
    ...emptyDay('2026-09-10'),
    todos: [{ id: 't1', text: '하나', done: true, createdAt: 1, order: 0 }],
    routineDone: { r1: true },
  }
  const routines = [
    // 그날 이전에 만든 둘 — 화면에 서 있었다
    { id: 'r1', title: '스트레칭', time: null, createdAt: Date.parse('2026-09-01'), updatedAt: 1 },
    { id: 'r2', title: '명상', time: null, createdAt: Date.parse('2026-09-01'), updatedAt: 1 },
    // 그날 이후에 만든 것 — 세면 안 된다
    { id: 'r3', title: '나중 루틴', time: null, createdAt: Date.parse('2026-09-20'), updatedAt: 1 },
  ]
  const rate = todoRate(day, routines)
  check('루틴을 포함해 센다 (2/3)', rate !== null && Math.round(rate) === 67, String(rate))
  check('루틴이 없으면 예전과 같다 (1/1)', todoRate(day) === 100, String(todoRate(day)))
  check(
    '나중에 만든 루틴은 지난 날에서 빠진다',
    todoRate(day, [routines[2]]) === 100,
    String(todoRate(day, [routines[2]])),
  )
}

// ── 25. 되살린 껍데기가 진짜 이름을 덮지 않는다 ────────────────────────────
//
// 실제로 이름이 두 번 날아간 경로다. 되살린 자리는 updatedAt 0으로 '항상
// 지도록' 만들어뒀는데, 올릴 때 0을 falsy로 보고 Date.now()를 붙여서
// 오히려 제일 새것이 되었다. 게다가 앱을 열 때마다 전부 다시 올렸다.
{
  const painted = (date: string, id: string) => {
    const d = emptyDay(date)
    return { ...d, timeSlots: d.timeSlots.map((_, i) => (i < 6 ? id : null)), updatedAt: 1000 }
  }
  const store: Store = { days: [], objects: [], settings: null }

  // 노트북: 이름이 '연구실'이다
  const laptop = migrate({
    timeCategories: [{ id: 'c1', label: '연구실', colorIndex: 0, updatedAt: 8000 }],
    days: { '2026-09-10': painted('2026-09-10', 'c1') },
  })
  await syncOnce(fakeClient(store), laptop, markEverythingDirty(laptop, emptySyncState()))
  check('노트북의 이름이 올라간다', row(store, 'timeCategory', 'c1')?.data.label === '연구실')
  check(
    '올린 시각을 만들어내지 않는다',
    row(store, 'timeCategory', 'c1')?.updated_at === 8000,
    String(row(store, 'timeCategory', 'c1')?.updated_at),
  )

  // 휴대폰: 목록이 비어 칸에서 자리만 되살린 상태
  const phone = migrate({ timeCategories: [], days: { '2026-09-10': painted('2026-09-10', 'c1') } })
  check('자리가 되살아난다', phone.timeCategories[0]?.recovered === true, JSON.stringify(phone.timeCategories))

  // 휴대폰이 처음 로그인해 전부 올릴 대상으로 잡아도
  const phoneState = markEverythingDirty(phone, emptySyncState())
  check('되살린 자리는 올릴 목록에 없다', phoneState.dirtyTimeCategories.c1 === undefined, JSON.stringify(phoneState.dirtyTimeCategories))

  const out = await syncOnce(fakeClient(store), phone, phoneState)
  check('서버의 이름이 그대로 남는다', row(store, 'timeCategory', 'c1')?.data.label === '연구실', JSON.stringify(store.objects))
  check('휴대폰이 진짜 이름을 받아간다', out.data.timeCategories[0]?.label === '연구실', JSON.stringify(out.data.timeCategories))
  check('받아온 뒤에는 껍데기가 아니다', out.data.timeCategories[0]?.recovered !== true)

  const back = await syncOnce(fakeClient(store), laptop, emptySyncState())
  check('노트북의 이름도 그대로', back.data.timeCategories[0]?.label === '연구실', JSON.stringify(back.data.timeCategories))
  check('칠해둔 시간도 그대로', back.data.days['2026-09-10'].timeSlots.filter(Boolean).length === 6)
}

// ── 26. 서버에 이미 올라간 껍데기는 진짜 이름이 밀어낸다 ───────────────────
//
// 고치기 전에 올라간 '이름 없는 유형'이 서버에 남아 있다. 시각만 최신이라
// 그냥 두면 또 덮는다. 이름을 가진 쪽이 진짜이므로 그 줄을 무시하고,
// 내 이름을 다시 올려 서버의 껍데기를 밀어낸다.
{
  const store: Store = { days: [], objects: [] , settings: null }
  store.objects.push({
    kind: 'timeCategory',
    id: 'c1',
    data: { id: 'c1', label: '이름 없는 유형 1', colorIndex: 0, updatedAt: 0 },
    deleted: false,
    updated_at: 9_999_999_999_999, // 고치기 전 Date.now()로 올라간 값
    server_updated_at: '2026-09-12T00:00:00.000Z',
  })

  const laptop = makeData({
    timeCategories: [{ id: 'c1', label: '연구실', colorIndex: 0, updatedAt: 8000 }],
  })
  const out = await syncOnce(fakeClient(store), laptop, emptySyncState())
  check('껍데기가 로컬 이름을 못 덮는다', out.data.timeCategories[0]?.label === '연구실', JSON.stringify(out.data.timeCategories))
  check('되찾을 이름을 다시 올릴 대상으로 잡는다', out.state.dirtyTimeCategories.c1 === true, JSON.stringify(out.state.dirtyTimeCategories))

  // 다시 돌리면 서버의 껍데기를 실제로 밀어낸다
  const after = await syncOnce(fakeClient(store), out.data, out.state)
  check('서버의 껍데기가 밀려난다', row(store, 'timeCategory', 'c1')?.data.label === '연구실', JSON.stringify(store.objects))
  check('대기열이 비워진다', Object.keys(after.state.dirtyTimeCategories).length === 0, JSON.stringify(after.state.dirtyTimeCategories))

  // 다른 기기도 그 이름을 받아간다
  const phone = await syncOnce(fakeClient(store), makeData({}), emptySyncState())
  check('다른 기기도 진짜 이름을 받는다', phone.data.timeCategories[0]?.label === '연구실', JSON.stringify(phone.data.timeCategories))
}

// ── 27. 무엇을 올려도 시각을 만들어내지 않는다 (종류 전부) ─────────────────
//
// 이름이 날아간 근본 원인은 올리는 쪽에서 시각을 만들어낸 것이었다.
// 한 종류만 고치면 다음에 다른 종류에서 같은 일이 난다.
{
  const store: Store = { days: [], objects: [], settings: null }
  const local = makeData({
    people: [{ id: 'p0', name: '영', relation: '', colorIndex: 0, createdAt: 0, updatedAt: 0 }],
    content: [{ id: 'x0', kind: 'book', title: '영', byline: '', url: '', colorIndex: 0, createdAt: 0, updatedAt: 0 }],
    thoughts: [{ id: 't0', level: 'sentence', title: '', text: '영', parentId: null, createdAt: 0, updatedAt: 0 }],
    routines: [{ id: 'r0', title: '영', time: null, createdAt: 0, updatedAt: 0 }],
    timeCategories: [{ id: 'k0', label: '영', colorIndex: 0, updatedAt: 0 }],
  })
  await syncOnce(fakeClient(store), local, markEverythingDirty(local, emptySyncState()))
  const invented = store.objects.filter((r) => r.updated_at !== 0)
  check(
    '0인 시각이 0으로 올라간다',
    invented.length === 0,
    JSON.stringify(invented.map((r) => [r.kind, r.updated_at])),
  )

  // 그러므로 서버에 이미 있는 값을 덮지 못한다
  const server: Store = { days: [], objects: [], settings: null }
  for (const kind of ['person', 'content', 'thought', 'routine']) {
    server.objects.push({
      kind,
      id: 'z1',
      data: { id: 'z1', name: '서버', title: '서버', text: '서버', label: '서버', updatedAt: 5000 },
      deleted: false,
      updated_at: 5000,
      server_updated_at: '2026-09-12T00:00:00.000Z',
    })
  }
  const stale = makeData({
    people: [{ id: 'z1', name: '옛것', relation: '', colorIndex: 0, createdAt: 0, updatedAt: 0 }],
    content: [{ id: 'z1', kind: 'book', title: '옛것', byline: '', url: '', colorIndex: 0, createdAt: 0, updatedAt: 0 }],
    thoughts: [{ id: 'z1', level: 'sentence', title: '', text: '옛것', parentId: null, createdAt: 0, updatedAt: 0 }],
    routines: [{ id: 'z1', title: '옛것', time: null, createdAt: 0, updatedAt: 0 }],
  })
  await syncOnce(fakeClient(server), stale, markEverythingDirty(stale, emptySyncState()))
  const overwritten = server.objects.filter((r) => r.data.updatedAt !== 5000)
  check(
    '시각이 0인 값은 서버의 값을 덮지 못한다',
    overwritten.length === 0,
    JSON.stringify(overwritten.map((r) => r.kind)),
  )
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
