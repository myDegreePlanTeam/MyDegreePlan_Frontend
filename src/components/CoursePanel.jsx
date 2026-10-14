import { useState, useEffect, useRef } from 'react'
import { formatPrereqs, formatCoreqs } from '../lib/formatRequisites'
import { formatMissingForDisplay } from '../lib/poolResolver'
import { getSeasonRestriction } from '../lib/semesterRestrictions'
import { hoursText } from '../lib/hoursText'
import StatusChip from './shell/StatusChip'
import MoveList from './MoveList'

// ── CoursePanel ───────────────────────────────────────────────────────────────
// Details for the selected course row (redesign Phase 3c). On a desktop it sits beside the plan and pushes it over; on a phone it is a
// bottom sheet. "Move to…" is the primary action, so nothing the plan does depends on dragging.
// Three modes:
//   info — what to do first (Move to…), then the facts, requisites and warnings
//   move — a radio list of every term with whether the course can go there (moveTargets is computed by DegreePlan with the same
//          checks as drag-and-drop), then a button that says where it will go
//   pick — the pool course picker (SlotModal in embedded mode, via `picker`)
//
// DegreePlan mounts this with key = selection key, so mode resets per course.

// The status is not chosen: it follows the term the course is in (lib/termPhase.js)
const STATUS_LABELS = { planned: 'Planned', in_progress: 'In progress', completed: 'Passed' }
const STATUS_TONE = { planned: 'planned', in_progress: 'progress', completed: 'done' }
const phaseNote = (phase, canRemove) => phase === 'past'
  ? `This term is over, so the course counts as passed. If you did not pass it, move it to a later term to retake it${canRemove ? ', or remove it' : ''}.`
  : phase === 'current' ? 'You are taking this course this term.' : null

export default function CoursePanel({
  eyebrow,
  title,
  subtitle,
  course,
  courseMap,
  prereqMap,
  coreqMap,
  status,
  phase,
  warnings,
  countsToward,
  moveTargets,
  isPool,
  isFreeAdd,
  startInPicker,
  picker,
  onMove,
  onRemove,
  onClose,
}) {
  const [mode, setMode] = useState(startInPicker ? 'pick' : 'info')
  const [target, setTarget] = useState(null)
  const panelRef = useRef(null)

  // Focus lands on the panel when it opens and whenever the view changes (the control that had it may be gone), so Escape and Tab start
  // there; the picker keeps its own focus
  useEffect(() => { if (mode !== 'pick') panelRef.current?.focus({ preventScroll: true }) }, [mode])

  const hasBlocker = warnings.prereq?.length > 0 || warnings.coreq?.length > 0
  const restriction = course ? getSeasonRestriction(course.code) : null
  const chosen = moveTargets.find(t => t.semNum === target)

  function onKeyDown(e) {
    if (e.key !== 'Escape' || e.defaultPrevented) return
    e.stopPropagation()
    if (mode === 'move') { setMode('info'); setTarget(null) } else onClose()
  }

  return (
    <aside className="ds-panel" aria-label="Course details" tabIndex={-1} ref={panelRef} onKeyDown={onKeyDown}>
      <div className="ds-panel-head">
        <div className="ds-panel-head-row">
          <div style={{ minWidth: 0 }}>
            <p className="ds-panel-term">{eyebrow}</p>
            <h3 className="ds-panel-title">{title}</h3>
            <p className="ds-panel-sub">{subtitle}</p>
          </div>
          <button className="ds-panel-close" onClick={onClose}>
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" /></svg>
            Close
          </button>
        </div>
      </div>

      <div className="ds-panel-body">
        {mode === 'pick' && (
          <>
            {!startInPicker && (
              <button className="ds-back" onClick={() => setMode('info')}>
                <span aria-hidden="true">←</span>Course details
              </button>
            )}
            {/* Second arg hides the picker's own Back button when the
                "← Course details" link above already does that job. */}
            {picker(startInPicker ? onClose : () => setMode('info'), !startInPicker)}
          </>
        )}

        {mode === 'move' && (
          <>
            <button className="ds-back" onClick={() => { setMode('info'); setTarget(null) }}>
              <span aria-hidden="true">←</span>Course details
            </button>
            <h4 className="ds-panel-heading" id="ds-move-heading">Move to</h4>
            <MoveList targets={moveTargets} chosen={target} onChoose={setTarget} labelledBy="ds-move-heading" />
            <p className="ds-panel-fine">
              A term that would break a prerequisite or corequisite asks you to confirm first. A term the course is not offered in cannot be chosen.
            </p>
            <div className="ds-panel-actions">
              <button className="ds-btn-primary" disabled={!chosen} onClick={() => chosen && onMove(chosen.semNum)}>
                {chosen ? `Move to ${chosen.name}` : 'Choose a term'}
              </button>
              <button className="ds-btn-ghost" onClick={() => { setMode('info'); setTarget(null) }}>Cancel</button>
            </div>
          </>
        )}

        {mode === 'info' && course && (
          <>
            <button className="ds-btn-primary ds-panel-move" onClick={() => setMode('move')}>Move to…</button>

            {phaseNote(phase, isPool || isFreeAdd) && <p className="ds-panel-fine ds-panel-phase">{phaseNote(phase, isPool || isFreeAdd)}</p>}

            {warnings.prereq?.length > 0 && (
              <p className="ds-panel-alert ds-panel-alert-blocked">
                Needs {formatMissingForDisplay(warnings.prereq)} completed in an earlier term.
              </p>
            )}
            {warnings.coreq?.length > 0 && (
              <p className="ds-panel-alert ds-panel-alert-blocked">
                Needs {formatMissingForDisplay(warnings.coreq)} in the same term or earlier.
              </p>
            )}
            {warnings.science && (
              <p className="ds-panel-alert ds-panel-alert-attention">
                {warnings.science.type === 'incomplete'
                  ? `Complete your ${warnings.science.sequenceName} sequence in another science slot.`
                  : 'This course does not pair with your other science selection.'}
              </p>
            )}
            {warnings.standing && (
              <p className="ds-panel-alert ds-panel-alert-info">
                {warnings.standing === 'senior' ? 'Senior standing (90+ credits)' : 'Junior standing (60+ credits)'} is
                required before this term, and your plan does not reach it yet.
              </p>
            )}

            <dl className="ds-facts">
              <div className="ds-fact">
                <dt className="ds-fact-label">Status</dt>
                <dd className="ds-fact-value">
                  {hasBlocker
                    ? <StatusChip tone="blocked" label="Prerequisite unmet" />
                    : <StatusChip tone={STATUS_TONE[status ?? 'planned'] ?? 'planned'} label={STATUS_LABELS[status ?? 'planned']} />}
                </dd>
              </div>
              <div className="ds-fact">
                <dt className="ds-fact-label">Credit hours</dt>
                <dd className="ds-fact-value">{hoursText(course.credits)}</dd>
              </div>
              <div className="ds-fact">
                <dt className="ds-fact-label">Term</dt>
                <dd className="ds-fact-value">{eyebrow}</dd>
              </div>
              <div className="ds-fact">
                <dt className="ds-fact-label">Offered</dt>
                <dd className="ds-fact-value">{restriction ? `${restriction} only` : 'Fall and Spring'}</dd>
              </div>
            </dl>

            <RequisiteBlock
              label="Prerequisites"
              lines={formatPrereqs(course.code, prereqMap, courseMap)}
            />
            <RequisiteBlock
              label="Corequisites"
              lines={formatCoreqs(course.code, coreqMap, courseMap)}
            />

            <h4 className="ds-panel-heading">Counts toward</h4>
            <p className="ds-panel-text">{countsToward}</p>

            {course.description && (
              <>
                <h4 className="ds-panel-heading">Description</h4>
                <p className="ds-panel-text ds-panel-muted">{course.description}</p>
              </>
            )}

            <div className="ds-panel-actions">
              {isPool && (
                <button className="ds-btn-ghost" onClick={() => setMode('pick')}>Change course</button>
              )}
              {(isPool || isFreeAdd) && (
                <button className="ds-btn-danger" onClick={onRemove}>
                  {isFreeAdd ? 'Remove from plan' : 'Clear selection'}
                </button>
              )}
              {!isPool && !isFreeAdd && (
                <p className="ds-panel-fine">
                  Required for the degree — it can be moved to another term, but not removed.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </aside>
  )
}

function RequisiteBlock({ label, lines }) {
  return (
    <>
      <h4 className="ds-panel-heading">{label}</h4>
      {lines.length > 0 ? (
        <ul className="ds-panel-list">
          {lines.map((line, i) => <li key={i}>{line}</li>)}
        </ul>
      ) : (
        <p className="ds-panel-text ds-panel-muted">None on record for this course.</p>
      )}
    </>
  )
}
