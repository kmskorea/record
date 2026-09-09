import { useMemo, useState } from 'react'
import {
  Card,
  Checkbox,
  Chip,
  CollapsibleCard,
  Empty,
  ScaleInput,
  Segmented,
  initial,
} from '../../components/ui'
import { StarRating } from '../../components/StarRating'
import { BulbIcon, GripIcon, PlusIcon, TrashIcon } from '../../components/icons'
import { useDragOrder } from '../../components/useDragOrder'
import { useStore } from '../../lib/store'
import { formatDuration, formatMinutes, formatPace, runSeconds, snsTotal } from '../../lib/metrics'
import { newId } from '../../lib/storage'
import { formatTime } from '../../lib/date'
import {
  ALCOHOL_KINDS,
  BUILTIN_CONTENT_KINDS,
  CONTENT_COLORS,
  CONTENT_FIELD_LABEL,
  DRINK_UNITS,
  EVENT_KIND_COLOR,
  EVENT_KIND_LABEL,
  INTENSITY_LABEL,
  ITEM_FIELDS,
  MEAL_LABELS,
  RUNNING_PART,
  SNS_APPS,
  PROFILE_COLORS,
  WORKOUT_PARTS,
  isRunning,
  type ContentField,
  type Drink,
  type EventKind,
  type ISODate,
  type Intensity,
  type Level,
} from '../../lib/types'

interface SectionProps {
  date: ISODate
}

// ── 할일 ─────────────────────────────────────────────────────────────────────

export function TodoSection({ date, onOpenPerson }: SectionProps & { onOpenPerson?: (id: string) => void }) {
  const { getDay, updateDay, data } = useStore()
  const day = getDay(date)
  const [draft, setDraft] = useState('')
  const [detail, setDetail] = useState(false)
  const [kind, setKind] = useState<EventKind>('appointment')
  const [time, setTime] = useState('')
  const [people, setPeople] = useState<string[]>([])

  const personById = useMemo(
    () => Object.fromEntries(data.people.map((p) => [p.id, p])),
    [data.people],
  )

  const resetForm = () => {
    setDraft('')
    setTime('')
    setPeople([])
    setDetail(false)
  }

  /** 지금 목록에서 가장 뒤 번호. 새로 넣는 것은 맨 끝에 붙인다. */
  const nextOrder = () =>
    Math.max(-1, ...day.todos.map((t) => t.order), ...day.events.map((e) => e.order)) + 1

  const add = () => {
    const text = draft.trim()
    if (!text) return
    if (detail) {
      updateDay(date, (d) => ({
        events: [
          ...d.events,
          {
            id: newId(),
            title: text,
            kind,
            time: time || null,
            personIds: kind === 'appointment' ? people : [],
            done: false,
            createdAt: Date.now(),
            order: nextOrder(),
          },
        ],
      }))
      resetForm()
    } else {
      updateDay(date, (d) => ({
        todos: [
          ...d.todos,
          { id: newId(), text, done: false, createdAt: Date.now(), order: nextOrder() },
        ],
      }))
      setDraft('')
    }
  }

  /** 일정과 그냥 적은 할 일을 한 줄기로 묶는다. 둘 다 결국 '오늘 해야 할 것'이다. */
  const rows = useMemo(() => {
    type Row = {
      key: string
      title: string
      done: boolean
      time: string | null
      kind: EventKind | null
      personIds: string[]
      createdAt: number
      order: number
      toggle: (v: boolean) => void
      remove: () => void
    }
    const list: Row[] = [
      ...day.events.map((ev) => ({
        key: `e-${ev.id}`,
        title: ev.title,
        done: ev.done,
        time: ev.time,
        kind: ev.kind,
        personIds: ev.personIds,
        createdAt: ev.createdAt,
        order: ev.order,
        toggle: (v: boolean) =>
          updateDay(date, (d) => ({
            events: d.events.map((x) => (x.id === ev.id ? { ...x, done: v } : x)),
          })),
        remove: () =>
          updateDay(date, (d) => ({ events: d.events.filter((x) => x.id !== ev.id) })),
      })),
      ...day.todos.map((t) => ({
        key: `t-${t.id}`,
        title: t.text,
        done: t.done,
        time: null,
        kind: null,
        personIds: [],
        createdAt: t.createdAt,
        order: t.order,
        toggle: (v: boolean) =>
          updateDay(date, (d) => ({
            todos: d.todos.map((x) => (x.id === t.id ? { ...x, done: v } : x)),
          })),
        remove: () => updateDay(date, (d) => ({ todos: d.todos.filter((x) => x.id !== t.id) })),
      })),
    ]
    // 사용자가 정해둔 자리 순. 같으면 만든 순으로 갈린다.
    return list.sort((a, b) => a.order - b.order || a.createdAt - b.createdAt)
  }, [day.events, day.todos, date, updateDay])

  /** 끌어서 옮긴 결과를 자리 번호로 굳힌다. */
  const commitOrder = (keys: string[]) => {
    const rank = new Map(keys.map((k, i) => [k, i]))
    updateDay(date, (d) => ({
      events: d.events.map((e) => ({ ...e, order: rank.get(`e-${e.id}`) ?? e.order })),
      todos: d.todos.map((t) => ({ ...t, order: rank.get(`t-${t.id}`) ?? t.order })),
    }))
  }

  const { listRef, order, draggingKey, start, move, end } = useDragOrder(
    useMemo(() => rows.map((r) => r.key), [rows]),
    commitOrder,
  )

  // 끄는 동안에는 화면에만 새 자리를 반영한다.
  const shown = useMemo(() => {
    if (!order) return rows
    const byKey = new Map(rows.map((r) => [r.key, r]))
    return order.map((k) => byKey.get(k)!).filter(Boolean)
  }, [order, rows])

  const done = rows.filter((r) => r.done).length

  return (
    <Card
      title="오늘 할 일"
      mark="var(--accent)"
      action={
        rows.length > 0 ? (
          <span className="todo-progress">
            <span className="big">{done}</span>
            <span className="small">/ {rows.length}</span>
          </span>
        ) : null
      }
    >
      {rows.length === 0 ? (
        <Empty>할 일이나 약속, 마감을 적어보세요.</Empty>
      ) : (
        <ul
          ref={listRef}
          onPointerMove={(e) => move(e.clientY)}
          onPointerUp={end}
          onPointerCancel={end}
        >
          {shown.map((row) => (
            <li
              key={row.key}
              className="todo"
              data-done={row.done}
              data-dragging={row.key === draggingKey}
            >
              <button
                type="button"
                className="todo-handle"
                aria-label={`${row.title} 순서 옮기기`}
                onPointerDown={(e) => start(row.key, e)}
              >
                <GripIcon />
              </button>
              <Checkbox checked={row.done} label={row.title} onChange={row.toggle} />
              <span className="todo-text">
                <span className="todo-title">{row.title}</span>
                {(row.kind || row.time || row.personIds.length > 0) && (
                  <span className="event-meta">
                    {row.kind && (
                      <span className="event-kind" style={{ background: EVENT_KIND_COLOR[row.kind] }}>
                        {EVENT_KIND_LABEL[row.kind]}
                      </span>
                    )}
                    {row.time && <span>{row.time}</span>}
                    {row.personIds.map((id) => (
                      <button
                        key={id}
                        type="button"
                        className="link-btn"
                        onClick={() => onOpenPerson?.(id)}
                      >
                        {personById[id]?.name ?? '알 수 없음'}
                      </button>
                    ))}
                  </span>
                )}
              </span>
              <button type="button" className="icon-btn plain" aria-label="삭제" onClick={row.remove}>
                <TrashIcon />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="input-row" style={{ marginTop: 12 }}>
        <input
          className="input"
          placeholder={detail ? '무엇을' : '할 일 추가'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add()
          }}
        />
        <button type="button" className="icon-btn" onClick={add} aria-label="추가">
          <PlusIcon />
        </button>
      </div>

      {detail && (
        <div className="stack" style={{ marginTop: 10 }}>
          <div className="seg">
            {(['appointment', 'deadline', 'task'] as EventKind[]).map((k) => (
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
                        style={{ background: PROFILE_COLORS[p.colorIndex % PROFILE_COLORS.length] }}
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
        </div>
      )}

      <button
        type="button"
        className="btn ghost sm"
        style={{ marginTop: 10 }}
        onClick={() => (detail ? resetForm() : setDetail(true))}
      >
        {detail ? '간단히 적기' : '+ 약속·마감으로 추가'}
      </button>
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

  const filled = sleep.hours !== null || Boolean(sleep.bedTime) || Boolean(sleep.wakeTime)
  const summary = (
    <>
      {sleep.hours !== null ? `${sleep.hours}시간` : '—'}
      {sleep.bedTime && sleep.wakeTime && (
        <span className="dim">
          {' '}
          · {sleep.bedTime} → {sleep.wakeTime}
        </span>
      )}
    </>
  )

  return (
    <CollapsibleCard title="수면" mark="var(--blue)" filled={filled} summary={summary}>
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
    </CollapsibleCard>
  )
}

// ── 내면 상태 ────────────────────────────────────────────────────────────────

/** 에너지는 높을수록 좋다. */
const ENERGY_COLOR = (v: Level | null) =>
  v === null ? undefined : v >= 4 ? 'var(--blue)' : v === 3 ? 'var(--yellow)' : 'var(--accent)'

/** 불안은 반대다 — 높을수록 나쁘므로 색도 뒤집는다. */
const ANXIETY_COLOR = (v: Level | null) =>
  v === null ? undefined : v <= 2 ? 'var(--blue)' : v === 3 ? 'var(--yellow)' : 'var(--accent)'

export function InnerStateSection({ date }: SectionProps) {
  const { getDay, updateDay } = useStore()
  const { condition } = getDay(date)

  const filled =
    condition.energy !== null || condition.anxiety !== null || condition.reason.trim() !== ''
  const summary = (
    <>
      {condition.energy === null && condition.anxiety === null && '—'}
      {condition.energy !== null && `에너지 ${condition.energy}`}
      {condition.anxiety !== null && (
        <>
          {condition.energy !== null && ' · '}
          {`불안 ${condition.anxiety}`}
        </>
      )}
      {condition.reason.trim() && <span className="dim"> · {condition.reason}</span>}
    </>
  )

  return (
    <CollapsibleCard
      title="내면 상태"
      mark={ENERGY_COLOR(condition.energy) ?? 'var(--ink-3)'}
      filled={filled}
      summary={summary}
    >
      <div className="field">
        <span className="field-label">에너지</span>
        <ScaleInput
          value={condition.energy}
          color={ENERGY_COLOR(condition.energy)}
          low="방전"
          high="충만"
          onChange={(v) => updateDay(date, (d) => ({ condition: { ...d.condition, energy: v } }))}
        />
      </div>

      <div className="field" style={{ marginTop: 14 }}>
        <span className="field-label">불안·스트레스</span>
        <ScaleInput
          value={condition.anxiety}
          color={ANXIETY_COLOR(condition.anxiety)}
          low="평온"
          high="극도"
          onChange={(v) => updateDay(date, (d) => ({ condition: { ...d.condition, anxiety: v } }))}
        />
      </div>

      <label className="field" style={{ marginTop: 14 }}>
        <span className="field-label">왜 그랬을까?</span>
        <textarea
          className="textarea"
          style={{ minHeight: 72 }}
          placeholder="오늘 안이 이랬던 이유를 짧게 남겨두면 나중에 패턴이 보여요."
          value={condition.reason}
          onChange={(e) =>
            updateDay(date, (d) => ({ condition: { ...d.condition, reason: e.target.value } }))
          }
        />
      </label>
    </CollapsibleCard>
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

/**
 * 러닝을 고르면 나오는 칸. 시계나 러닝 앱이 보여주는 그대로
 * '거리'와 '1km 평균 페이스'를 옮겨 적게 한다.
 */
function RunningFields({ date }: SectionProps) {
  const { getDay, updateDay } = useStore()
  const { running } = getDay(date).workout

  const patch = (next: Partial<typeof running>) =>
    updateDay(date, (d) => ({
      workout: { ...d.workout, running: { ...d.workout.running, ...next } },
    }))

  // 1km를 1분 안에 뛰는 일은 없으니, 페이스가 60초보다 짧으면 분 칸을 비워둔다.
  // SNS 시간 칸과 같은 이유다 — 분 칸에 0이 남으면 초만 지워도 기록이 안 지워진다.
  const mm =
    running.paceSec === null || running.paceSec < 60
      ? ''
      : String(Math.floor(running.paceSec / 60))
  const ss = running.paceSec === null ? '' : String(running.paceSec % 60)

  const setPace = (m: string, sec: string) => {
    if (m === '' && sec === '') return patch({ paceSec: null })
    const total = (Number(m) || 0) * 60 + (Number(sec) || 0)
    patch({ paceSec: Math.max(0, Math.min(59 * 60 + 59, total)) })
  }

  const elapsed = runSeconds(running)

  return (
    <div className="run-box">
      <span className="run-title">
        {/* 점 색은 달력에 찍히는 러닝 표시와 같은 색이다 */}
        <i />
        러닝
      </span>
      <div className="num-row">
        <span className="num-name">거리</span>
        <span className="num-inputs">
          <input
            className="input"
            type="number"
            inputMode="decimal"
            step="0.1"
            min={0}
            placeholder="0.0"
            aria-label="러닝 거리"
            value={running.km ?? ''}
            onChange={(e) =>
              patch({ km: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })
            }
          />
          <span className="num-unit">km</span>
        </span>
      </div>

      <div className="num-row">
        <span className="num-name">1km 평균 페이스</span>
        <span className="num-inputs">
          <input
            className="input"
            type="number"
            inputMode="numeric"
            min={0}
            max={59}
            placeholder="0"
            aria-label="평균 페이스 분"
            value={mm}
            onChange={(e) => setPace(e.target.value, ss)}
          />
          <span className="num-unit">분</span>
          <input
            className="input"
            type="number"
            inputMode="numeric"
            min={0}
            max={59}
            placeholder="00"
            aria-label="평균 페이스 초"
            value={ss}
            onChange={(e) => setPace(mm, e.target.value)}
          />
          <span className="num-unit">초</span>
        </span>
      </div>

      {elapsed !== null && (
        <p className="card-note" style={{ marginTop: 4, textAlign: 'right' }}>
          걸린 시간 <strong style={{ color: 'var(--ink)' }}>{formatDuration(elapsed)}</strong>
        </p>
      )}
    </div>
  )
}

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
    updateDay(date, (d) => {
      const on = d.workout.parts.includes(part)
      const parts = on ? d.workout.parts.filter((p) => p !== part) : [...d.workout.parts, part]
      return {
        workout: {
          ...d.workout,
          did: true,
          parts,
          // 러닝을 뺐으면 거리·페이스도 같이 지운다. 안 보이는 칸에 숫자가
          // 남아 있으면 달력 표시와 기록이 어긋난다.
          running: parts.includes(RUNNING_PART)
            ? d.workout.running
            : { km: null, paceSec: null },
        },
      }
    })

  const submitPart = () => {
    const clean = newPart.trim()
    if (!clean) return
    addCustomWorkoutPart(clean)
    if (!workout.parts.includes(clean)) togglePart(clean)
    setNewPart('')
    setAdding(false)
  }

  const filled = workout.did !== null
  const summary = (
    <>
      {workout.did === null ? '—' : workout.did ? '했음' : '안 함'}
      {workout.did && (workout.parts.length > 0 || workout.intensity) && (
        <span className="dim">
          {workout.parts.length > 0 && ` · ${workout.parts.join(', ')}`}
          {workout.running.km !== null && ` ${workout.running.km}km`}
          {workout.running.paceSec !== null && ` ${formatPace(workout.running.paceSec)}`}
          {workout.intensity && ` · ${INTENSITY_LABEL[workout.intensity]}`}
        </span>
      )}
    </>
  )

  return (
    <CollapsibleCard title="운동" mark="var(--green)" filled={filled} summary={summary}>
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
                ? {
                    ...d.workout,
                    did: false,
                    parts: [],
                    intensity: null,
                    running: { km: null, paceSec: null },
                  }
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

          {isRunning(workout.parts) && <RunningFields date={date} />}

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
    </CollapsibleCard>
  )
}

// ── 몸무게 ───────────────────────────────────────────────────────────────────

export function BodySection({ date }: SectionProps) {
  const { getDay, updateDay } = useStore()
  const day = getDay(date)

  return (
    <CollapsibleCard
      title="몸무게"
      mark="var(--purple)"
      filled={day.weight !== null}
      summary={day.weight !== null ? `${day.weight} kg` : '—'}
    >
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
    </CollapsibleCard>
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

        <div className="field">
          <span className="field-label">음주</span>
          <Segmented
            options={[
              { value: 'yes', label: 'O 마심' },
              { value: 'no', label: 'X 안 마심' },
            ]}
            value={diet.alcohol === null ? null : diet.alcohol ? 'yes' : 'no'}
            onChange={(v) =>
              updateDay(date, (d) => ({
                diet: {
                  ...d.diet,
                  alcohol: v === null ? null : v === 'yes',
                  // 안 마셨다고 했으면 적어둔 주종도 같이 비운다.
                  // 안 보이는 칸에 숫자가 남아 있으면 기록과 어긋난다.
                  drinks: v === 'yes' ? d.diet.drinks : [],
                },
              }))
            }
          />
        </div>

        {diet.alcohol && <DrinkList date={date} drinks={diet.drinks} />}
      </div>
    </Card>
  )
}

/** 마신 술을 주종별로 한 줄씩. 소주 1병 + 맥주 2잔처럼 섞이는 날이 흔하다. */
function DrinkList({ date, drinks }: SectionProps & { drinks: Drink[] }) {
  const { updateDay } = useStore()
  const [adding, setAdding] = useState(false)
  const [custom, setCustom] = useState('')

  const patch = (next: Drink[]) =>
    updateDay(date, (d) => ({ diet: { ...d.diet, alcohol: true, drinks: next } }))

  const add = (kind: string, unit: string) => {
    const clean = kind.trim()
    if (!clean) return
    patch([...drinks, { id: newId(), kind: clean, amount: 1, unit }])
  }

  const edit = (id: string, next: Partial<Drink>) =>
    patch(drinks.map((x) => (x.id === id ? { ...x, ...next } : x)))

  const used = new Set(drinks.map((x) => x.kind))

  return (
    <div className="stack" style={{ marginTop: 4 }}>
      {drinks.map((drink) => (
        <div key={drink.id} className="drink-row">
          <div className="drink-head">
            <span style={{ fontWeight: 700, fontSize: 14 }}>{drink.kind}</span>
            <button
              type="button"
              className="icon-btn plain"
              aria-label={`${drink.kind} 삭제`}
              onClick={() => patch(drinks.filter((x) => x.id !== drink.id))}
            >
              <TrashIcon />
            </button>
          </div>
          <div className="drink-amount">
            <input
              className="input"
              type="number"
              inputMode="decimal"
              step="0.5"
              min={0}
              aria-label={`${drink.kind} 양`}
              value={drink.amount}
              onChange={(e) =>
                edit(drink.id, { amount: e.target.value === '' ? 0 : Number(e.target.value) })
              }
            />
            <span className="chips">
              {DRINK_UNITS.map((u) => (
                <Chip key={u} active={drink.unit === u} onClick={() => edit(drink.id, { unit: u })}>
                  {u}
                </Chip>
              ))}
            </span>
          </div>
        </div>
      ))}

      {adding ? (
        <div className="input-row">
          <input
            className="input"
            autoFocus
            placeholder="주종 이름"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                add(custom, DRINK_UNITS[0])
                setCustom('')
                setAdding(false)
              }
              if (e.key === 'Escape') {
                setCustom('')
                setAdding(false)
              }
            }}
          />
          <button
            type="button"
            className="btn primary sm"
            onClick={() => {
              add(custom, DRINK_UNITS[0])
              setCustom('')
              setAdding(false)
            }}
          >
            추가
          </button>
        </div>
      ) : (
        <div className="chips">
          {ALCOHOL_KINDS.filter((k) => !used.has(k.label)).map((k) => (
            <button
              key={k.label}
              type="button"
              className="chip"
              onClick={() => add(k.label, k.unit)}
            >
              + {k.label}
            </button>
          ))}
          <button type="button" className="chip" onClick={() => setAdding(true)}>
            + 직접 추가
          </button>
        </div>
      )}
    </div>
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

  // 그날 잡힌 약속을 관계 칸에서 바로 이어받는다.
  // 약속을 걸어둔 사람과 무슨 일이 있었는지가 결국 여기에 적힐 내용이다.
  const appointments = day.events.filter(
    (e) => e.kind === 'appointment' && e.personIds.length > 0,
  )

  return (
    <Card title="관계" mark="var(--purple)">
      {appointments.length > 0 && !creating && (
        <div className="stack" style={{ marginBottom: 14 }}>
          <span className="field-label">오늘 약속</span>
          {appointments.map((ev) => {
            const names = ev.personIds
              .map((id) => personById[id]?.name)
              .filter(Boolean)
              .join(', ')
            const active =
              ev.personIds.length === selected.length &&
              ev.personIds.every((id) => selected.includes(id))
            return (
              <button
                key={ev.id}
                type="button"
                className="appointment-row"
                aria-pressed={active}
                // 토글이 아니라 항상 고른다. '있었던 일 적기'라고 써놓고
                // 눌렀더니 선택이 풀리면 앞뒤가 맞지 않는다.
                onClick={() => setSelected(ev.personIds)}
              >
                <span className="event-kind" style={{ background: 'var(--purple)' }}>
                  약속
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="event-title" style={{ display: 'block' }}>
                    {ev.title}
                  </span>
                  <span className="event-meta">
                    {ev.time && <span>{ev.time}</span>}
                    <span>{names}</span>
                  </span>
                </span>
                <span className="appointment-cta">
                  {active ? '아래에 적기' : '있었던 일 적기'}
                </span>
              </button>
            )
          })}
        </div>
      )}

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
                  style={{ background: PROFILE_COLORS[p.colorIndex % PROFILE_COLORS.length] }}
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
                      ? PROFILE_COLORS[person.colorIndex % PROFILE_COLORS.length]
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

// ── 콘텐츠 ───────────────────────────────────────────────────────────────────

/**
 * 유형마다 다른 칸을 그린다. 책은 쪽수와 구절, 영화는 별점, 영상은 링크.
 * 링크만 작품 자체에 붙으므로(주소는 안 바뀐다) 여기서는 다루지 않는다.
 */
function LogFields({
  fields,
  pages,
  setPages,
  quote,
  setQuote,
  rating,
  setRating,
}: {
  fields: ContentField[]
  pages: string
  setPages: (v: string) => void
  quote: string
  setQuote: (v: string) => void
  rating: number | null
  setRating: (v: number | null) => void
}) {
  return (
    <>
      {fields.includes('pages') && (
        <div className="num-row">
          <span className="num-name">읽은 쪽수</span>
          <span className="num-inputs">
            <input
              className="input"
              type="number"
              inputMode="numeric"
              min={0}
              placeholder="0"
              aria-label="읽은 쪽수"
              value={pages}
              onChange={(e) => setPages(e.target.value)}
            />
            <span className="num-unit">쪽</span>
          </span>
        </div>
      )}
      {fields.includes('quote') && (
        <label className="field">
          <span className="field-label">인상적인 구절</span>
          <textarea
            className="textarea"
            style={{ minHeight: 76 }}
            placeholder="옮겨 적고 싶은 문장"
            value={quote}
            onChange={(e) => setQuote(e.target.value)}
          />
        </label>
      )}
      {fields.includes('rating') && (
        <div className="field">
          <span className="field-label">별점</span>
          <StarRating
            value={rating}
            onChange={setRating}
            label="별점"
            hint="별을 눌러 매겨보세요"
          />
        </div>
      )}
    </>
  )
}

export function ContentSection({
  date,
  onOpenContent,
}: SectionProps & { onOpenContent?: (id: string) => void }) {
  const { getDay, updateDay, data, addContent, addContentKind } = useStore()
  const day = getDay(date)

  const kinds = useMemo(
    () => [...BUILTIN_CONTENT_KINDS, ...data.customContentKinds],
    [data.customContentKinds],
  )
  const [kindId, setKindId] = useState(BUILTIN_CONTENT_KINDS[0].id)
  const kind = kinds.find((k) => k.id === kindId) ?? kinds[0]

  const [itemId, setItemId] = useState<string | null>(null)
  const [pages, setPages] = useState('')
  const [quote, setQuote] = useState('')
  const [rating, setRating] = useState<number | null>(null)
  const [note, setNote] = useState('')

  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [byline, setByline] = useState('')
  const [url, setUrl] = useState('')

  const [addingKind, setAddingKind] = useState(false)
  const [kindLabel, setKindLabel] = useState('')
  const [kindFields, setKindFields] = useState<ContentField[]>(['rating'])

  const itemById = useMemo(
    () => Object.fromEntries(data.content.map((c) => [c.id, c])),
    [data.content],
  )
  const kindById = useMemo(() => Object.fromEntries(kinds.map((k) => [k.id, k])), [kinds])
  const items = useMemo(
    () => data.content.filter((c) => c.kind === kindId),
    [data.content, kindId],
  )

  const logFields = kind.fields.filter((f) => !ITEM_FIELDS.includes(f))

  const clearDraft = () => {
    setItemId(null)
    setPages('')
    setQuote('')
    setRating(null)
    setNote('')
  }

  const pickKind = (id: string) => {
    setKindId(id)
    setCreating(false)
    clearDraft()
  }

  const submit = () => {
    if (!itemId) return
    const p = Number(pages)
    const entry = {
      id: newId(),
      itemId,
      pages:
        !kind.fields.includes('pages') || pages.trim() === '' || !Number.isFinite(p) || p <= 0
          ? null
          : p,
      quote: kind.fields.includes('quote') ? quote.trim() : '',
      rating: kind.fields.includes('rating') ? rating : null,
      note: note.trim(),
      at: Date.now(),
    }
    // 아무 칸도 안 채웠으면 남길 게 없다. 작품만 고른 상태다.
    if (entry.pages === null && !entry.quote && entry.rating === null && !entry.note) return
    updateDay(date, (d) => ({ contentLogs: [entry, ...d.contentLogs] }))
    clearDraft()
  }

  const createItem = () => {
    if (!title.trim()) return
    const item = addContent(kindId, title, byline, url)
    setItemId(item.id)
    setTitle('')
    setByline('')
    setUrl('')
    setCreating(false)
  }

  const createKind = () => {
    const made = addContentKind(kindLabel, kindFields)
    if (!made) return
    setKindLabel('')
    setKindFields(['rating'])
    setAddingKind(false)
    pickKind(made.id)
  }

  const titles = [
    ...new Set(day.contentLogs.map((r) => itemById[r.itemId]?.title).filter(Boolean)),
  ]
  const summary =
    day.contentLogs.length === 0 ? (
      '—'
    ) : (
      <>
        {titles.slice(0, 2).join(', ') || `${day.contentLogs.length}개`}
        {titles.length > 2 && <span className="dim"> 외 {titles.length - 2}</span>}
      </>
    )

  return (
    <CollapsibleCard
      title="콘텐츠"
      mark="var(--brown)"
      filled={day.contentLogs.length > 0}
      // 보고 읽는 날보다 그렇지 않은 날이 많다. 매일 펼쳐 두면 지나치는 칸이 된다.
      alwaysCollapsed
      summary={summary}
    >
      <div className="chips" style={{ marginBottom: 14 }}>
        {kinds.map((k) => (
          <Chip
            key={k.id}
            active={k.id === kindId}
            color={CONTENT_COLORS[k.colorIndex % CONTENT_COLORS.length]}
            onClick={() => pickKind(k.id)}
          >
            {k.label}
          </Chip>
        ))}
        <button type="button" className="chip" onClick={() => setAddingKind((v) => !v)}>
          + 유형
        </button>
      </div>

      {addingKind && (
        <div className="stack kind-form">
          <input
            className="input"
            autoFocus
            placeholder="유형 이름 (예: 팟캐스트, 전시)"
            value={kindLabel}
            onChange={(e) => setKindLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') createKind()
            }}
          />
          <div className="field">
            <span className="field-label">무엇을 적을까요? (소감은 항상 있어요)</span>
            <div className="chips">
              {(Object.keys(CONTENT_FIELD_LABEL) as ContentField[]).map((f) => (
                <Chip
                  key={f}
                  active={kindFields.includes(f)}
                  onClick={() =>
                    setKindFields((prev) =>
                      prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f],
                    )
                  }
                >
                  {CONTENT_FIELD_LABEL[f]}
                </Chip>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn primary" onClick={createKind}>
              만들기
            </button>
            <button type="button" className="btn ghost" onClick={() => setAddingKind(false)}>
              취소
            </button>
          </div>
        </div>
      )}

      {creating ? (
        <div className="stack">
          <input
            className="input"
            autoFocus
            placeholder={`${kind.label} 제목`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            className="input"
            placeholder={`${kind.bylineLabel} (선택)`}
            value={byline}
            onChange={(e) => setByline(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !kind.fields.includes('url')) createItem()
            }}
          />
          {kind.fields.includes('url') && (
            <input
              className="input"
              type="url"
              inputMode="url"
              placeholder="영상 링크 (https://…)"
              aria-label="영상 링크"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') createItem()
              }}
            />
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn primary" onClick={createItem}>
              등록
            </button>
            <button type="button" className="btn ghost" onClick={() => setCreating(false)}>
              취소
            </button>
          </div>
        </div>
      ) : (
        <div className="person-scroll">
          {items.map((c) => {
            const active = itemId === c.id
            return (
              <button
                key={c.id}
                type="button"
                className="person-pill"
                aria-pressed={active}
                onClick={() => setItemId(active ? null : c.id)}
              >
                <span
                  className="avatar content"
                  data-selected={active}
                  style={{ background: PROFILE_COLORS[c.colorIndex % PROFILE_COLORS.length] }}
                >
                  {initial(c.title)}
                </span>
                <span className="name" style={{ color: active ? 'var(--ink)' : 'var(--ink-3)' }}>
                  {c.title}
                </span>
              </button>
            )
          })}
          <button type="button" className="person-pill" onClick={() => setCreating(true)}>
            <span
              className="avatar content"
              style={{
                background: 'var(--surface-2)',
                color: 'var(--ink-3)',
                border: '1.5px dashed var(--line-strong)',
              }}
            >
              <PlusIcon className="plus-sm" />
            </span>
            <span className="name" style={{ color: 'var(--ink-3)' }}>
              {kind.newLabel}
            </span>
          </button>
        </div>
      )}

      {itemId && !creating && (
        <div className="stack" style={{ marginTop: 12 }}>
          <LogFields
            fields={logFields}
            pages={pages}
            setPages={setPages}
            quote={quote}
            setQuote={setQuote}
            rating={rating}
            setRating={setRating}
          />
          <label className="field">
            <span className="field-label">{kind.noteLabel}</span>
            <textarea
              className="textarea"
              style={{ minHeight: 76 }}
              placeholder={kind.notePlaceholder}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="btn primary block"
            onClick={submit}
            disabled={!pages.trim() && !quote.trim() && rating === null && !note.trim()}
          >
            기록
          </button>
        </div>
      )}

      {day.contentLogs.length > 0 && (
        <div className="stack" style={{ marginTop: 14 }}>
          {day.contentLogs.map((r) => {
            const item = itemById[r.itemId]
            const itemKind = item ? kindById[item.kind] : undefined
            return (
              <div key={r.id} className="note-item">
                <button
                  type="button"
                  className="avatar sm content"
                  onClick={() => onOpenContent?.(r.itemId)}
                  style={{
                    background: item
                      ? PROFILE_COLORS[item.colorIndex % PROFILE_COLORS.length]
                      : 'var(--ink-3)',
                    cursor: onOpenContent ? 'pointer' : 'default',
                  }}
                  aria-label={`${item?.title ?? '알 수 없음'} 열기`}
                >
                  {initial(item?.title ?? '?')}
                </button>
                <div className="body">
                  <div style={{ fontSize: 13, fontWeight: 700 }}>
                    {item?.title ?? '삭제된 항목'}
                    {itemKind && (
                      <span
                        className="kind-tag"
                        style={{
                          background: CONTENT_COLORS[itemKind.colorIndex % CONTENT_COLORS.length],
                        }}
                      >
                        {itemKind.label}
                      </span>
                    )}
                    {r.pages !== null && <span className="dim"> · {r.pages}쪽</span>}
                    {r.rating !== null && <span className="dim"> · ★ {r.rating.toFixed(1)}</span>}
                  </div>
                  {r.quote && <p className="reading-quote">{r.quote}</p>}
                  {r.note && <p>{r.note}</p>}
                  {item?.url && (
                    <a className="content-link" href={item.url} target="_blank" rel="noreferrer">
                      링크 열기
                    </a>
                  )}
                </div>
                <button
                  type="button"
                  className="icon-btn plain"
                  aria-label="콘텐츠 기록 삭제"
                  onClick={() =>
                    updateDay(date, (d) => ({
                      contentLogs: d.contentLogs.filter((x) => x.id !== r.id),
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
    </CollapsibleCard>
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

// ── SNS 사용 시간 ────────────────────────────────────────────────────────────

/** 앱 하나의 시·분 입력. 스크린 타임이 '1시간 23분'으로 나오니 그대로 받는다. */
function ScreenTimeRow({
  app,
  minutes,
  onChange,
}: {
  app: (typeof SNS_APPS)[number]
  minutes: number | undefined
  onChange: (v: number | null) => void
}) {
  // 한 시간이 안 되면 시간 칸은 비워둔다. '0시간 45분'이 아니라 '45분'으로
  // 읽히는 게 자연스럽고, 두 칸을 다 비워 기록을 지우는 것도 가능해진다.
  // (시간 칸에 0이 남으면 분만 지워도 '0분 기록'으로 남아버린다.)
  const h = minutes === undefined || minutes < 60 ? '' : String(Math.floor(minutes / 60))
  const m = minutes === undefined ? '' : String(minutes % 60)

  const set = (hours: string, mins: string) => {
    if (hours === '' && mins === '') return onChange(null)
    const total = (Number(hours) || 0) * 60 + (Number(mins) || 0)
    onChange(Math.max(0, Math.min(24 * 60, total)))
  }

  return (
    <div className="num-row">
      <span className="num-name">
        <i style={{ background: app.color }} />
        {app.label}
      </span>
      <span className="num-inputs">
        <input
          className="input"
          type="number"
          inputMode="numeric"
          min={0}
          max={24}
          placeholder="0"
          aria-label={`${app.label} 시간`}
          value={h}
          onChange={(e) => set(e.target.value, m)}
        />
        <span className="num-unit">시간</span>
        <input
          className="input"
          type="number"
          inputMode="numeric"
          min={0}
          max={59}
          placeholder="0"
          aria-label={`${app.label} 분`}
          value={m}
          onChange={(e) => set(h, e.target.value)}
        />
        <span className="num-unit">분</span>
      </span>
    </div>
  )
}

export function ScreenTimeSection({ date }: SectionProps) {
  const { getDay, updateDay } = useStore()
  const day = getDay(date)
  const total = snsTotal(day)

  return (
    <CollapsibleCard
      title="SNS 사용 시간"
      mark="var(--purple)"
      filled={total !== null}
      summary={total === null ? '—' : formatMinutes(total)}
    >
      <div className="stack">
        {SNS_APPS.map((app) => (
          <ScreenTimeRow
            key={app.id}
            app={app}
            minutes={day.screenTime[app.id]}
            onChange={(v) =>
              updateDay(date, (d) => {
                const next = { ...d.screenTime }
                if (v === null) delete next[app.id]
                else next[app.id] = v
                return { screenTime: next }
              })
            }
          />
        ))}
      </div>
      {total !== null && (
        <p className="card-note" style={{ marginTop: 12, textAlign: 'right' }}>
          합계 <strong style={{ color: 'var(--ink)' }}>{formatMinutes(total)}</strong>
        </p>
      )}
    </CollapsibleCard>
  )
}
