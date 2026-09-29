// Credit hours shown on a semester card: filled pool slots count their
// chosen course, unfilled ones their expected hours (flex_credits, else 3).

export function calculateCredits(slots, freeAddSlots, courseMap, planSlots) {
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
