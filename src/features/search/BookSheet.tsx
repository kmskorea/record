import { useMemo, useState } from 'react'
import { Empty, Sheet, initial } from '../../components/ui'
import { TrashIcon } from '../../components/icons'
import { useStore } from '../../lib/store'
import { bookDays, bookPages, bookTimeline } from '../../lib/search'
import { formatKorean, formatRelative } from '../../lib/date'
import { PROFILE_COLORS } from '../../lib/types'

export function BookSheet({
  bookId,
  onClose,
  onOpenDate,
}: {
  bookId: string
  onClose: () => void
  onOpenDate?: (date: string) => void
}) {
  const { data, updateBook, deleteBook } = useStore()
  const book = data.books.find((b) => b.id === bookId)
  const [editing, setEditing] = useState(false)

  const timeline = useMemo(() => bookTimeline(data.days, bookId), [data.days, bookId])

  if (!book) {
    return (
      <Sheet title="책" onClose={onClose}>
        <Empty>삭제된 책입니다.</Empty>
      </Sheet>
    )
  }

  const color = PROFILE_COLORS[book.colorIndex % PROFILE_COLORS.length]
  const pages = bookPages(timeline)
  const days = bookDays(timeline)
  const lastRead = timeline[0]?.date

  return (
    <Sheet title={book.title} subtitle={book.author || '지은이 미입력'} onClose={onClose}>
      <section className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span className="avatar lg book" style={{ background: color }}>
            {initial(book.title)}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            {editing ? (
              <div className="stack">
                <input
                  className="input"
                  value={book.title}
                  onChange={(e) => updateBook(book.id, { title: e.target.value })}
                  placeholder="책 이름"
                />
                <input
                  className="input"
                  value={book.author}
                  onChange={(e) => updateBook(book.id, { author: e.target.value })}
                  placeholder="지은이"
                />
              </div>
            ) : (
              <>
                <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-0.03em' }}>
                  {book.title}
                </div>
                <div style={{ fontSize: 13, color: 'var(--ink-3)', fontWeight: 600 }}>
                  {book.author || '지은이 미입력'}
                </div>
              </>
            )}
          </div>
          <button type="button" className="btn sm ghost" onClick={() => setEditing((v) => !v)}>
            {editing ? '완료' : '수정'}
          </button>
        </div>

        <div className="tiles three" style={{ marginTop: 16 }}>
          <div className="tile">
            <span className="value">
              {pages}
              <span className="unit">쪽</span>
            </span>
            <span className="label">누적 쪽수</span>
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
              {lastRead ? formatRelative(lastRead) : '—'}
            </span>
            <span className="label">마지막 기록</span>
          </div>
        </div>
      </section>

      <section className="card" style={{ paddingBottom: 14 }}>
        <header className="card-head">
          <h2 className="card-title">
            <i className="mark" style={{ background: color }} />이 책에 적은 것
          </h2>
          <span className="card-note">{timeline.length}개</span>
        </header>

        {timeline.length === 0 ? (
          <Empty>아직 이 책에 대해 적은 내용이 없어요.</Empty>
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
                </button>
                {entry.quote && (
                  <p className="reading-quote" style={{ width: '100%' }}>
                    {entry.quote}
                  </p>
                )}
                {entry.thought && <p style={{ width: '100%' }}>{entry.thought}</p>}
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
              `‘${book.title}’과 이 책에 대해 적은 기록 ${timeline.length}개가 모두 지워집니다. 계속할까요?`,
            )
          ) {
            deleteBook(book.id)
            onClose()
          }
        }}
      >
        <TrashIcon className="btn-icon" /> 이 책 삭제
      </button>
    </Sheet>
  )
}
