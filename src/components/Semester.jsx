import { useState, useEffect } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { useDraggable } from '@dnd-kit/core'
import { POOL_LABELS } from '../lib/poolResolver'
import './Dashboard.css'

// Clicking cycles: planned → in_progress → completed → planned
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
  note               = '',
  onNoteSave,
}) {
  // ── Droppable: this semester card accepts dragged slots ───────────
  // id = semesterNumber so handleDragEnd in DegreePlan can read it.
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: semesterNumber })

  const totalCr      = calculateCredits(slots, freeAddSlots, courseMap, planSlots)
  const creditWarning = totalCr < 12 ? 'low' : totalCr > 19 ? 'high' : null

  // ── Notes local state ─────────────────────────────────────────────
  const [noteOpen, setNoteOpen] = useState(false)
  const [noteText, setNoteText] = useState(note)
  useEffect(() => { setNoteText(note) }, [note])

  function handleNoteBlur() {
    if (noteText === note) return
    onNoteSave(semesterNumber, noteText)
  }

  return (
    <div
      className={`semester-card${isOver ? ' semester-card-drag-over' : ''}`}
      ref={setDropRef}
    >
      <div className="semester-header">
        <span className="semester-label">Semester {semesterNumber}</span>
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
            : 'Heavy load — more than 19 credits'}
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
          />
        ))}
      </div>

      {/* Add Course button — always visible at the bottom of the card */}
      <button className="semester-add-course-btn" onClick={onAddCourse}>
        + Add course
      </button>
    </div>
  )
}

// ── SlotRow ───────────────────────────────────────────────────────────────────
// Handles both required courses and pool slots.
// Has a drag handle (grip icon) that activates @dnd-kit dragging — the rest
// of the row remains clickable so status changes and detail views still work.

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
}) {
  const effectiveStatus = status ?? 'planned'

  // ── Draggable ──────────────────────────────────────────────────────
  // id = slot.id; data carries type + slotId for handleDragEnd.
  // listeners are applied only to the grip handle, not the whole row,
  // so clicking the row/status badge still works normally.
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
        ].join(' ')}
        onClick={() => onSlotClick(slot)}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && onSlotClick(slot)}
      >
        {/* Drag handle — only this element starts the drag */}
        <DragHandle listeners={listeners} attributes={attributes} />

        <div className="slot-info">
          <span className="slot-code pool-code">
            {isSelected ? selectedCode : (POOL_LABELS[slot.class_code] ?? slot.class_code)}
          </span>
          <span className="slot-name pool-name">
            {isSelected
              ? (selectedCourse?.name ?? 'Selected')
              : 'Click to select'}
          </span>
          {/* Flex credits remaining indicator */}
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
          {prereqMissing && prereqMissing.length > 0 && (
            <span className="slot-prereq-warning">
              ⚠ Prereq not met: {prereqMissing.join(', ')}
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
        ].join(' ')}
        onClick={() => onSlotClick(slot)}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && onSlotClick(slot)}
      >
        <DragHandle listeners={listeners} attributes={attributes} />

        <div className="slot-info">
          <span className="slot-code">{course.code}</span>
          <span className="slot-name">{course.name}</span>
          {prereqMissing && prereqMissing.length > 0 && (
            <span className="slot-prereq-warning">
              ⚠ Prereq not met: {prereqMissing.join(', ')}
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
// Renders a student-added course with a dashed border, status badge, and × remove.

function FreeAddRow({ freeAdd, course, onStatusChange, onRemove, prereqMissing }) {
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
        {prereqMissing && prereqMissing.length > 0 && (
          <span className="slot-prereq-warning">
            ⚠ Prereq not met: {prereqMissing.join(', ')}
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
// Grip icon shown on hover. Only this element has dnd-kit listeners, so
// clicking anywhere else on the row still fires click/keyboard events normally.

function DragHandle({ listeners, attributes }) {
  return (
    <button
      className="slot-drag-handle"
      {...listeners}
      {...attributes}
      onClick={e => e.stopPropagation()}   // prevent row click when grabbing handle
      tabIndex={-1}
      aria-label="Drag to move"
    >
      {/* 6-dot grip icon */}
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
