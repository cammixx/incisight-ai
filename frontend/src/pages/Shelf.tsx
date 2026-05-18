import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Search, LayoutGrid, List, X, Upload, Pencil, ArrowLeft, ShoppingBag } from 'lucide-react'
import { apiFetch } from '../lib/api'
import PageHeader from '../components/PageHeader'
import ProductImage from '../components/ProductImage'

type ExpiryStatus = 'Expired' | 'Expiring' | 'OK'
type SortOption = 'name' | 'open_date' | 'expiry'
type ViewMode = 'grid' | 'list'

interface ShelfItem {
  id: string
  product_id: string
  open_date: string | null
  expiry_status: ExpiryStatus
  days_since_added: number | null
  product: { product_name: string; pao_months: number; image_url: string | null; product_ingredients: string; is_custom: boolean } | null
}

interface Product {
  id: string
  product_name: string
  product_ingredients: string
  pao_months: number
  low_confidence?: boolean
}

interface OcrResult {
  ingredients: string[]
  cleaned_text: string
}


const expiryOrder: Record<ExpiryStatus, number> = { Expired: 0, Expiring: 1, OK: 2 }

const sortLabels: Record<SortOption, string> = {
  name: 'Name',
  open_date: 'Date opened',
  expiry: 'Expiry status',
}

function getDaysToExpiry(item: ShelfItem): number | null {
  if (!item.open_date || !item.product?.pao_months) return null
  const expiry = new Date(item.open_date)
  expiry.setMonth(expiry.getMonth() + item.product.pao_months)
  return Math.ceil((expiry.getTime() - Date.now()) / 86400000)
}

export default function Shelf() {
  // ── Shelf state ──────────────────────────────────────────────
  const [items, setItems] = useState<ShelfItem[]>([])
  const [shelfLoading, setShelfLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<SortOption>('open_date')
  const [viewMode, setViewMode] = useState<ViewMode>('list')

  // ── Edit-dates state ─────────────────────────────────────────
  const [editingId, setEditingId] = useState<string | null>(null)
  const [shopUrls, setShopUrls] = useState<Record<string, string>>({})
  const [shopLoading, setShopLoading] = useState<Record<string, boolean>>({})
  const [editOpenDate, setEditOpenDate] = useState('')
  const [editPao, setEditPao] = useState('')
  const [editProductId, setEditProductId] = useState<string | null>(null)
  const [editIsCustom, setEditIsCustom] = useState(false)
  const [editIngredients, setEditIngredients] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  async function handleShop(item: ShelfItem) {
    if (shopUrls[item.id]) { window.open(shopUrls[item.id], '_blank'); return }
    setShopLoading((p) => ({ ...p, [item.id]: true }))
    try {
      const res = await apiFetch<{ url: string }>(`/api/products/${item.product_id}/shop`)
      setShopUrls((p) => ({ ...p, [item.id]: res.url }))
      window.open(res.url, '_blank')
    } catch (err) { console.error('Shop fetch failed:', err) }
    finally { setShopLoading((p) => ({ ...p, [item.id]: false })) }
  }

  function openEditDates(item: ShelfItem) {
    setEditingId(item.id)
    setEditOpenDate(item.open_date ?? '')
    setEditPao(String(item.product?.pao_months ?? 12))
    setEditProductId(item.product_id)
    setEditIsCustom(item.product?.is_custom ?? false)
    setEditIngredients(item.product?.product_ingredients ?? '')
  }

  async function saveEditDates() {
    if (!editingId) return
    setEditSaving(true)
    try {
      const productPatch: Record<string, unknown> = { pao_months: parseInt(editPao) || 12 }
      if (editIsCustom) productPatch.product_ingredients = editIngredients
      const [updated] = await Promise.all([
        apiFetch<ShelfItem>(`/api/shelf/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify({ open_date: editOpenDate || null }),
        }),
        editProductId && apiFetch(`/api/products/${editProductId}`, {
          method: 'PATCH',
          body: JSON.stringify(productPatch),
        }),
      ])
      setItems((prev) => prev.map((i) => (i.id === editingId ? {
        ...i, ...updated,
        product: i.product ? {
          ...i.product,
          pao_months: parseInt(editPao) || 12,
          ...(editIsCustom ? { product_ingredients: editIngredients } : {}),
        } : i.product
      } : i)))
      setEditingId(null)
    } finally {
      setEditSaving(false)
    }
  }

  // ── Add-panel state ──────────────────────────────────────────
  const [showAdd, setShowAdd] = useState(false)
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Product[]>([])
  const [ocrIngredients, setOcrIngredients] = useState<string[] | null>(null)
  const [ocrText, setOcrText] = useState('')
  const [ocrProductName, setOcrProductName] = useState('')
  const [ocrMatch, setOcrMatch] = useState<Product | null>(null)
  const [ocrImagePreview, setOcrImagePreview] = useState<string | null>(null)
  const [ocrPao, setOcrPao] = useState('12')
  const [ocrSuccess, setOcrSuccess] = useState(false)
  const [nameMatchResults, setNameMatchResults] = useState<Product[]>([])
  const [nameDropdownOpen, setNameDropdownOpen] = useState(false)
  const [nameUserEditing, setNameUserEditing] = useState(false)
  const [inciMatchSuggestion, setInciMatchSuggestion] = useState<Product | null>(null)
  const [noMatchFound, setNoMatchFound] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [openDate, setOpenDate] = useState('')
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [manualMode, setManualMode] = useState(false)
  const [manualName, setManualName] = useState('')
  const [manualIngredients, setManualIngredients] = useState('')
  const [manualPao, setManualPao] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // ── Load shelf ───────────────────────────────────────────────
  function loadShelf() {
    setShelfLoading(true)
    apiFetch<ShelfItem[]>('/api/shelf').then(setItems).finally(() => setShelfLoading(false))
  }

  useEffect(() => { loadShelf() }, [])

  async function removeItem(id: string) {
    await apiFetch(`/api/shelf/${id}`, { method: 'DELETE' })
    setItems((prev) => prev.filter((i) => i.id !== id))
    window.dispatchEvent(new Event('shelf-updated'))
    localStorage.setItem('suspects_dirty', '1')
  }

  // ── Add-panel helpers ────────────────────────────────────────
  function openAddPanel() {
    setShowAdd(true)
    setQuery('')
    setSearchResults([])
    setOcrIngredients(null)
    setOcrText('')
    setOcrProductName('')
    setOcrMatch(null)
    setOcrImagePreview(null)
    setOcrSuccess(false)
    setSelectedProduct(null)
    setOpenDate('')
    setAddError(null)
    setManualMode(false)
    setManualName('')
    setManualIngredients('')
    setManualPao('')
    setNameMatchSuggestion(null)
    setInciMatchSuggestion(null)
    setNoMatchFound(false)
  }

  // Debounced product search
  useEffect(() => {
    if (query.trim().length < 2) { setSearchResults([]); return }
    const t = setTimeout(async () => {
      try {
        const r = await apiFetch<Product[]>(`/api/products/search?q=${encodeURIComponent(query)}`)
        setSearchResults(r)
      } catch (err) { console.error('Product search failed:', err) }
    }, 300)
    return () => clearTimeout(t)
  }, [query])

  // Debounced name-match lookup when user types in the OCR product name field
  useEffect(() => {
    if (!nameUserEditing || ocrProductName.trim().length < 3) { setNameMatchResults([]); setNameDropdownOpen(false); return }
    const t = setTimeout(async () => {
      try {
        const r = await apiFetch<Product[]>(`/api/products/search?q=${encodeURIComponent(ocrProductName.trim())}`)
        setNameMatchResults(r)
        setNameDropdownOpen(r.length > 0)
      } catch { setNameMatchResults([]); setNameDropdownOpen(false) }
    }, 300)
    return () => clearTimeout(t)
  }, [ocrProductName, nameUserEditing])

  // Debounced ingredient-match lookup when user edits the ingredients textarea
  useEffect(() => {
    if (ocrText.trim().length < 20) { setInciMatchSuggestion(null); return }
    const t = setTimeout(async () => {
      try {
        const match = await apiFetch<Product | null>('/api/products/match', {
          method: 'POST',
          body: JSON.stringify({ ingredients: ocrText }),
        })
        // Only suggest if it's a different product than what's already confirmed
        if (match && match.product_name !== ocrProductName) setInciMatchSuggestion(match)
        else setInciMatchSuggestion(null)
      } catch { setInciMatchSuggestion(null) }
    }, 800)
    return () => clearTimeout(t)
  }, [ocrText])

  function selectProduct(p: Product) {
    setSelectedProduct(p)
    setSearchResults([])
    setQuery('')
    setOpenDate(new Date().toISOString().split('T')[0])
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setAddLoading(true)
    setAddError(null)
    setOcrIngredients(null)
    setOcrMatch(null)
    setOcrProductName('')
    setOcrImagePreview(URL.createObjectURL(file))
    try {
      const form = new FormData()
      form.append('file', file)
      const result = await apiFetch<OcrResult>('/api/ocr/extract', { method: 'POST', body: form })
      setOcrIngredients(result.ingredients.length > 0 ? result.ingredients : [])
      setOcrText(result.ingredients.join(', '))
      if (result.ingredients.length === 0) {
        setAddError('No ingredients detected. Please upload a photo of the ingredients list, or enter them manually below.')
      }
      setOcrSuccess(result.ingredients.length > 0)
      setTimeout(() => setOcrSuccess(false), 1200)
      try {
        const match = await apiFetch<Product | null>('/api/products/match', {
          method: 'POST',
          body: JSON.stringify({ ingredients: result.ingredients.join(', ') }),
        })
        if (match) {
          setInciMatchSuggestion(match)
          setNoMatchFound(false)
        } else {
          setNoMatchFound(true)
        }
      } catch { /* no match */ }
    } catch (e: any) {
      setAddError(e.message)
    } finally {
      setAddLoading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleSaveOcr() {
    if (!ocrText.trim()) return
    setAddLoading(true)
    setAddError(null)
    try {
      let productId: string
      if (ocrMatch) {
        productId = ocrMatch.id
      } else {
        const p = await apiFetch<Product>('/api/products', {
          method: 'POST',
          body: JSON.stringify({
            product_name: ocrProductName.trim() || 'Unknown product',
            product_ingredients: ocrText,
            pao_months: parseInt(ocrPao) || 12,
          }),
        })
        productId = p.id
      }
      await apiFetch('/api/shelf', {
        method: 'POST',
        body: JSON.stringify({ product_id: productId, open_date: openDate || null }),
      })
      setShowAdd(false)
      loadShelf()
      window.dispatchEvent(new Event('shelf-updated'))
    } catch (e: any) {
      setAddError(e.message)
    } finally {
      setAddLoading(false)
    }
  }

  async function handleAddToShelf() {
    const product = selectedProduct || ocrMatch
    if (!product) return
    setAddLoading(true)
    setAddError(null)
    try {
      await apiFetch('/api/shelf', {
        method: 'POST',
        body: JSON.stringify({ product_id: product.id, open_date: openDate || null }),
      })
      setShowAdd(false)
      loadShelf()
      window.dispatchEvent(new Event('shelf-updated'))
    } catch (e: any) {
      setAddError(e.message)
    } finally {
      setAddLoading(false)
    }
  }

  async function handleManualAdd() {
    if (!manualName.trim()) return
    setAddLoading(true)
    setAddError(null)
    try {
      const product = await apiFetch<Product>('/api/products', {
        method: 'POST',
        body: JSON.stringify({
          product_name: manualName.trim(),
          product_ingredients: manualIngredients.trim() || '',
          pao_months: manualPao ? parseInt(manualPao) : 12,
        }),
      })
      await apiFetch('/api/shelf', {
        method: 'POST',
        body: JSON.stringify({ product_id: product.id, open_date: openDate || null }),
      })
      setShowAdd(false)
      loadShelf()
      window.dispatchEvent(new Event('shelf-updated'))
    } catch (e: any) {
      setAddError(e.message)
    } finally {
      setAddLoading(false)
    }
  }

  // ── Filtered + sorted shelf ──────────────────────────────────
  const filteredItems = useMemo(() =>
    items
      .filter((item) =>
        (item.product?.product_name ?? '').toLowerCase().includes(searchQuery.toLowerCase())
      )
      .sort((a, b) => {
        if (sortBy === 'name') return (a.product?.product_name ?? '').localeCompare(b.product?.product_name ?? '')
        if (sortBy === 'open_date') return (b.open_date ?? '').localeCompare(a.open_date ?? '')
        if (sortBy === 'expiry') return expiryOrder[a.expiry_status] - expiryOrder[b.expiry_status]
        return 0
      }),
    [items, searchQuery, sortBy]
  )

  return (
    <div className="min-h-screen">
      <PageHeader title="Your Shelf" maxWidth="max-w-2xl" />

      <main className="max-w-2xl mx-auto px-4 py-8">
        {shelfLoading && <p className="text-center text-gray-400">Loading…</p>}

        {!shelfLoading && items.length === 0 && (
          <div className="text-center py-20 bg-rose-50 rounded-xl border border-rose-100">
            <p className="text-gray-500 mb-4">Your shelf is waiting to be filled</p>
            <button onClick={openAddPanel} className="px-6 py-2 bg-rose-400 text-white rounded-full text-sm font-medium">
              Add your first product
            </button>
          </div>
        )}

        {!shelfLoading && items.length > 0 && (
          <div className="space-y-4">
            {/* Search + Add */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search your shelf…"
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-rose-200/60 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
                />
              </div>
              <button onClick={openAddPanel} className="flex items-center gap-1 px-4 py-2.5 bg-rose-400 text-white text-sm font-medium rounded-xl transition-colors">
                <Plus size={16} /> Add
              </button>
            </div>

            {/* Sort + View toggle */}
            <div className="flex items-center justify-between">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="text-sm text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-rose-300 bg-white"
              >
                {(Object.keys(sortLabels) as SortOption[]).map((opt) => (
                  <option key={opt} value={opt}>{sortLabels[opt]}</option>
                ))}
              </select>

              <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 transition-colors ${viewMode === 'grid' ? 'bg-gray-100 text-gray-700' : 'text-gray-400'}`}
                >
                  <LayoutGrid size={17} />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-1.5 transition-colors ${viewMode === 'list' ? 'bg-gray-100 text-gray-700' : 'text-gray-400'}`}
                >
                  <List size={17} />
                </button>
              </div>
            </div>

            {/* Product list / grid */}
            {filteredItems.length === 0 ? (
              <p className="text-center py-8 text-sm text-gray-400">No products match your search.</p>
            ) : viewMode === 'list' ? (
              <div className="space-y-3">
                {filteredItems.map((item) => (
                  <div key={item.id} className="bg-white rounded-2xl border border-rose-100 shadow-sm p-4">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center">
                        <ProductImage src={item.product?.image_url} alt={item.product?.product_name ?? 'Product'} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{item.product?.product_name ?? 'Unknown product'}</p>
                        {item.open_date
                          ? <>
                              <p className="text-xs text-gray-400">Opened {item.open_date}</p>
                              {getDaysToExpiry(item) !== null && (
                                <p className={`text-xs ${getDaysToExpiry(item)! <= 0 ? 'text-red-400' : getDaysToExpiry(item)! <= 30 ? 'text-amber-500' : 'text-gray-400'}`}>
                                  {getDaysToExpiry(item)! <= 0 ? 'Expired' : `Expires in ${getDaysToExpiry(item)} days`}
                                </p>
                              )}
                            </>
                          : item.days_since_added !== null
                            ? <p className="text-xs text-amber-500">{item.days_since_added === 0 ? 'Not opened yet' : `Not opened since ${item.days_since_added}d ago`}</p>
                            : <p className="text-xs text-rose-400">Open date missing</p>
                        }
                      </div>
                      <div className="flex flex-col items-end gap-2 flex-shrink-0">
                        <div className="flex items-center gap-2">
                          <button onClick={() => openEditDates(item)} className="text-gray-400">
                            <Pencil size={14} />
                          </button>
                          <button onClick={() => removeItem(item.id)} className="text-red-400">
                            <X size={15} />
                          </button>
                        </div>
                        <button
                          onClick={() => handleShop(item)}
                          disabled={shopLoading[item.id]}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 border border-rose-200 text-rose-500 text-xs font-semibold rounded-full transition-colors disabled:opacity-50"
                        >
                          {shopLoading[item.id]
                            ? <span className="w-3 h-3 border-2 border-rose-300 border-t-transparent rounded-full animate-spin" />
                            : <ShoppingBag size={11} />}
                          Stock it now
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {filteredItems.map((item) => (
                  <div key={item.id} className="bg-white rounded-2xl border border-rose-100 shadow-sm overflow-hidden flex flex-col">
                    <div className="w-full h-28 flex items-center justify-center p-3">
                      <ProductImage src={item.product?.image_url} alt={item.product?.product_name ?? 'Product'} />
                    </div>
                    <div className="border-t border-rose-100" />
                    <div className="p-3 flex flex-col gap-1 flex-1">
                      <p className="font-semibold text-gray-900 text-sm leading-snug">{item.product?.product_name ?? 'Unknown product'}</p>
                      {item.open_date
                        ? <>
                            <p className="text-xs text-gray-400">Opened {item.open_date}</p>
                            {getDaysToExpiry(item) !== null && (
                              <p className={`text-xs ${getDaysToExpiry(item)! <= 0 ? 'text-red-400' : getDaysToExpiry(item)! <= 30 ? 'text-amber-500' : 'text-gray-400'}`}>
                                {getDaysToExpiry(item)! <= 0 ? 'Expired' : `Expires in ${getDaysToExpiry(item)} days`}
                              </p>
                            )}
                          </>
                        : item.days_since_added !== null
                          ? <p className="text-xs text-amber-500">{item.days_since_added === 0 ? 'Just added' : `Not opened · ${item.days_since_added}d ago`}</p>
                          : <p className="text-xs text-rose-400">Open date missing</p>
                      }
                      <div className="flex items-center justify-between mt-auto pt-2">
                        <button onClick={() => openEditDates(item)} className="text-gray-400">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => removeItem(item.id)} className="text-red-400">
                          <X size={15} />
                        </button>
                      </div>
                      <button
                        onClick={() => handleShop(item)}
                        disabled={shopLoading[item.id]}
                        className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 bg-rose-50 border border-rose-200 text-rose-500 text-xs font-semibold rounded-xl transition-colors disabled:opacity-50"
                      >
                        {shopLoading[item.id]
                          ? <span className="w-3 h-3 border-2 border-rose-300 border-t-transparent rounded-full animate-spin" />
                          : <ShoppingBag size={11} />}
                        Stock it now
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── Edit dates modal ────────────────────────────────────── */}
      {editingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setEditingId(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-80 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-900">{editIsCustom ? 'Edit product' : 'Edit dates'}</h3>
              <button onClick={() => setEditingId(null)} className="text-gray-400"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Shelf life (months)</label>
                <input
                  type="number"
                  value={editPao}
                  onChange={(e) => setEditPao(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Open date</label>
                <div className="relative">
                  <input
                    type="date"
                    value={editOpenDate}
                    onChange={(e) => setEditOpenDate(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
                  />
                  {editOpenDate && (
                    <button
                      type="button"
                      onClick={() => setEditOpenDate('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>
              {editIsCustom && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Ingredients</label>
                  <textarea
                    value={editIngredients}
                    onChange={(e) => setEditIngredients(e.target.value)}
                    rows={4}
                    placeholder="Paste or type ingredients list"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300 resize-none"
                  />
                </div>
              )}
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setEditingId(null)} className="flex-1 py-2 rounded-xl border border-gray-200 text-sm text-gray-600">
                Cancel
              </button>
              <button onClick={saveEditDates} disabled={editSaving} className="flex-1 py-2 rounded-xl bg-rose-500 text-white text-sm font-medium disabled:opacity-50">
                {editSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add product panel (overlay) ─────────────────────────── */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowAdd(false)} />

          {/* Panel */}
          <div className="relative w-full max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white flex items-center justify-between px-5 pt-5 pb-3 border-b border-rose-50 z-10">
              <h2 className="text-base font-bold text-gray-900">
                {ocrIngredients ? (
                  <button
                    onClick={() => { setOcrIngredients(null); setOcrText(''); setOcrProductName(''); setOcrMatch(null); setOcrImagePreview(null); setOcrPao('12') }}
                    className="flex items-center gap-1.5 text-rose-400 font-semibold"
                  >
                    <ArrowLeft size={14} /> Back
                  </button>
                ) : manualMode ? (
                  <button
                    onClick={() => { setManualMode(false); setManualName(''); setManualIngredients(''); setManualPao('') }}
                    className="flex items-center gap-1.5 text-rose-400 font-semibold"
                  >
                    <ArrowLeft size={14} /> Back
                  </button>
                ) : 'Add Product'}
              </h2>
              <button onClick={() => setShowAdd(false)} className="text-gray-400">
                <X size={20} />
              </button>
            </div>

            <div className="px-5 py-5 space-y-6">
              {addError && <p className="text-sm text-red-500 bg-red-50 px-4 py-2 rounded-lg">{addError}</p>}

              {!manualMode && !selectedProduct && (
                <>
                  <input ref={fileRef} type="file" accept="image/jpeg,image/png" className="hidden" onChange={handleUpload} />

                  {ocrIngredients ? (
                    /* ── OCR result form ── */
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Product name</label>
                        <div className="relative">
                          <input
                            value={ocrProductName}
                            onChange={(e) => { setOcrProductName(e.target.value); setOcrMatch(null); setNameUserEditing(true) }}
                            onBlur={() => setTimeout(() => { setNameDropdownOpen(false); setNameUserEditing(false) }, 150)}
                            placeholder="Type the product name"
                            className="w-full px-4 py-2.5 rounded-xl border border-rose-200/60 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
                          />
                          {nameDropdownOpen && nameMatchResults.length > 0 && (
                            <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-rose-100 rounded-xl shadow-lg z-20 overflow-hidden">
                              {nameMatchResults.map((p) => (
                                <button
                                  key={p.id}
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => {
                                    setOcrProductName(p.product_name)
                                    setOcrText(p.product_ingredients)
                                    setOcrPao(String(p.pao_months))
                                    setOcrMatch({ ...p, low_confidence: false })
                                    setNameMatchResults([])
                                    setNameDropdownOpen(false)
                                    setNameUserEditing(false)
                                  }}
                                  className="w-full text-left px-4 py-2.5 text-xs text-gray-700 border-b border-rose-50 last:border-b-0 hover:bg-rose-50 transition-colors"
                                >
                                  <p className="font-medium truncate">{p.product_name}</p>
                                  <p className="text-gray-400 truncate mt-0.5">{p.product_ingredients.slice(0, 60)}…</p>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        {noMatchFound && !inciMatchSuggestion && !ocrMatch && (
                          <div className="mt-1.5 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-500">
                            No match found in our library — enter the product name above
                          </div>
                        )}
                        {inciMatchSuggestion && (
                          <div className="mt-1.5 flex items-center justify-between gap-2 px-3 py-2 bg-rose-50 border border-rose-200 rounded-xl text-xs">
                            <span className="text-gray-600 truncate">
                              Found: <strong className="text-gray-800">{inciMatchSuggestion.product_name}</strong>
                            </span>
                            <div className="flex gap-1.5 flex-shrink-0">
                              <button
                                onClick={() => {
                                  setOcrProductName(inciMatchSuggestion.product_name)
                                  setOcrText(inciMatchSuggestion.product_ingredients)
                                  setOcrPao(String(inciMatchSuggestion.pao_months))
                                  setOcrMatch({ ...inciMatchSuggestion, low_confidence: false })
                                  setInciMatchSuggestion(null)
                                  setNameMatchSuggestion(null)
                                }}
                                className="px-2 py-0.5 bg-rose-400 text-white rounded-full font-medium"
                              >Use</button>
                              <button
                                onClick={() => setInciMatchSuggestion(null)}
                                className="px-2 py-0.5 border border-gray-200 text-gray-500 rounded-full"
                              >Dismiss</button>
                            </div>
                          </div>
                        )}
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Ingredients</label>
                        <textarea
                          value={ocrText}
                          onChange={(e) => { setOcrText(e.target.value); setInciMatchSuggestion(null) }}
                          rows={4}
                          className="w-full px-4 py-2.5 rounded-xl border border-rose-200/60 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">Shelf life (months)</label>
                          <input type="number" value={ocrPao} onChange={(e) => setOcrPao(e.target.value)} placeholder="12" className="w-full px-3 py-2 rounded-xl border border-rose-200/60 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300" />
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-xs text-gray-500">Open date</label>
                            {openDate && <button onClick={() => setOpenDate('')} className="text-xs font-medium text-gray-400 transition-colors">Clear</button>}
                          </div>
                          <input type="date" value={openDate} onChange={(e) => setOpenDate(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-rose-200/60 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300" />
                        </div>
                      </div>
                      {ocrMatch && (
                        <p className="text-xs font-light text-gray-600 text-center">
                          Suggested shelf life: {ocrMatch.pao_months} months
                        </p>
                      )}
                      <button onClick={handleSaveOcr} disabled={addLoading} className="w-full py-2.5 bg-rose-400 text-white rounded-xl text-sm font-semibold disabled:opacity-50">
                        {addLoading ? 'Adding…' : 'Add to shelf'}
                      </button>
                    </div>
                  ) : (
                    /* ── Upload + search ── */
                    <>
                      <section>
                        <h3 className="text-xs font-semibold text-rose-400 tracking-wider mb-2">Scan product label</h3>
                        {addLoading && ocrImagePreview ? (
                          /* ── Scanning animation ── */
                          <div className="relative w-full rounded-2xl overflow-hidden border-2 border-dashed border-rose-300 bg-rose-50/50" style={{ height: '160px' }}>
                            {/* scan line */}
                            <div className="absolute left-0 right-0 h-0.5 bg-rose-400/80 shadow-[0_0_8px_2px_rgba(251,113,133,0.6)] animate-scan-line" style={{ top: '0%' }} />
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                              <span className="text-xs font-medium text-rose-500 bg-white/80 px-2 py-0.5 rounded-full">Scanning…</span>
                            </div>
                          </div>
                        ) : ocrSuccess && ocrImagePreview ? (
                          /* ── Success flash ── */
                          <div className="relative w-full rounded-2xl overflow-hidden border-2 border-rose-300" style={{ height: '160px' }}>
                            <img src={ocrImagePreview} alt="label" className="w-full h-full object-cover opacity-60" />
                            <div className="absolute inset-0 bg-rose-50/40 flex items-center justify-center">
                              <div className="animate-ocr-success w-14 h-14 rounded-full bg-rose-400 flex items-center justify-center shadow-lg">
                                <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => fileRef.current?.click()}
                            disabled={addLoading}
                            className="w-full flex flex-col items-center gap-2 py-5 border-2 border-dashed border-rose-200 rounded-2xl transition-colors text-gray-400 disabled:opacity-50"
                          >
                            <Upload size={20} />
                            <span className="text-xs font-medium">Upload image</span>
                          </button>
                        )}
                        <ul className="mt-2 space-y-0.5">
                          {[
                            'JPEG or PNG only · max 10 MB',
                            'Crop the photo to show only the ingredients list',
                            'Ensure text is in focus and well-lit',
                          ].map((tip) => (
                            <li key={tip} className="flex items-start gap-1.5 text-[11px] text-gray-400">
                              <span className="mt-0.5 text-rose-300">•</span>
                              {tip}
                            </li>
                          ))}
                        </ul>
                      </section>

                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-px bg-gray-200" />
                        <span className="text-sm text-gray-400">or</span>
                        <div className="flex-1 h-px bg-gray-200" />
                      </div>

                      <section>
                        <h3 className="text-xs font-semibold text-rose-400 tracking-wider mb-2">Search product library</h3>
                        <div className="relative">
                          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                          <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="e.g. CeraVe Moisturizing Cream"
                            className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-rose-200/60 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
                          />
                          {searchResults.length > 0 && (
                            <div className="absolute z-20 left-0 right-0 bottom-full mb-1 bg-white border border-rose-100 rounded-xl shadow-lg max-h-52 overflow-y-auto">
                              {searchResults.map((p) => (
                                <button
                                  key={p.id}
                                  onClick={() => selectProduct(p)}
                                  className="w-full text-left px-4 py-3 transition-colors border-b border-rose-50 last:border-b-0"
                                >
                                  <p className="font-medium text-gray-900 text-sm">{p.product_name}</p>
                                  <p className="text-xs text-gray-400 mt-0.5 truncate">{p.product_ingredients}</p>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        {query.trim().length >= 2 && searchResults.length === 0 && !selectedProduct && (
                          <button
                            onClick={() => { setManualMode(true); setManualName(query); setQuery('') }}
                            className="mt-2 text-xs text-rose-400 font-medium"
                          >
                            Can't find it? Add manually
                          </button>
                        )}
                      </section>
                    </>
                  )}
                </>
              )}

              {/* Manual add form */}
              {manualMode && !selectedProduct && (
                <section className="bg-rose-50/50 rounded-2xl border border-rose-100 p-4 space-y-3">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Product name *</label>
                    <input
                      value={manualName}
                      onChange={(e) => setManualName(e.target.value)}
                      placeholder="e.g. CeraVe Moisturizing Cream"
                      className="w-full px-4 py-2.5 rounded-xl border border-rose-200/60 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Ingredients (optional)</label>
                    <textarea
                      value={manualIngredients}
                      onChange={(e) => setManualIngredients(e.target.value)}
                      rows={3}
                      placeholder="Paste or type ingredients list"
                      className="w-full px-4 py-2.5 rounded-xl border border-rose-200/60 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Shelf life (mo)</label>
                      <input
                        type="number"
                        value={manualPao}
                        onChange={(e) => setManualPao(e.target.value)}
                        placeholder="12"
                        className="w-full px-3 py-2 rounded-xl border border-rose-200/60 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Open date</label>
                      <input type="date" value={openDate} onChange={(e) => setOpenDate(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-rose-200/60 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300" />
                    </div>
                  </div>
                  <button
                    onClick={handleManualAdd}
                    disabled={addLoading || !manualName.trim()}
                    className="w-full py-2.5 bg-rose-400 text-white rounded-xl text-sm font-semibold disabled:opacity-50"
                  >
                    {addLoading ? 'Adding…' : 'Add to shelf'}
                  </button>
                </section>
              )}

              {/* Confirm selected library product */}
              {selectedProduct && (
                <section className="bg-rose-50/50 rounded-2xl border border-rose-100 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-gray-900">{selectedProduct.product_name}</p>
                    <button onClick={() => setSelectedProduct(null)} className="text-gray-400">
                      <X size={16} />
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 leading-relaxed line-clamp-3">{selectedProduct.product_ingredients}</p>
                  <p className="text-xs text-rose-700 font-medium">You can set dates now or later.</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Shelf life (months)</label>
                      <input type="number" defaultValue={selectedProduct.pao_months ?? 12} disabled className="w-full px-3 py-2 rounded-xl border border-rose-100 bg-rose-50 text-sm text-gray-500" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1 flex items-center justify-between">
                        Open date
                        {openDate && <button onClick={() => setOpenDate('')} className="text-gray-400 font-normal">Clear</button>}
                      </label>
                      <input type="date" value={openDate} onChange={(e) => setOpenDate(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-rose-200/60 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300" />
                    </div>
                  </div>
                  <button onClick={handleAddToShelf} disabled={addLoading} className="w-full py-2.5 bg-rose-400 text-white rounded-xl text-sm font-semibold disabled:opacity-50">
                    {addLoading ? 'Adding…' : 'Add to shelf'}
                  </button>
                </section>
              )}
            </div>
          </div>
        </div>
      )}


    </div>
  )
}
