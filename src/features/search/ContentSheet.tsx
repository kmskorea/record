import { useMemo, useState } from 'react'
import { Empty, Sheet, initial } from '../../components/ui'
import { TrashIcon } from '../../components/icons'
import { useStore } from '../../lib/store'
import { contentDays, contentPages, contentRating, contentTimeline } from '../../lib/search'
import { formatKorean, formatRelative } from '../../lib/date'
import { BUILTIN_CONTENT_KINDS, CONTENT_COLORS, PROFILE_COLORS } from '../../lib/types'

export function ContentSheet({
  itemId,
  onClose,
  onOpenDate,
}: {
  itemId: string
  onClose: () => void
  onOpenDate?: (date: string) => void
}) {
  const { data, updateContent, deleteContent } = useStore()
  const item = data.content.find((c) => c.id === itemId)
  const [editing, setEditing] = useState(false)

  const timeline = useMemo(() => contentTimeline(data.days, itemId), [data.days, itemId])
  const kind = useMemo(
    () =>
      [...BUILTIN_CONTENT_KINDS, ...data.customContentKinds].find((k) => k.id === item?.kind),
    [data.customContentKinds, item?.kind],
  )

  if (!item) {
    return (
      <Sheet title="콘텐츠" onClose={onClose}>
        <Empty>삭제된 항목입니다.</Empty>
      </Sheet>
    )
  }

  const color = PROFILE_COLORS[item.colorIndex % PROFILE_COLORS.length]
  const pages = contentPages(timeline)
  const rating = contentRating(timeline)
  const days = contentDays(timeline)
  const last = timeline[0]?.date
  const bylineLabel = kind?.bylineLabel ?? '만든 사람'
  // 유형마다 앞에 세울 숫자가 다르다. 책은 쪽수, 영화는 별점.
  const lead =
    kind?.fields.includes('pages') && pages > 0
      ? { value: `${pages}`, unit: '쪽', label: '누적 쪽수' }
      : rating !== null
        ? { value: rating.toFixed(1), unit: '점', label: '별점' }
        : { value: `${timeline.length}`, unit: '개', label: '남긴 기록' }

  return (
    <Sheet
      title={item.title}
      subtitle={item.byline || kind?.label || '콘텐츠'}
      onClose={onClose}
    >
      <section className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span className="avatar lg content" style={{ background: color }}>
            {initial(item.title)}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            {editing ? (
              <div className="stack">
                <input
                  className="input"
                  value={item.title}
                  onChange={(e) => updateContent(item.id, { title: e.target.value })}
                  placeholder="제목"
                />
                <input
                  className="input"
                  value={item.byline}
                  onChange={(e) => updateContent(item.id, { byline: e.target.value })}
                  placeholder={bylineLabel}
                />
                <input
                  className="input"
                  type="url"
                  inputMode="url"
                  value={item.url}
                  onChange={(e) => updateContent(item.id, { url: e.target.value })}
                  placeholder="링크 (선택)"
                  aria-label="링크"
                />
              </div>
            ) : (
              <>
                <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-0.03em' }}>
                  {item.title}
                </div>
                <div style={{ fontSize: 13, color: 'var(--ink-3)', fontWeight: 600 }}>
                  {kind && (
                    <span
                      className="kind-tag"
                      style={{
                        background: CONTENT_COLORS[kind.colorIndex % CONTENT_COLORS.length],
                        marginLeft: 0,
                        marginRight: 6,
                      }}
                    >
                      {kind.label}
                    </span>
                  )}
                  {item.byline || `${bylineLabel} 미입력`}
                </div>
              </>
            )}
          </div>
          <button type="button" className="btn sm ghost" onClick={() => setEditing((v) => !v)}>
            {editing ? '완료' : '수정'}
          </button>
        </div>

        {item.url && !editing && (
          <a
            className="btn ghost block"
            style={{ marginTop: 12 }}
            href={item.url}
            target="_blank"
            rel="noreferrer"
          >
            링크 열기
          </a>
        )}

        <div className="tiles three" style={{ marginTop: 16 }}>
          <div className="tile">
            <span className="value">
              {lead.value}
              <span className="unit">{lead.unit}</span>
            </span>
            <span className="label">{lead.label}</span>
          </div>
          <div className="tile">
            <span className="value">
              {days}
              <span className="unit">일</span>
            </span>
            <span className="label">펼친 날</span>
          </div>
          <div className="tile">
            <span className="value" style={{ fontSize: 17 }}>
              {last ? formatRelative(last) : '—'}
            </span>
            <span className="label">마지막 기록</span>
          </div>
        </div>
      </section>

      <section className="card" style={{ paddingBottom: 14 }}>
        <header className="card-head">
          <h2 className="card-title">
            <i className="mark" style={{ background: color }} />
            여기에 적은 것
          </h2>
          <span className="card-note">{timeline.length}개</span>
        </header>

        {timeline.length === 0 ? (
          <Empty>아직 이것에 대해 적은 내용이 없어요.</Empty>
        ) : (
          <div className="stack">
            {timeline.map((entry) => (
              <div key={entry.id} className="note-item" style={{ flexDirection: 'column', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => onOpenDate?.(entry.date)}
                  style={{
                    fontSize: 11.5,
                    fontWeight: 750,
                    color: 'var(--ink-3)',
                    textAlign: 'left',
                    cursor: onOpenDate ? 'pointer' : 'default',
                  }}
                >
                  {formatKorean(entry.date)}
                  {entry.pages !== null && ` · ${entry.pages}쪽`}
                  {entry.rating !== null && ` · ★ ${entry.rating.toFixed(1)}`}
                </button>
                {entry.quote && (
                  <p className="reading-quote" style={{ width: '100%' }}>
                    {entry.quote}
                  </p>
                )}
                {entry.note && <p style={{ width: '100%' }}>{entry.note}</p>}
              </div>
            ))}
          </div>
        )}
      </section>

      <button
        type="button"
        className="btn danger block"
        onClick={() => {
          if (
            confirm(
              `‘${item.title}’과 여기에 적은 기록 ${timeline.length}개가 모두 지워집니다. 계속할까요?`,
            )
          ) {
            deleteContent(item.id)
            onClose()
          }
        }}
      >
        <TrashIcon className="btn-icon" /> 이 항목 삭제
      </button>
    </Sheet>
  )
}
