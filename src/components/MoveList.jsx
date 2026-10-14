// The term list of the course details: one radio per term, so the choice is plain without colour. `targets` come from DegreePlan
// (the same checks as drag-and-drop): a term the course cannot go to is disabled and says why in its note.
export default function MoveList({ targets, chosen, onChoose, labelledBy }) {
  return (
    <div className="ds-move-list" role="radiogroup" aria-labelledby={labelledBy}>
      {targets.map(t => (
        <label
          key={t.semNum}
          className={`ds-move${t.isHere ? ' ds-move-current' : ''}${t.disabled ? ' ds-move-disabled' : ''}${chosen === t.semNum ? ' ds-move-chosen' : ''}`}
          title={t.reason ?? undefined}
        >
          <input
            type="radio" name="ds-move-term" className="ds-move-radio"
            checked={t.isHere || chosen === t.semNum} disabled={t.disabled}
            onChange={() => onChoose(t.semNum)}
          />
          <span className="ds-move-name">{t.name}</span>
          <span className={`ds-move-note ds-move-note-${t.tone}`}>{t.note}</span>
        </label>
      ))}
    </div>
  )
}
