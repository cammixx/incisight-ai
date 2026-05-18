import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { apiFetch } from '../lib/api'

interface OnboardingData {
  goals: string[]
  skinType: string
  age: string
  avoidList: string[]
}

export default function Auth() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = location.state as { onboarding?: OnboardingData; mode?: 'login' | 'signup' } | null
  const onboarding = state?.onboarding
  const [mode, setMode] = useState<'login' | 'signup'>(onboarding ? 'signup' : (state?.mode ?? 'login'))
  const [loginId, setLoginId] = useState('')   // email or username for login
  const [email, setEmail] = useState('')        // email only for signup
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function saveProfile() {
    try {
      await apiFetch('/api/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          display_name: username.trim() || null,
          ...(onboarding
            ? {
                skin_type: onboarding.skinType || null,
                skin_goals: onboarding.goals,
                avoid_list: onboarding.avoidList,
              }
            : {}),
        }),
      })
    } catch {
      // Profile save is best-effort — user can update later via /profile
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setMessage(null)
    setLoading(true)

    if (mode === 'login') {
      let resolvedEmail = loginId.trim()
      // If input has no @, treat as username — look up the email
      if (!resolvedEmail.includes('@')) {
        try {
          const { email: found } = await apiFetch<{ email: string }>(
            `/api/profile/email-by-username?username=${encodeURIComponent(resolvedEmail)}`
          )
          resolvedEmail = found
        } catch {
          setLoading(false)
          setError('Username not found')
          return
        }
      }
      const { error } = await supabase.auth.signInWithPassword({ email: resolvedEmail, password })
      setLoading(false)
      if (error) {
        const msg = error.message.toLowerCase()
        if (msg.includes('invalid login credentials') || msg.includes('invalid credentials') || msg.includes('email not confirmed')) {
          setError('Wrong email or password. Please try again.')
        } else if (msg.includes('user not found') || msg.includes('no user found')) {
          setError('No account found with that email.')
        } else if (msg.includes('too many requests') || msg.includes('rate limit')) {
          setError('Too many attempts. Please wait a moment and try again.')
        } else {
          setError(error.message)
        }
      }
    } else {
      if (!username.trim()) {
        setLoading(false)
        setError('Username is required')
        return
      }
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) {
        setLoading(false)
        setError(error.message)
        return
      }
      // If session exists immediately (e.g. email confirmation disabled), save profile now
      if (data.session) {
        await saveProfile()
        setLoading(false)
        // If came from onboarding, profile is filled — go home. Otherwise prompt to finish profile.
        navigate(onboarding ? '/home' : '/profile', { replace: true })
      } else {
        setLoading(false)
        setMessage('Check your email to confirm your account.')
      }
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <button onClick={() => navigate('/')} className="mb-4 flex items-center gap-1.5 text-gray-400 transition-colors text-sm">
          <ArrowLeft size={18} />
          Back
        </button>
      <div className="w-full bg-white rounded-2xl shadow-sm border border-rose-100 p-8">
        <h1 className="text-3xl font-bold text-center text-gray-900 mb-1">
          {mode === 'login' ? 'Welcome back!' : 'Create account'}
        </h1>
        <p className="text-sm text-center text-rose-400 font-semibold mb-6">InciSight.AI</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'login' ? (
            <input
              type="text"
              placeholder="Email or username"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl border border-rose-200/60 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
            />
          ) : (
            <>
              <input
                type="text"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl border border-rose-200/60 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
              />
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl border border-rose-200/60 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
              />
            </>
          )}
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full px-4 py-3 rounded-xl border border-rose-200/60 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
          />
          {mode === 'login' && (
            <button
              type="button"
              onClick={async () => {
                if (!loginId) { setError('Enter your email or username first'); return }
                setLoading(true)
                let resolvedEmail = loginId.trim()
                if (!resolvedEmail.includes('@')) {
                  try {
                    const { email: found } = await apiFetch<{ email: string }>(
                      `/api/profile/email-by-username?username=${encodeURIComponent(resolvedEmail)}`
                    )
                    resolvedEmail = found
                  } catch {
                    setLoading(false)
                    setError('Username not found')
                    return
                  }
                }
                const { error } = await supabase.auth.resetPasswordForEmail(resolvedEmail)
                setLoading(false)
                if (error) setError(error.message)
                else setMessage('Password reset link sent to your email.')
              }}
              className="text-xs text-rose-400 hover:underline"
            >
              Forgot password?
            </button>
          )}
          {error && <p className="text-sm text-red-500">{error}</p>}
          {message && <p className="text-sm text-green-600">{message}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-rose-400 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors"
          >
            {loading ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Sign up'}
          </button>
        </form>

        {!onboarding && (
          <p className="mt-6 text-center text-sm text-gray-400">
            {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <button
              onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(null) }}
              className="text-rose-400 font-medium hover:underline"
            >
              {mode === 'login' ? 'Sign up' : 'Log in'}
            </button>
          </p>
        )}
      </div>
      </div>
    </div>
  )
}
