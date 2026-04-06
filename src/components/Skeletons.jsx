import './Dashboard.css'

// ── OnboardingSkeleton ────────────────────────────────────────────────────────
// Shown by Dashboard.jsx while the student_profiles row is being fetched.
// Reuses the real onboarding structural classes (.onboarding-shell,
// .onboarding-card, etc.) so the card dimensions match exactly — only the
// inner content is replaced with animated placeholder bars (.sk-pulse).
//
// This avoids layout shift: the card appears at the correct size immediately,
// then the real Onboarding component snaps in at the same size.

export function OnboardingSkeleton() {
  return (
    <div className="onboarding-shell">
      <div className="onboarding-card">

        <div className="onboarding-header">
          <div className="sk-pulse sk-ob-eyebrow" />
          <div className="sk-pulse sk-ob-title"   />
          <div className="sk-pulse sk-ob-sub"     />
          {/* Step dots — reuse the real step class for correct sizing */}
          <div className="onboarding-steps">
            <div className="onboarding-step" />
            <div className="onboarding-step" />
          </div>
        </div>

        <div className="onboarding-body">
          {/* Four concentration card placeholders in the real 2-col grid */}
          <div className="concentration-grid">
            <div className="sk-pulse sk-ob-conc-card" />
            <div className="sk-pulse sk-ob-conc-card" />
            <div className="sk-pulse sk-ob-conc-card" />
            <div className="sk-pulse sk-ob-conc-card" />
          </div>
          {/* Continue button placeholder */}
          <div className="sk-pulse sk-ob-btn" />
        </div>

      </div>
    </div>
  )
}

// ── DegreeplanSkeleton ────────────────────────────────────────────────────────
// Shown by DegreePlan.jsx while slots, courses, prereqs, and notes are loading.
// Eight cards approximate the layout of a real 8-semester plan. Each card gets
// 5 slot-row placeholders — close to the average number of courses per semester.
//
// Reuses .degreeplan-shell, .degreeplan-main, .degreeplan-grid, and
// .semester-card so the grid layout and card borders match the real plan.
// The header is a simplified version (no sticky positioning needed since
// the student can't scroll while loading).

export function DegreeplanSkeleton() {
  return (
    <div className="degreeplan-shell">

      <div className="sk-dp-header">
        <div className="sk-dp-header-inner">
          <div className="sk-pulse sk-dp-eyebrow"    />
          <div className="sk-pulse sk-dp-title"      />
          <div className="sk-pulse sk-dp-meta"       />
          <div className="sk-dp-credit-bar-wrap">
            <div className="sk-pulse sk-dp-credit-bar" />
          </div>
        </div>
      </div>

      <main className="degreeplan-main">
        <div className="degreeplan-grid">
          {[5, 5, 5, 5, 5, 5, 5, 5].map((rowCount, i) => (
            <SkeletonSemesterCard key={i} rowCount={rowCount} />
          ))}
        </div>
      </main>

    </div>
  )
}

// ── SkeletonSemesterCard ──────────────────────────────────────────────────────
// A single placeholder semester card. Uses .semester-card for the real card
// shell (border, radius, bg) and replaces the header and slot rows with
// animated bars. The last row has no bottom border, matching .slot-row:last-child.

function SkeletonSemesterCard({ rowCount }) {
  return (
    <div className="semester-card">

      <div className="sk-sem-header">
        <div className="sk-pulse sk-sem-label"   />
        <div className="sk-pulse sk-sem-credits" />
      </div>

      <div className="semester-slots">
        {Array.from({ length: rowCount }).map((_, i) => (
          <div key={i} className={`sk-slot-row${i === rowCount - 1 ? ' sk-slot-row-last' : ''}`}>
            <div className="sk-slot-info">
              <div className="sk-pulse sk-slot-code" />
              <div className="sk-pulse sk-slot-name" />
            </div>
            <div className="sk-pulse sk-slot-credits" />
          </div>
        ))}
      </div>

    </div>
  )
}
