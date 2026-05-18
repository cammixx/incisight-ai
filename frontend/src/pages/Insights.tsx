import { useCallback, useEffect, useState, useRef } from 'react'
import { X, Camera, Search, Send, RotateCcw, Plus, GitCompare, Image, ChevronDown } from 'lucide-react'
import { apiFetch } from '../lib/api'
import PageHeader from '../components/PageHeader'
import ProductImage from '../components/ProductImage'
import { useProfile } from '../contexts/ProfileContext'

const COMMON_INGREDIENTS = ['Fragrance', 'Alcohol', 'Parabens', 'Sulfates', 'Essential Oils', 'Formaldehyde']

const QUICK_STARTS = [
  'Quick comparison',
  'Which is better for my skin?',
  'Which one aligns with my skin goal?',
]

interface Suspect { name: string; reaction_count: number; weighted_score: number; category: string | null; in_kb: boolean }
interface Product { id: string; product_name: string; image_url?: string | null }
interface OcrResult { ingredients: string[]; cleaned_text: string }
interface ShelfItem { product_id: string; product: { product_name: string; image_url?: string | null } | null }

type PinnedProduct =
  | { type: 'db'; id: string; name: string; image_url?: string | null }
  | { type: 'inline'; name: string; ingredients: string; imagePreview?: string }

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  pins?: Array<{ name: string; image?: string | null }>
  suggestedAvoid?: string[]
  time: string
}

const SUGGEST_AVOID_RE = /\[SUGGEST_AVOID:\s*([^\]]+)\]\s*$/i

function parseSuggestedAvoid(reply: string): { content: string; suggestedAvoid: string[] } {
  const match = reply.match(SUGGEST_AVOID_RE)
  if (!match) return { content: reply.trim(), suggestedAvoid: [] }
  const ingredients = match[1].split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  const content = reply.replace(SUGGEST_AVOID_RE, '').trim()
  return { content, suggestedAvoid: ingredients }
}

// ── PinSlot ───────────────────────────────────────────────────────────────────

function PinSlot({ slotLabel, pinned, onPin, shelfProducts }: {
  slotLabel: string
  pinned: PinnedProduct | null
  onPin: (p: PinnedProduct | null) => void
  shelfProducts: Product[]
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Product[]>([])
  const [open, setOpen] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [myShelf, setMyShelf] = useState(false)
  const [suggestion, setSuggestion] = useState<{ product: Product; imagePreview: string; ocrText: string } | null>(null)
  const [noMatchPending, setNoMatchPending] = useState<{ ocrText: string; imagePreview: string; name: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (myShelf) {
      const q = query.trim().toLowerCase()
      setResults(q ? shelfProducts.filter(p => p.product_name.toLowerCase().includes(q)) : shelfProducts)
      return
    }
    if (query.trim().length < 2) { setResults([]); return }
    const t = setTimeout(async () => {
      try {
        const r = await apiFetch<Product[]>(`/api/products/search?q=${encodeURIComponent(query)}`)
        setResults(r)
      } catch (err) { console.error('Product search failed:', err) }
    }, 300)
    return () => clearTimeout(t)
  }, [query, myShelf, shelfProducts])

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setScanning(true)
    const imagePreview = URL.createObjectURL(file)
    try {
      const form = new FormData()
      form.append('file', file)
      const ocr = await apiFetch<OcrResult>('/api/ocr/extract', { method: 'POST', body: form })
      const match = await apiFetch<Product | null>('/api/products/match', {
        method: 'POST',
        body: JSON.stringify({ ingredients: ocr.ingredients.join(', ') }),
      }).catch(() => null)
      if (match) {
        setSuggestion({ product: match, imagePreview, ocrText: ocr.cleaned_text })
      } else {
        setNoMatchPending({ ocrText: ocr.cleaned_text, imagePreview, name: '' })
      }
    } catch {
      URL.revokeObjectURL(imagePreview)
    } finally {
      setScanning(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  if (pinned) {
    return (
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-400 mb-1">{slotLabel}</p>
        <div className="flex items-center gap-2 px-3 py-2 bg-rose-50 border border-rose-200 rounded-xl">
          {pinned.type === 'db' ? (
            <ProductImage src={pinned.image_url} alt={pinned.name} className="w-7 h-7 rounded-lg object-contain flex-shrink-0 bg-white border border-rose-100" />
          ) : pinned.type === 'inline' && pinned.imagePreview ? (
            <img src={pinned.imagePreview} alt="scanned" className="w-7 h-7 rounded-lg object-cover flex-shrink-0 border border-rose-200" />
          ) : (
            pinned.type === 'inline' && <Camera size={12} className="text-amber-400 flex-shrink-0" />
          )}
          <span className="flex-1 text-xs font-medium text-gray-800 truncate">{pinned.name}</span>
          <button onClick={() => { if (pinned.type === 'inline') URL.revokeObjectURL(pinned.imagePreview ?? ''); onPin(null) }} className="text-gray-400 flex-shrink-0">
            <X size={13} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-gray-400">{slotLabel}</p>
        <button
          onClick={() => { setMyShelf(!myShelf); setOpen(true) }}
          className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${myShelf ? 'bg-rose-100 text-rose-500 border-rose-200' : 'text-gray-400 border-gray-200'}`}
        >
          My shelf
        </button>
      </div>
      <div className="relative">
        <div className="flex gap-1.5">
          <div className="relative flex-1">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
              placeholder={myShelf ? 'Filter shelf…' : 'Search products…'}
              className="w-full pl-7 pr-2 py-1.5 rounded-xl border border-rose-200/60 text-xs focus:outline-none focus:ring-2 focus:ring-rose-300"
            />
          </div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={scanning}
            title="Scan label"
            className="px-2 py-1.5 border border-rose-200/60 rounded-xl text-gray-400 transition-colors disabled:opacity-50"
          >
            {scanning ? <span className="text-xs text-gray-400">…</span> : <Camera size={13} />}
          </button>
        </div>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} />
        {suggestion && (
          <div className="mt-1.5 flex items-center justify-between gap-2 px-3 py-2 bg-rose-50 border border-rose-200 rounded-xl text-xs">
            <span className="text-gray-600 truncate">Found: <strong className="text-gray-800">{suggestion.product.product_name}</strong></span>
            <div className="flex gap-1.5 flex-shrink-0">
              <button
                onClick={() => { onPin({ type: 'db', id: suggestion.product.id, name: suggestion.product.product_name, image_url: suggestion.product.image_url }); URL.revokeObjectURL(suggestion.imagePreview); setSuggestion(null) }}
                className="px-2 py-0.5 bg-rose-400 text-white rounded-full font-medium"
              >Use</button>
              <button
                onClick={() => { URL.revokeObjectURL(suggestion.imagePreview); setSuggestion(null) }}
                className="px-2 py-0.5 border border-gray-200 text-gray-500 rounded-full"
              >Dismiss</button>
            </div>
          </div>
        )}
        {noMatchPending && (
          <div className="mt-1.5 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs space-y-1.5">
            <p className="text-gray-500">No match found — enter a product name to pin it</p>
            <div className="flex gap-1.5">
              <input
                value={noMatchPending.name}
                onChange={(e) => setNoMatchPending({ ...noMatchPending, name: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter' && noMatchPending.name.trim()) { onPin({ type: 'inline', name: noMatchPending.name.trim(), ingredients: noMatchPending.ocrText, imagePreview: noMatchPending.imagePreview }); setNoMatchPending(null) } }}
                placeholder="e.g. CeraVe Moisturizing Cream"
                autoFocus
                className="flex-1 px-2 py-1 rounded-lg border border-gray-200 focus:outline-none focus:ring-1 focus:ring-rose-300 text-xs"
              />
              <button
                onClick={() => { if (noMatchPending.name.trim()) { onPin({ type: 'inline', name: noMatchPending.name.trim(), ingredients: noMatchPending.ocrText, imagePreview: noMatchPending.imagePreview }); setNoMatchPending(null) } }}
                disabled={!noMatchPending.name.trim()}
                className="px-2 py-1 bg-rose-400 text-white rounded-lg font-medium disabled:opacity-40"
              >Pin</button>
              <button
                onClick={() => { URL.revokeObjectURL(noMatchPending.imagePreview); setNoMatchPending(null) }}
                className="px-2 py-1 border border-gray-200 text-gray-500 rounded-lg"
              >Dismiss</button>
            </div>
          </div>
        )}
        {open && (results.length > 0 || (myShelf && shelfProducts.length > 0)) && (
          <div className="absolute left-0 right-10 mt-1 bg-white border border-rose-100 rounded-xl shadow-lg z-20 max-h-40 overflow-y-auto">
            {results.length > 0 ? results.map((p) => (
              <button
                key={p.id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onPin({ type: 'db', id: p.id, name: p.product_name, image_url: p.image_url }); setQuery(''); setOpen(false) }}
                className="w-full text-left px-3 py-2 text-xs text-gray-700 border-b border-rose-50 last:border-b-0 truncate"
              >
                {p.product_name}
              </button>
            )) : (
              <p className="px-3 py-2 text-xs text-gray-400 italic">No items found</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score < 4)  return 'text-green-600'
  if (score < 10) return 'text-amber-500'
  return 'text-red-500'
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Insights() {

  // Suspects
  const [suspects, setSuspects] = useState<Suspect[]>([])
  const [hasReactions, setHasReactions] = useState(false)
  const [loadingSuspects, setLoadingSuspects] = useState(true)

  const { profile, update: updateProfile } = useProfile()

  // Avoid list
  const [avoidList, setAvoidList] = useState<string[]>([])
  const [avoidInput, setAvoidInput] = useState('')
  const [avoidDropdownOpen, setAvoidDropdownOpen] = useState(false)
  const [savingAvoid, setSavingAvoid] = useState(false)
  const avoidRef = useRef<HTMLDivElement>(null)

  // Chat
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const stored = localStorage.getItem('chat_history')
      return stored ? JSON.parse(stored) : []
    } catch { return [] }
  })
  const [pinnedA, setPinnedA] = useState<PinnedProduct | null>(null)
  const [pinnedB, setPinnedB] = useState<PinnedProduct | null>(null)
  const [showPinSlots, setShowPinSlots] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [showQuickStarts, setShowQuickStarts] = useState(true)
  const [showAvoidInput, setShowAvoidInput] = useState(false)
  const [avoidDupeWarning, setAvoidDupeWarning] = useState(false)
  const skinType = profile?.skin_type ?? null
  const skinGoals = profile?.skin_goals ?? []
  const userAvatar = profile?.avatar_url ?? null
  const userInitial = (profile?.display_name?.[0] ?? 'U').toUpperCase()
  const userName = profile?.display_name ?? null
  const [shelfProducts, setShelfProducts] = useState<Product[]>([])
  const chatEndRef = useRef<HTMLDivElement>(null)
  const labelFileRef = useRef<HTMLInputElement>(null)
  const [pendingAttachment, setPendingAttachment] = useState<{ preview: string; name: string; base64?: string } | null>(null)
  const [showPlusMenu, setShowPlusMenu] = useState(false)
  const [suspectsExpanded, setSuspectsExpanded] = useState(true)
  const [avoidExpanded, setAvoidExpanded] = useState(true)
  const [avoidSelectMode, setAvoidSelectMode] = useState(false)
  const [avoidSelected, setAvoidSelected] = useState<Set<string>>(new Set())
  const plusMenuRef = useRef<HTMLDivElement>(null)

  // Sync avoid list from profile context
  useEffect(() => {
    if (profile) setAvoidList([...new Set((profile.avoid_list || []).map((i: string) => i.toLowerCase()))])
  }, [profile])

  const refetchSuspects = useCallback(() => {
    apiFetch<{ suspects: Suspect[]; has_reactions: boolean }>('/api/insights/suspects')
      .then((r) => { setSuspects(r.suspects); setHasReactions(r.has_reactions) })
      .finally(() => setLoadingSuspects(false))
  }, [])

  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === 'visible' && localStorage.getItem('suspects_dirty')) {
        localStorage.removeItem('suspects_dirty')
        refetchSuspects()
      }
    }
    window.addEventListener('shelf-updated', refetchSuspects)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('shelf-updated', refetchSuspects)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [refetchSuspects])

  useEffect(() => {
    localStorage.removeItem('suspects_dirty')
    refetchSuspects()
    apiFetch<ShelfItem[]>('/api/shelf')
      .then((items) =>
        setShelfProducts(
          items.filter((i) => i.product).map((i) => ({ id: i.product_id, product_name: i.product!.product_name, image_url: i.product!.image_url }))
        )
      )
      .catch((err) => console.error('Failed to load shelf:', err))
  }, [])

  useEffect(() => {
    const t = setTimeout(() => localStorage.setItem('chat_history', JSON.stringify(messages)), 500)
    return () => clearTimeout(t)
  }, [messages])

  useEffect(() => {
    function clearOnClose() { localStorage.removeItem('chat_history') }
    window.addEventListener('beforeunload', clearOnClose)
    return () => window.removeEventListener('beforeunload', clearOnClose)
  }, [])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const handlePlusMenuOutsideClick = useCallback((e: MouseEvent) => {
    if (plusMenuRef.current && !plusMenuRef.current.contains(e.target as Node)) {
      setShowPlusMenu(false)
    }
  }, [])

  useEffect(() => {
    if (!showPlusMenu) return
    document.addEventListener('mousedown', handlePlusMenuOutsideClick)
    return () => document.removeEventListener('mousedown', handlePlusMenuOutsideClick)
  }, [showPlusMenu, handlePlusMenuOutsideClick])

  // ── Avoid list ────────────────────────────────────────────────────────────

  async function saveAvoidList(updated: string[]) {
    const deduped = [...new Set(updated.map((i) => i.toLowerCase()))]
    setSavingAvoid(true)
    try {
      await apiFetch('/api/profile', { method: 'PATCH', body: JSON.stringify({ avoid_list: deduped }) })
      setAvoidList(deduped)
      updateProfile({ avoid_list: deduped })
    } catch (err) { console.error('Failed to save avoid list:', err) }
    setSavingAvoid(false)
  }

  function addAvoid(item: string): boolean {
    const trimmed = item.trim().toLowerCase()
    if (!trimmed) return false
    if (avoidList.includes(trimmed)) {
      setAvoidDupeWarning(true)
      setTimeout(() => setAvoidDupeWarning(false), 2500)
      return false
    }
    setAvoidDupeWarning(false)
    setAvoidInput('')
    setAvoidDropdownOpen(false)
    saveAvoidList([...avoidList, trimmed])
    return true
  }


  const dropdownOptions = COMMON_INGREDIENTS.filter(
    (ing) => !avoidList.includes(ing) && ing.toLowerCase().includes(avoidInput.toLowerCase())
  )

  // ── Chat ──────────────────────────────────────────────────────────────────

  function resetChat() {
    localStorage.removeItem('chat_history')
    setMessages([])
    setPinnedA(null)
    setPinnedB(null)
    setShowPinSlots(false)
    setChatInput('')
    setShowQuickStarts(true)
  }

  function getDefaultQuery(): string {
    const skinDesc = skinType ? `${skinType.toLowerCase()} skin` : 'my skin'
    const goalDesc = skinGoals.length > 0 ? `, with goals: ${skinGoals.join(', ')}` : ''
    return `Compare these two products and tell me which is more suitable for my ${skinDesc}${goalDesc}.`
  }

  function getPinImages(): Array<{ name: string; image?: string | null }> {
    const pins: Array<{ name: string; image?: string | null }> = []
    if (pinnedA) pins.push({ name: pinnedA.name, image: pinnedA.type === 'db' ? pinnedA.image_url : pinnedA.imagePreview })
    if (pinnedB) pins.push({ name: pinnedB.name, image: pinnedB.type === 'db' ? pinnedB.image_url : pinnedB.imagePreview })
    return pins
  }

  function handleLabelUpload(file: File) {
    const preview = URL.createObjectURL(file)
    setPendingAttachment({ preview, name: file.name })
    const reader = new FileReader()
    reader.onload = (e) => {
      const base64 = e.target?.result as string
      setPendingAttachment({ preview, name: file.name, base64 })
    }
    reader.readAsDataURL(file)
  }

  async function sendMessage(text: string) {
    const hasPinned = pinnedA || pinnedB
    const messageToSend = text.trim() || (hasPinned ? getDefaultQuery() : '')
    if (!messageToSend || chatLoading) return

    // Capture pins, attachment, and history before clearing state
    const pins = hasPinned ? getPinImages() : undefined
    const snapshotAttachment = pendingAttachment
    const snapshotA = pinnedA
    const snapshotB = pinnedB
    // Pass up to last 8 messages (4 turns) as conversation history
    const history = messages.slice(-8).map((m) => ({ role: m.role, content: m.content }))

    setShowQuickStarts(false)
    setShowPinSlots(false)
    setPinnedA(null)
    setPinnedB(null)
    setPendingAttachment(null)
    const now = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    setMessages((prev) => [...prev, { role: 'user', content: messageToSend, pins, time: now() }])
    setChatInput('')
    setChatLoading(true)

    try {
      const payload: Record<string, unknown> = { message: messageToSend, history }
      if (snapshotA?.type === 'db') payload.product_id_a = snapshotA.id
      else if (snapshotA?.type === 'inline') payload.product_a = { name: snapshotA.name, ingredients: snapshotA.ingredients }
      if (snapshotB?.type === 'db') payload.product_id_b = snapshotB.id
      else if (snapshotB?.type === 'inline') payload.product_b = { name: snapshotB.name, ingredients: snapshotB.ingredients }
      if (snapshotAttachment?.base64) payload.image_base64 = snapshotAttachment.base64
      const res = await apiFetch<{ reply: string }>('/api/insights/chat', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      const { content, suggestedAvoid } = parseSuggestedAvoid(res.reply)
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content,
        suggestedAvoid: suggestedAvoid.length > 0 ? suggestedAvoid : undefined,
        time: now(),
      }])
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Sorry, something went wrong. Please try again.', time: now() }])
    } finally {
      setChatLoading(false)
    }
  }

  // ── Avatar components ─────────────────────────────────────────────────────

  function BotAvatar() {
    return (
      <div className="w-7 h-7 rounded-full bg-white border border-rose-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
        {/* @ts-ignore */}
        <lord-icon
          src="https://cdn.lordicon.com/lqcwrmzh.json"
          trigger="none"
          stroke="multicolor"
          colors="primary:#000000,secondary:#fad1e6"
          style={{ width: '24px', height: '24px', mixBlendMode: 'multiply' }}
        />
      </div>
    )
  }

  function UserAvatar() {
    return (
      <div className="w-7 h-7 rounded-full bg-rose-100 flex-shrink-0 overflow-hidden flex items-center justify-center">
        {userAvatar
          ? <img src={userAvatar} alt="you" className="w-full h-full object-cover" />
          : <span className="text-xs font-bold text-rose-400">{userInitial}</span>
        }
      </div>
    )
  }

  // ── JSX ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen">
      <PageHeader title="Your InciSight" maxWidth="max-w-5xl" />

      <main className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex gap-5 items-start">

        {/* ── Ask InciSight card ── */}
        <div className="flex-[4] min-w-0 sticky top-24 bg-white rounded-2xl border border-rose-100 shadow-sm overflow-hidden">
          {/* Card header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-rose-50">
            <div className="flex items-center gap-2.5">
              <span className="text-lg font-semibold text-gray-900">Chat</span>
            </div>
            {messages.length > 0 && (
              <button onClick={resetChat} className="flex items-center gap-1 text-xs text-gray-400 transition-colors">
                <RotateCcw size={11} /> Reset
              </button>
            )}
          </div>

          <div className="flex flex-col h-[580px]">
            {messages.length === 0 ? (
              /* ── Empty / greeting state ── */
              <div className="flex-1 flex flex-col items-center justify-center px-6 pb-4">
                <p className="text-lg text-bold text-gray-600 text-center max-w-s leading-relaxed mb-6">
                  Hey{userName ? `, ${userName}` : ''}!<br /> I am your smart skincare companion. <br />How can I help you today?
                </p>

                {/* Input bar centered */}
                <div className="w-full max-w-sm relative">
                  {showPinSlots && (
                    <div className="absolute bottom-full left-0 right-0 mb-2 bg-white border border-rose-100 rounded-2xl shadow-xl p-3 space-y-2 z-10">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-rose-400 tracking-wider">Select products to compare</span>
                        <button onClick={() => { setShowPinSlots(false); setPinnedA(null); setPinnedB(null) }} className="text-gray-400"><X size={13} /></button>
                      </div>
                      <PinSlot slotLabel="Product A" pinned={pinnedA} onPin={setPinnedA} shelfProducts={shelfProducts} />
                      <PinSlot slotLabel="Product B" pinned={pinnedB} onPin={setPinnedB} shelfProducts={shelfProducts} />
                      {showQuickStarts && (pinnedA && pinnedB) && (
                        <div className="pt-1 flex flex-wrap gap-1.5">
                          {QUICK_STARTS.map((q) => (
                            <button key={q} onClick={() => { setChatInput(q); setShowPinSlots(false); sendMessage(q) }} className="px-2.5 py-1 bg-rose-50 text-rose-500 text-xs rounded-full border border-rose-200 transition-colors">{q}</button>
                          ))}
                        </div>
                      )}
                      {(pinnedA || pinnedB) && (
                        <p className="text-xs text-gray-400 text-center pt-1 border-t border-rose-50">Type your question below ↓</p>
                      )}
                    </div>
                  )}
                  <input ref={labelFileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLabelUpload(f); e.target.value = '' }} />
                  {pendingAttachment && (
                    <div className="flex items-center gap-2 mb-2 px-2 py-1.5 bg-white border border-rose-200 rounded-xl w-fit">
                      <img src={pendingAttachment.preview} alt="attachment" className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
                      <span className="text-xs text-gray-700 max-w-[140px] truncate">{pendingAttachment.name}</span>
                      <button onClick={() => { setPendingAttachment(null); setPinnedA(null); setPinnedB(null) }} className="text-gray-400 flex-shrink-0"><X size={11} /></button>
                    </div>
                  )}
                  <div className="flex items-center gap-2 bg-rose-50 border border-rose-200/70 rounded-2xl px-3 py-2.5 shadow-sm focus-within:ring-2 focus-within:ring-rose-300 relative">
                    {/* + button with popover */}
                    <div className="relative" ref={plusMenuRef}>
                      <button
                        onClick={() => setShowPlusMenu((v) => !v)}
                        className={`w-8 h-8 rounded-xl border flex items-center justify-center flex-shrink-0 transition-colors ${showPlusMenu ? 'bg-rose-400 text-white border-rose-400' : 'border-rose-200 text-gray-400'}`}
                      >
                        <Plus size={15} />
                      </button>
                      {showPlusMenu && (
                        <div className="absolute bottom-full left-0 mb-2 bg-white border border-rose-100 rounded-2xl shadow-xl py-1.5 z-30 whitespace-nowrap">
                          <button
                            onClick={() => { setShowPlusMenu(false); setShowPinSlots(true) }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-700 transition-colors"
                          >
                            <GitCompare size={15} className="text-rose-400 flex-shrink-0" />
                            Compare two products
                          </button>
                          <button
                            onClick={() => { setShowPlusMenu(false); labelFileRef.current?.click() }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-700 transition-colors"
                          >
                            <Image size={15} className="text-amber-400 flex-shrink-0" />
                            Add files or photos
                          </button>
                        </div>
                      )}
                    </div>
                    <input
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(chatInput) } }}
                      placeholder={(pinnedA || pinnedB) ? 'Ask about these products…' : 'Ask anything…'}
                      disabled={chatLoading}
                      className="flex-1 text-sm bg-transparent focus:outline-none disabled:opacity-50 placeholder:text-gray-400"
                    />
                    <button
                      onClick={() => sendMessage(chatInput)}
                      disabled={chatLoading || (!chatInput.trim() && !pinnedA && !pinnedB)}
                      className="w-8 h-8 bg-rose-400 text-white rounded-xl flex items-center justify-center disabled:opacity-40 transition-colors flex-shrink-0"
                    >
                      <Send size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* ── Conversation state ── */
              <>
                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                  {messages.map((msg, i) => (
                    <div key={i} className={`flex items-end gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                      {msg.role === 'assistant' ? <BotAvatar /> : <UserAvatar />}
                      <div className={`flex flex-col gap-1.5 max-w-[84%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                        {msg.role === 'user' && msg.pins && msg.pins.length > 0 && (
                          <div className="flex gap-1.5 flex-wrap justify-end">
                            {msg.pins.map((pin, pi) => (
                              <div key={pi} className="flex items-center gap-1.5 px-2 py-1 bg-rose-100 border border-rose-200 rounded-xl">
                                <ProductImage src={pin.image} alt={pin.name} className="w-5 h-5 rounded object-contain" />
                                <span className="text-xs font-medium text-rose-700 max-w-[100px] truncate">{pin.name}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className={`px-3 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${msg.role === 'user' ? 'bg-rose-400 text-white rounded-tr-sm' : 'bg-rose-50 text-gray-700 rounded-tl-sm'}`}>
                          {msg.content}
                        </div>
                        {msg.role === 'assistant' && msg.suggestedAvoid && (() => {
                          const newItems = msg.suggestedAvoid.filter((i) => !avoidList.includes(i))
                          if (newItems.length === 0) return null
                          return (
                            <div className="flex flex-col gap-1.5 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700 max-w-full">
                              <span>Would you like to add these to your avoid list?</span>
                              <span className="text-gray-600 font-medium">{newItems.join(', ')}</span>
                              <div className="flex gap-1.5 pt-0.5">
                                <button
                                  onClick={async () => {
                                    await saveAvoidList([...avoidList, ...newItems])
                                    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                    setMessages((prev) => prev.map((m, idx) =>
                                      idx === i ? { ...m, suggestedAvoid: undefined } : m
                                    ))
                                    setMessages((prev) => [...prev,
                                      { role: 'user', content: 'Yes, add them to my avoid list.', time: now },
                                      { role: 'assistant', content: `Done! I've added ${newItems.join(', ')} to your avoid list.`, time: now },
                                    ])
                                  }}
                                  className="px-2.5 py-1 bg-amber-400 text-white rounded-full font-medium"
                                >Yes, add them</button>
                                <button
                                  onClick={() => setMessages((prev) => prev.map((m, idx) =>
                                    idx === i ? { ...m, suggestedAvoid: undefined } : m
                                  ))}
                                  className="px-2.5 py-1 border border-amber-300 text-amber-600 rounded-full"
                                >No thanks</button>
                              </div>
                            </div>
                          )
                        })()}
                        <span className="text-[10px] text-gray-400 px-1">{msg.time}</span>
                      </div>
                    </div>
                  ))}

                  {chatLoading && (
                    <div className="flex items-end gap-2">
                      <BotAvatar />
                      <div className="bg-rose-50 rounded-2xl rounded-bl-sm px-3 py-3">
                        <div className="flex gap-1 items-center">
                          <span className="w-1.5 h-1.5 bg-rose-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-1.5 h-1.5 bg-rose-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="w-1.5 h-1.5 bg-rose-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Input bar in conversation mode */}
                <div className="px-3 py-3 border-t border-rose-50 flex-shrink-0 relative">
                  {showPinSlots && (
                    <div className="absolute bottom-full left-0 right-0 mb-2 mx-3 bg-white border border-rose-100 rounded-2xl shadow-xl p-3 space-y-2 z-10">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-rose-400 tracking-wider">Select products to compare</span>
                        <button onClick={() => { setShowPinSlots(false); setPinnedA(null); setPinnedB(null) }} className="text-gray-400"><X size={13} /></button>
                      </div>
                      <PinSlot slotLabel="Product A" pinned={pinnedA} onPin={setPinnedA} shelfProducts={shelfProducts} />
                      <PinSlot slotLabel="Product B" pinned={pinnedB} onPin={setPinnedB} shelfProducts={shelfProducts} />
                      {showQuickStarts && (pinnedA && pinnedB) && (
                        <div className="pt-1 flex flex-wrap gap-1.5">
                          {QUICK_STARTS.map((q) => (
                            <button key={q} onClick={() => { setChatInput(q); setShowPinSlots(false); sendMessage(q) }} className="px-2.5 py-1 bg-rose-50 text-rose-500 text-xs rounded-full border border-rose-200 transition-colors">{q}</button>
                          ))}
                        </div>
                      )}
                      {(pinnedA || pinnedB) && (
                        <p className="text-xs text-gray-400 text-center pt-1 border-t border-rose-50">Type your own question below ↓</p>
                      )}
                    </div>
                  )}
                  <input ref={labelFileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLabelUpload(f); e.target.value = '' }} />
                  {pendingAttachment && (
                    <div className="flex items-center gap-2 mb-2 px-2 py-1.5 bg-white border border-rose-200 rounded-xl w-fit">
                      <img src={pendingAttachment.preview} alt="attachment" className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
                      <span className="text-xs text-gray-700 max-w-[140px] truncate">{pendingAttachment.name}</span>
                      <button onClick={() => { setPendingAttachment(null); setPinnedA(null); setPinnedB(null) }} className="text-gray-400 flex-shrink-0"><X size={11} /></button>
                    </div>
                  )}
                  <div className="flex items-center gap-2 bg-rose-50 border border-rose-200/70 rounded-2xl px-3 py-2 focus-within:ring-2 focus-within:ring-rose-300 relative">
                    <div className="relative">
                      <button
                        onClick={() => setShowPlusMenu((v) => !v)}
                        className={`w-8 h-8 rounded-xl border flex items-center justify-center flex-shrink-0 transition-colors ${showPlusMenu ? 'bg-rose-400 text-white border-rose-400' : 'border-rose-200 text-gray-400'}`}
                      >
                        <Plus size={15} />
                      </button>
                      {showPlusMenu && (
                        <div className="absolute bottom-full left-0 mb-2 bg-white border border-rose-100 rounded-2xl shadow-xl py-1.5 z-30 whitespace-nowrap">
                          <button
                            onClick={() => { setShowPlusMenu(false); setShowPinSlots(true) }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-700 transition-colors"
                          >
                            <GitCompare size={15} className="text-rose-400 flex-shrink-0" />
                            Compare two products
                          </button>
                          <button
                            onClick={() => { setShowPlusMenu(false); labelFileRef.current?.click() }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-700 transition-colors"
                          >
                            <Image size={15} className="text-amber-400 flex-shrink-0" />
                            Add files or photos
                          </button>
                        </div>
                      )}
                    </div>
                    <input
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(chatInput) } }}
                      placeholder={(pinnedA || pinnedB) ? 'Ask about these products…' : 'Ask anything…'}
                      disabled={chatLoading}
                      className="flex-1 text-sm bg-transparent focus:outline-none disabled:opacity-50 placeholder:text-gray-400"
                    />
                    <button
                      onClick={() => sendMessage(chatInput)}
                      disabled={chatLoading || (!chatInput.trim() && !pinnedA && !pinnedB)}
                      className="w-8 h-8 bg-rose-400 text-white rounded-xl flex items-center justify-center disabled:opacity-40 transition-colors flex-shrink-0"
                    >
                      <Send size={14} />
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
        {/* ── Right column ── */}
        <div className="flex-[2] min-w-0 flex flex-col gap-4">

          {/* Suspect INCI List card */}
          <div className="bg-white rounded-2xl border border-rose-100 shadow-sm">
            <div className="flex items-center justify-between px-4 py-3 border-b border-rose-50">
              <div className="flex items-center gap-1.5">
                <h2 className="text-sm font-semibold text-rose-400 tracking-wider">Suspect INCI List</h2>
                <div className="relative group">
                  <button onClick={(e) => e.stopPropagation()} className="w-4 h-4 rounded-full bg-gray-100 text-gray-400 text-[10px] font-bold flex items-center justify-center transition-colors">?</button>
                  <div className="absolute left-0 bottom-full mb-1.5 w-56 bg-white border border-rose-100 rounded-xl shadow-lg p-3 text-xs text-gray-500 z-20 hidden group-hover:block">
                    Ingredients from your reactions ranked by <span className="font-medium text-gray-600">score | count×</span>. Score combines reaction severity, recency, and ingredient safety.
                    <div className="flex items-center gap-3 mt-2 whitespace-nowrap">
                      <span className="flex items-center gap-1"><span className="text-green-600 font-semibold">●</span>Low &lt; 4</span>
                      <span className="flex items-center gap-1"><span className="text-amber-500 font-semibold">●</span>Med 4–9</span>
                      <span className="flex items-center gap-1"><span className="text-red-500 font-semibold">●</span>High ≥ 10</span>
                    </div>
                  </div>
                </div>
              </div>
              <button onClick={() => setSuspectsExpanded(v => !v)} className="text-gray-300 transition-colors">
                <ChevronDown size={15} className={`transition-transform ${suspectsExpanded ? '' : '-rotate-90'}`} />
              </button>
            </div>
            {suspectsExpanded && (
              <div className="px-4 py-3">
                {loadingSuspects && <p className="text-xs text-gray-400">Loading…</p>}
                {!loadingSuspects && suspects.length === 0 && (
                  <p className="text-xs text-gray-400">
                    {hasReactions ? 'No suspect ingredients found so far.' : 'No reactions logged yet.'}
                  </p>
                )}
                <div className="space-y-1.5">
                  {suspects.map((s, i) => (
                    <div key={s.name} className="bg-rose-50/60 rounded-xl border border-rose-100 px-3 py-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-gray-300 w-4 text-right">{i + 1}</span>
                        <span className="text-xs font-medium text-gray-800 capitalize truncate max-w-[180px]">{s.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-semibold ${scoreColor(s.weighted_score)}`}>{s.weighted_score}</span>
                        <span className="text-[10px] text-gray-300">|</span>
                        <span className="text-[10px] text-gray-400">{s.reaction_count}×</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Avoid INCI List card */}
          <div className="bg-white rounded-2xl border border-rose-100 shadow-sm">
            <div className="flex items-center justify-between px-4 py-3 border-b border-rose-50">
              <h2 className="text-sm font-semibold text-rose-400 tracking-wider">Avoid INCI List</h2>
              <div className="flex items-center gap-2">
                {savingAvoid && <span className="text-xs text-gray-400">Saving…</span>}
                {avoidSelectMode ? (
                  <>
                    <button
                      onClick={() => {
                        if (avoidSelected.size === avoidList.length) setAvoidSelected(new Set())
                        else setAvoidSelected(new Set(avoidList))
                      }}
                      className="text-xs text-rose-400 font-medium"
                    >{avoidSelected.size === avoidList.length ? 'Deselect all' : 'Select all'}</button>
                    <button
                      onClick={async () => {
                        await saveAvoidList(avoidList.filter((i) => !avoidSelected.has(i)))
                        setAvoidSelected(new Set())
                        setAvoidSelectMode(false)
                      }}
                      disabled={avoidSelected.size === 0}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-50 text-red-400 text-xs font-medium disabled:opacity-40"
                    >Delete ({avoidSelected.size})</button>
                    <button onClick={() => { setAvoidSelectMode(false); setAvoidSelected(new Set()) }} className="text-gray-400"><X size={14} /></button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setShowAvoidInput((v) => !v)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 text-rose-400 transition-colors"
                    >
                      <Plus size={13} />
                      <span className="text-xs font-medium">Add</span>
                    </button>
                    {avoidList.length > 0 && (
                      <button onClick={() => setAvoidSelectMode(true)} className="text-xs text-gray-400 font-medium px-1">Edit</button>
                    )}
                    <button onClick={() => setAvoidExpanded(v => !v)} className="text-gray-300 transition-colors">
                      <ChevronDown size={15} className={`transition-transform ${avoidExpanded ? '' : '-rotate-90'}`} />
                    </button>
                  </>
                )}
              </div>
            </div>

            {avoidExpanded && (
              <>
                {showAvoidInput && (
                  <div className="px-4 pt-3 pb-2" ref={avoidRef}>
                    {avoidDupeWarning && (
                      <p className="text-xs text-amber-600 mb-1.5">Already in your avoid list.</p>
                    )}
                    <div className="relative flex gap-2">
                      <input
                        value={avoidInput}
                        onChange={(e) => { setAvoidInput(e.target.value); setAvoidDropdownOpen(true) }}
                        onFocus={() => setAvoidDropdownOpen(true)}
                        onBlur={() => setTimeout(() => setAvoidDropdownOpen(false), 150)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { if (addAvoid(avoidInput)) setShowAvoidInput(false) } else if (e.key === 'Escape') { setShowAvoidInput(false); setAvoidInput('') } e.stopPropagation() }}
                        placeholder="Type an ingredient…"
                        autoFocus
                        className="flex-1 px-3 py-1.5 rounded-xl border border-rose-200/60 text-xs focus:outline-none focus:ring-2 focus:ring-rose-300"
                      />
                      <button onClick={() => { if (addAvoid(avoidInput)) setShowAvoidInput(false) }} className="px-3 py-1.5 bg-rose-400 text-white rounded-xl text-xs font-medium transition-colors">Save</button>
                      <button onClick={() => { setShowAvoidInput(false); setAvoidInput('') }} className="text-gray-400"><X size={14} /></button>
                      {avoidDropdownOpen && dropdownOptions.length > 0 && (
                        <div className="absolute left-0 right-20 top-full mt-1 bg-white border border-rose-100 rounded-xl shadow-lg z-50 max-h-36 overflow-y-auto">
                          {dropdownOptions.map((opt) => (
                            <button key={opt} onMouseDown={(e) => e.preventDefault()} onClick={() => { setAvoidInput(opt); setAvoidDropdownOpen(false) }} className="w-full text-left px-3 py-2 text-xs text-gray-700 transition-colors">{opt}</button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <div className="px-4 py-3">
                  {avoidList.length === 0 && !showAvoidInput && (
                    <p className="text-xs text-gray-400">None added yet.</p>
                  )}
                  <div className="space-y-1.5">
                    {avoidList.map((item, i) => (
                      <div
                        key={item}
                        onClick={() => {
                          if (!avoidSelectMode) return
                          setAvoidSelected((prev) => {
                            const next = new Set(prev)
                            next.has(item) ? next.delete(item) : next.add(item)
                            return next
                          })
                        }}
                        className={`rounded-xl border px-3 py-2 flex items-center justify-between transition-colors ${avoidSelectMode ? 'cursor-pointer' : ''} ${avoidSelected.has(item) ? 'bg-red-50 border-red-200' : 'bg-rose-50/60 border-rose-100'}`}
                      >
                        <div className="flex items-center gap-2">
                          {avoidSelectMode ? (
                            <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${avoidSelected.has(item) ? 'bg-red-400 border-red-400' : 'border-gray-300'}`}>
                              {avoidSelected.has(item) && <X size={10} className="text-white" />}
                            </div>
                          ) : (
                            <span className="text-xs font-bold text-gray-300 w-4 text-right">{i + 1}</span>
                          )}
                          <span className="text-xs font-medium text-gray-800 capitalize">{item}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

        </div>{/* end right col */}

        </div>{/* end flex row */}
      </main>
    </div>
  )
}
