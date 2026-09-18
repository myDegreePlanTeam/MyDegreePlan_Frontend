import { useState } from 'react'
import { formatPrereqs, formatCoreqs } from '../lib/formatRequisites'
import { formatMissingForDisplay } from '../lib/poolResolver'
import { getSeasonRestriction } from '../lib/semesterRestrictions'

// ── CoursePanel ───────────────────────────────────────────────────────────────
// Right-hand panel for the selected course row. Replaces CourseDetailModal.
// Three modes:
//   info — facts, requisites, warnings, actions
//   move — every term with whether the course can go there (moveTargets is
//          computed by DegreePlan with the same checks as drag-and-drop)
//   pick — the pool course picker (SlotModal in embedded mode, via `picker`)
//
// DegreePlan mounts this with key = selection key, so mode resets per course.

const STATUS_LABELS = { planned: 'Planned', in_progress: 'In progress', completed: 'Completed' }
const STATUS_ORDER  = ['planned', 'in_progress', 'completed']

export default function CoursePanel({
  eyebrow,
  title,
  subtitle,
  course,
  courseMap,
  prereqMap,
  coreqMap,
  status,
  statusLocked,
  warnings,
  countsToward,
  moveTargets,
  isPool,
  isFreeAdd,
  startInPicker,
  picker,
  onStatusChange,
  onMove,
  onRemove,
  onClose,
}) {
  const [mode, setMode] = useState(startInPicker ? 'pick' : 'info')

  const hasBlocker = warnings.prereq?.length > 0 || warnings.coreq?.length > 0
  const pill = hasBlocker ? 'blocked' : (status ?? 'planned')
  const restriction = course ? getSeasonRestriction(course.code) : null

  return (
    <aside className="ds-panel" aria-label="Course details">
      <div className="ds-panel-head">
        <div className="ds-panel-head-row">
          <div style={{ minWidth: 0 }}>
            <p className="ds-eyebrow">{eyebrow}</p>
            <h3 className="ds-panel-title">{title}</h3>
            <p className="ds-panel-sub">{subtitle}</p>
          </div>
          <button className="ds-panel-close" onClick={onClose} aria-label="Close panel">✕</button>
        </div>
      </div>

      <div className="ds-panel-body">
        {mode === 'pick' && (
          <>
            {!startInPicker && (
              <button className="ds-back" onClick={() => setMode('info')}>
                <span>←</span>Course details
              </button>
            )}
            {picker(startInPicker ? onClose : () => setMode('info'))}
          </>
        )}

        {mode === 'move' && (
          <>
            <button className="ds-back" onClick={() => setMode('info')}>
              <span>←</span>Course details
            </button>
            <p className="ds-eyebrow" style={{ marginBottom: 10 }}>Move to term</p>
            <div className="ds-move-list">
              {moveTargets.map(t => (
                <button
                  key={t.semNum}
                  className={`ds-move${t.isHere ? ' ds-move-current' : ''}`}
                  disabled={t.disabled}
                  title={t.reason ?? undefined}
                  onClick={() => !t.disabled && onMove(t.semNum)}
                >
                  <span className="ds-move-name">{t.name}</span>
                  <span className={`ds-move-note ds-move-note-${t.tone}`}>{t.note}</span>
                </button>
              ))}
            </div>
            <p className="ds-panel-fine" style={{ marginTop: 16 }}>
              Terms that would break a prerequisite, corequisite, or seasonal offering are shown but cannot be chosen.
            </p>
          </>
        )}

        {mode === 'info' && course && (
          <>
            <div className="ds-facts">
              <div className="ds-fact">
                <span className="ds-fact-label">Status</span>
                <span className={`ds-pill ds-pill-${pill}`}>
                  {hasBlocker ? 'Prerequisite unmet' : STATUS_LABELS[status ?? 'planned']}
                </span>
              </div>
              <div className="ds-fact">
                <span className="ds-fact-label">Credit hours</span>
                <span className="ds-fact-value">{course.credits} cr</span>
              </div>
              <div className="ds-fact">
                <span className="ds-fact-label">Term</span>
                <span className="ds-fact-value">{eyebrow}</span>
              </div>
              <div className="ds-fact">
                <span className="ds-fact-label">Offered</span>
                <span className="ds-fact-value">{restriction ? `${restriction} only` : 'Fall and Spring'}</span>
              </div>
            </div>

            <div className="ds-status-picker" role="group" aria-label="Course status">
              {STATUS_ORDER.map(s => (
                <button
                  key={s}
                  className={s === (status ?? 'planned') ? 'ds-status-active' : ''}
                  disabled={statusLocked}
                  title={statusLocked ? 'Undo the semester completion to change this' : undefined}
                  onClick={() => s !== status && onStatusChange(s)}
                >
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>

            {warnings.prereq?.length > 0 && (
              <p className="ds-panel-alert">
                Needs {formatMissingForDisplay(warnings.prereq)} completed in an earlier term.
              </p>
            )}
            {warnings.coreq?.length > 0 && (
              <p className="ds-panel-alert">
                Needs {formatMissingForDisplay(warnings.coreq)} in the same term or earlier.
              </p>
            )}
            {warnings.science && (
              <p className="ds-panel-alert">
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

            <RequisiteBlock
              label="Prerequisites"
              lines={formatPrereqs(course.code, prereqMap, courseMap)}
            />
            <RequisiteBlock
              label="Corequisites"
              lines={formatCoreqs(course.code, coreqMap, courseMap)}
            />

            <p className="ds-panel-label">Counts toward</p>
            <p className="ds-panel-text">{countsToward}</p>

            {course.description && (
              <>
                <p className="ds-panel-label">Description</p>
                <p className="ds-panel-text ds-panel-muted">{course.description}</p>
              </>
            )}

            <div className="ds-panel-actions">
              <button className="ds-btn-primary" onClick={() => setMode('move')}>Move</button>
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
      <p className="ds-panel-label">{label}</p>
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
