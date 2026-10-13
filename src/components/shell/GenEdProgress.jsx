import { formatRange } from '../../lib/genEdPanel'

// "Complete" is only for hours already earned: a category a later term would cover reads "Covered by plan".
const STATE_LABEL = {
  done:        'Complete',
  in_progress: 'In progress',
  planned:     'Covered by plan',
  open:        'Not covered',
  risk:        'At risk',
}

function Segments({ row }) {
  const pct = n => (row.max > 0 ? Math.min(100, (n / row.max) * 100) : 0)
  const done = pct(row.done)
  const current = Math.min(pct(row.inProgress), 100 - done)
  const planned = Math.min(pct(row.planned), 100 - done - current)
  return (
    <>
      <div className="ds-progress-done"    style={{ width: `${done}%` }} />
      <div className="ds-progress-current" style={{ width: `${current}%` }} />
      <div className="ds-progress-planned" style={{ width: `${planned}%` }} />
    </>
  )
}

function Row({ row }) {
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
        role="img"
        aria-label={`${row.label}: ${row.done} hours done, ${row.inProgress} in progress, ${row.planned} planned, of ${formatRange(row)}`}
      >
        <Segments row={row} />
      </div>
      {note && <p className="ds-gened-note">{note}</p>}
    </li>
  )
}

function summaryLine(panel) {
  if (panel.state === 'done') return 'Every general-education requirement is complete.'
  if (panel.state === 'in_progress' || panel.state === 'planned') {
    return `Your plan covers every requirement. ${panel.done} hours are earned so far; the rest depend on courses still ahead.`
  }
  return 'Counts prior credit and the courses you have placed in your plan. Hours in a future term are planned, not earned.'
}

export default function GenEdProgress({ panel }) {
  if (!panel) return null
  return (
    <section className="ds-gened" aria-labelledby="ds-gened-title">
      <h3 className="ds-h3" id="ds-gened-title">{panel.title}: {panel.earned} of {panel.required} hours covered</h3>
      <p className="ds-sub" style={{ maxWidth: '72ch', lineHeight: 1.6 }}>
        {summaryLine(panel)}
        {panel.flexNote && ` ${panel.flexNote}.`}
      </p>
      <p className="ds-gened-legend">
        <span className="ds-legend-done">{panel.done} earned</span>
        <span className="ds-sep">·</span>
        <span>{panel.inProgress} in progress</span>
        <span className="ds-sep">·</span>
        <span>{panel.planned} planned</span>
      </p>
      <ul className="ds-gened-list">
        {panel.rows.map(row => <Row key={row.key} row={row} />)}
      </ul>
    </section>
  )
}
