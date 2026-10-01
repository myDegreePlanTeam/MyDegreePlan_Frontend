// Credit hours shown on a semester card: filled pool slots count their
// chosen course, unfilled ones their expected hours (flex_credits, else 3).
// A Free Elective slot also counts the hours its chosen courses leave open
// (see poolRemainder.js), so choosing a short course doesn't shrink the term.
//
// freeAddSlots is the semester's own list; allFreeAddSlots is every free-add
// row, needed to find the follow-up picks that fill a slot from another term.

import { isRemainderPool, getPoolRemainder } from './poolRemainder'

export function calculateCredits(slots, freeAddSlots, courseMap, planSlots, allFreeAddSlots = freeAddSlots) {
  let total = slots.reduce((sum, slot) => {
    if (slot.is_pool) {
      const code   = planSlots?.[slot.id]
      const course = code ? courseMap[code] : null
      if (isRemainderPool(slot)) {
        const chosen = code ? (course?.credits ?? slot.flex_credits) : 0
        return sum + chosen + getPoolRemainder(slot, planSlots, courseMap, allFreeAddSlots)
      }
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
