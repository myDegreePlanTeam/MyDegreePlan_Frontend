import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from './lib/supabaseClient'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Dashboard from './pages/Dashboard'
import ErrorBoundary from './components/ErrorBoundary'

function App() {
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    // Get the current session on initial load
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

    // Listen for login/logout events and update session state
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  // Still checking auth state — render nothing to avoid flash
  if (session === undefined) return null

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={
          session ? <Navigate to="/dashboard" replace /> : <Login />
        } />
        <Route path="/signup" element={
          session ? <Navigate to="/dashboard" replace /> : <Signup />
        } />
        <Route path="/dashboard" element={
          session ? <ErrorBoundary><Dashboard /></ErrorBoundary> : <Navigate to="/login" replace />
        } />
        <Route path="*" element={
          <Navigate to={session ? "/dashboard" : "/login"} replace />
        } />
      </Routes>
    </BrowserRouter>
  )
}

export default App