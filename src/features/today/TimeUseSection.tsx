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

  // undefined = 아직 안 골랐음, null = 지우개, 문자열 = 그 유형
  // 셋을 구분하지 않으면 지우개를 고르는 순간 기본값이 되돌려버린다.
  const [activeId, setActiveId] = useState<string | null | undefined>(undefined)
  const [adding, setAdding] = useState(false)
  const [label, setLabel] = useState('')

  // 유형이 있으면 첫 번째를 기본으로 고른다. 앱을 다시 열 때마다 지우개로
  // 시작하면, 칠하려고 문지른 손이 오히려 기록을 지운다.
  useEffect(() => {
    if (categories.length === 0) return
    const gone = typeof activeId === 'string' && !categories.some((c) => c.id === activeId)
    if (activeId === undefined || gone) setActiveId(categories[0].id)
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
            title="이 상태로 문지르면 지워집니다"
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
            유형을 고르고 시계를 문지르면 칠해집니다. 지울 때는 지우개를 고르고 문지르세요.
            {' '}유형 이름을 두 번 누르면 그 유형이 삭제됩니다.
          </p>
          <DayClock
            slots={day.timeSlots}
            categories={categories}
            activeId={activeId ?? null}
            onPaint={paint}
          />
          <TimeShareBar slots={day.timeSlots} categories={categories} />
        </>
      )}
    </Card>
  )
}
