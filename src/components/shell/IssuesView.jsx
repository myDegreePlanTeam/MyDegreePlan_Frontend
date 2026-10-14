const ICONS = { blocker: '✕', warning: '⚠', info: 'ℹ' }

// Plan check: the list of things to review. It is not a tab any more (shell/navTabs.js): the plan's Plan check line opens it, and "Back to plan"
// returns. The Plan tab stays marked while it is open (Sidebar.jsx).
export default function IssuesView({ issues, onOpenIssue, onBack }) {
  const blockers = issues.filter(i => i.severity === 'blocker').length

  return (
    <div className="ds-view ds-issues">
      {onBack && <button className="ds-btn-ghost ds-issues-back" onClick={onBack}>← Back to plan</button>}
      <p className="ds-eyebrow">Plan check</p>
      <h2 className="ds-h2">
        {issues.length === 0
          ? 'Nothing to review'
          : `${issues.length} ${issues.length === 1 ? 'thing' : 'things'} to review`}
      </h2>
      <p className="ds-sub" style={{ maxWidth: '72ch', lineHeight: 1.6 }}>
        Checked against prerequisites, corequisites, standing, science sequences, term load, and unfinished course selections.
        {blockers > 0 && ` ${blockers} ${blockers === 1 ? 'needs' : 'need'} fixing; the rest are advice.`}
        {' '}Select one to jump to it on the plan.
      </p>

      {issues.length === 0 ? (
        <div className="ds-empty-state">
          <strong>All clear.</strong> Every course sits after its prerequisites, and every semester is within a normal load.
        </div>
      ) : (
        <div className="ds-issue-list">
          {issues.map(issue => (
            <button
              key={issue.id}
              className={`ds-issue ds-issue-${issue.severity}`}
              onClick={() => onOpenIssue(issue)}
            >
              <span className="ds-issue-icon" aria-hidden="true">{ICONS[issue.severity]}</span>
              <span className="ds-issue-text">
                <span className="ds-issue-top">
                  <span className="ds-issue-title">{issue.title}</span>
                  <span className="ds-issue-where">{issue.where}</span>
                </span>
                <span className="ds-issue-body" style={{ display: 'block' }}>{issue.body}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
