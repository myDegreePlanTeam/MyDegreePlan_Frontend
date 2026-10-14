import { isFeatureOpen } from '../lib/features'
import './Dashboard.css'
import { getBrand } from '../lib/brand'
import { NAV_TABS } from './shell/navTabs'
import NavIcon from './shell/NavIcon'

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
// Mirrors the real app shell so nothing shifts when the plan arrives: the
// sidebar on the left (real .ds-sidebar chrome, static tab labels, placeholder
// account block) and, on the right, the plan header, the Prior Coursework strip,
// and the semester grid. Eight cards approximate an 8-semester plan; each gets
// 6 rows and a footer, close to a typical semester.
//
// Reuses .ds-app, .ds-sidebar, .ds-main, .ds-plan*, .ds-prior, .ds-grid, and
// .ds-sem, so the two-per-row grid and card borders match the real plan.

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
              <div className="sk-pulse sk-dp-btn sk-dp-btn-wide" />
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

          <div className="ds-plan-body">
            <div className="ds-prior">
              <div className="sk-head">
                <div className="sk-pulse sk-sem-label" />
              </div>
            </div>

            <div className="ds-grid">
              {[6, 6, 6, 6, 6, 6, 6, 6].map((rowCount, i) => (
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

function SkeletonSemesterCard({ rowCount }) {
  return (
    <div className="ds-sem ds-sem-open">

      <div className="sk-head">
        <div className="sk-pulse sk-sem-label"   />
        <div className="sk-pulse sk-sem-credits" />
      </div>

      <div className="ds-sem-body">
        {Array.from({ length: rowCount }).map((_, i) => (
          <div key={i} className="sk-row">
            <div className="sk-pulse sk-row-dot" />
            <div className="sk-row-info">
              <div className="sk-pulse sk-slot-code" />
              <div className="sk-pulse sk-slot-name" />
            </div>
            <div className="sk-pulse sk-slot-credits" />
          </div>
        ))}
      </div>

      <div className="sk-foot" />

    </div>
  )
}
