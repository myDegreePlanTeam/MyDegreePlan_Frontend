// courseKinds.js
//
// The catalog holds more than the courses an undergraduate plans with. The course searches show one kind at
// a time so graduate courses and placeholder codes do not crowd the results:
//   undergraduate  a course numbered below 5000 (CSC1300, MATH1910, ENGL2130)
//   graduate       a course numbered 5000 or above (CSC5240)
//   placeholder    a code that is not a course number: elective credit placeholders (AIELEC, ACCTELEC) and
//                  the transfer-institution codes Coursedog lists for equivalency (CIS186, EDU201)

export const COURSE_KINDS = [
  { key: 'undergraduate', label: 'Undergraduate' },
  { key: 'graduate',      label: 'Graduate' },
  { key: 'placeholder',   label: 'Placeholders' },
]

const COURSE_CODE = /^[A-Z]{2,4}(\d{4})$/

export function courseKind(code) {
  const m = COURSE_CODE.exec(code ?? '')
  if (!m) return 'placeholder'
  return Number(m[1]) >= 5000 ? 'graduate' : 'undergraduate'
}

export function countByKind(rows) {
  const counts = { undergraduate: 0, graduate: 0, placeholder: 0 }
  for (const r of rows ?? []) counts[courseKind(r.code)]++
  return counts
}
