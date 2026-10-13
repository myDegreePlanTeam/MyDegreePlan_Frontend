// auditLabels.js
//
// The words the Requirements tab and the printed audit share, so the two cannot say different things about the same requirement.

/** A requirement's state, in a row. The mark and the word carry it; colour never does alone. */
export const ROW_STATES = {
  done:        { mark: '✓', label: 'Done' },
  in_progress: { mark: '◐', label: 'In progress' },
  planned:     { mark: '○', label: 'Planned' },
  not_placed:  { mark: '–', label: 'Not placed' },
}

/** A general-education category's state. "Complete" is only for hours already earned: a category a later term would cover reads "Covered by plan". */
export const CATEGORY_STATES = {
  done:        'Complete',
  in_progress: 'In progress',
  planned:     'Covered by plan',
  open:        'Not covered',
  risk:        'At risk',
  exempt:      'Exempt',
}
