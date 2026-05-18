import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import Landing from './pages/Landing'
import Auth from './pages/Auth'
import Home from './pages/Home'
import Shelf from './pages/Shelf'
import Insights from './pages/Insights'
import Profile from './pages/Profile'
import Inbox from './pages/Inbox'
import Onboarding from './pages/Onboarding'
import GradientBackground from './components/GradientBackground'
import DashboardLayout from './components/DashboardLayout'
import { ProfileProvider } from './contexts/ProfileContext'

function AppRoutes({ session }: { session: Session | null }) {
  const location = useLocation()
  const isLanding = location.pathname === '/'
  return (
    <div className="min-h-screen bg-rose-50/40 relative">
      <GradientBackground animate={isLanding} showDecor={isLanding} />
      <div className="relative z-10">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/onboarding" element={session ? <Navigate to="/shelf" replace /> : <Onboarding />} />
          <Route path="/auth" element={session ? <Navigate to="/home" replace /> : <Auth />} />
          <Route element={session ? <DashboardLayout /> : <Navigate to="/auth" replace />}>
            <Route path="/home" element={<Home />} />
            <Route path="/shelf" element={<Shelf />} />
            <Route path="/insights" element={<Insights />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/inbox" element={<Inbox />} />
          </Route>
        </Routes>
      </div>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading…</div>
  }

  const routes = <AppRoutes session={session} />

  return (
    <BrowserRouter>
      {session ? <ProfileProvider>{routes}</ProfileProvider> : routes}
    </BrowserRouter>
  )
}
