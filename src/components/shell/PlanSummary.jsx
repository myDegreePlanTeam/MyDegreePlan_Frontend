// The top of the plan: where the student finishes, and how much of the degree is in the plan (redesign Phase 3a).
//
// Props:
//   finish         "Spring 2030", the last non-summer semester of the plan, or null
//   semesterCount  how many semesters the plan has
//   totalHours     the hours the degree needs
//   extraNote      e.g. "18 more than CSC Cybersecurity alone" when other programs add hours, or null
//   hours          { done, inProgress, planned } in hours; what is left of totalHours is the picks still to make

const plural = (n, one, many) => (n === 1 ? one : many)

export default function PlanSummary({ finish, semesterCount, totalHours, extraNote = null, hours }) {
  const { done = 0, inProgress = 0, planned = 0 } = hours
  const placed = done + inProgress + planned
  const toPlace = Math.max(0, totalHours - placed)
  const pct = n => (totalHours > 0 ? Math.min(100, (n / totalHours) * 100) : 0)
  const doneW = pct(done)
  const progressW = Math.min(pct(inProgress), 100 - doneW)
  const plannedW = Math.min(pct(planned), 100 - doneW - progressW)

  return (
    <section className="ds-summary" aria-label="Where you are">
      <div className="ds-summary-finish">
        {finish ? (
          <>
            <p className="ds-summary-label">You finish</p>
            <p className="ds-summary-big">{finish}</p>
          </>
        ) : (
          <p className="ds-summary-big ds-summary-none">No finish date yet</p>
        )}
        <p className="ds-summary-meta">
          {semesterCount} {plural(semesterCount, 'semester', 'semesters')} · {totalHours} hours{extraNote ? ` (${extraNote})` : ''}
        </p>
      </div>
      <div className="ds-summary-progress">
        <p className="ds-summary-head">{placed} of {totalHours} hours planned</p>
        <div
          className="ds-summary-bar"
          role="img"
          aria-label={`${done} hours done, ${inProgress} in progress, ${planned} planned, ${toPlace} in picks still to make, of ${totalHours}`}
        >
          <div className="ds-summary-seg ds-summary-seg-done" style={{ width: `${doneW}%` }} />
          <div className="ds-summary-seg ds-summary-seg-progress" style={{ width: `${progressW}%` }} />
          <div className="ds-summary-seg ds-summary-seg-planned" style={{ width: `${plannedW}%` }} />
        </div>
        <p className="ds-summary-legend">
          <span><b className="ds-summary-done">{done}</b> done</span>
          {inProgress > 0 && <span><b className="ds-summary-progress-n">{inProgress}</b> in progress</span>}
          {planned > 0 && <span><b className="ds-summary-planned-n">{planned}</b> planned</span>}
          {toPlace > 0 && <span><b>{toPlace}</b> in picks to make</span>}
        </p>
      </div>
    </section>
  )
}
