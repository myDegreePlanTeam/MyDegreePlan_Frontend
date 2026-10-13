import { useState } from 'react'
import { formatMissingForDisplay } from '../../lib/poolResolver'
import GenEdSummary, { CategoryProgress } from './GenEdProgress'

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

function whereOf(row) {
  return row.source === 'prior_credit' ? `Prior credit${row.sourceLabel ? ` (${row.sourceLabel})` : ''}` : row.term
}

function RowBody({ row }) {
  const state = STATES[row.state]
  const where = whereOf(row)
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
          {row.choose && <span className="ds-audit-tag">{row.choose}</span>}
          {row.alsoCounts && <span className="ds-audit-tag">Also counts for {row.alsoCounts}</span>}
          {row.hours > 0 && <span>{row.hours} hrs</span>}
        </span>
      </span>
    </>
  )
}

const OPTION_STATUS = { available: 'Available', locked: 'Not yet', taken: 'Already in your plan' }

// Why a course cannot go in this slot yet, in the picker's own words.
function lockedReason(option) {
  if (option.limitHint) return option.limitHint
  if (option.standingHint) return option.standingHint
  if (option.removedNote) return option.removedNote
  if (option.missing?.length) return `Needs ${formatMissingForDisplay(option.missing)} in an earlier term`
  return null
}

// What else could fill a choice. Read-only: a plan changes on the plan, so this only explains and points there.
function Options({ row, getOptions }) {
  const [options, setOptions] = useState(null)
  const open = options !== null
  const count = row.optionCount

  function toggle() {
    setOptions(prev => (prev === null ? getOptions(row) ?? { open: false, options: [], notice: null } : null))
  }

  return (
    <div className="ds-audit-options">
      <button type="button" className="ds-audit-options-toggle" aria-expanded={open} onClick={toggle}>
        {open ? 'Hide options' : row.code ? `Other options (${count})` : `See the ${count} options`}
      </button>
      {open && (
        <div className="ds-audit-options-body">
          {options.notice && <p className="ds-audit-options-note">{options.notice}</p>}
          <ul className="ds-audit-options-list">
            {options.options.map(option => (
              <li key={option.code} className={`ds-audit-option ds-audit-option-${option.status}`}>
                <span className="ds-audit-option-main">
                  <span className="ds-audit-code">{option.code}</span>
                  <span className="ds-audit-name">{option.name}</span>
                  <span className="ds-audit-option-hours">{option.credits} hrs</span>
                </span>
                <span className="ds-audit-option-status">
                  {option.code === row.code ? 'Your pick' : OPTION_STATUS[option.status]}
                </span>
                {option.status === 'locked' && lockedReason(option) && (
                  <span className="ds-audit-option-why">{lockedReason(option)}</span>
                )}
              </li>
            ))}
          </ul>
          <p className="ds-audit-options-note">To choose, open this row on your plan.</p>
        </div>
      )}
    </div>
  )
}

// A Free Elective, or any pool that takes any course in the catalog, has no short list to show.
const hasOptions = row => row.optionCount > 0 && row.source !== 'prior_credit' && typeof row.key === 'number'

// One row style everywhere. A fixed course is a requirement with nothing to choose, so its row is one line.
function Row({ row, onOpenRow, getOptions }) {
  const cls = `ds-audit-row ds-audit-${row.state}${row.required ? ' ds-audit-compact' : ''}`
  // A row covered by prior credit is not on the grid, so there is nothing to open.
  if (row.source === 'prior_credit') {
    return <li className={cls}><div className="ds-audit-line"><RowBody row={row} /></div></li>
  }
  return (
    <li className={cls}>
      <button type="button" className="ds-audit-line ds-audit-open" onClick={() => onOpenRow(row)}>
        <RowBody row={row} />
        <span className="ds-audit-go" aria-hidden="true">{row.state === 'not_placed' ? 'Choose ›' : 'View ›'}</span>
      </button>
      {hasOptions(row) && <Options row={row} getOptions={getOptions} />}
    </li>
  )
}

// A major course that also counts toward this category: listed once, in the major, and pointed at from here.
function Ref({ item, onOpenRow }) {
  const state = STATES[item.state]
  const where = whereOf(item)
  const body = (
    <>
      <span className="ds-audit-mark" aria-hidden="true">{state.mark}</span>
      <span className="ds-audit-main">
        <span className="ds-audit-title">
          <span className="ds-audit-code">{item.code}</span>
          {item.name && <span className="ds-audit-name">{item.name}</span>}
        </span>
        <span className="ds-audit-meta">
          <span className={`ds-audit-state ds-audit-state-${item.state}`}>{state.label}</span>
          {where && <span>{where}</span>}
          <span className="ds-audit-tag">Counted from your major</span>
        </span>
      </span>
    </>
  )
  return (
    <li className={`ds-audit-row ds-audit-ref ds-audit-${item.state}`}>
      {item.source === 'prior_credit'
        ? <div className="ds-audit-line">{body}</div>
        : <button type="button" className="ds-audit-line ds-audit-open" onClick={() => onOpenRow(item)}>{body}</button>}
    </li>
  )
}

function Group({ group, onOpenRow, getOptions }) {
  const compact = group.rows.length > 0 && group.rows.every(r => r.required)
  const done = group.rows.filter(r => r.state === 'done').length
  const empty = group.progress && group.rows.length === 0 && group.refs.length === 0
  return (
    <section className="ds-audit-group" aria-label={group.title}>
      <div className="ds-audit-group-head">
        <h4 className="ds-audit-group-title">{group.title}</h4>
        {!group.progress && group.rows.length > 0 && (
          <span className="ds-audit-count">{done} of {group.rows.length} done</span>
        )}
      </div>
      {group.progress && <CategoryProgress row={group.progress} />}
      {(group.rows.length > 0 || group.refs.length > 0) && (
        <ul className={`ds-audit-list${compact ? ' ds-audit-list-compact' : ''}`}>
          {group.refs.map(item => <Ref key={`ref-${item.key}`} item={item} onOpenRow={onOpenRow} />)}
          {group.rows.map(row => <Row key={row.key} row={row} onOpenRow={onOpenRow} getOptions={getOptions} />)}
        </ul>
      )}
      {empty && <p className="ds-audit-empty">Nothing in your plan counts toward this yet.</p>}
    </section>
  )
}

function Block({ block, onOpenRow, getOptions }) {
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
      {block.panel && <GenEdSummary panel={block.panel} />}
      {block.groups.map(group => <Group key={group.id} group={group} onOpenRow={onOpenRow} getOptions={getOptions} />)}
    </section>
  )
}

export default function RequirementsView({ audit, onOpenRow, getOptions }) {
  return (
    <div className="ds-view ds-requirements">
      <p className="ds-eyebrow">Requirements</p>
      <h2 className="ds-h2">Degree audit</h2>
      <p className="ds-sub" style={{ maxWidth: '72ch', lineHeight: 1.6 }}>
        Every requirement of your degree program, read from your plan and prior credit: your major, general education, then
        electives. A course in a past term counts as done, one in the current term as in progress, and one in a later term as
        planned. To change anything, select a row to open it on your plan.
      </p>

      <Summary summary={audit.summary} />

      {audit.blocks.length === 0 ? (
        <div className="ds-empty-state">This plan has no requirements to show yet.</div>
      ) : (
        audit.blocks.map(block => <Block key={block.id} block={block} onOpenRow={onOpenRow} getOptions={getOptions} />)
      )}
    </div>
  )
}
