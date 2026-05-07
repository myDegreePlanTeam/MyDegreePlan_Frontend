import { useState, useEffect } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { useDraggable } from '@dnd-kit/core'
import { POOL_LABELS, formatMissingForDisplay } from '../lib/poolResolver'
import './Dashboard.css'

// Maps prior_credit.credit_type to a short badge label shown on slots
const CREDIT_TYPE_LABELS = {
  ap_credit:       'AP',
  transfer_credit: 'Transfer',
  test_out:        'CLEP',
  ib_credit:       'IB',
  act_placement:   'ACT',
  act_credit:      'ACT',
  cambridge:       'Cambridge',
}

// Clicking cycles: planned → in_progress → completed → planned
// TODO: individual course completion status will be driven by Banner transcript
// data on university integration. Do not add manual per-course completion
// toggles until that integration defines the source of truth.
const NEXT_STATUS = {
  planned:     'in_progress',
  in_progress: 'completed',
  completed:   'planned',
}

const STATUS_LABEL = {
  planned:     'Planned',
  in_progress: 'In Progress',
  completed:   'Done',
}

export default function Semester({
  semesterNumber,
  slots,
  freeAddSlots       = [],
  courseMap,
  planSlots          = {},
  planStatuses       = {},
  planCreditsRemaining = {},
  onSlotClick,
  onStatusChange,
  onFreeAddStatusChange,
  onRemoveFreeAdd,
  onAddCourse,
  scienceWarnings    = {},
  prereqWarnings     = {},
  coreqWarnings      = {},
  standingWarnings   = {},
  transferFilled     = {},
  transferDetails    = {},
  note               = '',
  onNoteSave,
  // Completion / collapse props
  isExpanded         = true,
  onToggleExpand,
  isCompleted                = false,
  onMarkComplete,
  hasWarnings                = false,
  priorSemestersAllComplete  = true,
  displayNumber              = null,
  onDelete                   = null,
}) {
  // ── Droppable ─────────────────────────────────────────────────────
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: semesterNumber })

  const totalCr      = calculateCredits(slots, freeAddSlots, courseMap, planSlots)
  const creditWarning = totalCr < 12 ? 'low' : totalCr > 18 ? 'high' : null

  const hasUnfilledPool = slots.some(s => s.is_pool && !planSlots[s.id])

  // ── Notes local state ─────────────────────────────────────────────
  const [noteOpen, setNoteOpen] = useState(false)
  const [noteText, setNoteText] = useState(note)
  useEffect(() => { setNoteText(note) }, [note])

  function handleNoteBlur() {
    if (noteText === note) return
    onNoteSave(semesterNumber, noteText)
  }

  // ── Completed / collapsed summary row ────────────────────────────
  // Concept 1: the whole semester card collapses to a single summary row.
  // The course data inside is untouched — only the display collapses.
  if (!isExpanded) {
    return (
      <div
        className={`semester-card semester-card-collapsed${isCompleted ? ' semester-card-done' : ''}`}
        ref={setDropRef}
      >
        <button
          className="semester-collapsed-row"
          onClick={onToggleExpand}
          aria-label={`Expand semester ${displayNumber ?? semesterNumber}`}
        >
          <span className="semester-label">Semester {displayNumber ?? semesterNumber}</span>
          <span className="semester-collapsed-meta">
            <span className="semester-credits">{totalCr} cr</span>
            {isCompleted && (
              <span className="semester-done-badge">Completed ✓</span>
            )}
          </span>
          <span className="semester-chevron">▼</span>
        </button>
      </div>
    )
  }

  return (
    <div
      className={`semester-card${isOver ? ' semester-card-drag-over' : ''}${isCompleted ? ' semester-card-done' : ''}`}
      ref={setDropRef}
    >
      <div className="semester-header">
        <div className="semester-header-left">
          <button
            className="semester-collapse-btn"
            onClick={onToggleExpand}
            title="Collapse semester"
            aria-label="Collapse semester"
          >
            ▲
          </button>
          <span className="semester-label">Semester {displayNumber ?? semesterNumber}</span>
        </div>
        <div className="semester-header-right">
          <span className="semester-credits">{totalCr} cr</span>
          <button
            className={`semester-notes-btn${note ? ' semester-notes-btn-active' : ''}`}
            onClick={() => setNoteOpen(o => !o)}
            title={note ? 'Edit semester note' : 'Add semester note'}
            aria-label={note ? 'Edit semester note' : 'Add semester note'}
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M8.5 1.5l2 2L4 10H2V8L8.5 1.5z"
                stroke="currentColor" strokeWidth="1.3"
                strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Warning gate message when Mark Complete is disabled */}
      {hasWarnings && !isCompleted && (
        <div className="semester-warning-gate">
          Resolve {countWarnings(slots, freeAddSlots, prereqWarnings, coreqWarnings)} warning(s) before marking this semester complete.
        </div>
      )}

      {hasUnfilledPool && !isCompleted && (
        <div className="semester-warning-gate">
          Select a course for all pool slots before marking this semester complete.
        </div>
      )}

      {noteOpen && (
        <div className="semester-notes-wrap">
          <textarea
            className="semester-notes-input"
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            onBlur={handleNoteBlur}
            placeholder="Add a note for this semester..."
            rows={2}
          />
        </div>
      )}

      {creditWarning && (
        <div className={`semester-credit-warning semester-credit-warning-${creditWarning}`}>
          {creditWarning === 'low'
            ? 'Below full-time — fewer than 12 credits'
            : 'Heavy load — more than 18 credits'}
        </div>
      )}

      <div className="semester-slots">
        {/* Required / pool slots from the degree template */}
        {slots.map(slot => (
          <SlotRow
            key={slot.id}
            slot={slot}
            course={courseMap[slot.class_code]}
            selectedCode={planSlots[slot.id]}
            selectedCourse={planSlots[slot.id] ? courseMap[planSlots[slot.id]] : null}
            status={planStatuses[slot.id]}
            creditsRemaining={planCreditsRemaining[slot.id] ?? 0}
            onSlotClick={onSlotClick}
            onStatusChange={onStatusChange}
            warning={scienceWarnings[slot.id]}
            prereqMissing={prereqWarnings[slot.id]}
            coreqMissing={coreqWarnings[slot.id]}
            standingWarning={standingWarnings[slot.id]}
            isTransferFilled={!!transferFilled[slot.id]}
            transferBadgeLabel={
              transferDetails[slot.id]
                ? CREDIT_TYPE_LABELS[transferDetails[slot.id].creditType] ?? 'Transfer'
                : 'Transfer'
            }
          />
        ))}

        {/* Free-add slots the student manually placed here */}
        {freeAddSlots.map(fa => (
          <FreeAddRow
            key={fa.id}
            freeAdd={fa}
            course={courseMap[fa.course_code]}
            onStatusChange={onFreeAddStatusChange}
            onRemove={onRemoveFreeAdd}
            prereqMissing={prereqWarnings[`fa_${fa.id}`]}
            coreqMissing={coreqWarnings[`fa_${fa.id}`]}
          />
        ))}
      </div>

      <div className="semester-footer">
        <button className="semester-add-course-btn" onClick={onAddCourse}>
          + Add course
        </button>
        {onDelete && slots.length === 0 && freeAddSlots.length === 0 && (
          <button
            className="semester-delete-btn"
            onClick={onDelete}
            title="Remove this empty semester"
          >
            Remove semester
          </button>
        )}
        {(slots.length > 0 || freeAddSlots.length > 0) && isCompleted ? (
          <button
            className="semester-complete-btn semester-complete-btn-undo"
            onClick={() => onMarkComplete(false)}
            title="Undo completion — semester returns to normal"
          >
            Undo Completion
          </button>
        ) : (slots.length > 0 || freeAddSlots.length > 0) ? (
          <button
            className="semester-complete-btn"
            onClick={() => !hasWarnings && !hasUnfilledPool && priorSemestersAllComplete && onMarkComplete(true)}
            disabled={hasWarnings || hasUnfilledPool || !priorSemestersAllComplete}
            title={
              !priorSemestersAllComplete
                ? 'Complete earlier semesters first'
                : hasUnfilledPool
                  ? 'Select a course for all pool slots before marking complete'
                  : hasWarnings
                    ? 'Resolve warnings before marking this semester complete'
                    : 'Mark this semester as complete'
            }
          >
            Mark Complete
          </button>
        ) : null}
      </div>
    </div>
  )
}

// ── SlotRow ───────────────────────────────────────────────────────────────────

function SlotRow({
  slot,
  course,
  selectedCode,
  selectedCourse,
  status,
  creditsRemaining,
  onSlotClick,
  onStatusChange,
  warning,
  prereqMissing,
  coreqMissing,
  standingWarning,
  isTransferFilled,
  transferBadgeLabel = 'Transfer',
}) {
  const effectiveStatus = status ?? 'planned'

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id:   slot.id,
    data: { type: 'requirement_slot', slotId: slot.id },
  })

  const dragStyle = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50 }
    : undefined

  // Pool slot
  if (slot.is_pool) {
    const isSelected = !!selectedCode
    return (
      <div
        ref={setNodeRef}
        style={dragStyle}
        className={[
          'slot-row slot-pool clickable',
          `status-${effectiveStatus}`,
          isSelected ? 'slot-filled' : '',
          isDragging ? 'slot-dragging' : '',
          isTransferFilled ? 'slot-transfer-filled' : '',
        ].join(' ')}
        onClick={() => onSlotClick(slot)}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && onSlotClick(slot)}
      >
        <DragHandle listeners={listeners} attributes={attributes} />

        <div className="slot-info">
          <span className="slot-code pool-code">
            {isSelected ? selectedCode : (POOL_LABELS[slot.class_code] ?? slot.class_code)}
          </span>
          <span className="slot-name pool-name">
            {isTransferFilled && !isSelected
              ? 'Satisfied by transfer credit'
              : isSelected
                ? (selectedCourse?.name ?? 'Selected')
                : 'Click to select'}
          </span>
          {isTransferFilled && !isSelected && (
            <span className="slot-transfer-badge">{transferBadgeLabel}</span>
          )}
          {isSelected && creditsRemaining > 0 && (
            <span className="slot-credits-remaining">
              {creditsRemaining} cr remaining
            </span>
          )}
          {warning && (
            <span className={`slot-science-warning slot-science-warning-${warning.type}`}>
              {warning.type === 'incomplete'
                ? `Complete your ${warning.sequenceName} sequence`
                : 'Sequence conflict'}
            </span>
          )}
          {prereqMissing?.length > 0 && (
            <span className="slot-prereq-warning">
              ⚠ Prereq not met: {formatMissingForDisplay(prereqMissing)}
            </span>
          )}
          {coreqMissing?.length > 0 && (
            <span className="slot-prereq-warning slot-coreq-warning">
              ⚠ Coreq not met: {formatMissingForDisplay(coreqMissing)}
            </span>
          )}
          {standingWarning && (
            <span className="slot-standing-warning">
              ℹ Standing requirement: {standingWarning === 'junior' ? 'Junior' : 'Senior'}
            </span>
          )}
        </div>
        <div className="slot-right">
          {isSelected && (
            <StatusBadge
              slot={slot}
              status={effectiveStatus}
              onStatusChange={onStatusChange}
            />
          )}
          <span className="slot-credits">
            {isSelected
              ? `${selectedCourse?.credits ?? slot.flex_credits ?? 3} cr`
              : `${slot.flex_credits ?? 3} cr`}
          </span>
        </div>
      </div>
    )
  }

  // Required course
  if (course) {
    return (
      <div
        ref={setNodeRef}
        style={dragStyle}
        className={[
          'slot-row slot-required clickable',
          `status-${effectiveStatus}`,
          isDragging ? 'slot-dragging' : '',
          isTransferFilled ? 'slot-transfer-filled' : '',
        ].join(' ')}
        onClick={() => onSlotClick(slot)}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && onSlotClick(slot)}
      >
        <DragHandle listeners={listeners} attributes={attributes} />

        <div className="slot-info">
          <div className="slot-code-row">
            <span className="slot-code">{course.code}</span>
            {isTransferFilled && (
              <span className="slot-transfer-badge">{transferBadgeLabel}</span>
            )}
          </div>
          <span className="slot-name">{course.name}</span>
          {prereqMissing?.length > 0 && (
            <span className="slot-prereq-warning">
              ⚠ Prereq not met: {formatMissingForDisplay(prereqMissing)}
            </span>
          )}
          {coreqMissing?.length > 0 && (
            <span className="slot-prereq-warning slot-coreq-warning">
              ⚠ Coreq not met: {formatMissingForDisplay(coreqMissing)}
            </span>
          )}
          {standingWarning && (
            <span className="slot-standing-warning">
              ℹ Standing requirement: {standingWarning === 'junior' ? 'Junior' : 'Senior'}
            </span>
          )}
        </div>
        <div className="slot-right">
          <StatusBadge
            slot={slot}
            status={effectiveStatus}
            onStatusChange={onStatusChange}
          />
          <span className="slot-credits">{course.credits} cr</span>
        </div>
      </div>
    )
  }

  // Fallback
  return (
    <div className="slot-row slot-missing">
      <div className="slot-info">
        <span className="slot-code">{slot.class_code}</span>
        <span className="slot-name">Course not found</span>
      </div>
      <span className="slot-credits">— cr</span>
    </div>
  )
}

// ── FreeAddRow ────────────────────────────────────────────────────────────────

function FreeAddRow({ freeAdd, course, onStatusChange, onRemove, prereqMissing, coreqMissing }) {
  const effectiveStatus = freeAdd.status ?? 'planned'

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id:   freeAdd.id,
    data: { type: 'free_add', slotId: freeAdd.id },
  })

  const dragStyle = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50 }
    : undefined

  return (
    <div
      ref={setNodeRef}
      style={dragStyle}
      className={[
        'slot-row slot-free-add',
        `status-${effectiveStatus}`,
        isDragging ? 'slot-dragging' : '',
      ].join(' ')}
    >
      <DragHandle listeners={listeners} attributes={attributes} />

      <div className="slot-info">
        <div className="slot-free-add-top">
          <span className="slot-code">{freeAdd.course_code}</span>
          <span className="slot-free-add-badge">Added</span>
        </div>
        <span className="slot-name">
          {course?.name ?? freeAdd.course_code}
        </span>
        {prereqMissing?.length > 0 && (
          <span className="slot-prereq-warning">
            ⚠ Prereq not met: {formatMissingForDisplay(prereqMissing)}
          </span>
        )}
        {coreqMissing?.length > 0 && (
          <span className="slot-prereq-warning slot-coreq-warning">
            ⚠ Coreq not met: {formatMissingForDisplay(coreqMissing)}
          </span>
        )}
      </div>
      <div className="slot-right">
        <StatusBadge
          slot={freeAdd}
          status={effectiveStatus}
          onStatusChange={(_, newStatus) => onStatusChange(freeAdd, newStatus)}
        />
        <span className="slot-credits">
          {course?.credits ?? '—'} cr
        </span>
        <button
          className="slot-free-add-remove"
          onClick={e => { e.stopPropagation(); onRemove(freeAdd) }}
          title="Remove this course"
          aria-label="Remove course"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

// ── DragHandle ────────────────────────────────────────────────────────────────

function DragHandle({ listeners, attributes }) {
  return (
    <button
      className="slot-drag-handle"
      {...listeners}
      {...attributes}
      onClick={e => e.stopPropagation()}
      tabIndex={-1}
      aria-label="Drag to move"
    >
      <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" aria-hidden="true">
        <circle cx="3" cy="2.5"  r="1.2"/>
        <circle cx="7" cy="2.5"  r="1.2"/>
        <circle cx="3" cy="7"    r="1.2"/>
        <circle cx="7" cy="7"    r="1.2"/>
        <circle cx="3" cy="11.5" r="1.2"/>
        <circle cx="7" cy="11.5" r="1.2"/>
      </svg>
    </button>
  )
}

// ── StatusBadge ───────────────────────────────────────────────────────────────

function StatusBadge({ slot, status, onStatusChange }) {
  function handleClick(e) {
    e.stopPropagation()
    onStatusChange(slot, NEXT_STATUS[status])
  }
  return (
    <button
      className={`status-badge status-badge-${status}`}
      onClick={handleClick}
      title={`Mark as ${STATUS_LABEL[NEXT_STATUS[status]]}`}
    >
      {STATUS_LABEL[status]}
    </button>
  )
}

// ── Credit calculator ─────────────────────────────────────────────────────────

function calculateCredits(slots, freeAddSlots, courseMap, planSlots) {
  let total = slots.reduce((sum, slot) => {
    if (slot.is_pool) {
      const code   = planSlots?.[slot.id]
      const course = code ? courseMap[code] : null
      return sum + (course?.credits ?? slot.flex_credits ?? 3)
    }
    const course = courseMap[slot.class_code]
    return sum + (course?.credits ?? 0)
  }, 0)

  for (const fa of freeAddSlots) {
    total += courseMap[fa.course_code]?.credits ?? 0
  }

  return total
}

// ── Warning count helper ──────────────────────────────────────────────────────

function countWarnings(slots, freeAddSlots, prereqWarnings, coreqWarnings) {
  let count = 0
  for (const slot of slots) {
    if (prereqWarnings[slot.id]?.length > 0) count++
    if (coreqWarnings[slot.id]?.length > 0) count++
  }
  for (const fa of freeAddSlots) {
    const key = `fa_${fa.id}`
    if (prereqWarnings[key]?.length > 0) count++
    if (coreqWarnings[key]?.length > 0) count++
  }
  return count
}
