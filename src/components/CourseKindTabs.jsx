import { COURSE_KINDS } from '../lib/courseKinds'

// Undergraduate / Graduate / Placeholders switch for a course search. `counts` (optional) shows how many of
// the current matches fall in each kind, so a student can see that "Graduate (3)" holds what they typed.
export default function CourseKindTabs({ value, onChange, counts = null, more = false }) {
  return (
    <div className="kind-tabs" role="tablist" aria-label="Kind of course">
      {COURSE_KINDS.map(({ key, label }) => {
        const n = counts?.[key]
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={value === key}
            className={`kind-tab${value === key ? ' active' : ''}`}
            onClick={() => onChange(key)}
          >
            {label}
            {n != null && n > 0 && <span className="kind-tab-count">{n}{more ? '+' : ''}</span>}
          </button>
        )
      })}
    </div>
  )
}
