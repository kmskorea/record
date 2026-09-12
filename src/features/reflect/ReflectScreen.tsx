import { useMemo, useState } from 'react'
import { Card, Empty } from '../../components/ui'
import { PlusIcon } from '../../components/icons'
import { useStore } from '../../lib/store'
import { formatRelative, toKey } from '../../lib/date'
import { THOUGHT_LEVELS, THOUGHT_LEVEL, type Thought, type ThoughtLevel } from '../../lib/types'
import { ThoughtSheet } from './ThoughtSheet'

/** 단락·글이 품고 있는 것의 수. 겉으로 보이는 '쌓인 양'이다. */
function countChildren(thoughts: Thought[], id: string): number {
  return thoughts.filter((t) => t.parentId === id).length
}

export function ReflectScreen() {
  const { data, addThought, groupThoughts, setThoughtParent } = useStore()
  const [draft, setDraft] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [attaching, setAttaching] = useState(false)

  const thoughts = data.thoughts

  /** 아직 아무 데도 안 묶인 것만 목록에 세운다. 묶인 것은 그 안에서 본다. */
  const loose = useMemo(() => {
    const byLevel: Record<ThoughtLevel, Thought[]> = {
      sentence: [],
      paragraph: [],
      essay: [],
    }
    for (const t of thoughts) {
      if (t.parentId === null) byLevel[t.level].push(t)
    }
    for (const list of Object.values(byLevel)) list.sort((a, b) => b.createdAt - a.createdAt)
    return byLevel
  }, [thoughts])

  const selectedLevel = useMemo(() => {
    const first = thoughts.find((t) => t.id === selected[0])
    return first?.level ?? null
  }, [thoughts, selected])

  const up = selectedLevel ? THOUGHT_LEVEL[selectedLevel].up : null

  const toggle = (t: Thought) => {
    setAttaching(false)
    setSelected((prev) => {
      if (prev.includes(t.id)) return prev.filter((x) => x !== t.id)
      // 단계가 다른 것을 고르면 새로 시작한다. 섞어서는 올릴 단계를 정할 수 없다.
      if (selectedLevel && selectedLevel !== t.level) return [t.id]
      return [...prev, t.id]
    })
  }

  const clear = () => {
    setSelected([])
    setAttaching(false)
  }

  const submitDraft = () => {
    if (addThought(draft)) setDraft('')
  }

  const group = () => {
    if (!up) return
    const label = THOUGHT_LEVEL[up].label
    const title = prompt(`${label} 이름`, '')
    if (title === null) return
    const made = groupThoughts(selected, title)
    clear()
    if (made) setOpenId(made.id)
  }

  const attach = (parentId: string) => {
    for (const id of selected) setThoughtParent(id, parentId)
    clear()
    setOpenId(parentId)
  }

  const total = thoughts.length

  return (
    <div className="screen">
      <header className="screen-head">
        <div>
          <h1 className="screen-title">
            반추
            <span className="dim">단상에서 사유로</span>
          </h1>
          <p className="screen-sub">
            지나가는 문장을 모아 단락으로, 단락을 엮어 글로. 재료가 된 것은 그대로 남습니다.
          </p>
        </div>
      </header>

      <Card title="지나가는 생각" mark={THOUGHT_LEVEL.sentence.color} note="한 줄로">
        <div className="input-row">
          <input
            className="input"
            placeholder="지금 스친 생각"
            aria-label="새 문장"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitDraft()
            }}
          />
          <button type="button" className="icon-btn" onClick={submitDraft} aria-label="문장 추가">
            <PlusIcon />
          </button>
        </div>
        {total === 0 && (
          <p className="card-note" style={{ marginTop: 10 }}>
            다듬을 생각이 없어도 괜찮습니다. 스친 문장을 그대로 적어두면 나중에 여기서 자랍니다.
          </p>
        )}
      </Card>

      {THOUGHT_LEVELS.map((level) => {
        const list = loose[level.id]
        if (list.length === 0) return null
        return (
          <div key={level.id}>
            <div className="section-label">
              {level.label} {list.length}
            </div>
            <div className="stack">
              {list.map((t) => {
                const active = selected.includes(t.id)
                const children = countChildren(thoughts, t.id)
                return (
                  <div key={t.id} className="thought" data-selected={active}>
                    <button
                      type="button"
                      className="thought-pick"
                      aria-pressed={active}
                      aria-label={`${t.title || t.text} 고르기`}
                      style={{ '--level-color': level.color } as React.CSSProperties}
                      onClick={() => toggle(t)}
                    />
                    <button
                      type="button"
                      className="thought-body"
                      onClick={() => (level.id === 'sentence' ? toggle(t) : setOpenId(t.id))}
                    >
                      {t.title && <span className="thought-title">{t.title}</span>}
                      {(t.text || !t.title) && <span className="thought-text">{t.text}</span>}
                      <span className="thought-meta">
                        {formatRelative(toKey(new Date(t.createdAt)))}
                        {children > 0 && ` · ${children}개 품음`}
                      </span>
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {total === 0 && (
        <Card>
          <Empty>아직 적어둔 생각이 없어요.</Empty>
        </Card>
      )}

      {selected.length > 0 && (
        <div className="pick-bar">
          {attaching ? (
            <>
              <span className="pick-count">어디에 넣을까요?</span>
              <div className="pick-targets">
                {loose[up ?? 'paragraph']
                  .concat(
                    // 이미 글에 들어간 단락에도 넣을 수 있어야 한다
                    thoughts.filter((t) => t.level === up && t.parentId !== null),
                  )
                  .map((target) => (
                    <button
                      key={target.id}
                      type="button"
                      className="chip"
                      onClick={() => attach(target.id)}
                    >
                      {target.title || target.text.slice(0, 12) || '이름 없음'}
                    </button>
                  ))}
                {loose[up ?? 'paragraph'].length === 0 &&
                  !thoughts.some((t) => t.level === up && t.parentId !== null) && (
                    <span className="pick-count dim">넣을 곳이 아직 없어요</span>
                  )}
              </div>
              <button type="button" className="btn ghost sm" onClick={() => setAttaching(false)}>
                뒤로
              </button>
            </>
          ) : (
            <>
              <span className="pick-count">{selected.length}개 골랐습니다</span>
              {up && (
                <>
                  <button type="button" className="btn primary sm" onClick={group}>
                    새 {THOUGHT_LEVEL[up].label}으로
                  </button>
                  <button type="button" className="btn ghost sm" onClick={() => setAttaching(true)}>
                    기존 {THOUGHT_LEVEL[up].label}에
                  </button>
                </>
              )}
              {!up && <span className="pick-count dim">글은 더 올라갈 곳이 없어요</span>}
              <button type="button" className="btn ghost sm" onClick={clear}>
                해제
              </button>
            </>
          )}
        </div>
      )}

      {openId && <ThoughtSheet id={openId} onClose={() => setOpenId(null)} onOpen={setOpenId} />}
    </div>
  )
}
