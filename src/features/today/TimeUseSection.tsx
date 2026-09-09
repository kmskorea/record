import { useEffect, useState } from 'react'
import { Card, Empty } from '../../components/ui'
import { DayClock, TimeShareBar } from '../../components/DayClock'
import { TrashIcon } from '../../components/icons'
import { useStore } from '../../lib/store'
import { SLOT_COUNT, TIME_COLORS, type ISODate } from '../../lib/types'

/** 하루를 30분 단위로 어디에 썼는지 칠하고, 유형별 비중을 본다. */
export function TimeUseSection({ date }: { date: ISODate }) {
  const { getDay, updateDay, data, addTimeCategory, renameTimeCategory, deleteTimeCategory } =
    useStore()
  const day = getDay(date)
  const categories = data.timeCategories

  // undefined = 아직 안 골랐음, null = 지우개, 문자열 = 그 유형
  // 셋을 구분하지 않으면 지우개를 고르는 순간 기본값이 되돌려버린다.
  const [activeId, setActiveId] = useState<string | null | undefined>(undefined)
  const [adding, setAdding] = useState(false)
  const [label, setLabel] = useState('')
  // 유형을 지우면 그 유형으로 칠해둔 시간이 모든 날에서 사라진다. 손가락이
  // 두 번 닿았다고 일어나서는 안 되는 일이라, 따로 켜야 지울 수 있게 한다.
  const [managing, setManaging] = useState(false)

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
              <span className="paint-chip-wrap" key={c.id}>
                <button
                  type="button"
                  className="paint-chip"
                  aria-pressed={active}
                  onClick={() => {
                    // 정리 중에는 고르는 대신 이름을 고친다. 칸에서 되살린
                    // '이름 없는 유형'에 이름을 되찾아 줄 자리가 필요하다.
                    if (!managing) return setActiveId(active ? null : c.id)
                    const next = prompt('유형 이름', c.label)
                    if (next !== null) renameTimeCategory(c.id, next)
                  }}
                >
                  <i style={{ background: TIME_COLORS[c.colorIndex % TIME_COLORS.length] }} />
                  {c.label}
                </button>
                {managing && (
                  <button
                    type="button"
                    className="paint-chip-x"
                    aria-label={`${c.label} 유형 삭제`}
                    onClick={() => {
                      const painted = Object.values(data.days).reduce(
                        (n, d) => n + (d.timeSlots.some((v) => v === c.id) ? 1 : 0),
                        0,
                      )
                      const warn = painted > 0 ? `\n\n${painted}일치 시간표에서 지워집니다.` : ''
                      if (confirm(`'${c.label}' 유형을 지울까요?${warn}`)) {
                        deleteTimeCategory(c.id)
                      }
                    }}
                  >
                    ×
                  </button>
                )}
              </span>
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
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button type="button" className="btn ghost sm" onClick={() => setAdding(true)}>
            + 유형 추가
          </button>
          {categories.length > 0 && (
            <button
              type="button"
              className="btn ghost sm"
              aria-pressed={managing}
              onClick={() => setManaging((v) => !v)}
            >
              {managing ? '완료' : '유형 정리'}
            </button>
          )}
        </div>
      )}

      {categories.length > 0 && (
        <>
          <p className="card-note" style={{ marginBottom: 4 }}>
            {managing
              ? '유형을 눌러 이름을 고치고, ×로 지웁니다. 지우면 그 유형으로 칠해둔 시간도 함께 사라집니다.'
              : '유형을 고르고 시계를 문지르면 칠해집니다. 지울 때는 지우개를 고르고 문지르세요.'}
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
