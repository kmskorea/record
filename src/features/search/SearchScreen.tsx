import { useDeferredValue, useMemo, useState } from 'react'
import { Card, Empty, initial } from '../../components/ui'
import { CloseIcon, SearchIcon } from '../../components/icons'
import { useStore } from '../../lib/store'
import { searchAll, searchContent, searchPeople, splitHighlight } from '../../lib/search'
import { formatKorean } from '../../lib/date'
import { BUILTIN_CONTENT_KINDS, CONTENT_COLORS, PROFILE_COLORS } from '../../lib/types'

const KIND_COLOR: Record<string, string> = {
  할일: 'var(--accent)',
  '내면 상태': 'var(--blue)',
  운동: 'var(--green)',
  식사: 'var(--yellow)',
  관계: 'var(--purple)',
  콘텐츠: 'var(--brown)',
  일기: 'var(--ink-2)',
  '한 줄 평': 'var(--blue)',
  문장: '#93A8D4',
  단락: '#4F7CAC',
  글: '#1B3FD8',
}

export function SearchScreen({
  onOpenPerson,
  onOpenContent,
  onOpenDate,
}: {
  onOpenPerson: (id: string) => void
  onOpenContent: (id: string) => void
  onOpenDate: (date: string) => void
}) {
  const { data } = useStore()
  const [query, setQuery] = useState('')
  const deferred = useDeferredValue(query)

  const people = useMemo(() => searchPeople(data.people, deferred), [data.people, deferred])
  const content = useMemo(() => searchContent(data.content, deferred), [data.content, deferred])
  const kindById = useMemo(
    () =>
      Object.fromEntries(
        [...BUILTIN_CONTENT_KINDS, ...data.customContentKinds].map((k) => [k.id, k]),
      ),
    [data.customContentKinds],
  )
  const hits = useMemo(
    () => searchAll(data.days, data.people, data.content, data.thoughts, deferred),
    [data, deferred],
  )

  const trimmed = deferred.trim()

  return (
    <div className="screen">
      <header className="screen-head">
        <div>
          <h1 className="screen-title">
            검색
            <span className="dim">기록 다시 찾기</span>
          </h1>
        </div>
      </header>

      <div className="search-bar">
        <SearchIcon />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="단어, 사람 이름, 작품 제목으로 검색"
          aria-label="기록 검색"
          autoComplete="off"
        />
        {query && (
          <button
            type="button"
            className="icon-btn plain"
            onClick={() => setQuery('')}
            aria-label="지우기"
          >
            <CloseIcon />
          </button>
        )}
      </div>

      {/* 검색 중에 이름이 안 맞으면 굳이 빈 카드를 띄우지 않는다 */}
      {(people.length > 0 || !trimmed) && (
      <Card title="사람" mark="var(--purple)" note={`${people.length}명`}>
        {people.length === 0 ? (
          <Empty>오늘 탭의 관계 칸에서 사람을 등록해보세요.</Empty>
        ) : (
          <div className="person-scroll">
            {people.map((p) => (
              <button
                key={p.id}
                type="button"
                className="person-pill"
                onClick={() => onOpenPerson(p.id)}
              >
                <span
                  className="avatar"
                  style={{ background: PROFILE_COLORS[p.colorIndex % PROFILE_COLORS.length] }}
                >
                  {initial(p.name)}
                </span>
                <span className="name">{p.name}</span>
              </button>
            ))}
          </div>
        )}
      </Card>
      )}

      {/* 등록한 것이 없으면 빈 카드로 자리만 차지하지 않게 한다 */}
      {content.length > 0 && (
        <Card title="콘텐츠" mark="var(--brown)" note={`${content.length}개`}>
          <div className="person-scroll">
            {content.map((c) => {
              const kind = kindById[c.kind]
              return (
                <button
                  key={c.id}
                  type="button"
                  className="person-pill"
                  onClick={() => onOpenContent(c.id)}
                >
                  <span
                    className="avatar content"
                    style={{ background: PROFILE_COLORS[c.colorIndex % PROFILE_COLORS.length] }}
                  >
                    {initial(c.title)}
                    {kind && (
                      <i
                        className="kind-pip"
                        style={{
                          background: CONTENT_COLORS[kind.colorIndex % CONTENT_COLORS.length],
                        }}
                      />
                    )}
                  </span>
                  <span className="name">{c.title}</span>
                </button>
              )
            })}
          </div>
        </Card>
      )}

      {trimmed ? (
        <>
          <div className="section-label">기록 {hits.length}개</div>
          {hits.length === 0 ? (
            <Card>
              <Empty>‘{trimmed}’이(가) 들어간 기록이 없어요.</Empty>
            </Card>
          ) : (
            <div className="stack">
              {hits.map((hit) => {
                const person = hit.personId
                  ? data.people.find((p) => p.id === hit.personId)
                  : undefined
                const item = hit.itemId
                  ? data.content.find((c) => c.id === hit.itemId)
                  : undefined
                return (
                  <button
                    key={hit.id}
                    type="button"
                    className="result"
                    onClick={() => onOpenDate(hit.date)}
                  >
                    <span className="meta">
                      <span className="kind" style={{ color: KIND_COLOR[hit.kind] }}>
                        {hit.kind}
                      </span>
                      <span>{formatKorean(hit.date)}</span>
                      {person && <span>· {person.name}</span>}
                      {item && <span>· {item.title}</span>}
                    </span>
                    <span className="text">
                      {splitHighlight(hit.text, trimmed).map((part, i) =>
                        part.hit ? <mark key={i}>{part.text}</mark> : <span key={i}>{part.text}</span>,
                      )}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </>
      ) : (
        <Card title="이렇게 찾아보세요" mark="var(--ink-3)">
          <ul className="stack">
            {[
              '사람 이름을 검색하면 그 사람과 있었던 일이 모두 나와요.',
              '콘텐츠에서 작품을 누르면 거기에 적은 구절·소감이 한 번에 보여요.',
              '반추에 적어둔 문장·단락·글도 모두 찾아집니다.',
              '‘피곤’처럼 내면 상태에 적어둔 이유로도 검색됩니다.',
            ].map((tip) => (
              <li key={tip} style={{ fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.6 }}>
                · {tip}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
