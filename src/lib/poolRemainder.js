// poolRemainder.js
//
// A FREE_ELECTIVE slot is an hours bucket, not a single course: the template
// gives it flex_credits (8 in the Flight Foundations Core plan, 5 in legacy)
// and the student fills it with whatever they like. Choosing a 3-hour course
// for an 8-hour slot fills 3 of the 8; the other 5 stay owed, and the plan
// shows them as another "choose a course" row.
//
// Those follow-up picks are student_free_add_slots rows whose fills_slot_id
// points at the slot (tier 22). They are ordinary free-add courses in every
// other respect — they count toward total hours, can be moved or removed, and
// are deduplicated against the rest of the plan — and the link only says which
// bucket they spend hours from.
//
// Pure: no Supabase calls, no React.

// Pools whose flex_credits is a bucket of hours that several courses may fill.
// Every other pool is one course per slot (a SCIENCE slot's flex hours are the
// 4-hour lab science course it takes).
export const REMAINDER_POOLS = new Set(['FREE_ELECTIVE'])

/** True for a slot whose hours can be filled by more than one course. */
export function isRemainderPool(slot) {
  return !!slot?.is_pool && REMAINDER_POOLS.has(slot.class_code) && (slot.flex_credits ?? 0) > 0
}

/** The free-add rows that spend hours from `slotId`. */
export function getPoolExtras(slotId, freeAddSlots) {
  return (freeAddSlots ?? []).filter(fa => fa?.fills_slot_id != null && Number(fa.fills_slot_id) === Number(slotId))
}

/**
 * Hours of `slot` no course covers yet: flex_credits minus the slot's own
 * selection and its follow-up picks, never below 0. 0 for any slot that is not
 * an hours bucket.
 *
 * An unfilled slot reports flex_credits minus its follow-up picks, so the
 * bucket totals flex_credits however its courses are split.
 *
 * @param {Object} slot          – requirement_slots row
 * @param {Object} planSlots     – { [slotId]: selectedCourseCode }
 * @param {Object} courses       – { [courseCode]: { credits, ... } }
 * @param {Array}  freeAddSlots  – every student_free_add_slots row (not one semester's)
 * @returns {number}
 */
export function getPoolRemainder(slot, planSlots, courses, freeAddSlots) {
  if (!isRemainderPool(slot)) return 0

  const code    = planSlots?.[slot.id]
  const primary = code ? (courses?.[code]?.credits ?? slot.flex_credits) : 0
  const extras  = getPoolExtras(slot.id, freeAddSlots)
    .reduce((sum, fa) => sum + (courses?.[fa.course_code]?.credits ?? 0), 0)

  return Math.max(0, slot.flex_credits - primary - extras)
}
