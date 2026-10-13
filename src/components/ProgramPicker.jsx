import { useState } from 'react'
import { degreeTitle } from '../lib/catalogYears'
import { COMING_SOON, isProgramReady, programPath } from '../lib/programBrowser'
import { pickerModel } from '../lib/programPicker'
import './ProgramPicker.css'

/**
 * One level of where a student finds their program, drawn as its own onboarding step: the colleges, then the majors of the college,
 * then (when the major has some) its concentrations. Onboarding owns what is chosen and which step is showing; this draws the step.
 * A search (on the first step) finds a whole program and skips the rest. The picker never knows the student's start term (that is asked
 * next), so it lists the programs open to the newest catalog year and keeps the ones that closed behind one disclosure.
 *
 * Props
 *   programs, plans   concentrations rows (kind, degree, major_name, college, major_code, is_base, aliases ...), degree_plans rows
 *   stage             'college' | 'major' | 'concentration'
 *   value             the selected program's code, or null
 *   collegeCode, majorKey   what is chosen at the earlier steps
 *   searchable        show the search box (the first step only)
 *   showClosed, onShowClosed   whether programs that are no longer offered are listed
 *   onCollege(code), onMajor(major), onChange(program), onSearchPick(program)
 *   loading, error
 */
export default function ProgramPicker({
  programs, plans, stage, value, collegeCode = null, majorKey = null, searchable = false, showClosed = false, onShowClosed = () => {},
  onCollege = () => {}, onMajor = () => {}, onChange = () => {}, onSearchPick = () => {}, loading = false, error = null,
}) {
  const [query, setQuery] = useState('')

  if (loading) {
    return (
      <div className="program-picker">
        <div className="concentration-grid">
          {[0, 1, 2, 3].map(i => <div key={i} className="sk-pulse sk-ob-conc-card" />)}
        </div>
      </div>
    )
  }
  if (error) return <p className="onboarding-error">Could not load programs: {error}</p>

  const m = pickerModel({ programs, plans, value, showClosed, collegeCode, majorKey, query: searchable ? query : '' })
  const { tree, college, major, selected, results, disclosure, selectedIsClosed } = m

  // Hiding the closed programs also drops a closed program that was the selection: it would otherwise stay chosen with no way to see it.
  function hideClosed() {
    onShowClosed(false)
    if (selectedIsClosed) { onCollege(null); onMajor(null); onChange(null) }
  }

  return (
    <div className="program-picker">
      {searchable && (
        <div className="program-search">
          <input
            type="search"
            className="onboarding-input"
            placeholder="Search majors and concentrations"
            aria-label="Search majors and concentrations"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
      )}

      {selected && (
        <p className="program-crumb">
          <span className="program-crumb-label">Your program</span>
          <strong>{programPath(selected)}</strong>
        </p>
      )}

      {results ? (
        results.length === 0 ? (
          <p className="program-empty">
            No program matches “{query.trim()}”.{' '}
            {disclosure === 'show' && <button type="button" className="program-link" onClick={() => onShowClosed(true)}>Include closed programs</button>}
          </p>
        ) : (
          <div className="program-results" role="group" aria-label="Search results">
            {results.map(p => (
              <button
                key={p.code}
                type="button"
                className={`concentration-card ${selected?.code === p.code ? 'selected' : ''}`}
                aria-pressed={selected?.code === p.code}
                disabled={!isProgramReady(p)}
                onClick={() => { setQuery(''); onSearchPick(p) }}
              >
                <span className="concentration-name">{p.name}</span>
                <span className="concentration-desc">{programPath(p)}</span>
                {!isProgramReady(p) && <span className="program-tag program-tag-soon">{COMING_SOON}</span>}
              </button>
            ))}
          </div>
        )
      ) : (
        <>
          {stage === 'college' && (
            <div className="program-colleges" role="group" aria-label="Colleges">
              {tree.map(c => (
                <button
                  key={c.college.code}
                  type="button"
                  className={`program-college ${college?.college.code === c.college.code ? 'selected' : ''} ${c.majors.some(mj => mj.programs.some(isProgramReady)) ? '' : 'program-soon'}`}
                  aria-pressed={college?.college.code === c.college.code}
                  onClick={() => onCollege(c.college.code)}
                >
                  <span className="concentration-name">{c.college.short}</span>
                  <span className="concentration-desc">{c.majors.length} major{c.majors.length === 1 ? '' : 's'}</span>
                </button>
              ))}
            </div>
          )}

          {stage === 'major' && college && (
            <div className="program-majors" role="group" aria-label={`Majors in ${college.college.short}`}>
              <p className="concentration-group-title">{tree.length > 1 ? `Majors in ${college.college.short}` : 'Majors'}</p>
              <div className="program-major-list">
                {college.majors.map(mj => {
                  const ready = mj.programs.some(isProgramReady)
                  return (
                    <button
                      key={mj.key}
                      type="button"
                      className={`program-major ${major?.key === mj.key ? 'selected' : ''}`}
                      aria-pressed={major?.key === mj.key}
                      disabled={!ready}
                      onClick={() => onMajor(mj)}
                    >
                      <span className="concentration-name">{degreeTitle(mj)}</span>
                      <span className="concentration-desc">
                        {mj.concentrations.length ? `${mj.concentrations.length} concentration${mj.concentrations.length === 1 ? '' : 's'}` : 'no concentrations'}
                      </span>
                      {!ready && <span className="program-tag program-tag-soon">{COMING_SOON}</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {stage === 'concentration' && major && major.programs.length > 1 && (
            <div className="program-concentrations" role="group" aria-label={`Concentrations of ${major.majorName}`}>
              <p className="concentration-group-title">
                {major.concentrationRequired ? 'Choose your concentration' : 'Concentration (optional)'}
              </p>
              <div className="concentration-grid">
                {major.programs.map(p => (
                  <button
                    key={p.code}
                    type="button"
                    className={`concentration-card ${selected?.code === p.code ? 'selected' : ''}`}
                    aria-pressed={selected?.code === p.code}
                    disabled={!isProgramReady(p)}
                    onClick={() => onChange(p)}
                  >
                    <span className="concentration-name">{p.name}</span>
                    {p === major.base && <span className="program-tag">No concentration</span>}
                    {p.description && <span className="concentration-desc">{p.description}</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {searchable && disclosure === 'show' && (
            <p className="program-closed">
              Looking for a program that is no longer offered?{' '}
              <button type="button" className="program-link" onClick={() => onShowClosed(true)}>Show closed programs</button>
            </p>
          )}
          {searchable && disclosure === 'hide' && (
            <p className="program-closed">
              Closed programs are listed with the others.{' '}
              <button type="button" className="program-link" onClick={hideClosed}>Hide closed programs</button>
            </p>
          )}
        </>
      )}
    </div>
  )
}
