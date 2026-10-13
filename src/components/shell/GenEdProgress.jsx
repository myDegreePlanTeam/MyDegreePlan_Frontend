import { formatRange } from '../../lib/genEdPanel'
import { CATEGORY_STATES } from '../../lib/auditLabels'

const STATE_LABEL = CATEGORY_STATES

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

// One category of a gen-ed program: its hours against the range, in what has happened, what is under way and what is planned.
export function CategoryProgress({ row }) {
  // An exempt category owes no hours: a word, no bar.
  if (row.exempt) {
    return (
      <div className="ds-gened-progress ds-gened-exempt">
        <div className="ds-gened-top">
          <span className="ds-gened-hours">Not required for your major</span>
          <span className="ds-gened-state">{STATE_LABEL.exempt}</span>
        </div>
      </div>
    )
  }
  return (
    <div className={`ds-gened-progress ds-gened-${row.state}`}>
      <div className="ds-gened-top">
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
      {row.state === 'risk' && (
        <p className="ds-gened-note">The open general-education slots cannot cover what is still needed.</p>
      )}
    </div>
  )
}

function summaryLine(panel) {
  if (panel.state === 'done') return 'Every general-education requirement is complete.'
  if (panel.state === 'in_progress' || panel.state === 'planned') {
    return `Your plan covers every requirement. ${panel.done} hours are earned so far; the rest depend on courses still ahead.`
  }
  return 'Counts prior credit and the courses you have placed in your plan. Hours in a future term are planned, not earned.'
}

// The program's own total, shown once under the General education heading.
export default function GenEdSummary({ panel }) {
  if (!panel) return null
  return (
    <div className="ds-gened-summary">
      <p className="ds-gened-headline">{panel.title}: {panel.earned} of {panel.required} hours covered</p>
      <p className="ds-sub" style={{ maxWidth: '72ch', lineHeight: 1.6 }}>
        {summaryLine(panel)}
        {panel.flexNote && ` ${panel.flexNote}.`}
      </p>
      {panel.exemptions.length > 0 && (
        <p className="ds-sub" style={{ maxWidth: '72ch', lineHeight: 1.6 }}>
          Exempt for your major: {panel.exemptions.map(e => `${e.label} (${e.hours} hrs)`).join(', ')}. The catalog's general
          requirements excuse Chemical, Civil, Computer, Electrical, General and Mechanical Engineering majors from American
          History. Confirm with your advisor.
        </p>
      )}
      <p className="ds-gened-legend">
        <span className="ds-legend-done">{panel.done} earned</span>
        <span className="ds-sep">·</span>
        <span>{panel.inProgress} in progress</span>
        <span className="ds-sep">·</span>
        <span>{panel.planned} planned</span>
      </p>
    </div>
  )
}
