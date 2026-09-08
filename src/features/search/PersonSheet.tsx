import { useMemo, useState } from 'react'
import { Empty, Sheet, initial } from '../../components/ui'
import { TrashIcon } from '../../components/icons'
import { useStore } from '../../lib/store'
import { personTimeline } from '../../lib/search'
import { formatKorean, formatRelative } from '../../lib/date'
import { PERSON_COLORS } from '../../lib/types'

export function PersonSheet({
  personId,
  onClose,
  onOpenDate,
}: {
  personId: string
  onClose: () => void
  onOpenDate?: (date: string) => void
}) {
  const { data, updatePerson, deletePerson } = useStore()
  const person = data.people.find((p) => p.id === personId)
  const [editing, setEditing] = useState(false)

  const timeline = useMemo(() => personTimeline(data.days, personId), [data.days, personId])

  if (!person) {
    return (
      <Sheet title="사람" onClose={onClose}>
        <Empty>삭제된 사람입니다.</Empty>
      </Sheet>
    )
  }

  const color = PERSON_COLORS[person.colorIndex % PERSON_COLORS.length]
  const lastMet = timeline[0]?.date

  return (
    <Sheet title={person.name} subtitle={person.relation || '관계 미입력'} onClose={onClose}>
      <section className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span className="avatar lg" style={{ background: color }}>
            {initial(person.name)}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            {editing ? (
              <div className="stack">
                <input
                  className="input"
                  value={person.name}
                  onChange={(e) => updatePerson(person.id, { name: e.target.value })}
                  placeholder="이름"
                />
                <input
                  className="input"
                  value={person.relation}
                  onChange={(e) => updatePerson(person.id, { relation: e.target.value })}
                  placeholder="어떤 사이인가요?"
                />
              </div>
            ) : (
              <>
                <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-0.03em' }}>
                  {person.name}
                </div>
                <div style={{ fontSize: 13, color: 'var(--ink-3)', fontWeight: 600 }}>
                  {person.relation || '관계 미입력'}
                </div>
              </>
            )}
          </div>
          <button
            type="button"
            className="btn sm ghost"
            onClick={() => setEditing((v) => !v)}
          >
            {editing ? '완료' : '수정'}
          </button>
        </div>

        <div className="tiles" style={{ marginTop: 16 }}>
          <div className="tile">
            <span className="value">
              {timeline.length}
              <span className="unit">번</span>
            </span>
            <span className="label">함께한 기록</span>
          </div>
          <div className="tile">
            <span className="value" style={{ fontSize: 19 }}>
              {lastMet ? formatRelative(lastMet) : '—'}
            </span>
            <span className="label">마지막 기록</span>
          </div>
        </div>
      </section>

      <section className="card" style={{ paddingBottom: 14 }}>
        <header className="card-head">
          <h2 className="card-title">
            <i className="mark" style={{ background: color }} />
            함께한 기록
          </h2>
          <span className="card-note">{timeline.length}개</span>
        </header>

        {timeline.length === 0 ? (
          <Empty>아직 이 사람에 대해 적은 내용이 없어요.</Empty>
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
                </button>
                <p style={{ width: '100%' }}>{entry.note}</p>
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
              `${person.name} 님과 이 사람에 대해 적은 기록 ${timeline.length}개가 모두 지워집니다. 계속할까요?`,
            )
          ) {
            deletePerson(person.id)
            onClose()
          }
        }}
      >
        <TrashIcon className="btn-icon" /> 이 사람 삭제
      </button>
    </Sheet>
  )
}
