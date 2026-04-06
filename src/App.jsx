import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState, lazy, Suspense } from 'react'
import { supabase } from './lib/supabaseClient'
import ErrorBoundary from './components/ErrorBoundary'

// Route-level code splitting: each page only downloads when first visited.
// A logged-in user never fetches Login/Signup JS; an anonymous user never
// fetches Dashboard JS. React.lazy() returns a component that triggers the
// dynamic import on first render; Suspense catches the pending state.
const Login     = lazy(() => import('./pages/Login'))
const Signup    = lazy(() => import('./pages/Signup'))
const Dashboard = lazy(() => import('./pages/Dashboard'))

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
      <Suspense fallback={null}>
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
      </Suspense>
    </BrowserRouter>
  )
}

export default App