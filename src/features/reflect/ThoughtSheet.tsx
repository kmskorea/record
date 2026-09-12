import { useMemo } from 'react'
import { Empty, Sheet } from '../../components/ui'
import { TrashIcon } from '../../components/icons'
import { useStore } from '../../lib/store'
import { formatRelative, toKey } from '../../lib/date'
import { THOUGHT_LEVEL } from '../../lib/types'

/**
 * 단락·글 하나를 펼친다. 위에는 다듬은 글이, 아래에는 재료가 된 것들이 있다.
 * 재료를 지우지 않고 같이 보여주는 것이 반추의 핵심이다 — 어디서 온 생각인지
 * 되짚을 수 있어야 더 깊어진다.
 */
export function ThoughtSheet({
  id,
  onClose,
  onOpen,
}: {
  id: string
  onClose: () => void
  onOpen: (id: string) => void
}) {
  const { data, updateThought, deleteThought, setThoughtParent } = useStore()
  const thought = data.thoughts.find((t) => t.id === id)

  const children = useMemo(
    () => data.thoughts.filter((t) => t.parentId === id).sort((a, b) => a.createdAt - b.createdAt),
    [data.thoughts, id],
  )
  const parent = useMemo(
    () => (thought?.parentId ? data.thoughts.find((t) => t.id === thought.parentId) : undefined),
    [data.thoughts, thought?.parentId],
  )

  if (!thought) {
    return (
      <Sheet title="반추" onClose={onClose}>
        <Empty>지워진 생각입니다.</Empty>
      </Sheet>
    )
  }

  const level = THOUGHT_LEVEL[thought.level]
  const childLabel = thought.level === 'essay' ? '단락' : '문장'

  return (
    <Sheet
      title={thought.title || level.label}
      subtitle={`${level.label} · ${formatRelative(toKey(new Date(thought.createdAt)))}`}
      onClose={onClose}
    >
      <section className="card">
        <label className="field">
          <span className="field-label">{level.label} 이름</span>
          <input
            className="input"
            placeholder="무엇에 대한 생각인가요?"
            value={thought.title}
            onChange={(e) => updateThought(thought.id, { title: e.target.value })}
          />
        </label>

        <label className="field" style={{ marginTop: 14 }}>
          <span className="field-label">{level.bodyLabel}</span>
          <textarea
            className="textarea"
            style={{ minHeight: thought.level === 'essay' ? 260 : 160 }}
            placeholder={level.bodyPlaceholder}
            value={thought.text}
            onChange={(e) => updateThought(thought.id, { text: e.target.value })}
          />
        </label>

        {parent && (
          <p className="card-note" style={{ marginTop: 12 }}>
            <strong style={{ color: 'var(--ink)' }}>{parent.title || '이름 없음'}</strong>{' '}
            {THOUGHT_LEVEL[parent.level].label}에 담겨 있습니다{' '}
            <button
              type="button"
              className="link-btn"
              onClick={() => setThoughtParent(thought.id, null)}
            >
              빼내기
            </button>
          </p>
        )}
      </section>

      <section className="card" style={{ paddingBottom: 14 }}>
        <header className="card-head">
          <h2 className="card-title">
            <i className="mark" style={{ background: level.color }} />
            품고 있는 {childLabel}
          </h2>
          <span className="card-note">{children.length}개</span>
        </header>

        {children.length === 0 ? (
          <Empty>반추 목록에서 {childLabel}을 골라 여기에 넣을 수 있어요.</Empty>
        ) : (
          <div className="stack">
            {children.map((child) => (
              <div key={child.id} className="note-item" style={{ alignItems: 'flex-start' }}>
                <i
                  className="thought-dot"
                  style={{ background: THOUGHT_LEVEL[child.level].color }}
                />
                <div className="body">
                  {child.title && <div style={{ fontSize: 13, fontWeight: 700 }}>{child.title}</div>}
                  <p>{child.text || '(비어 있음)'}</p>
                  <div className="time">{formatRelative(toKey(new Date(child.createdAt)))}</div>
                </div>
                <span style={{ display: 'flex', flexShrink: 0 }}>
                  {child.level !== 'sentence' && (
                    <button
                      type="button"
                      className="btn sm ghost"
                      onClick={() => onOpen(child.id)}
                    >
                      열기
                    </button>
                  )}
                  <button
                    type="button"
                    className="icon-btn plain"
                    aria-label={`${child.text.slice(0, 10)} 빼내기`}
                    title="빼내기"
                    onClick={() => setThoughtParent(child.id, null)}
                  >
                    ↥
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <button
        type="button"
        className="btn danger block"
        onClick={() => {
          const warn =
            children.length > 0
              ? `\n\n품고 있던 ${childLabel} ${children.length}개는 지워지지 않고 반추 목록으로 돌아갑니다.`
              : ''
          if (confirm(`이 ${level.label}을 지울까요?${warn}`)) {
            deleteThought(thought.id)
            onClose()
          }
        }}
      >
        <TrashIcon className="btn-icon" /> 이 {level.label} 삭제
      </button>
    </Sheet>
  )
}
