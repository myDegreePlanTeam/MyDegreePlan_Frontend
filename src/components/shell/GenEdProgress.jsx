import { formatRange } from '../../lib/genEdPanel'

const STATE_LABEL = { done: 'Met', risk: 'At risk', open: 'In progress' }

function Row({ row }) {
  const pct = row.max > 0 ? Math.min(100, Math.round((row.earned / row.max) * 100)) : 0
  const note = row.state === 'risk' ? 'The open general-education slots cannot cover what is still needed.' : null
  return (
    <li className={`ds-gened-row ds-gened-${row.state}`}>
      <div className="ds-gened-top">
        <span className="ds-gened-label">{row.label}</span>
        <span className="ds-gened-hours">{row.earned} of {formatRange(row)} hrs</span>
        <span className="ds-gened-state">{STATE_LABEL[row.state]}</span>
      </div>
      <div
        className="ds-gened-track"
        role="progressbar"
        aria-label={row.label}
        aria-valuemin={0}
        aria-valuemax={row.max}
        aria-valuenow={row.earned}
      >
        <div className="ds-gened-fill" style={{ width: `${pct}%` }} />
      </div>
      {note && <p className="ds-gened-note">{note}</p>}
    </li>
  )
}

export default function GenEdProgress({ panel }) {
  if (!panel) return null
  return (
    <section className="ds-gened" aria-labelledby="ds-gened-title">
      <h3 className="ds-h3" id="ds-gened-title">{panel.title}: {panel.earned} of {panel.required} hours</h3>
      <p className="ds-sub" style={{ maxWidth: '72ch', lineHeight: 1.6 }}>
        {panel.satisfied
          ? 'Every general-education requirement is covered by your plan and prior credit.'
          : 'Counts prior credit and the courses you have placed in your plan.'}
        {panel.flexNote && ` ${panel.flexNote}.`}
      </p>
      <ul className="ds-gened-list">
        {panel.rows.map(row => <Row key={row.key} row={row} />)}
      </ul>
    </section>
  )
}
