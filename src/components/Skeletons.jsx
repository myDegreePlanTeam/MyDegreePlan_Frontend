import { isFeatureOpen } from '../lib/features'
import './Dashboard.css'
import './FirstRun.css'
import { getBrand } from '../lib/brand'
import { NAV_TABS } from './shell/navTabs'
import NavIcon from './shell/NavIcon'

// ── OnboardingSkeleton ────────────────────────────────────────────────────────
// Shown by Dashboard.jsx while the student_profiles row is being fetched.
// Reuses first run's own card (.fr-shell, .fr-card, .fr-header, .fr-body in FirstRun.css) so the card is the size of the
// screen that follows; only the inner content is replaced with animated placeholder bars (.sk-pulse).

export function OnboardingSkeleton() {
  return (
    <div className="fr-shell" aria-busy="true" aria-label="Loading">
      <div className="fr-card">

        <div className="fr-header">
          <div className="sk-pulse sk-ob-eyebrow" />
          <div className="fr-progress" aria-hidden="true">
            {[0, 1, 2, 3].map(i => <span key={i} className="fr-progress-seg" />)}
          </div>
          <div className="sk-pulse sk-ob-title" />
          <div className="sk-pulse sk-ob-sub"   />
        </div>

        <div className="fr-body">
          <div className="sk-pulse sk-ob-field" />
          {[0, 1, 2, 3].map(i => <div key={i} className="sk-pulse fr-major-skeleton" />)}
          <div className="sk-pulse sk-ob-btn" />
        </div>

      </div>
    </div>
  )
}

// ── DegreeplanSkeleton ────────────────────────────────────────────────────────
// Shown by DegreePlan.jsx while slots, courses, prereqs, and notes are loading.
// Mirrors the real app shell so nothing shifts when the plan arrives: the
// rail on the left (real .ds-sidebar chrome, static tab labels, placeholder
// account block) and, on the right, the plan header, the finish card, the Plan
// check strip, the credits row, and the semesters in one column. Eight cards
// approximate an 8-semester plan: the first two open with five rows, as the
// plan opens (lib/semesterDefaults.js), and the rest as one line each.
//
// Reuses .ds-app, .ds-sidebar, .ds-main, .ds-plan*, .ds-prior, .ds-grid, and
// .ds-sem, so the column and the card borders match the real plan.

// The same destinations as the real rail (shell/navTabs.js, shell/NavIcon.jsx).
const SKELETON_TABS = NAV_TABS.map(tab => ({ ...tab, active: tab.id === 'plan' }))

export function DegreeplanSkeleton() {
  return (
    <div className="ds-app" aria-busy="true" aria-label="Loading degree plan">
      <SkeletonSidebar />

      <main className="ds-main">
        <div className="ds-plan">

          <div className="ds-plan-header">
            <div className="ds-plan-heading">
              <div className="sk-pulse sk-dp-title"   />
              <div className="sk-pulse sk-dp-meta"    />
            </div>
            <div className="ds-header-actions">
              <div className="sk-pulse sk-dp-btn" />
            </div>
          </div>

          <div className="ds-summary">
            <div>
              <div className="sk-pulse sk-dp-finish" />
              <div className="sk-pulse sk-dp-meta"   />
            </div>
            <div>
              <div className="sk-pulse sk-dp-head"       />
              <div className="sk-pulse sk-dp-credit-bar" />
              <div className="sk-pulse sk-dp-legend"     />
            </div>
          </div>

          <div className="ds-plancheck-block">
            <div className="sk-pulse sk-dp-strip" />
          </div>

          <div className="ds-plan-body">
            <div className="ds-prior">
              <div className="sk-head">
                <div className="sk-pulse sk-sem-label" />
              </div>
            </div>

            <div className="ds-grid">
              {[5, 5, 0, 0, 0, 0, 0, 0].map((rowCount, i) => (
                <SkeletonSemesterCard key={i} rowCount={rowCount} />
              ))}
            </div>
          </div>

        </div>
      </main>
    </div>
  )
}

// ── SkeletonSidebar ───────────────────────────────────────────────────────────
// Static copy of Sidebar.jsx's chrome. Not interactive (divs, not buttons); the
// account block is placeholder bars because the email loads asynchronously.

function SkeletonSidebar() {
  return (
    <div className="ds-sidebar">
      <div className="ds-brand">
        <p className="ds-brand-title">{getBrand().shellEyebrow}</p>
      </div>

      <div className="ds-tabs">
        {SKELETON_TABS.map(tab => (
          <div key={tab.id} className={`ds-tab${tab.active ? ' ds-tab-active' : ''}${isFeatureOpen(tab.feature) ? '' : ' ds-tab-soon'}`}>
            <NavIcon id={tab.id} />
            <span className="ds-tab-label">{tab.label}</span>
            {!isFeatureOpen(tab.feature) && <span className="ds-tab-soon-tag">Coming soon</span>}
          </div>
        ))}
      </div>

      <div className="ds-account">
        <div className="sk-pulse sk-account-name" />
        <div className="sk-pulse sk-account-meta" />
      </div>
    </div>
  )
}

// ── SkeletonSemesterCard ──────────────────────────────────────────────────────
// A single placeholder semester card. Uses .ds-sem for the real card shell
// (border, radius, bg) and replaces the header and rows with animated bars.
// With no rows it is a collapsed semester: the header line only.

function SkeletonSemesterCard({ rowCount }) {
  return (
    <div className={`ds-sem${rowCount > 0 ? ' ds-sem-open' : ''}`}>

      <div className="sk-head">
        <div className="sk-pulse sk-sem-label"   />
        <div className="sk-pulse sk-sem-credits" />
      </div>

      {rowCount > 0 && (
        <>
          <div className="ds-sem-body">
            {Array.from({ length: rowCount }).map((_, i) => (
              <div key={i} className="sk-row">
                <div className="sk-pulse sk-slot-code" />
                <div className="sk-pulse sk-slot-name" />
                <div className="sk-pulse sk-slot-credits" />
              </div>
            ))}
          </div>

          <div className="sk-foot" />
        </>
      )}

    </div>
  )
}
