import { useState, useEffect } from 'react'
import { useDroppable, useDraggable } from '@dnd-kit/core'
import { POOL_LABELS, formatMissingForDisplay } from '../lib/poolResolver'
import { calculateCredits } from '../lib/semesterCredits'

// Maps prior_credit.credit_type to a short label shown on transfer-filled slots
const CREDIT_TYPE_LABELS = {
  ap_credit:       'AP',
  transfer_credit: 'Transfer',
  test_out:        'CLEP',
  ib_credit:       'IB',
  act_placement:   'ACT',
  act_credit:      'ACT',
  cambridge:       'Cambridge',
}

// One semester card on the plan grid. Clicking a row selects it (the course
// panel opens); rows drag between cards. Per-course status is changed from
// the course panel — the row dot shows it.
export default function Semester({
  semesterNumber,
  slots,
  freeAddSlots       = [],
  courseMap,
  planSlots          = {},
  planStatuses       = {},
  planCreditsRemaining = {},
  onSelectSlot,
  onSelectFreeAdd,
  selectedKey        = null,
  onAddCourse,
  scienceWarnings    = {},
  prereqWarnings     = {},
  coreqWarnings      = {},
  standingWarnings   = {},
  transferFilled     = {},
  transferDetails    = {},
  note               = '',
  onNoteSave,
  isExpanded         = true,
  onToggleExpand,
  isCompleted                = false,
  onMarkComplete,
  hasWarnings                = false,
  priorSemestersAllComplete  = true,
  termLabel                  = null,
  isCurrent                  = false,
  isGraduation               = false,
  issueCount                 = 0,
  onDelete                   = null,
}) {
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: semesterNumber })

  const totalCr         = calculateCredits(slots, freeAddSlots, courseMap, planSlots)
  const hasUnfilledPool = slots.some(s => s.is_pool && !planSlots[s.id])
  const isEmpty         = slots.length === 0 && freeAddSlots.length === 0

  const [noteOpen, setNoteOpen] = useState(false)
  const [noteText, setNoteText] = useState(note)
  useEffect(() => { setNoteText(note) }, [note])

  function handleNoteBlur() {
    if (noteText === note) return
    onNoteSave(semesterNumber, noteText)
  }

  const name = [termLabel ?? `Semester ${semesterNumber}`, isCurrent && 'Now', isGraduation && 'Graduate']
    .filter(Boolean).join(' · ')

  const cardClass = [
    'ds-sem',
    isExpanded && 'ds-sem-open',
    isCurrent && 'ds-sem-current',
    isCompleted ? 'ds-sem-done' : issueCount > 0 && 'ds-sem-warn',
    isOver && 'ds-sem-over',
  ].filter(Boolean).join(' ')

  const completeBlockedReason = !priorSemestersAllComplete
    ? 'Complete earlier semesters first'
    : hasUnfilledPool
      ? 'Select a course for all pool slots before marking complete'
      : hasWarnings
        ? 'Resolve prerequisite warnings before marking this semester complete'
        : null

  return (
    <div className={cardClass} ref={setDropRef}>
      <button
        className="ds-sem-head"
        onClick={onToggleExpand}
        aria-expanded={isExpanded}
        aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${name}`}
      >
        <span className="ds-sem-name">{name}</span>
        {isCompleted ? (
          <span className="ds-sem-flag ds-sem-flag-done">Done ✓</span>
        ) : issueCount > 0 ? (
          <span className="ds-sem-flag ds-sem-flag-warn">⚠ {issueCount}</span>
        ) : null}
        {note && <span className="ds-sem-note-dot" title="This semester has a note">✎</span>}
        <span className="ds-sem-cr">{totalCr} cr</span>
        <span className="ds-sem-caret">{isExpanded ? '▲' : '▼'}</span>
      </button>

      {isExpanded && (
        <div className="ds-sem-body">
          {noteOpen && (
            <div className="ds-sem-noteedit">
              <textarea
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                onBlur={handleNoteBlur}
                placeholder="Add a note for this semester..."
                rows={2}
                autoFocus
              />
            </div>
          )}

          {isEmpty && (
            <p className="ds-sem-empty">No courses yet. Add one, or drag a course here.</p>
          )}

          {slots.map(slot => (
            <SlotRow
              key={slot.id}
              slot={slot}
              course={courseMap[slot.class_code]}
              selectedCode={planSlots[slot.id]}
              selectedCourse={planSlots[slot.id] ? courseMap[planSlots[slot.id]] : null}
              status={planStatuses[slot.id]}
              creditsRemaining={planCreditsRemaining[slot.id] ?? 0}
              isSelected={selectedKey === slot.id}
              onSelect={() => onSelectSlot(slot)}
              scienceWarning={scienceWarnings[slot.id]}
              prereqMissing={prereqWarnings[slot.id]}
              coreqMissing={coreqWarnings[slot.id]}
              standingWarning={standingWarnings[slot.id]}
              isTransferFilled={!!transferFilled[slot.id]}
              transferLabel={
                CREDIT_TYPE_LABELS[transferDetails[slot.id]?.creditType] ?? 'Transfer'
              }
            />
          ))}

          {freeAddSlots.map(fa => (
            <FreeAddRow
              key={fa.id}
              freeAdd={fa}
              course={courseMap[fa.course_code]}
              isSelected={selectedKey === `fa_${fa.id}`}
              onSelect={() => onSelectFreeAdd(fa)}
              prereqMissing={prereqWarnings[`fa_${fa.id}`]}
              coreqMissing={coreqWarnings[`fa_${fa.id}`]}
            />
          ))}

          <div className="ds-sem-foot">
            <button onClick={onAddCourse}>+ Add course</button>
            <button
              className="ds-sem-foot-icon"
              onClick={() => setNoteOpen(o => !o)}
              title={note ? 'Edit semester note' : 'Add semester note'}
              aria-label={note ? 'Edit semester note' : 'Add semester note'}
            >
              ✎
            </button>
            {isEmpty ? (
              onDelete && <button onClick={onDelete}>Remove semester</button>
            ) : isCompleted ? (
              <button onClick={() => onMarkComplete(false)} title="Semester returns to normal">
                Undo complete
              </button>
            ) : (
              <button
                onClick={() => !completeBlockedReason && onMarkComplete(true)}
                disabled={!!completeBlockedReason}
                title={completeBlockedReason ?? 'Mark this semester as complete'}
              >
                Mark complete
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Row presentation ──────────────────────────────────────────────────────────
// Picks the dot, note text, and note tone for a row. Warnings outrank status
// so a problem is never hidden behind a "planned" dot.
function describeRow({ status, prereqMissing, coreqMissing, scienceWarning, standingWarning, fallbackNote, isEmptyPool }) {
  if (prereqMissing?.length > 0) {
    return { dot: 'blocked', tone: 'blocked', note: `Needs ${formatMissingForDisplay(prereqMissing)} in an earlier term` }
  }
  if (coreqMissing?.length > 0) {
    return { dot: 'blocked', tone: 'blocked', note: `Take with ${formatMissingForDisplay(coreqMissing)}` }
  }
  if (scienceWarning) {
    return {
      dot: 'blocked', tone: 'blocked',
      note: scienceWarning.type === 'incomplete'
        ? `Complete your ${scienceWarning.sequenceName} sequence`
        : 'Science sequence conflict',
    }
  }
  if (standingWarning) {
    return { dot: 'info', tone: 'info', note: `${standingWarning === 'senior' ? 'Senior' : 'Junior'} standing required` }
  }
  if (isEmptyPool) return { dot: 'empty', tone: 'empty', note: fallbackNote }
  return { dot: status ?? 'planned', tone: null, note: fallbackNote }
}

function useRowDrag(id, type) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    data: { type, slotId: id },
  })
  return { dragProps: { ref: setNodeRef, ...listeners, ...attributes }, isDragging }
}

function Row({ dragProps, isDragging, isSelected, onSelect, view, code, codeIsPool, tag, credits }) {
  return (
    <div
      {...dragProps}
      role="button"
      tabIndex={0}
      className={[
        'ds-row',
        isSelected && 'ds-row-selected',
        isDragging && 'ds-row-dragging',
      ].filter(Boolean).join(' ')}
      onClick={onSelect}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect() } }}
    >
      <span className={`ds-dot ds-dot-${view.dot}`} aria-hidden="true" />
      <span className="ds-row-text">
        <span className={`ds-row-code${codeIsPool ? ' ds-row-code-pool' : ''}`}>{code}</span>
        <span className={`ds-row-note${view.tone ? ` ds-row-note-${view.tone}` : ''}`}>{view.note}</span>
      </span>
      {tag && <span className="ds-row-tag">{tag}</span>}
      <span className="ds-row-cr">{credits}</span>
    </div>
  )
}

function SlotRow({
  slot, course, selectedCode, selectedCourse, status, creditsRemaining,
  isSelected, onSelect,
  scienceWarning, prereqMissing, coreqMissing, standingWarning,
  isTransferFilled, transferLabel,
}) {
  const { dragProps, isDragging } = useRowDrag(slot.id, 'requirement_slot')

  if (slot.is_pool) {
    const filled = !!selectedCode
    const fallbackNote = isTransferFilled && !filled
      ? `Satisfied by ${transferLabel} credit`
      : filled
        ? (selectedCourse?.name ?? 'Selected')
          + (creditsRemaining > 0 ? ` · ${creditsRemaining} cr remaining` : '')
        : 'Choose a course'
    const view = describeRow({
      status, prereqMissing, coreqMissing, scienceWarning, standingWarning,
      fallbackNote, isEmptyPool: !filled && !isTransferFilled,
    })
    return (
      <Row
        dragProps={dragProps} isDragging={isDragging}
        isSelected={isSelected} onSelect={onSelect} view={view}
        code={filled ? selectedCode : (POOL_LABELS[slot.class_code] ?? slot.class_code)}
        codeIsPool={!filled}
        credits={`${selectedCourse?.credits ?? slot.flex_credits ?? 3} cr`}
      />
    )
  }

  if (!course) {
    return (
      <div className="ds-row" aria-disabled="true">
        <span className="ds-dot ds-dot-empty" aria-hidden="true" />
        <span className="ds-row-text">
          <span className="ds-row-code">{slot.class_code}</span>
          <span className="ds-row-note">Course not found in catalog</span>
        </span>
        <span className="ds-row-cr">— cr</span>
      </div>
    )
  }

  const view = describeRow({
    status, prereqMissing, coreqMissing, scienceWarning, standingWarning,
    fallbackNote: course.name,
  })
  return (
    <Row
      dragProps={dragProps} isDragging={isDragging}
      isSelected={isSelected} onSelect={onSelect} view={view}
      code={course.code}
      tag={isTransferFilled ? transferLabel : null}
      credits={`${course.credits} cr`}
    />
  )
}

function FreeAddRow({ freeAdd, course, isSelected, onSelect, prereqMissing, coreqMissing }) {
  const { dragProps, isDragging } = useRowDrag(freeAdd.id, 'free_add')
  const view = describeRow({
    status: freeAdd.status, prereqMissing, coreqMissing,
    fallbackNote: course?.name ?? freeAdd.course_code,
  })
  return (
    <Row
      dragProps={dragProps} isDragging={isDragging}
      isSelected={isSelected} onSelect={onSelect} view={view}
      code={freeAdd.course_code}
      tag="Added"
      credits={`${course?.credits ?? '—'} cr`}
    />
  )
}
