import { useCallback, useEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { CalendarDays, Package, Lightbulb, User, LogOut, Bell, ChevronLeft, ChevronRight } from 'lucide-react'
import { apiFetch } from '../lib/api'
import { supabase } from '../lib/supabase'
import { useProfile } from '../contexts/ProfileContext'

const tabs = [
  { label: 'Home', icon: CalendarDays, path: '/home' },
  { label: 'Shelf', icon: Package, path: '/shelf' },
  { label: 'Insights', icon: Lightbulb, path: '/insights' },
  { label: 'Profile', icon: User, path: '/profile' },
  { label: 'Inbox', icon: Bell, path: '/inbox' },
]


export default function DashboardLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { profile } = useProfile()
  const displayName = profile?.display_name ?? null
  const avatarUrl = profile?.avatar_url ?? null
  const [unreadCount, setUnreadCount] = useState(0)
  const [navExpanded, setNavExpanded] = useState(true)
  const notificationIdsRef = useRef<string[]>([])

  const computeUnread = useCallback((ids: string[]) => {
    const dismissed = new Set<string>(JSON.parse(localStorage.getItem('inbox_dismissed_ids') || '[]'))
    const read = new Set<string>(JSON.parse(localStorage.getItem('inbox_read_ids') || '[]'))
    const visible = ids.filter((id) => !dismissed.has(id))
    setUnreadCount(visible.filter((id) => !read.has(id)).length)
  }, [])

  const fetchNotifications = useCallback(() => {
    apiFetch<{ notifications: Array<{ id: string }>; unread_count: number }>('/api/notifications')
      .then((r) => {
        const incoming = new Set(r.notifications.map((n) => n.id))

        const dismissed = new Set<string>(JSON.parse(localStorage.getItem('inbox_dismissed_ids') || '[]'))
        const prunedDismissed = new Set([...dismissed].filter((id) => incoming.has(id)))
        localStorage.setItem('inbox_dismissed_ids', JSON.stringify([...prunedDismissed]))

        const read = new Set<string>(JSON.parse(localStorage.getItem('inbox_read_ids') || '[]'))
        const prunedRead = new Set([...read].filter((id) => incoming.has(id)))
        localStorage.setItem('inbox_read_ids', JSON.stringify([...prunedRead]))

        const ids = r.notifications.map((n) => n.id)
        notificationIdsRef.current = ids
        computeUnread(ids)
      })
      .catch((err) => console.error('Failed to load notifications:', err))
  }, [computeUnread])

  useEffect(() => { fetchNotifications() }, [fetchNotifications])

  // Re-fetch when read/dismissed state changes or when shelf adds create new notifications
  useEffect(() => {
    window.addEventListener('inbox-updated', fetchNotifications)
    window.addEventListener('shelf-updated', fetchNotifications)
    return () => {
      window.removeEventListener('inbox-updated', fetchNotifications)
      window.removeEventListener('shelf-updated', fetchNotifications)
    }
  }, [fetchNotifications])

  return (
    <div className="min-h-screen flex">
      <nav className={`fixed left-0 top-0 bottom-0 ${navExpanded ? 'w-48' : 'w-16'} bg-white border-r border-rose-100 z-50 flex flex-col py-6 gap-1 overflow-hidden transition-all duration-200`}>
        {/* Avatar + name + collapse toggle */}
        <div className="flex items-center px-2 mb-4 h-8 gap-1 justify-between">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-80 transition-opacity"
          >
            <div className="w-8 h-8 rounded-full bg-rose-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
              {avatarUrl ? (
                <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                <span className="text-xs font-bold text-rose-400">
                  {displayName ? displayName[0].toUpperCase() : '?'}
                </span>
              )}
            </div>
            <span className={`text-sm font-bold text-gray-700 whitespace-nowrap overflow-hidden transition-all duration-200 ${navExpanded ? 'max-w-xs' : 'max-w-0'}`}>
              {displayName || ''}
            </span>
          </button>
          <button
            onClick={() => setNavExpanded(v => !v)}
            className="flex-shrink-0 text-black transition-transform hover:scale-110 p-1 rounded-full focus:outline-none hover:bg-rose-50"
          >
            {navExpanded
              ? <ChevronLeft size={13} strokeWidth={1.8} />
              : <ChevronRight size={13} strokeWidth={1.8} />}
          </button>
        </div>

        {tabs.map((tab) => {
          const active = location.pathname === tab.path
          const isInbox = tab.path === '/inbox'
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className={`flex items-center gap-3 mx-2 px-2 py-2.5 rounded-xl transition-colors ${
                active ? 'text-rose-400 bg-rose-50' : 'text-gray-500'
              }`}
            >
              <div className="relative flex-shrink-0">
                <tab.icon size={22} strokeWidth={active ? 2.2 : 1.8} />
                {isInbox && unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-400 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </div>
              <span className={`text-xs whitespace-nowrap overflow-hidden transition-all duration-200 ${navExpanded ? 'max-w-xs' : 'max-w-0'} ${active ? 'font-semibold' : 'font-medium'}`}>
                {tab.label}
              </span>
            </button>
          )
        })}

        <div className="mt-auto flex flex-col gap-1">
          {/* Sign out */}
          <button
            onClick={() => { localStorage.removeItem('chat_history'); supabase.auth.signOut().then(() => navigate('/')) }}
            className="flex items-center gap-3 mx-2 px-2 py-2.5 rounded-xl text-gray-500 transition-colors w-full"
          >
            <LogOut size={22} strokeWidth={1.8} className="flex-shrink-0" />
            <span className={`text-xs font-medium whitespace-nowrap overflow-hidden transition-all duration-200 ${navExpanded ? 'max-w-xs' : 'max-w-0'}`}>
              Sign out
            </span>
          </button>
        </div>
      </nav>

      <div className={`flex-1 transition-all duration-200 ${navExpanded ? 'ml-48' : 'ml-16'}`}>
        <Outlet />
      </div>
    </div>
  )
}
