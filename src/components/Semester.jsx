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
  courseMap,
  planSlots      = {},
  planStatuses   = {},
  onSlotClick,
  onStatusChange,
  scienceWarnings = {},
}) {
  return (
    <div className="semester-card">
      <div className="semester-header">
        <span className="semester-label">Semester {semesterNumber}</span>
        <span className="semester-credits">
          {calculateCredits(slots, courseMap, planSlots)} cr
        </span>
      </div>
      <div className="semester-slots">
        {slots.map(slot => (
          <SlotRow
            key={slot.id}
            slot={slot}
            course={courseMap[slot.class_code]}
            selectedCode={planSlots[slot.id]}
            selectedCourse={planSlots[slot.id] ? courseMap[planSlots[slot.id]] : null}
            status={planStatuses[slot.id]}
            onSlotClick={onSlotClick}
            onStatusChange={onStatusChange}
            warning={scienceWarnings[slot.id]}
          />
        ))}
      </div>
    </div>
  )
}

// ── SlotRow ───────────────────────────────────────────────────────────────────
// Pool slots are rendered as a div[role=button] rather than <button> because
// they contain a StatusBadge <button> — HTML forbids nested interactive buttons
// and browsers silently break the DOM when you try. A div with role/tabIndex
// is semantically equivalent for keyboard/screen-reader users.

function SlotRow({ slot, course, selectedCode, selectedCourse, status, onSlotClick, onStatusChange, warning }) {
  const effectiveStatus = status ?? 'planned'

  // Pool slot — div[role=button] opens the course-selection modal
  if (slot.is_pool) {
    const isSelected = !!selectedCode
    return (
      <div
        className={`slot-row slot-pool clickable status-${effectiveStatus} ${isSelected ? 'slot-filled' : ''}`}
        onClick={() => onSlotClick(slot)}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && onSlotClick(slot)}
      >
        <div className="slot-info">
          <span className="slot-code pool-code">
            {isSelected ? selectedCode : (POOL_LABELS[slot.class_code] ?? slot.class_code)}
          </span>
          <span className="slot-name pool-name">
            {isSelected
              ? (selectedCourse?.name ?? 'Selected')
              : 'Click to select'}
          </span>
          {warning && (
            <span className={`slot-science-warning slot-science-warning-${warning.type}`}>
              {warning.type === 'incomplete'
                ? `Complete your ${warning.sequenceName} sequence`
                : 'Sequence conflict'}
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

  // Required course — always on the plan, always shows status badge
  if (course) {
    return (
      <div className={`slot-row slot-required status-${effectiveStatus}`}>
        <div className="slot-info">
          <span className="slot-code">{course.code}</span>
          <span className="slot-name">{course.name}</span>
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

  // Fallback: course data not found
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

// ── StatusBadge ───────────────────────────────────────────────────────────────
// Clicking cycles to the next status and saves to Supabase.
// stopPropagation prevents the click from bubbling up to the pool slot's
// div[role=button] and accidentally opening the course-selection modal.

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

function calculateCredits(slots, courseMap, planSlots) {
  return slots.reduce((total, slot) => {
    if (slot.is_pool) {
      const selectedCode   = planSlots?.[slot.id]
      const selectedCourse = selectedCode ? courseMap[selectedCode] : null
      return total + (selectedCourse?.credits ?? slot.flex_credits ?? 3)
    }
    const course = courseMap[slot.class_code]
    return total + (course?.credits ?? 0)
  }, 0)
}
