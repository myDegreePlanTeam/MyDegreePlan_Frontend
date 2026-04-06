import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import Onboarding from '../components/Onboarding'
import DegreePlan from '../components/DegreePlan'

export default function Dashboard() {
  // profile holds the student's row from student_profiles
  // null  = not loaded yet
  // false = loaded but something went wrong
  const [profile, setProfile]         = useState(null)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState(null)

    useEffect(() => {
    let cancelled = false

    async function loadProfile() {
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
        setError('No authenticated user found.')
        setLoading(false)
        return
        }

        let { data, error } = await supabase
        .from('student_profiles')
        .select(`
            id,
            concentration_id,
            start_season,
            start_year,
            concentrations (
            id,
            code,
            name,
            total_hours
            )
        `)
        .eq('user_id', user.id)
        .single()

        // PGRST116 means zero rows found — profile is missing
        if (error && error.code === 'PGRST116') {
        const { data: newProfile, error: insertError } = await supabase
            .from('student_profiles')
            .insert({ user_id: user.id })
            .select(`
            id,
            concentration_id,
            start_season,
            start_year,
            concentrations (
                id,
                code,
                name,
                total_hours
            )
            `)
            .single()

        if (!cancelled) {
            if (insertError) {
            setError(insertError.message)
            } else {
            setProfile(newProfile)
            }
        }
        } else if (error) {
        if (!cancelled) setError(error.message)
        } else {
        if (!cancelled) setProfile(data)
        }

        if (!cancelled) setLoading(false)
    }

    loadProfile()

    // Cleanup function — if the component unmounts before the async
    // work finishes, cancelled = true prevents any state updates
    // from firing on an unmounted component, which prevents the
    // duplicate insert from happening on re-render
    return () => { cancelled = true }
}, [])
  // The empty [] means this effect runs only once — on mount.
  // If we put [profile] here it would re-run every time profile
  // changes, causing an infinite loop.

  // ── This is called by Onboarding when the student completes setup.
  // Instead of re-fetching from Supabase, we just update local state
  // directly with the new values — faster and no extra network call.
  function handleOnboardingComplete(updatedProfile) {
    setProfile(updatedProfile)
  }

  // ── Render logic ──────────────────────────────────────────────────
  // React renders whatever you return. We use conditional rendering
  // to show different UI depending on the current state.

  if (loading) {
    return (
      <div className="dashboard-loading">
        <p>Loading your degree plan...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="dashboard-error">
        <p>Something went wrong: {error}</p>
      </div>
    )
  }

  // If concentration_id is null the student hasn't completed onboarding.
  // Show the Onboarding component and pass it a callback to call when done.
  if (!profile.concentration_id) {
    return (
      <Onboarding
        profileId={profile.id}
        onComplete={handleOnboardingComplete}
      />
    )
  }

  // Profile is complete — show the full degree plan.
  return (
    <DegreePlan
      profile={profile}
      onProfileChange={setProfile}
    />
  )
}