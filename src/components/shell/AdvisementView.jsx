// Read-only summary for an advising appointment: headline numbers, every
// term's courses, and prior coursework. The PDF export lives here.

export default function AdvisementView({
  concentrationName,
  email,
  completed,
  planned,
  totalHours,
  graduation,
  terms,
  priorSummary,
  exportButton,
  genEd,
}) {
  const remaining = Math.max(totalHours - completed, 0)

  return (
    <div className="ds-view">
      <div className="ds-adv-top">
        <div>
          <p className="ds-eyebrow">Advisement view</p>
          <h2 className="ds-h2">Degree summary</h2>
          <p className="ds-sub">{concentrationName}{email && ` · ${email}`}</p>
        </div>
        {exportButton}
      </div>

      <div className="ds-stats">
        <div className="ds-stat">
          <div className="ds-stat-value" style={{ color: 'var(--status-done)' }}>{completed}</div>
          <div className="ds-stat-label">credits complete</div>
        </div>
        <div className="ds-stat">
          <div className="ds-stat-value" style={{ color: 'var(--gold)' }}>{remaining}</div>
          <div className="ds-stat-label">credits remaining</div>
        </div>
        <div className="ds-stat">
          <div className="ds-stat-value">{planned}</div>
          <div className="ds-stat-label">credits planned</div>
        </div>
        <div className="ds-stat ds-stat-accent">
          <div className="ds-stat-value ds-stat-value-sm">
            {graduation ? `${graduation.season} ${graduation.year}` : '—'}
          </div>
          <div className="ds-stat-label">projected graduation</div>
        </div>
      </div>

      {genEd && <div style={{ marginBottom: 26, maxWidth: 760 }}>{genEd}</div>}

      <div className="ds-adv-grid">
        {terms.map(term => (
          <div key={term.semNum} className="ds-adv-term">
            <div className="ds-adv-term-head">
              <span className={`ds-adv-term-name${term.isCurrent ? ' ds-adv-term-name-current' : ''}`}>
                {term.name}
              </span>
              <span className={`ds-adv-term-meta${term.metaTone ? ` ds-adv-term-meta-${term.metaTone}` : ''}`}>
                {term.meta}
              </span>
            </div>
            <div className="ds-adv-courses">
              {term.courses.length === 0 && (
                <div className="ds-adv-course"><span className="ds-adv-title ds-panel-muted">No courses</span></div>
              )}
              {term.courses.map(c => (
                <div key={c.key} className="ds-adv-course">
                  <span className="ds-adv-code">{c.code}</span>
                  <span className="ds-adv-title">{c.title}</span>
                  <span className="ds-adv-cr">{c.cr}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="ds-adv-foot">{priorSummary}</p>
    </div>
  )
}
