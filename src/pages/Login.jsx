import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Link } from 'react-router-dom'
import './Auth.css'

export default function Login() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState(null)
  const [loading, setLoading]   = useState(false)

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
    }
    // On success, App.jsx detects the new session via onAuthStateChange
    // and redirects to /dashboard automatically — no manual navigate() needed
  }

  return (
    <div className="auth-shell">

      <div className="auth-brand">
        <div className="auth-brand-inner">
          <p className="auth-brand-eyebrow">Tennessee Tech University</p>
          <h1 className="auth-brand-title">Degree<br />Planner</h1>
          <p className="auth-brand-sub">
            Plan your path. Track your progress.<br />Graduate with confidence.
          </p>
          <div className="auth-brand-rule" />
          <p className="auth-brand-dept">Department of Computer Science</p>
        </div>
      </div>

      <div className="auth-form-panel">
        <div className="auth-form-inner">
          <h2 className="auth-form-title">Sign in</h2>
          <p className="auth-form-sub">
            Don't have an account? <Link to="/signup" className="auth-link">Create one</Link>
          </p>

          <form onSubmit={handleLogin} className="auth-form">
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

            {error && <p className="auth-error">{error}</p>}

            <button className="auth-btn" type="submit" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>

    </div>
  )
}