import { useState, useEffect } from 'react'
import { resolvePool } from '../lib/poolResolver'
import './Dashboard.css'

export default function SlotModal({ slot, courseMap, studentId, onSave, onClose }) {
  const [courses, setCourses]   = useState([])
  const [search, setSearch]     = useState('')
  const [selected, setSelected] = useState(null)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState(null)

  useEffect(() => {
    // Resolve the pool to a list of course objects when the modal opens
    const resolved = resolvePool(slot.class_code, courseMap)
    setCourses(resolved ?? [])
  }, [slot.class_code, courseMap])

  // Filter courses by search input — matches code or name case-insensitively
  const filtered = courses.filter(c =>
    c.code.toLowerCase().includes(search.toLowerCase()) ||
    c.name.toLowerCase().includes(search.toLowerCase())
  )

  async function handleSave() {
    if (!selected) return
    setSaving(true)
    setError(null)
    await onSave(slot, selected)
    setSaving(false)
  }

  // Close modal when clicking the backdrop behind the card
  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal-card">

        <div className="modal-header">
          <div>
            <p className="modal-eyebrow">Select a course</p>
            <h3 className="modal-title">{POOL_LABELS[slot.class_code] ?? slot.class_code}</h3>
            <p className="modal-sub">Semester {slot.semester_number}</p>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-search-wrap">
          <input
            className="modal-search"
            type="text"
            placeholder="Search by code or name..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
        </div>

        <div className="modal-course-list">
          {filtered.length === 0 ? (
            <p className="modal-empty">No courses match your search.</p>
          ) : (
            filtered.map(course => (
              <button
                key={course.code}
                className={`modal-course-row ${selected?.code === course.code ? 'selected' : ''}`}
                onClick={() => setSelected(course)}
              >
                <div className="modal-course-info">
                  <span className="modal-course-code">{course.code}</span>
                  <span className="modal-course-name">{course.name}</span>
                </div>
                <span className="modal-course-credits">{course.credits} cr</span>
              </button>
            ))
          )}
        </div>

        <div className="modal-footer">
          {error && <p className="modal-error">{error}</p>}
          <div className="modal-footer-btns">
            <button className="onboarding-btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              className="onboarding-btn"
              onClick={handleSave}
              disabled={!selected || saving}
            >
              {saving ? 'Saving...' : 'Select course'}
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}

const POOL_LABELS = {
  GEN_ED:             'General Education',
  ENG_LIT:            'English Literature',
  SCIENCE:            'Natural Science',
  COMM_REQ:           'Communications',
  MATH_STATS:         'Statistics',
  CSC_LOWER_ELECTIVE: 'CSC Lower Elective',
  CSC_UPPER_ELECTIVE: 'CSC Upper Elective',
  CSC_ELECTIVE:       'CSC Elective',
  CSC_HPC_ELECTIVE:   'HPC Elective',
  FREE_ELECTIVE:      'Free Elective',
}