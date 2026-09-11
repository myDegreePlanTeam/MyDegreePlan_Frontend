// removedPrereqs.js
//
// Some course options need a course the student's plan dropped for their math
// placement: PHYS2110 and MATH3470 require MATH1920, which the degree builder
// archives as 'not_applicable' for students whose math track ends at MATH2010.
// SlotModal uses these helpers to say so on the option, so the student knows
// before choosing that taking the course means adding the prereq back.
//
// Pure functions — no Supabase calls, no side effects.

// Every course code in the plan, at any position: active fixed slots, filled
// pool slots, free-adds, and prior credit.
export function getPlanCodes({ slots = [], planSlots = {}, planArchived = {}, freeAddSlots = [], priorCredits = [] }) {
  const codes = new Set()
  for (const s of slots) {
    if (planArchived[s.id]) continue
    const code = s.is_pool ? planSlots[s.id] : s.class_code
    if (code) codes.add(code)
  }
  for (const fa of freeAddSlots) if (fa.course_code) codes.add(fa.course_code)
  for (const pc of priorCredits ?? []) if (pc.satisfies_course_code) codes.add(pc.satisfies_course_code)
  return codes
}

// Courses the degree builder removed for the student's math placement.
export function getRemovedCodes(slots = [], planArchived = {}) {
  return new Set(
    slots
      .filter(s => !s.is_pool && planArchived[s.id] === 'not_applicable')
      .map(s => s.class_code)
  )
}

// Removed courses a student would have to add back to take `courseCode`:
// from each prereq group with no member anywhere in the plan, the members
// that the plan removed.
export function getRemovedPrereqs(courseCode, prereqMap, planCodes, removedCodes) {
  const found = []
  for (const group of Object.values(prereqMap?.[courseCode] ?? {})) {
    if (group.codes.some(c => planCodes.has(c))) continue
    for (const c of group.codes) {
      if (removedCodes.has(c) && !found.includes(c)) found.push(c)
    }
  }
  return found
}
