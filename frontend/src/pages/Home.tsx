import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { apiFetch } from '../lib/api'
import PageHeader from '../components/PageHeader'
import ProductImage from '../components/ProductImage'
import { reactionButtonColors as problemColors, reactionBadgeColors as reactionBadge } from '../lib/colors'
import { useProfile } from '../contexts/ProfileContext'

type ReactionStatus = 'OK' | 'Irritated' | 'Breakout'
type ExpiryStatus = 'Expired' | 'Expiring' | 'OK'

interface ShelfItem {
  id: string
  product_id: string
  open_date: string | null
  expiry_status: ExpiryStatus
  product: { product_name: string; pao_months: number; image_url: string | null } | null
}

interface SkinLog {
  id: string
  shelf_item_id: string
  log_date: string
  reaction_status: ReactionStatus
  notes: string | null
  product_name: string
  image_url: string | null
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const PROBLEMS: ReactionStatus[] = ['OK', 'Irritated', 'Breakout']


const SEVERITY: Record<string, number> = { OK: 1, Irritated: 2, Breakout: 3 }

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const TODAY = toDateStr(new Date())

export default function Home() {
  const navigate = useNavigate()
  const { profile } = useProfile()
  const [profileBannerDismissed, setProfileBannerDismissed] = useState(false)
  const [userId, setUserId] = useState('')
  const [items, setItems] = useState<ShelfItem[]>([])
  const [skinLogs, setSkinLogs] = useState<SkinLog[]>([])
  const [loading, setLoading] = useState(true)
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [selectedDate, setSelectedDate] = useState<string>(TODAY)

  // Log form state
  const [logging, setLogging] = useState(false)
  const [selectedItemId, setSelectedItemId] = useState('')
  const [selectedProblems, setSelectedProblems] = useState<ReactionStatus[]>([])
  const [logNotes, setLogNotes] = useState('')
  const [openDateInput, setOpenDateInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [logError, setLogError] = useState<string | null>(null)

  // Fetch user ID once
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUserId(data.user.id)
    })
  }, [])

  // Fetch shelf items once
  useEffect(() => {
    apiFetch<ShelfItem[]>('/api/shelf')
      .then(setItems)
      .catch((err) => console.error('Failed to load shelf items:', err))
      .finally(() => setLoading(false))
  }, [])

  // Fetch skin logs whenever month changes
  useEffect(() => {
    if (!userId) return
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth()
    const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`
    const lastDay = new Date(year, month + 1, 0).getDate()

    supabase
      .from('skin_logs')
      .select('id, shelf_item_id, log_date, reaction_status, notes, user_shelf(product_id, products(product_name, image_url))')
      .eq('user_id', userId)
      .gte('log_date', `${monthStr}-01`)
      .lte('log_date', `${monthStr}-${String(lastDay).padStart(2, '0')}`)
      .then(({ data }) => {
        if (!data) return
        setSkinLogs(data.map((row: any) => ({
          id: row.id,
          shelf_item_id: row.shelf_item_id,
          log_date: row.log_date,
          reaction_status: row.reaction_status,
          notes: row.notes,
          product_name: row.user_shelf?.products?.product_name ?? 'Unknown product',
          image_url: row.user_shelf?.products?.image_url ?? null,
        })))
      })
  }, [userId, currentMonth])

  // Calendar
  const { year, month, cells } = useMemo(() => {
    const y = currentMonth.getFullYear()
    const m = currentMonth.getMonth()
    const firstDay = new Date(y, m, 1).getDay()
    const daysInMonth = new Date(y, m + 1, 0).getDate()
    const arr: (number | null)[] = []
    for (let i = 0; i < firstDay; i++) arr.push(null)
    for (let d = 1; d <= daysInMonth; d++) arr.push(d)
    while (arr.length % 7 !== 0) arr.push(null)
    return { year: y, month: m, cells: arr }
  }, [currentMonth])

  const loggedDateSet = useMemo(
    () => new Set(skinLogs.map((l) => l.log_date)),
    [skinLogs]
  )

  // Logs for the selected date
  const dayLogs = useMemo(
    () => skinLogs.filter((l) => l.log_date === selectedDate),
    [skinLogs, selectedDate]
  )

  // Items not yet logged on selectedDate
  const availableItems = useMemo(() => {
    const loggedIdsOnDate = new Set(dayLogs.map((l) => l.shelf_item_id))
    return items.filter((item) => !loggedIdsOnDate.has(item.id))
  }, [dayLogs, items])

  const selectedItem = useMemo(
    () => items.find((i) => i.id === selectedItemId) ?? null,
    [items, selectedItemId]
  )

  function resetForm() {
    setSelectedItemId('')
    setSelectedProblems([])
    setLogNotes('')
    setOpenDateInput('')
  }

  function closeForm() {
    setLogging(false)
    resetForm()
  }

  function toggleProblem(p: ReactionStatus) {
    setSelectedProblems((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    )
  }

  async function saveLog() {
    if (!selectedItemId || (selectedProblems.length === 0 && !logNotes.trim()) || !userId) return
    if (!selectedItem?.open_date && !openDateInput) {
      setLogError('Please enter the date you opened this product.')
      return
    }
    setSaving(true)
    setLogError(null)

    // Persist open_date if it was just provided
    if (!selectedItem?.open_date && openDateInput) {
      await apiFetch(`/api/shelf/${selectedItemId}`, {
        method: 'PATCH',
        body: JSON.stringify({ open_date: openDateInput }),
      })
      setItems((prev) => prev.map((i) => i.id === selectedItemId ? { ...i, open_date: openDateInput } : i))
    }

    const status: ReactionStatus = selectedProblems.length > 0
      ? selectedProblems.reduce<ReactionStatus>((worst, p) => SEVERITY[p] > SEVERITY[worst] ? p : worst, 'OK')
      : 'OK'
    const autoNote = selectedProblems.length > 1
      ? selectedProblems.join(', ') + (logNotes ? ` — ${logNotes}` : '')
      : logNotes || null

    try {
      const { data, error } = await supabase
        .from('skin_logs')
        .insert({ shelf_item_id: selectedItemId, user_id: userId, log_date: selectedDate, reaction_status: status, notes: autoNote })
        .select('id, shelf_item_id, log_date, reaction_status, notes')
        .single()

      if (error) throw error

      const newLog: SkinLog = {
        id: data.id,
        shelf_item_id: data.shelf_item_id,
        log_date: data.log_date,
        reaction_status: data.reaction_status,
        notes: data.notes,
        product_name: selectedItem?.product?.product_name ?? 'Unknown product',
        image_url: selectedItem?.product?.image_url ?? null,
      }
      setSkinLogs((prev) => [...prev, newLog])
      if (status === 'Irritated' || status === 'Breakout') {
        localStorage.setItem('suspects_dirty', '1')
      }

      closeForm()
    } catch (e: any) {
      setLogError(e.message ?? 'Failed to save log')
    } finally {
      setSaving(false)
    }
  }

  async function deleteLog(logId: string) {
    await supabase.from('skin_logs').delete().eq('id', logId)
    setSkinLogs((prev) => prev.filter((l) => l.id !== logId))
    window.dispatchEvent(new Event('shelf-updated'))
    localStorage.setItem('suspects_dirty', '1')
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading...</div>
  }

  return (
    <div className="min-h-screen">
      <PageHeader title="Your Skin Log" />

      {!profileBannerDismissed && profile && !profile.skin_type && profile.skin_goals.length === 0 && (
        <div className="max-w-lg mx-auto px-4 mt-4">
          <div className="flex items-center justify-between gap-3 bg-rose-50 border border-rose-200 rounded-2xl px-4 py-3">
            <button
              onClick={() => navigate('/profile')}
              className="flex-1 text-left text-sm text-rose-600 font-medium"
            >
              Complete your skin profile to unlock personalized insights →
            </button>
            <button onClick={() => setProfileBannerDismissed(true)} className="text-rose-300 flex-shrink-0">
              <X size={15} />
            </button>
          </div>
        </div>
      )}

      <main className="max-w-lg mx-auto px-4 space-y-6 mt-6 pb-8">
        {/* Month navigation */}
        <div className="flex items-center justify-between">
          <button onClick={() => setCurrentMonth(new Date(year, month - 1, 1))} className="p-2 text-gray-400">
            <ChevronLeft size={20} />
          </button>
          <h2 className="text-lg font-semibold text-gray-900">{MONTHS[month]} {year}</h2>
          <button onClick={() => setCurrentMonth(new Date(year, month + 1, 1))} className="p-2 text-gray-400">
            <ChevronRight size={20} />
          </button>
        </div>

        {/* Calendar grid */}
        <div className="bg-rose-50 rounded-2xl border border-rose-100 p-4">
          <div className="grid grid-cols-7 mb-2">
            {DAYS.map((d) => (
              <div key={d} className={`text-center text-xs font-medium ${d === 'Sun' || d === 'Sat' ? 'text-rose-300' : 'text-gray-400'}`}>
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-1">
            {cells.map((day, i) => {
              if (day === null) return <div key={i} />
              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              const isToday = dateStr === TODAY
              const isSelected = dateStr === selectedDate
              const dotColor = loggedDateSet.has(dateStr) ? 'bg-rose-300' : null
              return (
                <button
                  key={i}
                  onClick={() => { setSelectedDate(dateStr); closeForm() }}
                  className={`relative flex flex-col items-center justify-center py-2 rounded-xl transition-colors ${
                    isSelected ? 'bg-rose-400 text-white' : isToday ? 'bg-rose-50 text-rose-500 font-semibold' : 'text-gray-700'
                  }`}
                >
                  <span className="text-sm">{day}</span>
                  {dotColor && <span className={`absolute bottom-1 w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : dotColor}`} />}
                </button>
              )
            })}
          </div>
        </div>

        {/* Empty shelf reminder */}
        {items.length === 0 && (
          <div className="text-center py-6 bg-rose-50 rounded-xl border border-rose-100">
            <p className="text-sm text-gray-500">You haven't added any products yet.</p>
            <button onClick={() => navigate('/shelf')} className="mt-2 text-sm text-rose-400 font-medium">
              Add your first product
            </button>
          </div>
        )}

        {/* Skin Log section */}
        {items.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-rose-400 tracking-wider">My Skin Log</h3>
                <p className="text-xs text-gray-400 mt-0.5">{selectedDate}</p>
              </div>
              <button
                onClick={() => logging ? closeForm() : setLogging(true)}
                className="text-xs px-3 py-1.5 bg-rose-400 text-white rounded-full font-medium transition-colors"
              >
                {logging ? 'Cancel' : 'Log Skin'}
              </button>
            </div>


            {/* Logs for selected date */}
            {dayLogs.length > 0 ? (
              <div className="space-y-2">
                {dayLogs.map((log) => (
                  <div key={log.id} className="bg-white rounded-xl border border-rose-100 p-4 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center">
                        <ProductImage src={log.image_url} alt={log.product_name} />
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-gray-900 text-sm">{log.product_name}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${reactionBadge[log.reaction_status]}`}>
                          {log.reaction_status}
                        </span>
                        {log.notes && <p className="text-xs text-gray-500 italic">{log.notes}</p>}
                      </div>
                    </div>
                    <button onClick={() => deleteLog(log.id)} className="p-1 text-gray-300 transition-colors flex-shrink-0">
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              !logging && (
                <p className="text-center py-4 text-xs text-gray-400">
                  No logs for {selectedDate}.{availableItems.length > 0 ? ' Tap "Log Skin" to start.' : ''}
                </p>
              )
            )}
          </div>
        )}
      </main>

      {/* Log form modal */}
      {logging && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => closeForm()} />
          <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl p-6 space-y-4 z-10">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-semibold text-gray-900">My Skin Log</h3>
                <p className="text-xs text-gray-400 mt-0.5">{selectedDate}</p>
              </div>
              <button onClick={() => closeForm()} className="p-1.5 text-gray-300 transition-colors">
                <X size={18} />
              </button>
            </div>

            <div>
              <label className="text-xs text-gray-400 block mb-1.5">Product</label>
              {availableItems.length === 0 ? (
                <p className="text-sm text-gray-400 px-3 py-2.5 rounded-xl border border-rose-100 bg-rose-50">
                  All products have been logged for this date.
                </p>
              ) : (
                <select
                  value={selectedItemId}
                  onChange={(e) => { setSelectedItemId(e.target.value); setOpenDateInput('') }}
                  className="w-full px-3 py-2.5 rounded-xl border border-rose-200/60 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-rose-300"
                >
                  <option value="">Select a product…</option>
                  {availableItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.product?.product_name ?? 'Unknown product'}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {selectedItemId && !selectedItem?.open_date && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 space-y-2">
                <p className="text-xs text-amber-700 font-medium">When did you open this product?</p>
                <input
                  type="date"
                  value={openDateInput}
                  max={toDateStr(new Date())}
                  onChange={(e) => setOpenDateInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-amber-200 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                />
              </div>
            )}

            <div>
              <label className="text-xs text-gray-400 block mb-1.5">Skin reaction <span className="text-rose-300">(select all that apply)</span></label>
              <div className="flex gap-2">
                {PROBLEMS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => toggleProblem(p)}
                    className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                      selectedProblems.includes(p) ? problemColors[p] : 'border-gray-200 text-gray-500'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-400 block mb-1.5">Notes <span className="text-gray-300">(optional)</span></label>
              <input
                type="text"
                value={logNotes}
                onChange={(e) => setLogNotes(e.target.value)}
                placeholder="e.g. cheeks felt tight, minor redness…"
                className="w-full px-3 py-2.5 rounded-xl border border-rose-200/60 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
              />
            </div>

            {logError && <p className="text-xs text-red-500">{logError}</p>}
            <button
              onClick={saveLog}
              disabled={saving || !selectedItemId || (selectedProblems.length === 0 && !logNotes.trim())}
              className="w-full py-3 bg-rose-400 text-white rounded-2xl text-sm font-semibold disabled:opacity-40 transition-colors"
            >
              {saving ? 'Saving…' : 'Save Log'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
