import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Link } from 'react-router-dom'
import './Auth.css'

export default function Signup() {
  const [email, setEmail]             = useState('')
  const [password, setPassword]       = useState('')
  const [confirmPassword, setConfirm] = useState('')
  const [error, setError]             = useState(null)
  const [loading, setLoading]         = useState(false)

  async function handleSignup(e) {
    e.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setLoading(true)

    const { error } = await supabase.auth.signUp({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
    }
    // On success, Supabase sends a confirmation email and the auth trigger
    // automatically creates the student_profiles row.
    // App.jsx detects the session via onAuthStateChange and redirects to /dashboard.
  }

  return (
    <div className="auth-shell">

      <div className="auth-brand">
        <div className="auth-brand-inner">
          <p className="auth-brand-eyebrow">Tennessee Tech University</p>
          <h1 className="auth-brand-title">Degree<br />Planner</h1>
          <p className="auth-brand-sub">
            Build your four-year plan.<br />
            Stay on track every semester.
          </p>
          <div className="auth-brand-rule" />
          <p className="auth-brand-dept">Department of Computer Science</p>
        </div>
      </div>

      <div className="auth-form-panel">
        <div className="auth-form-inner">
          <h2 className="auth-form-title">Create account</h2>
          <p className="auth-form-sub">
            Already have an account? <Link to="/login" className="auth-link">Sign in</Link>
          </p>

          <form onSubmit={handleSignup} className="auth-form">
            <div className="auth-field">
              <label className="auth-label">Email</label>
              <input
                className="auth-input"
                type="email"
                placeholder="you@tntech.edu"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="auth-field">
              <label className="auth-label">Password</label>
              <input
                className="auth-input"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>

            <div className="auth-field">
              <label className="auth-label">Confirm Password</label>
              <input
                className="auth-input"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={e => setConfirm(e.target.value)}
                required
              />
            </div>

            {error && <p className="auth-error">{error}</p>}

            <button className="auth-btn" type="submit" disabled={loading}>
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          </form>
        </div>
      </div>

    </div>
  )
}