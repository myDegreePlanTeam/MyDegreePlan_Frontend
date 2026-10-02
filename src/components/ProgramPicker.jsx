import { useState } from 'react'
import { degreeTitle, splitByOffering } from '../lib/catalogYears'
import { groupByCollege, programPath, searchPrograms } from '../lib/programBrowser'
import './ProgramPicker.css'

/**
 * Where a student finds their program: a college, then a major, then (when it has some) a concentration, or a search that
 * skips all three. One selected program comes out; the picker never knows the student's start term (that is asked next), so
 * it lists the programs open to the newest catalog year and keeps the ones that closed behind one disclosure.
 *
 * Props
 *   programs   concentrations rows (kind, degree, major_name, college, major_code, is_base, aliases ...)
 *   plans      degree_plans rows: a program with no plan cannot be chosen
 *   value      the selected program's code, or null
 *   onChange   (program) => void
 *   loading, error
 */
export default function ProgramPicker({ programs, plans, value, onChange, loading = false, error = null }) {
  const [query, setQuery] = useState('')
  const [collegeCode, setCollegeCode] = useState(null)
  const [majorKey, setMajorKey] = useState(null)
  const [showClosed, setShowClosed] = useState(false)

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

  const { current, closed } = splitByOffering(programs, plans)
  const selected = programs.find(p => p.code === value) ?? null
  const closedShown = showClosed || (!!selected && closed.includes(selected))
  const visible = closedShown ? [...current, ...closed] : current
  const tree = groupByCollege(visible)

  // with one college (the program list has only grown to a single college so far) the college level is skipped
  const college = tree.length === 1 ? tree[0] : tree.find(c => c.college.code === (collegeCode ?? selected?.college)) ?? null
  const major = college?.majors.find(m => m.key === (majorKey ?? (selected && college.majors.find(m2 => m2.programs.includes(selected))?.key))) ?? null
  const results = query.trim() ? searchPrograms(visible, query) : null

  function chooseMajor(m) {
    setMajorKey(m.key)
    if (m.programs.length === 1) onChange(m.programs[0])
  }
  function chooseFromSearch(p) {
    setQuery('')
    setCollegeCode(p.college ?? null)
    setMajorKey(null)
    onChange(p)
  }

  return (
    <div className="program-picker">
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
            {closed.length > 0 && !closedShown && (
              <button type="button" className="program-link" onClick={() => setShowClosed(true)}>Include closed programs</button>
            )}
          </p>
        ) : (
          <div className="program-results" role="group" aria-label="Search results">
            {results.map(p => (
              <button
                key={p.code}
                type="button"
                className={`concentration-card ${selected?.code === p.code ? 'selected' : ''}`}
                aria-pressed={selected?.code === p.code}
                onClick={() => chooseFromSearch(p)}
              >
                <span className="concentration-name">{p.name}</span>
                <span className="concentration-desc">{programPath(p)}</span>
              </button>
            ))}
          </div>
        )
      ) : (
        <>
          {tree.length > 1 && (
            <div className="program-colleges" role="group" aria-label="Colleges">
              {tree.map(c => (
                <button
                  key={c.college.code}
                  type="button"
                  className={`program-college ${college?.college.code === c.college.code ? 'selected' : ''}`}
                  aria-pressed={college?.college.code === c.college.code}
                  onClick={() => { setCollegeCode(c.college.code); setMajorKey(null) }}
                >
                  <span className="concentration-name">{c.college.short}</span>
                  <span className="concentration-desc">{c.majors.length} major{c.majors.length === 1 ? '' : 's'}</span>
                </button>
              ))}
            </div>
          )}

          {college && (
            <div className="program-majors" role="group" aria-label={`Majors in ${college.college.short}`}>
              <p className="concentration-group-title">{tree.length > 1 ? `Majors in ${college.college.short}` : 'Majors'}</p>
              <div className="program-major-list">
                {college.majors.map(m => (
                  <button
                    key={m.key}
                    type="button"
                    className={`program-major ${major?.key === m.key ? 'selected' : ''}`}
                    aria-pressed={major?.key === m.key}
                    onClick={() => chooseMajor(m)}
                  >
                    <span className="concentration-name">{degreeTitle(m)}</span>
                    <span className="concentration-desc">
                      {m.concentrations.length ? `${m.concentrations.length} concentration${m.concentrations.length === 1 ? '' : 's'}` : 'no concentrations'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {major && major.programs.length > 1 && (
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

          {closed.length > 0 && !closedShown && (
            <p className="program-closed">
              Looking for a program that is no longer offered?{' '}
              <button type="button" className="program-link" onClick={() => setShowClosed(true)}>Show closed programs</button>
            </p>
          )}
        </>
      )}
    </div>
  )
}
