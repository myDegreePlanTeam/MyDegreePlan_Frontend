import './Dashboard.css'

// Human-readable labels for all pool codes
const POOL_LABELS = {
  GEN_ED:             'General Education',
  ENG_LIT:            'English Literature',
  SCIENCE:            'Natural Science',
  COMM_REQ:           'Communications',
  MATH_STATS:         'Statistics',
  CSC_LOWER_ELECTIVE: 'CSC Lower Elective',
  CSC_UPPER_ELECTIVE: 'CSC Upper Elective',
  CSC_ELECTIVE:       'CSC Elective',
  CSC_HPC_ELECTIVE:   'HPC Elective',
  FREE_ELECTIVE:      'Free Elective',
}

export default function Semester({ semesterNumber, slots, courseMap }) {
  return (
    <div className="semester-card">
      <div className="semester-header">
        <span className="semester-label">Semester {semesterNumber}</span>
        <span className="semester-credits">
          {calculateCredits(slots, courseMap)} cr
        </span>
      </div>
      <div className="semester-slots">
        {slots.map(slot => (
          <SlotRow
            key={slot.id}
            slot={slot}
            course={courseMap[slot.class_code]}
          />
        ))}
      </div>
    </div>
  )
}

function SlotRow({ slot, course }) {
  // Pool slot — show the human-readable pool label
  if (slot.is_pool) {
    return (
      <div className="slot-row slot-pool">
        <div className="slot-info">
          <span className="slot-code pool-code">
            {POOL_LABELS[slot.class_code] ?? slot.class_code}
          </span>
          <span className="slot-name pool-name">Student choice</span>
        </div>
        <span className="slot-credits">
          {slot.flex_credits ?? '3'} cr
        </span>
      </div>
    )
  }

  // Real course slot — show code, name, and credits from courseMap
  if (course) {
    return (
      <div className="slot-row slot-required">
        <div className="slot-info">
          <span className="slot-code">{course.code}</span>
          <span className="slot-name">{course.name}</span>
        </div>
        <span className="slot-credits">{course.credits} cr</span>
      </div>
    )
  }

  // Fallback — course code exists in slot but wasn't found in courseMap
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

function calculateCredits(slots, courseMap) {
  return slots.reduce((total, slot) => {
    if (slot.is_pool) return total + (slot.flex_credits ?? 3)
    const course = courseMap[slot.class_code]
    return total + (course?.credits ?? 0)
  }, 0)
}