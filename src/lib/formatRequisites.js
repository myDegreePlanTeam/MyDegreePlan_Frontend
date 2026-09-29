// Human-readable prerequisite / corequisite lines for the course panel.
// Moved out of CourseDetailModal when the modal became the side panel.
//
// The schema produces two group types:
//   AND group (logic='AND'): a single required course — "CSC1310 – Intro to Data Structures"
//   OR  group (logic='OR'):  any one of several courses — "one of: A, B, or C"
//
// Multiple groups are always combined with AND (the schema treats groups as
// separate AND-joined requirements). Each group becomes one list item so the
// student can read them as a bullet list: "you need all of these."

function labelFor(code, courseMap) {
  const name = courseMap[code]?.name
  return name ? `${code} – ${name}` : code
}

function groupLines(groups, courseMap) {
  const lines = []
  for (const groupIndex of Object.keys(groups).sort((a, b) => Number(a) - Number(b))) {
    const group = groups[groupIndex]
    if (!group || !Array.isArray(group.codes)) continue

    if (group.logic === 'AND') {
      for (const code of group.codes) lines.push(labelFor(code, courseMap))
    } else {
      const options = group.codes.map(code => labelFor(code, courseMap))
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

export function formatPrereqs(courseCode, prereqMap, courseMap) {
  const groups = prereqMap[courseCode]
  if (!groups || Object.keys(groups).length === 0) return []
  return groupLines(groups, courseMap)
}

// Accepts two coreqMap shapes (matching checkCoreqs in prereqChecker.js):
//   Flat list (legacy):  { [courseCode]: string[] } — all AND-required
//   Grouped (current):   { [courseCode]: { [groupIdx]: { logic, codes[] } } }
export function formatCoreqs(courseCode, coreqMap, courseMap) {
  const entry = coreqMap[courseCode]
  if (!entry) return []
  if (Array.isArray(entry)) return entry.map(code => labelFor(code, courseMap))
  return groupLines(entry, courseMap)
}
