import { useEffect, useState } from 'react'
import { Check, Trash2 } from 'lucide-react'
import { apiFetch } from '../lib/api'
import PageHeader from '../components/PageHeader'
import { notificationDotColors as dotColor, notificationBorderColors as borderColor } from '../lib/colors'

interface Notification {
  id: string
  type: string
  product_name: string
  message: string
  shelf_item_id: string
  created_at: string | null
}

export default function Inbox() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [readIds, setReadIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('inbox_read_ids')
      return stored ? new Set(JSON.parse(stored)) : new Set()
    } catch { return new Set() }
  })
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('inbox_dismissed_ids')
      return stored ? new Set(JSON.parse(stored)) : new Set()
    } catch { return new Set() }
  })

  useEffect(() => {
    apiFetch<{ notifications: Notification[]; unread_count: number }>('/api/notifications')
      .then((r) => {
        setNotifications(r.notifications)
        const incoming = new Set(r.notifications.map((n) => n.id))
        setDismissedIds((prev) => {
          const pruned = new Set([...prev].filter((id) => incoming.has(id)))
          localStorage.setItem('inbox_dismissed_ids', JSON.stringify([...pruned]))
          return pruned
        })
        setReadIds((prev) => {
          const pruned = new Set([...prev].filter((id) => incoming.has(id)))
          localStorage.setItem('inbox_read_ids', JSON.stringify([...pruned]))
          const dismissed = new Set<string>(JSON.parse(localStorage.getItem('inbox_dismissed_ids') || '[]'))
          const visible = r.notifications.filter((n) => !dismissed.has(n.id))
          setUnreadCount(visible.filter((n) => !pruned.has(n.id)).length)
          return pruned
        })
      })
      .catch((err) => console.error('Failed to load notifications:', err))
  }, [])

  const visible = notifications.filter((n) => !dismissedIds.has(n.id))

  return (
    <div className="min-h-screen">
      <PageHeader title="Inbox" maxWidth="max-w-2xl">
        {unreadCount > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-500 text-xs font-semibold">
            {unreadCount} unread
          </span>
        )}
      </PageHeader>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-2">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center gap-2">
            <span className="text-4xl">✓</span>
            <p className="text-sm font-medium text-gray-500">You're all caught up!</p>
            <p className="text-xs text-gray-400">No reminders right now.</p>
          </div>
        ) : (
          visible.map((n) => {
            const isRead = readIds.has(n.id)
            const isExpanded = expandedId === n.id
            return (
              <div
                key={n.id}
                className={`w-full text-left bg-white border border-gray-100 border-l-4 ${borderColor[n.type] ?? 'border-l-gray-200'} rounded-xl p-4 space-y-1`}
              >
                <div className="flex items-center justify-between gap-2">
                  <button
                    className="flex items-center gap-2 flex-1 min-w-0 text-left"
                    onClick={() => {
                      setReadIds((prev) => {
                        const next = new Set(prev).add(n.id)
                        localStorage.setItem('inbox_read_ids', JSON.stringify([...next]))
                        window.dispatchEvent(new Event('inbox-updated'))
                        return next
                      })
                      setUnreadCount((prev) => Math.max(0, isRead ? prev : prev - 1))
                      setExpandedId(isExpanded ? null : n.id)
                    }}
                  >
                    {!isRead && <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor[n.type] ?? 'bg-gray-300'}`} />}
                    <p className={`text-sm font-semibold text-gray-800 ${isExpanded ? '' : 'truncate'}`}>
                      {n.product_name}
                    </p>
                  </button>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isRead && (
                      <div className="relative group flex items-center">
                        <button
                          onClick={() => {
                            setReadIds((prev) => {
                              const next = new Set(prev)
                              next.delete(n.id)
                              localStorage.setItem('inbox_read_ids', JSON.stringify([...next]))
                              window.dispatchEvent(new Event('inbox-updated'))
                              return next
                            })
                            setUnreadCount((prev) => prev + 1)
                          }}
                          className="text-gray-300 transition-colors"
                        >
                          <Check size={16} />
                        </button>
                        <div className="absolute bottom-full right-0 mb-1.5 px-2 py-1 bg-gray-800 text-white text-[10px] rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                          Mark as unread
                        </div>
                      </div>
                    )}
                    <button
                      onClick={() => {
                        setDismissedIds((prev) => {
                          const next = new Set(prev).add(n.id)
                          localStorage.setItem('inbox_dismissed_ids', JSON.stringify([...next]))
                          window.dispatchEvent(new Event('inbox-updated'))
                          return next
                        })
                        if (!isRead) setUnreadCount((prev) => Math.max(0, prev - 1))
                      }}
                      className="text-gray-300 transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                <p className={`text-xs text-gray-500 ${isExpanded ? '' : 'truncate'}`}>
                  {n.message}
                </p>
                {n.created_at && (
                  <p className="text-[10px] text-gray-300">
                    {new Date(n.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                )}
              </div>
            )
          })
        )}
      </main>
    </div>
  )
}
