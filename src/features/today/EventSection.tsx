import { useMemo, useState } from 'react'
import { Card, Checkbox, Empty, initial } from '../../components/ui'
import { PlusIcon, TrashIcon } from '../../components/icons'
import { useStore } from '../../lib/store'
import { newId } from '../../lib/storage'
import {
  EVENT_KIND_COLOR,
  EVENT_KIND_LABEL,
  PERSON_COLORS,
  type EventKind,
  type ISODate,
} from '../../lib/types'

const KINDS: EventKind[] = ['appointment', 'deadline', 'task']

/** 그 날짜에 걸어두는 약속·마감·할일. 지난 날에도 앞으로의 날에도 붙는다. */
export function EventSection({ date }: { date: ISODate }) {
  const { getDay, updateDay, data } = useStore()
  const day = getDay(date)
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<EventKind>('appointment')
  const [time, setTime] = useState('')
  const [people, setPeople] = useState<string[]>([])

  const personById = useMemo(
    () => Object.fromEntries(data.people.map((p) => [p.id, p])),
    [data.people],
  )

  const reset = () => {
    setTitle('')
    setTime('')
    setPeople([])
    setOpen(false)
  }

  const add = () => {
    const clean = title.trim()
    if (!clean) return
    updateDay(date, (d) => ({
      events: [
        ...d.events,
        {
          id: newId(),
          title: clean,
          kind,
          time: time || null,
          personIds: kind === 'appointment' ? people : [],
          done: false,
          createdAt: Date.now(),
        },
      ],
    }))
    reset()
  }

  // 시간이 정해진 일정을 앞에, 그 안에서는 이른 시각부터
  const sorted = [...day.events].sort((a, b) => {
    if (a.time && b.time) return a.time.localeCompare(b.time)
    if (a.time) return -1
    if (b.time) return 1
    return a.createdAt - b.createdAt
  })

  return (
    <Card
      title="일정"
      mark="var(--purple)"
      action={
        <button
          type="button"
          className="icon-btn"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? '일정 추가 닫기' : '일정 추가'}
        >
          <PlusIcon style={{ transform: open ? 'rotate(45deg)' : 'none', transition: 'transform .15s' }} />
        </button>
      }
    >
      {open && (
        <div className="stack" style={{ marginBottom: sorted.length ? 14 : 0 }}>
          <div className="seg">
            {KINDS.map((k) => (
              <button
                key={k}
                type="button"
                className="seg-btn"
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
              >
                {EVENT_KIND_LABEL[k]}
              </button>
            ))}
          </div>

          <input
            className="input"
            autoFocus
            placeholder={
              kind === 'appointment' ? '누구와 무엇을' : kind === 'deadline' ? '무엇의 마감' : '할 일'
            }
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') add()
            }}
          />

          <label className="field">
            <span className="field-label">시각 (선택)</span>
            <input
              type="time"
              className="input"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </label>

          {kind === 'appointment' && data.people.length > 0 && (
            <div className="field">
              <span className="field-label">누구와</span>
              <div className="person-scroll">
                {data.people.map((p) => {
                  const active = people.includes(p.id)
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className="person-pill"
                      aria-pressed={active}
                      onClick={() =>
                        setPeople((prev) =>
                          prev.includes(p.id) ? prev.filter((x) => x !== p.id) : [...prev, p.id],
                        )
                      }
                    >
                      <span
                        className="avatar"
                        data-selected={active}
                        style={{ background: PERSON_COLORS[p.colorIndex % PERSON_COLORS.length] }}
                      >
                        {initial(p.name)}
                      </span>
                      <span className="name">{p.name}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn primary" style={{ flex: 1 }} onClick={add} disabled={!title.trim()}>
              추가
            </button>
            <button type="button" className="btn ghost" onClick={reset}>
              취소
            </button>
          </div>
        </div>
      )}

      {sorted.length === 0 ? (
        !open && <Empty>약속, 마감, 할 일을 미리 걸어두세요.</Empty>
      ) : (
        <div className="stack">
          {sorted.map((ev) => (
            <div key={ev.id} className="event-item" data-done={ev.done}>
              <Checkbox
                checked={ev.done}
                label={ev.title}
                onChange={(v) =>
                  updateDay(date, (d) => ({
                    events: d.events.map((x) => (x.id === ev.id ? { ...x, done: v } : x)),
                  }))
                }
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="event-title">{ev.title}</div>
                <div className="event-meta">
                  <span className="event-kind" style={{ background: EVENT_KIND_COLOR[ev.kind] }}>
                    {EVENT_KIND_LABEL[ev.kind]}
                  </span>
                  {ev.time && <span>{ev.time}</span>}
                  {ev.personIds.length > 0 && (
                    <span>
                      {ev.personIds
                        .map((id) => personById[id]?.name)
                        .filter(Boolean)
                        .join(', ')}
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                className="icon-btn plain"
                aria-label="일정 삭제"
                onClick={() =>
                  updateDay(date, (d) => ({ events: d.events.filter((x) => x.id !== ev.id) }))
                }
              >
                <TrashIcon />
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
