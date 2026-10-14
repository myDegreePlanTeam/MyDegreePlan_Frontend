import { picksText, problemLines } from '../../lib/planCheck'

// The Plan check strip on the plan (redesign Phase 3a). A real problem gets its own line above (red for a blocker, amber for advice);
// then the picks: a quiet violet strip that says how many course picks are still to make and where to start, with the one filled button
// on the screen. Nothing is shown when there is nothing to review.
//
// Props: summary (lib/planCheck.js summarizePlanCheck), onStart(issue) opens the pick to start with, onOpenIssue(issue) opens one issue on the plan,
// onOpenList() opens the whole Plan check list.

const STROKE = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }

function Icon({ tone }) {
  return (
    <svg className="ds-plancheck-icon" viewBox="0 0 24 24" {...STROKE} aria-hidden="true">
      {tone === 'blocker' && <><circle cx="12" cy="12" r="9" /><path d="M8.5 8.5l7 7M15.5 8.5l-7 7" /></>}
      {tone === 'advice' && <><path d="M12 3l9.5 17h-19z" /><path d="M12 10v4.5M12 17.4v.1" /></>}
      {tone === 'picks' && <path d="M4 7l1.8 1.8L9 5.5M4 14l1.8 1.8L9 12.5M12 7h8M12 14h8M4.2 20.4h.1M12 20.4h8" />}
    </svg>
  )
}

export default function PlanCheckStrip({ summary, onStart, onOpenIssue, onOpenList }) {
  if (summary.total === 0) return null
  const picks = picksText(summary)
  const problems = problemLines(summary)

  return (
    <div className="ds-plancheck-block" role="region" aria-label="Plan check">
      {problems.map(line => (
        <div key={line.tone} className={`ds-plancheck-problem ds-plancheck-problem-${line.tone}`}>
          <Icon tone={line.tone} />
          <span className="ds-plancheck-problem-text">{line.text}</span>
          <button className="ds-plancheck-action" onClick={() => onOpenIssue(line.issue)}>
            {line.tone === 'blocker' ? 'Fix it' : 'Look'}
          </button>
        </div>
      ))}
      <div className="ds-plancheck">
        <Icon tone="picks" />
        <div className="ds-plancheck-text">
          <strong>{picks ? picks.headline : `${summary.total} ${summary.total === 1 ? 'thing' : 'things'} to review`}</strong>
          {picks && <span>{picks.detail}</span>}
        </div>
        <button className="ds-plancheck-list" onClick={onOpenList}>See the list</button>
        {picks && <button className="ds-plancheck-start" onClick={() => onStart(summary.firstPick)}>Start picking</button>}
      </div>
    </div>
  )
}
