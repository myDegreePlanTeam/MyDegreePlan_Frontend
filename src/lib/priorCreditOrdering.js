// priorCreditOrdering.js
//
// Groups a flat list of prior_credits rows by credit_type and returns them
// in the canonical display order used throughout the app:
//
//   AP → IB → ACT (placement + credit) → CLEP → Transfer → Cambridge → Other
//
// Rationale: students expect to see exam-based credit first (AP is by far
// the most common at TTU), transfer coursework together toward the end,
// and any unrecognized credit_type still rendered rather than dropped.
//
// Pure function — no Supabase calls, no side effects.

const GROUP_ORDER = [
  { type: 'ap_credit',       label: 'AP Exams' },
  { type: 'ib_credit',       label: 'IB Exams' },
  { type: 'act',             label: 'ACT' },            // synthetic; combines act_placement + act_credit
  { type: 'test_out',        label: 'CLEP Exams' },
  { type: 'transfer_credit', label: 'Transfer Credit' },
  { type: 'cambridge',       label: 'Cambridge International' },
  { type: 'other',           label: 'Other' },          // synthetic bucket for unknown types
]

const KNOWN_TYPES = new Set([
  'ap_credit', 'ib_credit', 'act_placement', 'act_credit',
  'test_out', 'transfer_credit', 'cambridge',
])

// Map a raw prior_credits.credit_type to the bucket key used in GROUP_ORDER.
function bucketFor(creditType) {
  if (creditType === 'act_placement' || creditType === 'act_credit') return 'act'
  if (KNOWN_TYPES.has(creditType)) return creditType
  return 'other'
}

/**
 * Groups + orders a list of prior_credits rows for display.
 *
 * @param {Array} priorCredits
 * @returns {Array<{ type: string, label: string, entries: Array }>}
 *   Only sections with at least one entry are returned. Entries within a
 *   section preserve their input order.
 */
export function groupAndSortPriorCredits(priorCredits) {
  const source = Array.isArray(priorCredits) ? priorCredits : []

  const byBucket = {}
  for (const pc of source) {
    const bucket = bucketFor(pc?.credit_type)
    if (!byBucket[bucket]) byBucket[bucket] = []
    byBucket[bucket].push(pc)
  }

  const result = []
  for (const { type, label } of GROUP_ORDER) {
    const entries = byBucket[type]
    if (entries && entries.length > 0) {
      result.push({ type, label, entries })
    }
  }
  return result
}
