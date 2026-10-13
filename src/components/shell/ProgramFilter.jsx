/**
 * Which program the plan grid emphasises, for a student who follows more than one: "All", or one program. The courses that do not serve
 * the chosen program are dimmed, never hidden, so the hours on a semester card still add up. Renders nothing for one program.
 *
 * Props: options [{ id, label }] (lib/programTags.js filterOptions), value (a program id or null for all), onChange(id | null)
 */
export default function ProgramFilter({ options = [], value = null, onChange }) {
  if (options.length < 2) return null
  const chips = [{ id: null, label: 'All' }, ...options]
  return (
    <div className="ds-prog-filter" role="group" aria-label="Show courses for one of your majors or minors">
      {chips.map(chip => {
        const on = String(chip.id) === String(value) || (chip.id === null && value === null)
        return (
          <button
            key={String(chip.id)}
            type="button"
            className={`ds-prog-chip${on ? ' ds-prog-chip-on' : ''}`}
            aria-pressed={on}
            onClick={() => onChange(chip.id)}
          >
            {chip.label}
          </button>
        )
      })}
    </div>
  )
}
