// CompletionBadge.jsx
//
// Renders nothing until isComplete flips true, then animates in a full-width
// celebratory banner just below the degree plan header.
//
// Props:
//   isComplete       — boolean from usePlanCompleteness
//   concentrationName — string, e.g. "B.S. Computer Science — Cybersecurity Track"
//                       (pass profile.concentrations.name from DegreePlan)

export default function CompletionBadge({ isComplete, concentrationName }) {
  if (!isComplete) return null

  return (
    <div className="completion-banner" role="status" aria-live="polite">
      <span className="completion-banner-check" aria-hidden="true">✓</span>
      <div className="completion-banner-text">
        <span className="completion-banner-label">Plan Complete</span>
        {concentrationName && (
          <span className="completion-banner-sub">{concentrationName}</span>
        )}
      </div>
      <span className="completion-banner-sparkle" aria-hidden="true">🎓</span>
    </div>
  )
}
