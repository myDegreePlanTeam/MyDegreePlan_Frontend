const ICONS = { blocker: '✕', warning: '⚠', info: 'ℹ' }

export default function IssuesView({ issues, onOpenIssue }) {
  const blockers = issues.filter(i => i.severity === 'blocker').length

  return (
    <div className="ds-view ds-issues">
      <p className="ds-eyebrow">Validation</p>
      <h2 className="ds-h2">
        {issues.length === 0
          ? 'No issues in this plan'
          : `${issues.length} ${issues.length === 1 ? 'issue' : 'issues'} in this plan`}
      </h2>
      <p className="ds-sub" style={{ maxWidth: '72ch', lineHeight: 1.6 }}>
        Checked against prerequisites, corequisites, standing, science sequences, and term load.
        {blockers > 0 && ` ${blockers} ${blockers === 1 ? 'is a blocker' : 'are blockers'}; the rest are advisory.`}
        {' '}Select an issue to jump to it on the plan.
      </p>

      {issues.length === 0 ? (
        <div className="ds-empty-state">
          <strong>All clear.</strong> Every course sits after its prerequisites, and every term is within a normal load.
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
