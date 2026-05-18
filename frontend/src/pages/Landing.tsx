import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ScanLine, Swords, CalendarClock, Home, User, Bell, LogOut } from 'lucide-react'
import { supabase } from '../lib/supabase'
import GradientBackground from '../components/GradientBackground'

function Logo({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const px = size === 'sm' ? 32 : 48
  return (
    // @ts-ignore — lord-icon is a custom element
    <lord-icon
      src="https://cdn.lordicon.com/lqcwrmzh.json"
      trigger="loop"
      stroke="multicolor"
      colors="primary:#000000,secondary:#fad1e6"
      style={{ width: `${px}px`, height: `${px}px`, mixBlendMode: 'multiply' }}
    />
  )
}

export default function Landing() {
  const navigate = useNavigate()
  const [username, setUsername] = useState<string | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [dribble, setDribble] = useState(false)
  const ctaRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const handleCTA = useCallback((to: string) => {
    if (to === '/home') {
      navigate(to)
    } else {
      if (dribble) return
      setDribble(true)
      setTimeout(() => navigate(to), 4000)
    }
  }, [navigate, dribble])

  useEffect(() => {
    if (!menuOpen) return
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) return
      supabase
        .from('profiles')
        .select('display_name, avatar_url')
        .eq('id', data.session.user.id)
        .single()
        .then(({ data: p }) => {
          if (p?.display_name) setUsername(p.display_name)
          if (p?.avatar_url) setAvatarUrl(p.avatar_url)
        })
    })
  }, [])

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden">
      {/* Star transition overlay — only for Begin Your Journey */}
      {dribble && (
        <div className="fixed inset-0 z-[100] bg-rose-50 flex flex-col items-center justify-center gap-6">
          <GradientBackground animate={true} showDecor={false} />
          <div className="relative z-10 cta-loader">
            <svg xmlns="http://www.w3.org/2000/svg" width={32} height={32} className="cta-star" viewBox="0 0 256 256">
              <path d="M234.5,114.38l-45.1,39.36,13.51,58.6a16,16,0,0,1-23.84,17.34l-51.11-31-51,31a16,16,0,0,1-23.84-17.34L66.61,153.8,21.5,114.38a16,16,0,0,1,9.11-28.06l59.46-5.15,23.21-55.36a15.95,15.95,0,0,1,29.44,0h0L166,81.17l59.44,5.15a16,16,0,0,1,9.11,28.06Z" />
            </svg>
            <svg xmlns="http://www.w3.org/2000/svg" width={32} height={32} className="cta-star cta-star2" viewBox="0 0 256 256">
              <path d="M234.5,114.38l-45.1,39.36,13.51,58.6a16,16,0,0,1-23.84,17.34l-51.11-31-51,31a16,16,0,0,1-23.84-17.34L66.61,153.8,21.5,114.38a16,16,0,0,1,9.11-28.06l59.46-5.15,23.21-55.36a15.95,15.95,0,0,1,29.44,0h0L166,81.17l59.44,5.15a16,16,0,0,1,9.11,28.06Z" />
            </svg>
            <svg xmlns="http://www.w3.org/2000/svg" width={32} height={32} className="cta-star cta-star3" viewBox="0 0 256 256">
              <path d="M234.5,114.38l-45.1,39.36,13.51,58.6a16,16,0,0,1-23.84,17.34l-51.11-31-51,31a16,16,0,0,1-23.84-17.34L66.61,153.8,21.5,114.38a16,16,0,0,1,9.11-28.06l59.46-5.15,23.21-55.36a15.95,15.95,0,0,1,29.44,0h0L166,81.17l59.44,5.15a16,16,0,0,1,9.11,28.06Z" />
            </svg>
          </div>
          <p className="relative z-10 text-xl font-medium uppercase" style={{ animation: 'cta-text-in 0.4s ease 1.1s both', color: '#fb7185' }}>Let's get to know you a little bit!</p>
        </div>
      )}

      {/* Navbar */}
      <nav className="sticky top-0 z-50 bg-transparent">
        <div className="max-w-6xl mx-auto px-6 pt-20 h-16 flex items-center justify-end">
          {username ? (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-2 text-sm font-bold text-gray-700 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-rose-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                  {avatarUrl
                    ? <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                    : <span className="text-xs font-bold text-rose-400">{username[0].toUpperCase()}</span>
                  }
                </div>
                Hi, {username}!
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-2 w-44 bg-white border border-rose-100 rounded-2xl shadow-xl py-1.5 z-50">
                  {[
                    { label: 'Home', icon: Home, action: () => navigate('/home') },
                    { label: 'My Profile', icon: User, action: () => navigate('/profile') },
                    { label: 'Inbox', icon: Bell, action: () => navigate('/inbox') },
                    { label: 'Sign out', icon: LogOut, action: () => { supabase.auth.signOut().then(() => setUsername(null)) } },
                  ].map(({ label, icon: Icon, action }) => (
                    <button
                      key={label}
                      onClick={() => { setMenuOpen(false); action() }}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${label === 'Sign out' ? 'text-red-400' : 'text-gray-700'}`}
                    >
                      <Icon size={15} />
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/auth', { state: { mode: 'login' } })}
                className="text-sm font-semibold text-gray-600 transition-colors px-4 py-2 rounded-full"
              >
                Log in
              </button>
              <button
                onClick={() => navigate('/auth', { state: { mode: 'signup' } })}
                className="text-sm font-semibold text-white bg-rose-400 transition-colors px-5 py-2 rounded-full shadow-sm"
              >
                Sign up
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* Hero */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 text-center pb-8">
        <div className="flex items-center gap-3 -mt-6">
          <Logo />
          <p className="text-3xl font-semibold tracking-widest text-rose-400">InciSight.AI</p>
        </div>
        <div className="mt-16 flex flex-col items-center gap-2 max-w-2xl">
          {["Tired of Skin Reactions", "You Can\u2019t Explain?", "Let\u2019s Fix That!"].map(
            (t) => <p key={t} className="text-3xl md:text-5xl font-bold text-gray-900">{t}</p>
          )}
</div>

        <button
          ref={ctaRef}
          onClick={() => handleCTA(username ? '/home' : '/onboarding')}
          className="mt-10 px-8 py-4 bg-rose-400 text-white text-lg font-semibold uppercase rounded-full transition-all shadow-lg shadow-rose-200 hover:shadow-xl hover:shadow-rose-300 hover:-translate-y-0.5"
        >
          {username ? 'Go to Dashboard' : 'Begin Your Journey'}
        </button>

        {/* Feature cards — conveyor belt */}
        <div className="mt-14 w-full max-w-3xl mx-auto overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_5%,black_95%,transparent)]">
          <div className="flex gap-4 animate-conveyor hover:[animation-play-state:paused] w-max">
            {[0, 1].map(copy => (
              <div key={copy} className="flex gap-4 shrink-0">
                <button
                  onClick={() => navigate('/shelf')}
                  className="group w-64 bg-white border border-rose-100 rounded-2xl p-6 text-left shadow-sm hover:shadow-md transition-all shrink-0"
                >
                  <ScanLine size={24} className="text-rose-400 mb-3" />
                  <h3 className="font-semibold text-gray-900 group-hover:text-rose-500 transition-colors">Ingredients Scanner</h3>
                  <p className="mt-1 text-sm text-gray-500">Instantly decode labels with AI-powered ingredient insights.</p>
                </button>
                <button
                  onClick={() => navigate('/shelf')}
                  className="group w-64 bg-white border border-rose-100 rounded-2xl p-6 text-left shadow-sm hover:shadow-md transition-all shrink-0"
                >
                  <CalendarClock size={24} className="text-rose-400 mb-3" />
                  <h3 className="font-semibold text-gray-900 group-hover:text-rose-500 transition-colors">Routine Tracker</h3>
                  <p className="mt-1 text-sm text-gray-500">Track reactions and receive smart expiry alerts.</p>
                </button>
                <button
                  onClick={() => navigate('/insights')}
                  className="group w-64 bg-white border border-rose-100 rounded-2xl p-6 text-left shadow-sm hover:shadow-md transition-all shrink-0"
                >
                  <Swords size={24} className="text-rose-400 mb-3" />
                  <h3 className="font-semibold text-gray-900 group-hover:text-rose-500 transition-colors">Smart Analysis</h3>
                  <p className="mt-1 text-sm text-gray-500">Make confident choices with personalized AI safety scoring.</p>
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`@keyframes heartBeat{0%{transform:scale(1)}14%{transform:scale(1.2)}28%{transform:scale(1)}42%{transform:scale(1.2)}70%{transform:scale(1)}}`}</style>
      {/* Footer */}
      <footer className="relative z-10 py-6 text-center space-y-1">
        <p className="text-xs text-gray-500">Made with <span style={{display:'inline-block',animation:'heartBeat 2s ease-in-out infinite',transformOrigin:'50%'}}>❤️</span> for educational use.</p>
        <p className="text-xs text-gray-500">
          &copy; InciSight.AI {new Date().getFullYear()} All rights reserved
        </p>
      </footer>
    </div>
  )
}
