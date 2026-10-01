import { creditRange, validateHours } from '../lib/creditHours'

// "How many credit hours?" for a course that carries a range (a 1-4 hour topics course). The parent keeps
// the value as a string so a half-typed number is not clamped under the student's cursor; it is valid when
// validateHours(course, value) is null. Renders nothing for a fixed-credit course.
export default function CreditHoursField({ course, value, onChange, idPrefix = 'hours' }) {
  const { min, max, variable } = creditRange(course)
  if (!variable) return null
  const error = value === '' ? null : validateHours(course, value)
  const inputId = `${idPrefix}-${course.code}`
  return (
    <div className="hours-field">
      <label className="hours-field-label" htmlFor={inputId}>
        Credit hours <span className="hours-field-range">{min}–{max}</span>
      </label>
      <input
        id={inputId}
        className={`hours-field-input${error ? ' hours-field-input-error' : ''}`}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (['e', 'E', '+', '-', '.'].includes(e.key)) e.preventDefault() }}
        aria-invalid={!!error}
      />
      {error && <p className="hours-field-error">{error}</p>}
    </div>
  )
}
