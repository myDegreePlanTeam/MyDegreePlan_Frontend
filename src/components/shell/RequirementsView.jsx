import GenEdProgress from './GenEdProgress'

// State words and marks. The mark and the word carry the state, never the colour alone.
const STATES = {
  done:        { mark: '✓', label: 'Done' },
  in_progress: { mark: '◐', label: 'In progress' },
  planned:     { mark: '○', label: 'Planned' },
  not_placed:  { mark: '–', label: 'Not placed' },
}

function Summary({ summary }) {
  const { total, done, inProgress, planned, remaining, donePct, inProgressPct, plannedPct } = summary
  return (
    <section className="ds-audit-summary" aria-label="Degree progress">
      <p className="ds-audit-total">
        <strong>{done + inProgress + planned}</strong> of {total} hours are done or placed in your plan
      </p>
      <div
        className="ds-progress-track"
        role="img"
        aria-label={`${done} hours done, ${inProgress} in progress, ${planned} planned, ${remaining} not yet placed, of ${total}`}
      >
        <div className="ds-progress-done"      style={{ width: `${donePct}%` }} />
        <div className="ds-progress-current"   style={{ width: `${inProgressPct}%` }} />
        <div className="ds-progress-planned"   style={{ width: `${plannedPct}%` }} />
      </div>
      <div className="ds-progress-legend">
        <span className="ds-legend-done">{done} done</span>
        <span className="ds-sep">·</span>
        <span>{inProgress} in progress</span>
        <span className="ds-sep">·</span>
        <span>{planned} planned</span>
        <span className="ds-sep">·</span>
        <span>{remaining} not yet placed</span>
      </div>
    </section>
  )
}

function RowBody({ row }) {
  const state = STATES[row.state]
  const where = row.source === 'prior_credit'
    ? `Prior credit${row.sourceLabel ? ` (${row.sourceLabel})` : ''}`
    : row.term
  return (
    <>
      <span className="ds-audit-mark" aria-hidden="true">{state.mark}</span>
      <span className="ds-audit-main">
        <span className="ds-audit-title">
          {row.code ? <span className="ds-audit-code">{row.code}</span> : null}
          <span className="ds-audit-name">{row.code ? row.name : row.label}</span>
        </span>
        <span className="ds-audit-meta">
          <span className={`ds-audit-state ds-audit-state-${row.state}`}>{state.label}</span>
          {where && <span>{where}</span>}
          {row.required && <span className="ds-audit-tag">Required</span>}
          {row.choose && <span className="ds-audit-tag">{row.choose}</span>}
          {row.hours > 0 && <span>{row.hours} hrs</span>}
        </span>
      </span>
    </>
  )
}

function Row({ row, onOpenRow }) {
  // A row covered by prior credit is not on the grid, so there is nothing to open.
  if (row.source === 'prior_credit') {
    return <li className={`ds-audit-row ds-audit-${row.state}`}><div className="ds-audit-line"><RowBody row={row} /></div></li>
  }
  return (
    <li className={`ds-audit-row ds-audit-${row.state}`}>
      <button type="button" className="ds-audit-line ds-audit-open" onClick={() => onOpenRow(row)}>
        <RowBody row={row} />
        <span className="ds-audit-go" aria-hidden="true">{row.state === 'not_placed' ? 'Choose ›' : 'View ›'}</span>
      </button>
    </li>
  )
}

function Block({ block, onOpenRow }) {
  const { counts, total } = block
  return (
    <section className={`ds-audit-block${block.complete ? ' ds-audit-block-done' : ''}`} aria-labelledby={`ds-audit-${block.id}`}>
      <div className="ds-audit-block-head">
        <h3 className="ds-h3" id={`ds-audit-${block.id}`}>{block.title}</h3>
        {total > 0 && (
          <span className="ds-audit-count">
            {block.complete ? '✓ ' : ''}{counts.done} of {total} done
          </span>
        )}
      </div>
      {block.panel && <GenEdProgress panel={block.panel} />}
      {block.rows.length > 0 && (
        <ul className="ds-audit-list">
          {block.rows.map(row => <Row key={row.key} row={row} onOpenRow={onOpenRow} />)}
        </ul>
      )}
    </section>
  )
}

export default function RequirementsView({ audit, onOpenRow }) {
  return (
    <div className="ds-view ds-requirements">
      <p className="ds-eyebrow">Requirements</p>
      <h2 className="ds-h2">Degree audit</h2>
      <p className="ds-sub" style={{ maxWidth: '72ch', lineHeight: 1.6 }}>
        Every requirement of your degree program, read from your plan and prior credit. A course in a past term counts as done, one in
        the current term as in progress, and one in a later term as planned. Select a row to see it on your plan.
      </p>

      <Summary summary={audit.summary} />

      {audit.blocks.length === 0 ? (
        <div className="ds-empty-state">This plan has no requirements to show yet.</div>
      ) : (
        audit.blocks.map(block => <Block key={block.id} block={block} onOpenRow={onOpenRow} />)
      )}
    </div>
  )
}
