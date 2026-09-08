import { useMemo, useState } from 'react'
import { Card, Checkbox, Chip, Empty, ScaleInput, Segmented, initial } from '../../components/ui'
import { StarRating } from '../../components/StarRating'
import { BulbIcon, PlusIcon, TrashIcon } from '../../components/icons'
import { useStore } from '../../lib/store'
import { newId } from '../../lib/storage'
import { formatTime } from '../../lib/date'
import {
  MEAL_LABELS,
  PERSON_COLORS,
  WORKOUT_PARTS,
  type ISODate,
  type Intensity,
  type Level,
} from '../../lib/types'

interface SectionProps {
  date: ISODate
}

// ── 할일 ─────────────────────────────────────────────────────────────────────

export function TodoSection({ date }: SectionProps) {
  const { getDay, updateDay } = useStore()
  const day = getDay(date)
  const [draft, setDraft] = useState('')

  const add = () => {
    const text = draft.trim()
    if (!text) return
    updateDay(date, (d) => ({
      todos: [...d.todos, { id: newId(), text, done: false, createdAt: Date.now() }],
    }))
    setDraft('')
  }

  const done = day.todos.filter((t) => t.done).length

  return (
    <Card
      title="오늘 할 일"
      mark="var(--accent)"
      action={
        day.todos.length > 0 ? (
          <span className="todo-progress">
            <span className="big">{done}</span>
            <span className="small">/ {day.todos.length}</span>
          </span>
        ) : null
      }
    >
      {day.todos.length === 0 ? (
        <Empty>오늘 할 일을 하나씩 적어보세요.</Empty>
      ) : (
        <ul>
          {day.todos.map((todo) => (
            <li key={todo.id} className="todo" data-done={todo.done}>
              <Checkbox
                checked={todo.done}
                label={todo.text}
                onChange={(v) =>
                  updateDay(date, (d) => ({
                    todos: d.todos.map((t) => (t.id === todo.id ? { ...t, done: v } : t)),
                  }))
                }
              />
              <span className="todo-text">{todo.text}</span>
              <button
                type="button"
                className="icon-btn plain"
                aria-label="삭제"
                onClick={() =>
                  updateDay(date, (d) => ({ todos: d.todos.filter((t) => t.id !== todo.id) }))
                }
              >
                <TrashIcon />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="input-row" style={{ marginTop: 12 }}>
        <input
          className="input"
          placeholder="할 일 추가"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add()
          }}
        />
        <button type="button" className="icon-btn" onClick={add} aria-label="할 일 추가">
          <PlusIcon />
        </button>
      </div>
    </Card>
  )
}

// ── 수면 ─────────────────────────────────────────────────────────────────────

/** 취침·기상 시각으로 잔 시간을 계산한다. 자정을 넘긴 경우도 처리. */
function hoursBetween(bed: string, wake: string): number {
  const [bh, bm] = bed.split(':').map(Number)
  const [wh, wm] = wake.split(':').map(Number)
  const mins = wh * 60 + wm - (bh * 60 + bm)
  // 두 시각이 정확히 같으면(모바일에서 시간 입력칸을 탭만 해도 현재 시각이
  // 찍히는 경우가 흔하다) '24시간 잤다'로 계산하지 않는다.
  if (mins === 0) return 0
  const wrapped = mins < 0 ? mins + 24 * 60 : mins
  return Math.round((wrapped / 60) * 10) / 10
}

export function SleepSection({ date }: SectionProps) {
  const { getDay, updateDay } = useStore()
  const { sleep } = getDay(date)

  const setTimes = (bedTime: string | null, wakeTime: string | null) => {
    updateDay(date, (d) => ({
      sleep: {
        bedTime,
        wakeTime,
        // 취침·기상이 같은 시각으로 찍히면(주로 모바일 시간 선택기가 탭만
        // 해도 현재 시각을 기본값으로 채우는 탓) 계산이 의미가 없으므로
        // 기존에 적어둔 시간을 그대로 둔다.
        hours:
          bedTime && wakeTime && bedTime !== wakeTime
            ? hoursBetween(bedTime, wakeTime)
            : d.sleep.hours,
      },
    }))
  }

  const clear = () =>
    updateDay(date, () => ({ sleep: { hours: null, bedTime: null, wakeTime: null } }))

  const nudge = (delta: number) =>
    updateDay(date, (d) => ({
      sleep: {
        ...d.sleep,
        hours: Math.max(0, Math.min(24, Math.round(((d.sleep.hours ?? 7) + delta) * 10) / 10)),
      },
    }))

  return (
    <Card title="수면" mark="var(--blue)" note="어젯밤">
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
        <button type="button" className="icon-btn" onClick={() => nudge(-0.5)} aria-label="30분 줄이기">
          <span style={{ fontSize: 20, fontWeight: 700, lineHeight: 1 }}>−</span>
        </button>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div
            style={{
              fontSize: 38,
              fontWeight: 820,
              letterSpacing: '-0.05em',
              lineHeight: 1,
              color: sleep.hours === null ? 'var(--ink-3)' : 'var(--ink)',
            }}
          >
            {sleep.hours === null ? '—' : sleep.hours}
            <span style={{ fontSize: 16, fontWeight: 700, marginLeft: 3 }}>시간</span>
          </div>
        </div>
        <button type="button" className="icon-btn" onClick={() => nudge(0.5)} aria-label="30분 늘리기">
          <PlusIcon />
        </button>
      </div>

      {(sleep.hours !== null || sleep.bedTime || sleep.wakeTime) && (
        <button
          type="button"
          className="btn ghost sm"
          style={{ marginBottom: 12 }}
          onClick={clear}
        >
          지우고 다시 입력
        </button>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <label className="field">
          <span className="field-label">취침</span>
          <input
            type="time"
            className="input"
            value={sleep.bedTime ?? ''}
            onChange={(e) => setTimes(e.target.value || null, sleep.wakeTime)}
          />
        </label>
        <label className="field">
          <span className="field-label">기상</span>
          <input
            type="time"
            className="input"
            value={sleep.wakeTime ?? ''}
            onChange={(e) => setTimes(sleep.bedTime, e.target.value || null)}
          />
        </label>
      </div>
    </Card>
  )
}

// ── 컨디션 ───────────────────────────────────────────────────────────────────

const CONDITION_COLOR = (v: Level | null) =>
  v === null ? undefined : v >= 4 ? 'var(--blue)' : v === 3 ? 'var(--yellow)' : 'var(--accent)'

export function ConditionSection({ date }: SectionProps) {
  const { getDay, updateDay } = useStore()
  const { condition } = getDay(date)

  return (
    <Card
      title="컨디션"
      mark={CONDITION_COLOR(condition.score) ?? 'var(--ink-3)'}
      note="달력 색의 기준"
    >
      <ScaleInput
        value={condition.score}
        color={CONDITION_COLOR(condition.score)}
        low="별로"
        high="좋음"
        onChange={(v) => updateDay(date, (d) => ({ condition: { ...d.condition, score: v } }))}
      />
      <label className="field" style={{ marginTop: 14 }}>
        <span className="field-label">왜 그랬을까?</span>
        <textarea
          className="textarea"
          style={{ minHeight: 72 }}
          placeholder="컨디션이 이런 이유를 짧게 남겨두면 나중에 패턴이 보여요."
          value={condition.reason}
          onChange={(e) =>
            updateDay(date, (d) => ({ condition: { ...d.condition, reason: e.target.value } }))
          }
        />
      </label>
    </Card>
  )
}

// ── 아이디어 ─────────────────────────────────────────────────────────────────

export function IdeaSection({ date }: SectionProps) {
  const { getDay, updateDay } = useStore()
  const day = getDay(date)
  const [draft, setDraft] = useState('')

  const add = () => {
    const text = draft.trim()
    if (!text) return
    updateDay(date, (d) => ({ ideas: [{ id: newId(), text, at: Date.now() }, ...d.ideas] }))
    setDraft('')
  }

  return (
    <Card
      title="아이디어"
      mark="var(--yellow)"
      note={day.ideas.length ? `${day.ideas.length}개` : '떠오를 때마다'}
    >
      <div className="input-row" style={{ marginBottom: day.ideas.length ? 12 : 0 }}>
        <input
          className="input"
          placeholder="지금 떠오른 생각"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add()
          }}
        />
        <button type="button" className="icon-btn" onClick={add} aria-label="아이디어 추가">
          <PlusIcon />
        </button>
      </div>

      <div className="stack">
        {day.ideas.map((idea) => (
          <div key={idea.id} className="note-item">
            <BulbIcon className="idea-icon" />
            <div className="body">
              <p>{idea.text}</p>
              <div className="time">{formatTime(idea.at)}</div>
            </div>
            <button
              type="button"
              className="icon-btn plain"
              aria-label="삭제"
              onClick={() =>
                updateDay(date, (d) => ({ ideas: d.ideas.filter((i) => i.id !== idea.id) }))
              }
            >
              <TrashIcon />
            </button>
          </div>
        ))}
      </div>
    </Card>
  )
}

// ── 운동 ─────────────────────────────────────────────────────────────────────

export function WorkoutSection({ date }: SectionProps) {
  const { getDay, updateDay, data, addCustomWorkoutPart } = useStore()
  const { workout } = getDay(date)
  const [newPart, setNewPart] = useState('')
  const [adding, setAdding] = useState(false)

  const parts = useMemo(
    () => [...WORKOUT_PARTS, ...data.customWorkoutParts],
    [data.customWorkoutParts],
  )

  const togglePart = (part: string) =>
    updateDay(date, (d) => ({
      workout: {
        ...d.workout,
        did: true,
        parts: d.workout.parts.includes(part)
          ? d.workout.parts.filter((p) => p !== part)
          : [...d.workout.parts, part],
      },
    }))

  const submitPart = () => {
    const clean = newPart.trim()
    if (!clean) return
    addCustomWorkoutPart(clean)
    if (!workout.parts.includes(clean)) togglePart(clean)
    setNewPart('')
    setAdding(false)
  }

  return (
    <Card title="운동" mark="var(--green)">
      <Segmented
        options={[
          { value: 'yes', label: '했음' },
          { value: 'no', label: '안 함' },
        ]}
        value={workout.did === null ? null : workout.did ? 'yes' : 'no'}
        onChange={(v) =>
          updateDay(date, (d) => ({
            workout:
              v === 'no'
                ? { ...d.workout, did: false, parts: [], intensity: null }
                : { ...d.workout, did: v === null ? null : true },
          }))
        }
      />

      {workout.did && (
        <>
          <div className="field" style={{ marginTop: 14 }}>
            <span className="field-label">부위 (여러 개 선택)</span>
            <div className="chips">
              {parts.map((part) => (
                <Chip
                  key={part}
                  active={workout.parts.includes(part)}
                  onClick={() => togglePart(part)}
                >
                  {part}
                </Chip>
              ))}
              {adding ? (
                <input
                  className="input"
                  autoFocus
                  style={{ width: 120, padding: '7px 12px', fontSize: 13 }}
                  placeholder="부위 이름"
                  value={newPart}
                  onChange={(e) => setNewPart(e.target.value)}
                  onBlur={submitPart}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitPart()
                    if (e.key === 'Escape') {
                      setNewPart('')
                      setAdding(false)
                    }
                  }}
                />
              ) : (
                <button type="button" className="chip" onClick={() => setAdding(true)}>
                  + 직접 추가
                </button>
              )}
            </div>
          </div>

          <div className="field" style={{ marginTop: 14 }}>
            <span className="field-label">강도</span>
            <Segmented<Intensity>
              options={[
                { value: 'low', label: '낮음' },
                { value: 'mid', label: '보통' },
                { value: 'high', label: '높음' },
              ]}
              value={workout.intensity}
              onChange={(v) => updateDay(date, (d) => ({ workout: { ...d.workout, intensity: v } }))}
            />
          </div>

          <label className="field" style={{ marginTop: 14 }}>
            <span className="field-label">메모</span>
            <input
              className="input"
              placeholder="한 운동, 무게, 느낌 등"
              value={workout.memo}
              onChange={(e) =>
                updateDay(date, (d) => ({ workout: { ...d.workout, memo: e.target.value } }))
              }
            />
          </label>
        </>
      )}
    </Card>
  )
}

// ── 몸무게 ───────────────────────────────────────────────────────────────────

export function BodySection({ date }: SectionProps) {
  const { getDay, updateDay } = useStore()
  const day = getDay(date)

  return (
    <Card title="몸무게" mark="var(--purple)">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input
          className="input"
          type="number"
          inputMode="decimal"
          step="0.1"
          placeholder="0.0"
          style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.04em', textAlign: 'center' }}
          value={day.weight ?? ''}
          onChange={(e) =>
            updateDay(date, () => ({
              weight: e.target.value === '' ? null : Number(e.target.value),
            }))
          }
        />
        <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink-3)' }}>kg</span>
      </div>
    </Card>
  )
}

// ── 식습관 ───────────────────────────────────────────────────────────────────

const AMOUNT_LABELS = ['아주 적게', '적게', '보통', '많이', '아주 많이']

export function DietSection({ date }: SectionProps) {
  const { getDay, updateDay } = useStore()
  const { diet } = getDay(date)

  const addMeal = (label: string) =>
    updateDay(date, (d) => ({
      diet: {
        ...d.diet,
        meals: [...d.diet.meals, { id: newId(), label, amount: 3 as Level, time: null }],
      },
    }))

  const usedLabels = new Set(diet.meals.map((m) => m.label))
  const nutrients: { key: 'protein' | 'water' | 'sugar'; label: string; color: string }[] = [
    { key: 'protein', label: '단백질', color: 'var(--accent)' },
    { key: 'water', label: '수분', color: 'var(--blue)' },
    { key: 'sugar', label: '당분', color: 'var(--yellow)' },
  ]

  return (
    <Card title="식습관" mark="var(--yellow)" note={`${diet.meals.length}끼`}>
      <div className="stack">
        {diet.meals.map((meal) => (
          <div key={meal.id} style={{ background: 'var(--surface-2)', borderRadius: 'var(--r-md)', padding: 12 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 8,
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <span style={{ fontWeight: 700, fontSize: 14, flexShrink: 0 }}>{meal.label}</span>
                <input
                  type="time"
                  className="input meal-time"
                  aria-label={`${meal.label} 시각`}
                  value={meal.time ?? ''}
                  onChange={(e) =>
                    updateDay(date, (d) => ({
                      diet: {
                        ...d.diet,
                        meals: d.diet.meals.map((m) =>
                          m.id === meal.id ? { ...m, time: e.target.value || null } : m,
                        ),
                      },
                    }))
                  }
                />
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <span style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 600 }}>
                  {AMOUNT_LABELS[meal.amount - 1]}
                </span>
                <button
                  type="button"
                  className="icon-btn plain"
                  aria-label={`${meal.label} 삭제`}
                  onClick={() =>
                    updateDay(date, (d) => ({
                      diet: { ...d.diet, meals: d.diet.meals.filter((m) => m.id !== meal.id) },
                    }))
                  }
                >
                  <TrashIcon />
                </button>
              </span>
            </div>
            <ScaleInput
              value={meal.amount}
              color="var(--yellow)"
              onChange={(v) =>
                updateDay(date, (d) => ({
                  diet: {
                    ...d.diet,
                    meals: d.diet.meals.map((m) =>
                      m.id === meal.id ? { ...m, amount: (v ?? 3) as Level } : m,
                    ),
                  },
                }))
              }
            />
          </div>
        ))}
      </div>

      <div className="chips" style={{ marginTop: diet.meals.length ? 12 : 0 }}>
        {MEAL_LABELS.filter((l) => l !== '간식' && !usedLabels.has(l))
          .concat('간식')
          .map((label) => (
            <button key={label} type="button" className="chip" onClick={() => addMeal(label)}>
              + {label}
            </button>
          ))}
      </div>

      <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {nutrients.map((n) => (
          <div className="field" key={n.key}>
            <span className="field-label">{n.label}</span>
            <ScaleInput
              value={diet[n.key]}
              color={n.color}
              low="거의 안 함"
              high="충분히"
              onChange={(v) => updateDay(date, (d) => ({ diet: { ...d.diet, [n.key]: v } }))}
            />
          </div>
        ))}

        <div className="field">
          <span className="field-label">크레아틴</span>
          <Segmented
            options={[
              { value: 'yes', label: 'O 먹음' },
              { value: 'no', label: 'X 안 먹음' },
            ]}
            value={diet.creatine === null ? null : diet.creatine ? 'yes' : 'no'}
            onChange={(v) =>
              updateDay(date, (d) => ({
                diet: { ...d.diet, creatine: v === null ? null : v === 'yes' },
              }))
            }
          />
        </div>
      </div>
    </Card>
  )
}

// ── 관계 ─────────────────────────────────────────────────────────────────────

export function PeopleSection({
  date,
  onOpenPerson,
}: SectionProps & { onOpenPerson?: (id: string) => void }) {
  const { getDay, updateDay, data, addPerson } = useStore()
  const day = getDay(date)
  const [selected, setSelected] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [relation, setRelation] = useState('')

  const personById = useMemo(
    () => Object.fromEntries(data.people.map((p) => [p.id, p])),
    [data.people],
  )

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]))

  const submitNote = () => {
    const text = note.trim()
    if (selected.length === 0 || !text) return
    const at = Date.now()
    // 함께 있었던 일은 고른 사람 각각에게 같은 내용으로 남긴다.
    // 나중에 사람별 프로필에서 따로 열어봐야 하기 때문이다.
    updateDay(date, (d) => ({
      interactions: [
        ...selected.map((personId) => ({ id: newId(), personId, note: text, at })),
        ...d.interactions,
      ],
    }))
    setNote('')
    setSelected([])
  }

  const createPerson = () => {
    if (!name.trim()) return
    const person = addPerson(name, relation)
    setSelected((prev) => [...prev, person.id])
    setName('')
    setRelation('')
    setCreating(false)
  }

  return (
    <Card title="관계" mark="var(--purple)">
      {creating ? (
        <div className="stack">
          <input
            className="input"
            autoFocus
            placeholder="이름"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="input"
            placeholder="어떤 사이인가요? (예: 대학교 친구, 가족)"
            value={relation}
            onChange={(e) => setRelation(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') createPerson()
            }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn primary" onClick={createPerson}>
              등록
            </button>
            <button type="button" className="btn ghost" onClick={() => setCreating(false)}>
              취소
            </button>
          </div>
        </div>
      ) : (
        <div className="person-scroll">
          {data.people.map((p) => {
            const active = selected.includes(p.id)
            return (
              <button
                key={p.id}
                type="button"
                className="person-pill"
                aria-pressed={active}
                onClick={() => toggle(p.id)}
              >
                <span
                  className="avatar"
                  data-selected={active}
                  style={{ background: PERSON_COLORS[p.colorIndex % PERSON_COLORS.length] }}
                >
                  {initial(p.name)}
                </span>
                <span className="name" style={{ color: active ? 'var(--ink)' : 'var(--ink-3)' }}>
                  {p.name}
                </span>
              </button>
            )
          })}
          <button type="button" className="person-pill" onClick={() => setCreating(true)}>
            <span
              className="avatar"
              style={{
                background: 'var(--surface-2)',
                color: 'var(--ink-3)',
                border: '1.5px dashed var(--line-strong)',
              }}
            >
              <PlusIcon className="plus-sm" />
            </span>
            <span className="name" style={{ color: 'var(--ink-3)' }}>
              새 사람
            </span>
          </button>
        </div>
      )}

      {selected.length > 0 && !creating && (
        <div style={{ marginTop: 12 }}>
          <textarea
            className="textarea"
            style={{ minHeight: 76 }}
            placeholder={`${selected
              .map((id) => personById[id]?.name)
              .filter(Boolean)
              .join(', ')}와(과) 오늘 있었던 일`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button
            type="button"
            className="btn primary block"
            style={{ marginTop: 8 }}
            onClick={submitNote}
            disabled={!note.trim()}
          >
            {selected.length > 1 ? `${selected.length}명에게 기록` : '기록'}
          </button>
        </div>
      )}

      {day.interactions.length > 0 && (
        <div className="stack" style={{ marginTop: 14 }}>
          {day.interactions.map((it) => {
            const person = personById[it.personId]
            return (
              <div key={it.id} className="note-item">
                <button
                  type="button"
                  className="avatar sm"
                  onClick={() => onOpenPerson?.(it.personId)}
                  style={{
                    background: person
                      ? PERSON_COLORS[person.colorIndex % PERSON_COLORS.length]
                      : 'var(--ink-3)',
                    cursor: onOpenPerson ? 'pointer' : 'default',
                  }}
                  aria-label={`${person?.name ?? '알 수 없음'} 프로필 열기`}
                >
                  {initial(person?.name ?? '?')}
                </button>
                <div className="body">
                  <div style={{ fontSize: 13, fontWeight: 700 }}>
                    {person?.name ?? '삭제된 사람'}
                    {person?.relation && (
                      <span style={{ color: 'var(--ink-3)', fontWeight: 550 }}>
                        {' '}
                        · {person.relation}
                      </span>
                    )}
                  </div>
                  <p style={{ marginTop: 3 }}>{it.note}</p>
                </div>
                <button
                  type="button"
                  className="icon-btn plain"
                  aria-label="삭제"
                  onClick={() =>
                    updateDay(date, (d) => ({
                      interactions: d.interactions.filter((x) => x.id !== it.id),
                    }))
                  }
                >
                  <TrashIcon />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {data.people.length === 0 && !creating && (
        <Empty>사람을 등록하면 그 사람과 있었던 일을 모아볼 수 있어요.</Empty>
      )}
    </Card>
  )
}

// ── 자기성찰 ─────────────────────────────────────────────────────────────────

export function ReflectionSection({ date }: SectionProps) {
  const { getDay, updateDay } = useStore()
  const day = getDay(date)

  return (
    <Card title="자기성찰" mark="var(--ink)" note={`${day.reflection.length}자`}>
      <textarea
        className="textarea"
        style={{ minHeight: 150 }}
        placeholder="오늘 하루는 어땠나요? 좋았던 것, 아쉬웠던 것, 내일 다르게 해보고 싶은 것."
        value={day.reflection}
        onChange={(e) => updateDay(date, () => ({ reflection: e.target.value }))}
      />
    </Card>
  )
}

// ── 하루 점수 ────────────────────────────────────────────────────────────────

export function ScoreSection({ date }: SectionProps) {
  const { getDay, updateDay } = useStore()
  const day = getDay(date)

  return (
    <Card title="하루 감상평" mark="var(--blue)">
      <StarRating
        value={day.score}
        onChange={(v) => updateDay(date, () => ({ score: v }))}
      />
      <label className="field" style={{ marginTop: 14 }}>
        <span className="field-label">한 줄 평</span>
        <input
          className="input"
          placeholder="오늘을 한 문장으로 남긴다면"
          value={day.scoreNote}
          onChange={(e) => updateDay(date, () => ({ scoreNote: e.target.value }))}
        />
      </label>
    </Card>
  )
}
