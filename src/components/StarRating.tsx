import { SCORE_STEPS, scoreStep } from '../lib/metrics'

function StarShape({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="m12 2.6 2.9 6.1 6.6.9-4.8 4.7 1.2 6.6-5.9-3.2-5.9 3.2 1.2-6.6L2.5 9.6l6.6-.9z" />
    </svg>
  )
}

/**
 * 영화 평점처럼 0~5점을 0.5 단위로 매긴다.
 * 별 하나의 좌/우 절반이 각각 0.5점씩이다.
 */
export function StarRating({
  value,
  onChange,
  label = '하루 점수',
  hint = '별을 눌러 오늘을 매겨보세요',
}: {
  value: number | null
  onChange: (v: number | null) => void
  /** 스크린리더에 읽히는 이름. 영화 별점처럼 다른 데도 쓴다 */
  label?: string
  /** 아직 안 매겼을 때 아래에 뜨는 안내 */
  hint?: string
}) {
  const shown = value ?? 0
  const step = value === null ? null : scoreStep(value)

  return (
    <div className="rating">
      <div className="rating-row">
        <div className="stars" role="group" aria-label={label}>
          {[1, 2, 3, 4, 5].map((i) => {
            const fill = Math.max(0, Math.min(1, shown - (i - 1)))
            return (
              <span className="star" key={i}>
                <StarShape className="star-bg" />
                <span className="star-fill" style={{ width: `${fill * 100}%` }}>
                  <StarShape />
                </span>
                <button
                  type="button"
                  className="star-hit left"
                  aria-label={`${i - 0.5}점`}
                  onClick={() => onChange(value === i - 0.5 ? null : i - 0.5)}
                />
                <button
                  type="button"
                  className="star-hit right"
                  aria-label={`${i}점`}
                  onClick={() => onChange(value === i ? null : i)}
                />
              </span>
            )
          })}
        </div>

        <span
          className="rating-value"
          style={
            step
              ? { background: step.bg, color: step.ink, borderColor: 'var(--line-strong)' }
              : undefined
          }
        >
          {value === null ? '—' : value.toFixed(1)}
        </span>
      </div>

      <div className="rating-legend">
        <span>{value === null ? hint : (scoreStep(shown).label || ' ')}</span>
        {value !== null && (
          <button type="button" className="link-btn" onClick={() => onChange(null)}>
            지우기
          </button>
        )}
      </div>
    </div>
  )
}

/** 달력 아래 범례에 쓰는 0~5 색 띠. */
export function ScoreScaleLegend() {
  return (
    <div className="scale-strip" aria-hidden="true">
      {SCORE_STEPS.map((s) => (
        <i key={s.value} style={{ background: s.bg }} title={`${s.value}점`} />
      ))}
    </div>
  )
}
