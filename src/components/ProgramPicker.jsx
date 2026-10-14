import { useState } from 'react'
import { degreeTitle } from '../lib/catalogYears'
import { COMING_SOON, isProgramReady, programPath } from '../lib/programBrowser'
import { majorListModel } from '../lib/programPicker'

/**
 * The first screen of first run: choose a major (redesign Phase 7). Search comes first; the colleges are filter chips; the majors the
 * planner supports are listed by college, and "Show the rest" adds the ones it does not support yet. A major with more than one program
 * shows its concentrations in place, as radios, when it is chosen. Onboarding owns what is chosen; this draws it. The picker never knows
 * the student's start term (that is asked next), so it lists the programs open to the newest catalog year and keeps the ones that closed
 * behind one disclosure.
 *
 * Props
 *   programs, plans   concentrations rows (kind, degree, major_name, college, major_code, is_base, aliases ...), degree_plans rows
 *   value             the selected program's code, or null
 *   majorKey          the major opened to choose a concentration, before a program is chosen
 *   showClosed, onShowClosed   whether programs that are no longer offered are listed
 *   onMajor(major), onChange(program), onSearchPick(program)
 *   loading, error
 */
export default function ProgramPicker({
  programs, plans, value, majorKey = null, showClosed = false, onShowClosed = () => {},
  onMajor = () => {}, onChange = () => {}, onSearchPick = () => {}, loading = false, error = null,
}) {
  const [query, setQuery] = useState('')
  const [college, setCollege] = useState(null)
  const [showAll, setShowAll] = useState(false)

  if (loading) {
    return (
      <div className="fr-picker" aria-busy="true">
        {[0, 1, 2, 3].map(i => <div key={i} className="sk-pulse fr-major-skeleton" />)}
      </div>
    )
  }
  if (error) return <p className="fr-error" role="alert">Could not load the majors: {error}</p>

  const m = majorListModel({ programs, plans, value, majorKey, showClosed, college, showAll, query })
  const { colleges, groups, hiddenCount, results, selected, openMajor, disclosure, selectedIsClosed } = m

  // Hiding the closed programs also drops a closed program that was the selection: it would otherwise stay chosen with no way to see it.
  function hideClosed() {
    onShowClosed(false)
    if (selectedIsClosed) { onMajor(null); onChange(null) }
  }

  return (
    <div className="fr-picker">
      <label className="fr-field">
        <span className="fr-label">Search majors and concentrations</span>
        <input
          type="search"
          className="fr-input"
          placeholder="For example: cyber, mechanical, biology"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </label>

      {selected && (
        <p className="fr-chosen">
          <span className="fr-chosen-label">Your major</span>
          <strong>{programPath(selected)}</strong>
        </p>
      )}

      {results ? (
        results.length === 0 ? (
          <p className="fr-empty">
            Nothing matches “{query.trim()}”.{' '}
            {disclosure === 'show' && <button type="button" className="fr-link" onClick={() => onShowClosed(true)}>Include closed programs</button>}
          </p>
        ) : (
          <div className="fr-majors" role="group" aria-label="Search results">
            {results.map(p => (
              <button
                key={p.code}
                type="button"
                className={`fr-major fr-result${selected?.code === p.code ? ' fr-major-on' : ''}`}
                aria-pressed={selected?.code === p.code}
                disabled={!isProgramReady(p)}
                onClick={() => { setQuery(''); onSearchPick(p) }}
              >
                <span className="fr-major-name">{p.name}</span>
                <span className="fr-major-note">{isProgramReady(p) ? programPath(p) : COMING_SOON}</span>
              </button>
            ))}
          </div>
        )
      ) : (
        <>
          {colleges.length > 1 && (
            <div className="fr-chips" role="group" aria-label="Colleges">
              <button type="button" className={`fr-chip${college === null ? ' fr-chip-on' : ''}`} aria-pressed={college === null} onClick={() => setCollege(null)}>
                All colleges
              </button>
              {colleges.map(c => (
                <button key={c.code} type="button" className={`fr-chip${college === c.code ? ' fr-chip-on' : ''}`} aria-pressed={college === c.code} onClick={() => setCollege(c.code)}>
                  {c.short}
                </button>
              ))}
            </div>
          )}

          {hiddenCount > 0 && (
            <p className="fr-scope">
              {showAll ? 'Showing every major. The ones not in the planner yet cannot be chosen.' : 'Showing majors the planner supports today.'}{' '}
              <button type="button" className="fr-link" onClick={() => setShowAll(v => !v)}>{showAll ? 'Show only supported majors' : 'Show the rest'}</button>
            </p>
          )}

          {groups.map(({ college: c, majors }) => (
            <section key={c.code} className="fr-college" aria-label={c.short}>
              {(colleges.length > 1 || showAll) && <h3 className="fr-college-name">{c.short}</h3>}
              <div className="fr-majors">
                {majors.map(major => {
                  const open = openMajor?.key === major.key
                  const several = major.programs.length > 1
                  return (
                    <div key={major.key} className={`fr-major-wrap${open && several ? ' fr-major-open' : ''}`}>
                      <button
                        type="button"
                        className={`fr-major${open ? ' fr-major-on' : ''}`}
                        aria-pressed={open}
                        aria-expanded={several ? open : undefined}
                        disabled={!major.ready}
                        onClick={() => onMajor(major)}
                      >
                        <span className="fr-major-name">{degreeTitle(major)}</span>
                        <span className="fr-major-note">
                          {!major.ready ? COMING_SOON
                            : open && several ? 'Choose a concentration below'
                            : major.concentrations.length ? `${major.concentrations.length} concentration${major.concentrations.length === 1 ? '' : 's'}` : ''}
                        </span>
                      </button>
                      {open && several && (
                        <fieldset className="fr-concs">
                          <legend className="fr-concs-legend">{major.concentrationRequired ? 'Concentration' : 'Concentration (optional)'}</legend>
                          {major.programs.map(p => (
                            <label key={p.code} className={`fr-conc${selected?.code === p.code ? ' fr-conc-on' : ''}${isProgramReady(p) ? '' : ' fr-conc-off'}`}>
                              <input
                                type="radio" name={`fr-conc-${major.key}`} className="fr-radio" value={p.code}
                                checked={selected?.code === p.code} disabled={!isProgramReady(p)}
                                onChange={() => onChange(p)}
                              />
                              <span className="fr-conc-text">
                                <span className="fr-conc-name">{p.name}</span>
                                <span className="fr-conc-desc">
                                  {p === major.base && 'No concentration. '}{p.description}
                                </span>
                              </span>
                            </label>
                          ))}
                        </fieldset>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          ))}

          {disclosure === 'show' && (
            <p className="fr-scope">
              Looking for a program that is no longer offered?{' '}
              <button type="button" className="fr-link" onClick={() => onShowClosed(true)}>Show closed programs</button>
            </p>
          )}
          {disclosure === 'hide' && (
            <p className="fr-scope">
              Closed programs are listed with the others.{' '}
              <button type="button" className="fr-link" onClick={hideClosed}>Hide closed programs</button>
            </p>
          )}
        </>
      )}
    </div>
  )
}
