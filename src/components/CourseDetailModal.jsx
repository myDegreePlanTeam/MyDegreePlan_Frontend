import './Dashboard.css'

// ── CourseDetailModal ─────────────────────────────────────────────────────────
// Read-only panel showing a course's full information.
// Opened when the student clicks:
//   • A required (non-pool) slot — course is fixed so there's nothing to select
//   • A filled pool slot — the student already chose a course; this shows its
//     details alongside "Change" and "Remove" options
//
// Props:
//   slot              — the requirement_slot row
//   course            — the course object to display (resolved by the parent)
//   courseMap         — full { code: courseObj } map, used to look up names
//   prereqMap         — { courseCode: { groupIdx: { logic, codes[] } } }
//   coreqMap          — { courseCode: { groupIdx: { logic, codes[] } } }
//                       (also accepts legacy flat shape { courseCode: [code, ...] })
//   isPool            — true if this is a pool slot (shows change/remove actions)
//   onChangeSelection — callback: close detail, open SlotModal for same slot
//   onRemove          — callback: remove pool selection
//   onClose           — callback: close without action

export default function CourseDetailModal({
  slot,
  course,
  courseMap,
  prereqMap,
  coreqMap,
  isPool,
  onChangeSelection,
  onRemove,
  onClose,
}) {
  if (!course) return null

  const prereqs = formatPrereqs(course.code, prereqMap, courseMap)
  const coreqs  = formatCoreqs(course.code, coreqMap, courseMap)

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal-card">

        <div className="modal-header">
          <div>
            <p className="modal-eyebrow">Course Details</p>
            <h3 className="modal-title">{course.code}</h3>
            <p className="modal-sub">{course.name}</p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="course-detail-body">

          {/* Credit hours */}
          <div className="course-detail-section">
            <span className="course-detail-label">Credit Hours</span>
            <span className="course-detail-value">{course.credits} credit hours</span>
          </div>

          {/* Standing requirement — only shown when present */}
          {course.standing_req && (
            <div className="course-detail-section">
              <span className="course-detail-label">Standing Requirement</span>
              <span className="course-detail-value course-detail-standing">
                {course.standing_req === 'senior'
                  ? 'Senior standing required — 90 or more credit hours planned in prior semesters'
                  : course.standing_req === 'junior'
                  ? 'Junior standing required — 60 or more credit hours planned in prior semesters'
                  : course.standing_req}
              </span>
            </div>
          )}

          {/* Description */}
          {course.description && (
            <div className="course-detail-section">
              <span className="course-detail-label">Description</span>
              <p className="course-detail-desc">{course.description}</p>
            </div>
          )}

          {/* Prerequisites */}
          <div className="course-detail-section">
            <span className="course-detail-label">Prerequisites</span>
            {prereqs.length > 0 ? (
              <ul className="course-detail-list">
                {prereqs.map((line, i) => (
                  <li key={i} className="course-detail-list-item">{line}</li>
                ))}
              </ul>
            ) : (
              <span className="course-detail-none">None</span>
            )}
          </div>

          {/* Corequisites */}
          <div className="course-detail-section">
            <span className="course-detail-label">Corequisites</span>
            {coreqs.length > 0 ? (
              <ul className="course-detail-list">
                {coreqs.map((line, i) => (
                  <li key={i} className="course-detail-list-item">{line}</li>
                ))}
              </ul>
            ) : (
              <span className="course-detail-none">None</span>
            )}
          </div>

        </div>

        <div className="modal-footer">
          <div className="modal-footer-btns">
            {isPool && (
              <button
                className="modal-remove-btn"
                onClick={() => onRemove(slot)}
              >
                Remove selection
              </button>
            )}
            {isPool && (
              <button
                className="onboarding-btn-secondary"
                onClick={onChangeSelection}
              >
                Change
              </button>
            )}
            <button className="onboarding-btn" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}

// ── formatPrereqs ─────────────────────────────────────────────────────────────
// Converts the prereqMap structure into an array of human-readable strings,
// one entry per prerequisite group.
//
// The schema produces two group types:
//   AND group (logic='AND'): a single required course — "CSC1310 – Intro to Data Structures"
//   OR  group (logic='OR'):  any one of several courses — "one of: A, B, or C"
//
// Multiple groups are always combined with AND (the schema treats groups as
// separate AND-joined requirements). Each group becomes one list item so the
// student can read them as a bullet list: "you need all of these."

function formatPrereqs(courseCode, prereqMap, courseMap) {
  const groups = prereqMap[courseCode]
  if (!groups || Object.keys(groups).length === 0) return []

  const lines = []

  for (const groupIndex of Object.keys(groups).sort((a, b) => Number(a) - Number(b))) {
    const group = groups[groupIndex]

    if (group.logic === 'AND') {
      // AND groups have one code by schema design
      for (const code of group.codes) {
        const name = courseMap[code]?.name
        lines.push(name ? `${code} \u2013 ${name}` : code)
      }
    } else {
      // OR group: student needs at least one of these
      const options = group.codes.map(code => {
        const name = courseMap[code]?.name
        return name ? `${code} \u2013 ${name}` : code
      })
      if (options.length === 1) {
        lines.push(options[0])
      } else {
        // "one of: A, B, or C"
        const last  = options[options.length - 1]
        const front = options.slice(0, -1).join(', ')
        lines.push(`one of: ${front}, or ${last}`)
      }
    }
  }

  return lines
}

// ── formatCoreqs ──────────────────────────────────────────────────────────────
// Converts a coreqMap entry into human-readable strings.
//
// Accepts two coreqMap shapes (matching checkCoreqs in prereqChecker.js):
//   Flat list (legacy):  { [courseCode]: string[] }
//       — all entries are treated as AND requirements.
//   Grouped (current):   { [courseCode]: { [groupIdx]: { logic, codes[] } } }
//       — same shape as prereqMap; OR groups render as "one of: A, B, or C".

function formatCoreqs(courseCode, coreqMap, courseMap) {
  const entry = coreqMap[courseCode]
  if (!entry) return []

  const labelFor = (code) => {
    const name = courseMap[code]?.name
    return name ? `${code} \u2013 ${name}` : code
  }

  // Legacy flat-list shape — all codes are AND-required concurrently
  if (Array.isArray(entry)) {
    return entry.map(labelFor)
  }

  // Grouped shape — mirror formatPrereqs
  const groupIndices = Object.keys(entry)
  if (groupIndices.length === 0) return []

  const lines = []
  for (const groupIndex of groupIndices.sort((a, b) => Number(a) - Number(b))) {
    const group = entry[groupIndex]
    if (!group || !Array.isArray(group.codes)) continue

    if (group.logic === 'AND') {
      for (const code of group.codes) lines.push(labelFor(code))
    } else {
      const options = group.codes.map(labelFor)
      if (options.length === 1) {
        lines.push(options[0])
      } else {
        const last  = options[options.length - 1]
        const front = options.slice(0, -1).join(', ')
        lines.push(`one of: ${front}, or ${last}`)
      }
    }
  }

  return lines
}
