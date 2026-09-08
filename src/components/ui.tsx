import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CheckIcon, CloseIcon } from './icons'
import type { Level } from '../lib/types'

export function Card({
  title,
  mark,
  note,
  action,
  className = '',
  children,
}: {
  title?: ReactNode
  mark?: string
  note?: ReactNode
  action?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <header className="card-head">
          <h2 className="card-title">
            {mark && <i className="mark" style={{ background: mark }} />}
            {title}
          </h2>
          {action ?? (note ? <span className="card-note">{note}</span> : null)}
        </header>
      )}
      {children}
    </section>
  )
}

/**
 * 값이 채워지면 한 줄로 접히는 카드.
 * 매일 같은 항목을 다 펼쳐두면 화면이 금방 길어져서, 이미 적은 것은
 * 요약만 보여주고 누를 때 다시 펼친다.
 */
export function CollapsibleCard({
  title,
  mark,
  summary,
  filled,
  children,
}: {
  title: ReactNode
  mark?: string
  /** 접혔을 때 보여줄 한 줄 요약 */
  summary: ReactNode
  /** 이미 값이 있는지. 처음 그릴 때 접을지 정하는 기준이다. */
  filled: boolean
  children: ReactNode
}) {
  // 처음 그릴 때만 판단한다. 적는 도중에 접히면 오히려 방해가 된다.
  const [expanded, setExpanded] = useState(!filled)

  return (
    <section className="card" data-collapsed={!expanded}>
      <button
        type="button"
        className="collapse-head"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        <h2 className="card-title">
          {mark && <i className="mark" style={{ background: mark }} />}
          {title}
        </h2>
        {!expanded && <span className="collapse-summary">{summary}</span>}
        <ChevronIcon className="collapse-chevron" />
      </button>
      {expanded && <div className="collapse-body">{children}</div>}
    </section>
  )
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      width="1em"
      height="1em"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

export function Chip({
  active,
  onClick,
  color,
  children,
}: {
  active: boolean
  onClick: () => void
  color?: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className={color ? 'chip tinted' : 'chip'}
      aria-pressed={active}
      onClick={onClick}
      style={color ? ({ '--chip-color': color } as React.CSSProperties) : undefined}
    >
      {color && <i className="dot" />}
      {children}
    </button>
  )
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  tones,
}: {
  options: { value: T; label: string }[]
  value: T | null
  onChange: (v: T | null) => void
  tones?: Record<string, string>
}) {
  return (
    <div className="seg" role="group">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className="seg-btn"
          aria-pressed={value === o.value}
          data-tone={tones?.[o.value]}
          // 같은 값을 다시 누르면 선택 해제 — 잘못 누른 걸 되돌릴 수 있게.
          onClick={() => onChange(value === o.value ? null : o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function ScaleInput({
  value,
  onChange,
  color,
  low,
  high,
  labels,
}: {
  value: Level | null
  onChange: (v: Level | null) => void
  color?: string
  low?: string
  high?: string
  labels?: string[]
}) {
  return (
    <div>
      <div className="scale">
        {([1, 2, 3, 4, 5] as Level[]).map((n) => (
          <button
            key={n}
            type="button"
            className="scale-btn"
            aria-pressed={value === n}
            aria-label={labels?.[n - 1] ?? String(n)}
            style={color ? ({ '--scale-color': color } as React.CSSProperties) : undefined}
            onClick={() => onChange(value === n ? null : n)}
          >
            {labels ? labels[n - 1] : n}
          </button>
        ))}
      </div>
      {(low || high) && (
        <div className="scale-legend">
          <span>{low}</span>
          <span>{high}</span>
        </div>
      )}
    </div>
  )
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      className="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
    >
      <i />
    </button>
  )
}

export function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="checkbox"
      className="check"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
    >
      {checked && <CheckIcon />}
    </button>
  )
}

export function Sheet({
  title,
  subtitle,
  onClose,
  headExtra,
  children,
}: {
  title: ReactNode
  subtitle?: ReactNode
  onClose: () => void
  headExtra?: ReactNode
  children: ReactNode
}) {
  const scrimRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return (
    <div
      className="scrim"
      ref={scrimRef}
      onMouseDown={(e) => {
        if (e.target === scrimRef.current) onClose()
      }}
    >
      <div className="sheet" role="dialog" aria-modal="true" aria-label={String(title)}>
        <div className="grabber" />
        <header className="sheet-head">
          <div style={{ minWidth: 0 }}>
            <div className="sheet-title">{title}</div>
            {subtitle && <div className="sheet-sub">{subtitle}</div>}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {headExtra}
            <button type="button" className="icon-btn" onClick={onClose} aria-label="닫기">
              <CloseIcon />
            </button>
          </div>
        </header>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>
}

/** 사람 이름의 첫 글자(한글은 한 글자, 영문은 대문자)를 아바타에 쓴다. */
export function initial(name: string): string {
  const t = name.trim()
  if (!t) return '?'
  return t[0].toUpperCase()
}
