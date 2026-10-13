import { useEffect, useMemo, useState } from 'react'
import { db } from '../../lib/dataClient'
import { academicYearOf, degreeTitle } from '../../lib/catalogYears'
import { selectWithOptional } from '../../lib/dbErrors'
import { groupByCollege, searchPrograms } from '../../lib/programBrowser'
import { termForDate } from '../../lib/semesterTerms'
import { ENTRY_SEASONS, OVERLAP_NOTE, addableMajors, newProgramRow } from '../../lib/addProgram'

/**
 * "Add a second major": pick a degree program, say which term the student starts it, read the overlap note, confirm.
 * `onAdd(row)` receives the student_programs row to write (lib/addProgram.js). Programs that are already in the plan, another
 * concentration of the student's own major, and programs with no plan for the declared term are not offered.
 */
export default function AddProgramModal({ profile, addedPrograms, onAdd, onClose, adding, error }) {
  const [programs, setPrograms] = useState([])
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(null)
  const [selected, setSelected] = useState(null)
  const [query, setQuery] = useState('')
  const today = useMemo(() => termForDate(new Date()), [])
  const [season, setSeason] = useState(today.season)
  const [year, setYear] = useState(today.year)

  useEffect(() => {
    Promise.all([
      selectWithOptional(
        columns => db.from('concentrations').select(columns).order('id', { ascending: true }),
        'id, code, name, total_hours',
        ['kind', 'degree', 'major_name', 'department', 'supersedes', 'last_catalog_year', 'description', 'college', 'major_code', 'is_base', 'aliases'],
      ),
      db.from('degree_plans').select('id, concentration_id, catalog_year, gened_program, total_hours, covers_earlier'),
    ]).then(([programsRes, plansRes]) => {
      const failure = programsRes.error ?? plansRes.error
      if (failure) setFetchError(failure.message)
      else { setPrograms(programsRes.data); setPlans(plansRes.data) }
      setLoading(false)
    })
  }, [])

  const termYear = academicYearOf(season, year)
  const primary = programs.find(p => p.id === profile.concentration_id) ?? null
  const options = addableMajors(programs, plans, termYear, { primary, added: addedPrograms })
  const tree = groupByCollege(query.trim() ? searchPrograms(options, query) : options)
  const chosen = options.find(p => p.id === selected?.id) ?? null
  const row = chosen ? newProgramRow({ studentId: profile.id, program: chosen, plans, season, year, position: 1 + Math.max(0, ...addedPrograms.map(p => p.position ?? 0)) }) : null
  const years = Array.from({ length: 6 }, (_, i) => today.year - 1 + i)

  return (
    <div className="ds-modal-backdrop" onClick={e => { if (e.target === e.currentTarget && !adding) onClose() }}>
      <div className="ds-modal" role="dialog" aria-modal="true" aria-labelledby="add-program-title">
        <div className="ds-modal-head">
          <p className="ds-eyebrow">Degree programs</p>
          <h3 className="ds-modal-title" id="add-program-title">Add a second major</h3>
          <p className="ds-sub" style={{ fontSize: 11, lineHeight: 1.6 }}>
            Your plan keeps its current degree program and adds the courses this one needs.
          </p>
        </div>
        <div className="ds-modal-body">
          <p className="ds-eyebrow" style={{ margin: '0 0 6px' }}>Starting</p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <select className="ds-act-input" style={{ textAlign: 'left' }} aria-label="Year you start the second major" value={year} onChange={e => { setYear(Number(e.target.value)); setSelected(null) }} disabled={adding}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <select className="ds-act-input" style={{ textAlign: 'left' }} aria-label="Semester you start the second major" value={season} onChange={e => { setSeason(e.target.value); setSelected(null) }} disabled={adding}>
              {ENTRY_SEASONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          {loading ? (
            <p className="ds-modal-text">Loading programs…</p>
          ) : fetchError ? (
            <p className="ds-modal-text" style={{ color: 'var(--danger)' }}>{fetchError}</p>
          ) : (
            <>
              {options.length > 10 && (
                <input
                  type="search"
                  className="ds-act-input"
                  style={{ width: '100%', margin: '0 0 6px', textAlign: 'left' }}
                  placeholder="Search majors"
                  aria-label="Search majors"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                />
              )}
              {tree.length === 0 && <p className="ds-modal-text">{query.trim() ? `No program matches “${query.trim()}”.` : 'No other degree program can be added for that term yet.'}</p>}
              {tree.map(({ college, majors }) => (
                <div key={college.code}>
                  {tree.length > 1 && <p className="ds-eyebrow" style={{ margin: '14px 0 2px' }}>{college.short}</p>}
                  {majors.map(major => (
                    <div key={major.key}>
                      {(tree.length > 1 || majors.length > 1) && <p className="ds-eyebrow" style={{ margin: '10px 0 4px' }}>{degreeTitle(major)}</p>}
                      {major.programs.map(c => (
                        <button key={c.id} className={`ds-option${chosen?.id === c.id ? ' ds-option-selected' : ''}`} onClick={() => setSelected(c)} disabled={adding}>
                          <span className="ds-option-mark" aria-hidden="true">{chosen?.id === c.id ? '●' : '○'}</span>
                          <span className="ds-option-text"><span className="ds-setting-label">{c.name}</span></span>
                          <span className="ds-option-meta">{c.total_hours} hrs</span>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </>
          )}
          {chosen && <p className="ds-modal-warn">{OVERLAP_NOTE}</p>}
          {error && <p className="ds-modal-text" role="alert" style={{ color: 'var(--danger)' }}>{error}</p>}
        </div>
        <div className="ds-modal-foot">
          <button className="ds-btn-ghost" onClick={onClose} disabled={adding}>Cancel</button>
          <button className="ds-btn-primary" onClick={() => row && onAdd(row)} disabled={!row || adding}>
            {adding ? 'Adding…' : chosen ? `Add ${chosen.name}` : 'Choose a degree program'}
          </button>
        </div>
      </div>
    </div>
  )
}
