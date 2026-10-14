import { useState } from 'react'
import { formatMissingForDisplay } from '../../lib/poolResolver'
import GenEdSummary, { CategoryProgress } from './GenEdProgress'
import { ROW_STATES } from '../../lib/auditLabels'
import { describeFinish, describeBlockDates } from '../../lib/degreeProjection'
import { formatCourseCode } from '../../lib/courseCodeFormat'
import { hoursText } from '../../lib/hoursText'
import StatusChip from './StatusChip'

const STATES = ROW_STATES
// a requirement's state as a chip (an icon, a word, a colour); an open choice has no chip: it shows "Pick a course"
const CHIP_TONE = { done: 'done', in_progress: 'progress', planned: 'planned' }
const Chevron = () => (
  <svg className="ds-audit-go" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 3.5l4.5 4.5L6 12.5" /></svg>
)

function Summary({ summary }) {
  const { requirements: r, total, done, inProgress, planned } = summary
  const all = r.done + r.in_progress + r.planned + r.not_placed
  const placed = all - r.not_placed
  const pct = n => (all > 0 ? (n / all) * 100 : 0)
  return (
    <section className="ds-audit-summary" aria-label="Requirements progress">
      <p className="ds-audit-total">
        <strong>{placed} of {all}</strong> requirements are done or placed in your plan
      </p>
      {r.not_placed > 0 && (
        <p className="ds-audit-open-count">{r.not_placed} {r.not_placed === 1 ? 'course pick is' : 'course picks are'} still to make.</p>
      )}
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
        <span className="ds-legend-item ds-legend-done"><strong>{r.done}</strong> done</span>
        <span className="ds-legend-item ds-legend-current"><strong>{r.in_progress}</strong> in progress</span>
        <span className="ds-legend-item ds-legend-planned"><strong>{r.planned}</strong> planned</span>
        <span className="ds-legend-item ds-legend-open"><strong>{r.not_placed}</strong> to pick</span>
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

function RowBody({ row, pick }) {
  const state = STATES[row.state]
  const where = whereOf(row)
  return (
    <>
      <span className="ds-audit-main">
        <span className="ds-audit-title">
          {row.code ? <span className="ds-audit-code">{formatCourseCode(row.code)}</span> : null}
          <span className="ds-audit-name">{row.code ? row.name : row.label}</span>
        </span>
        <span className="ds-audit-meta">
          {where && <span>{where}</span>}
          {row.hours > 0 && <span>{hoursText(row.hours)}</span>}
          {row.sourceNote && <span className="ds-audit-note">{row.sourceNote}</span>}
          {row.choose && <span className="ds-audit-tag">{row.choose}</span>}
          {row.alsoCounts && <span className="ds-audit-tag">Also counts for {row.alsoCounts}</span>}
        </span>
      </span>
      {CHIP_TONE[row.state]
        ? <StatusChip tone={CHIP_TONE[row.state]} label={state.label} />
        : pick ? <span className="ds-row-pick">Pick a course</span> : <span className="ds-audit-state">{state.label}</span>}
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
                  <span className="ds-audit-code">{formatCourseCode(option.code)}</span>
                  <span className="ds-audit-name">{option.name}</span>
                  <span className="ds-audit-option-hours">{hoursText(option.credits)}</span>
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
        <RowBody row={row} pick />
        {row.state !== 'not_placed' && <Chevron />}
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
      <span className="ds-audit-main">
        <span className="ds-audit-title">
          <span className="ds-audit-code">{formatCourseCode(item.code)}</span>
          {item.name && <span className="ds-audit-name">{item.name}</span>}
        </span>
        <span className="ds-audit-meta">
          {where && <span>{where}</span>}
          {item.hours > 0 && <span>{hoursText(item.hours)}</span>}
          {item.note && <span className="ds-audit-note">{item.note}</span>}
          <span className="ds-audit-tag">{item.label}</span>
        </span>
      </span>
      {CHIP_TONE[item.state]
        ? <StatusChip tone={CHIP_TONE[item.state]} label={state.label} />
        : <span className="ds-audit-state">{state.label}</span>}
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
{counts.done} of {total} done
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
      <p className="ds-audit-lede">
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
                  {item.code && <span className="ds-audit-code">{formatCourseCode(item.code)}</span>}
                  <span className="ds-audit-name">{item.name}</span>
                </span>
                <span className="ds-audit-meta">
                  {item.hours > 0 && <span>{hoursText(item.hours)}</span>}
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
      <section className="ds-finish" aria-label="When you finish">
        <h3 className="ds-finish-big">{f.lead}</h3>
      </section>
    )
  }

  return (
    <section className="ds-finish" aria-label="When you finish">
      <h3 className="ds-finish-big">{f.lead}{f.graduationLabel && <strong>{f.graduationLabel}</strong>}</h3>
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
                    <span className="ds-finish-course">{step.code ? formatCourseCode(step.code) : step.label}</span>
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
                  <span className="ds-finish-course">{b.code ? formatCourseCode(b.code) : b.label}</span>
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
      <h2 className="ds-h2 ds-page-title">Requirements</h2>
      <p className="ds-audit-lede">
        Every requirement of your degree, read from your plan and the credits you already have. A course in a past term counts as done, one
        in the current term as in progress, and one in a later term as planned. Select a row to open it on your plan.
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
