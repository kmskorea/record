import { useEffect, useState } from 'react'
import { Card, Empty } from '../../components/ui'
import { DayClock, TimeShareBar } from '../../components/DayClock'
import { TrashIcon } from '../../components/icons'
import { useStore } from '../../lib/store'
import { SLOT_COUNT, TIME_COLORS, type ISODate } from '../../lib/types'

/** 하루를 30분 단위로 어디에 썼는지 칠하고, 유형별 비중을 본다. */
export function TimeUseSection({ date }: { date: ISODate }) {
  const { getDay, updateDay, data, addTimeCategory, deleteTimeCategory } = useStore()
  const day = getDay(date)
  const categories = data.timeCategories

  const [activeId, setActiveId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [label, setLabel] = useState('')

  // 고른 유형이 지워졌으면 선택을 풀어준다.
  useEffect(() => {
    if (activeId && !categories.some((c) => c.id === activeId)) setActiveId(null)
  }, [categories, activeId])

  const paint = (indexes: number[], value: string | null) => {
    updateDay(date, (d) => {
      const slots = [...d.timeSlots]
      for (const i of indexes) {
        if (i >= 0 && i < SLOT_COUNT) slots[i] = value
      }
      return { timeSlots: slots }
    })
  }

  const submit = () => {
    const created = addTimeCategory(label)
    if (created) setActiveId(created.id)
    setLabel('')
    setAdding(false)
  }

  return (
    <Card title="하루 시간표" mark="var(--green)" note="30분 단위">
      {categories.length === 0 && !adding ? (
        <Empty>
          연구실, 친구 모임, 휴식처럼 하루를 나눌 유형을 먼저 만들어주세요.
        </Empty>
      ) : (
        <div className="paint-chips">
          {categories.map((c) => {
            const active = activeId === c.id
            return (
              <button
                key={c.id}
                type="button"
                className="paint-chip"
                aria-pressed={active}
                onClick={() => setActiveId(active ? null : c.id)}
                onDoubleClick={() => {
                  if (confirm(`'${c.label}' 유형과 이 유형으로 칠해둔 시간을 모두 지울까요?`)) {
                    deleteTimeCategory(c.id)
                  }
                }}
              >
                <i style={{ background: TIME_COLORS[c.colorIndex % TIME_COLORS.length] }} />
                {c.label}
              </button>
            )
          })}
          <button
            type="button"
            className="paint-chip"
            aria-pressed={activeId === null}
            onClick={() => setActiveId(null)}
            title="칠해진 칸을 다시 누르면 지워집니다"
          >
            <TrashIcon style={{ fontSize: 13 }} />
            지우개
          </button>
        </div>
      )}

      {adding ? (
        <div className="input-row" style={{ marginBottom: 12 }}>
          <input
            className="input"
            autoFocus
            placeholder="유형 이름 (예: 연구실)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
              if (e.key === 'Escape') {
                setLabel('')
                setAdding(false)
              }
            }}
          />
          <button type="button" className="btn primary sm" onClick={submit}>
            추가
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="btn ghost sm"
          style={{ marginBottom: 12 }}
          onClick={() => setAdding(true)}
        >
          + 유형 추가
        </button>
      )}

      {categories.length > 0 && (
        <>
          <p className="card-note" style={{ marginBottom: 4 }}>
            유형을 고르고 시계를 문지르면 칠해집니다. 같은 칸을 다시 누르면 지워져요.
            {' '}유형을 두 번 누르면 삭제됩니다.
          </p>
          <DayClock
            slots={day.timeSlots}
            categories={categories}
            activeId={activeId}
            onPaint={paint}
          />
          <TimeShareBar slots={day.timeSlots} categories={categories} />
        </>
      )}
    </Card>
  )
}
