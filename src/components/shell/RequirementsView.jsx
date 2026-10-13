import { useState } from 'react'
import { formatMissingForDisplay } from '../../lib/poolResolver'
import GenEdSummary, { CategoryProgress } from './GenEdProgress'
import { ROW_STATES } from '../../lib/auditLabels'
import { describeFinish, describeBlockDates } from '../../lib/degreeProjection'

const STATES = ROW_STATES

function Summary({ summary }) {
  const { requirements: r, total, done, inProgress, planned } = summary
  const all = r.done + r.in_progress + r.planned + r.not_placed
  const placed = all - r.not_placed
  const pct = n => (all > 0 ? (n / all) * 100 : 0)
  return (
    <section className="ds-audit-summary" aria-label="Requirements progress">
      <p className="ds-audit-total">
        <strong>{placed}</strong> of {all} requirements are done or placed in your plan
        {r.not_placed > 0 && <>; <strong>{r.not_placed}</strong> {r.not_placed === 1 ? 'choice is' : 'choices are'} still open</>}
      </p>
      <div
        className="ds-progress-track"
        role="img"
        aria-label={`${r.done} requirements done, ${r.in_progress} in progress, ${r.planned} planned, ${r.not_placed} still open, of ${all}`}
      >
        <div className="ds-progress-done"    style={{ width: `${pct(r.done)}%` }} />
        <div className="ds-progress-current" style={{ width: `${pct(r.in_progress)}%` }} />
        <div className="ds-progress-planned" style={{ width: `${pct(r.planned)}%` }} />
      </div>
      <div className="ds-progress-legend">
        <span className="ds-legend-done">{r.done} done</span>
        <span className="ds-sep">·</span>
        <span>{r.in_progress} in progress</span>
        <span className="ds-sep">·</span>
        <span>{r.planned} planned</span>
        <span className="ds-sep">·</span>
        <span>{r.not_placed} open</span>
      </div>
      <p className="ds-audit-hours">
        In hours: {done} done, {inProgress} in progress and {planned} planned, of the {total} your degree needs.
      </p>
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
          {row.sourceNote && <span className="ds-audit-note">{row.sourceNote}</span>}
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
          {item.note && <span className="ds-audit-note">{item.note}</span>}
          {item.hours > 0 && <span>{item.hours} hrs</span>}
          <span className="ds-audit-tag">{item.label}</span>
        </span>
      </span>
    </>
  )
  return (
    <li className={`ds-audit-row ds-audit-ref ds-audit-${item.state}`}>
      {item.key == null
        ? <div className="ds-audit-line">{body}</div>
        : <button type="button" className="ds-audit-line ds-audit-open" onClick={() => onOpenRow(item)}>{body}</button>}
    </li>
  )
}

function Group({ group, onOpenRow, getOptions }) {
  const compact = group.rows.length > 0 && group.rows.every(r => r.required)
  const done = group.rows.filter(r => r.state === 'done').length
  const empty = group.progress && !group.progress.exempt && group.rows.length === 0 && group.refs.length === 0
  return (
    <section className="ds-audit-group" aria-label={group.title}>
      <div className="ds-audit-group-head">
        <h4 className="ds-audit-group-title">{group.title}</h4>
        {!group.progress && group.rows.length > 0 && (
          <span className="ds-audit-count">{done} of {group.rows.length} done</span>
        )}
      </div>
      {group.progress && <CategoryProgress row={group.progress} />}
      {group.note && <p className="ds-audit-empty">{group.note}</p>}
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

function Block({ block, dates, onOpenRow, getOptions }) {
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
      {describeBlockDates(dates) && <p className="ds-audit-dates">{describeBlockDates(dates)}</p>}
      {block.panel && <GenEdSummary panel={block.panel} />}
      {block.groups.map(group => <Group key={group.id} group={group} onOpenRow={onOpenRow} getOptions={getOptions} />)}
    </section>
  )
}

// What did not count toward a requirement, and why, so nothing a student did disappears without a word.
function NotCounted({ items, onOpenRow }) {
  return (
    <section className="ds-audit-block" aria-labelledby="ds-audit-notcounted">
      <div className="ds-audit-block-head">
        <h3 className="ds-h3" id="ds-audit-notcounted">Not counted toward a requirement</h3>
        {items.length > 0 && <span className="ds-audit-count">{items.length} {items.length === 1 ? 'item' : 'items'}</span>}
      </div>
      <p className="ds-sub" style={{ maxWidth: '72ch', lineHeight: 1.6 }}>
        A course counts once, toward one requirement. Hours that fill no requirement, or sit above a category's limit, are listed
        here so none of them goes missing.
      </p>
      {items.length === 0 ? (
        <p className="ds-audit-empty">Everything in your plan counts toward a requirement.</p>
      ) : (
        <ul className="ds-audit-list">
          {items.map((item, i) => {
            const body = (
              <span className="ds-audit-main">
                <span className="ds-audit-title">
                  {item.code && <span className="ds-audit-code">{item.code}</span>}
                  <span className="ds-audit-name">{item.name}</span>
                </span>
                <span className="ds-audit-meta">
                  {item.hours > 0 && <span>{item.hours} hrs</span>}
                  {item.term && <span>{item.term}</span>}
                </span>
                <span className="ds-audit-why">{item.reason}</span>
              </span>
            )
            return (
              <li key={`${item.kind}-${item.key ?? item.name}-${i}`} className="ds-audit-row ds-audit-not_placed">
                {item.key == null
                  ? <div className="ds-audit-line">{body}</div>
                  : <button type="button" className="ds-audit-line ds-audit-open" onClick={() => onOpenRow(item)}>{body}</button>}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

// When the student could finish, and what sets that pace (the words come from lib/degreeProjection.js, shared with the printed audit).
function FinishLine({ projection, onOpenRow }) {
  const f = describeFinish(projection)
  if (!f) return null

  if (f.complete) {
    return (
      <section className="ds-finish" aria-label="Finish line">
        <p className="ds-eyebrow">Finish line</p>
        <p className="ds-finish-big">{f.lead}</p>
      </section>
    )
  }

  return (
    <section className="ds-finish" aria-label="Finish line">
      <p className="ds-eyebrow">Finish line</p>
      <p className="ds-finish-big">{f.lead}{f.graduationLabel && <strong>{f.graduationLabel}</strong>}</p>
      <p className="ds-finish-sub">{f.detail}</p>

      {f.pace && (
        <div className="ds-finish-pace">
          <p className="ds-finish-pace-head">What sets the pace: <strong>{f.pace.label}</strong>. {f.pace.text}</p>
          {f.chain.length > 0 && (
            <ol className="ds-finish-chain">
              {f.chain.map(step => (
                <li key={step.key}>
                  <button type="button" className="ds-finish-step" onClick={() => onOpenRow(step)}>
                    <span className="ds-finish-term">{step.termLabel}</span>
                    <span className="ds-finish-course">{step.code ?? step.label}</span>
                    {step.name && <span className="ds-finish-name">{step.name}</span>}
                    {step.note && <span className="ds-finish-note">{step.note}</span>}
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {f.blocked.length > 0 && (
        <div className="ds-finish-blocked">
          <p className="ds-finish-pace-head">
            <strong>{f.blocked.length} {f.blocked.length === 1 ? 'course' : 'courses'}</strong> cannot be placed, so the date above leaves {f.blocked.length === 1 ? 'it' : 'them'} out:
          </p>
          <ul>
            {f.blocked.map(b => (
              <li key={b.key}>
                <button type="button" className="ds-finish-step" onClick={() => onOpenRow(b)}>
                  <span className="ds-finish-course">{b.code ?? b.label}</span>
                  <span className="ds-finish-note">{b.text}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="ds-finish-fine">{f.fine}</p>
    </section>
  )
}

export default function RequirementsView({ audit, projection, onOpenRow, getOptions }) {
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

      <FinishLine projection={projection} onOpenRow={onOpenRow} />

      {audit.blocks.length === 0 ? (
        <div className="ds-empty-state">This plan has no requirements to show yet.</div>
      ) : (
        audit.blocks.map(block => <Block key={block.id} block={block} dates={projection?.blocks?.[block.id]} onOpenRow={onOpenRow} getOptions={getOptions} />)
      )}

      <NotCounted items={audit.notCounted} onOpenRow={onOpenRow} />
    </div>
  )
}
