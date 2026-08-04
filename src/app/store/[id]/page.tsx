'use client'

import { useEffect, useRef, useState, Suspense } from 'react'
import { createPortal } from 'react-dom'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Quantity } from '@/lib/types'
import Toast from '@/components/Toast'

const BRAND_ALIASES: Record<string, string> = {
  'alani':          'Alani Nu',
  'alani nu':       'Alani Nu',
  'red bull':       'Red Bull',
  'redbull':        'Red Bull',
  'monster':        'Monster',
  'monster energy': 'Monster',
  'celsius':        'Celsius',
  'ghost':          'Ghost',
  'reign':          'Reign',
  'rockstar':       'Rockstar',
  'bang':           'Bang',
  'nos':            'NOS',
}

function normalizeBrand(input: string): string {
  const key = input.trim().toLowerCase()
  return BRAND_ALIASES[key] ?? input.trim()
}

const TYPE_ICON: Record<string, string> = {
  gas_station: '⛽',
  convenience: '🏪',
  grocery: '🛒',
  other: '📍',
}

const TYPE_LABEL: Record<string, string> = {
  gas_station: 'Gas Station',
  convenience: 'Convenience Store',
  grocery: 'Grocery Store',
  other: 'Store',
}

const QUANTITY_CONFIG: Record<Quantity, { label: string; color: string; bg: string; border: string }> = {
  out:    { label: 'OUT',  color: '#FF4545', bg: 'rgba(255,69,69,0.08)',  border: 'rgba(255,69,69,0.25)'  },
  low:    { label: 'LOW',  color: '#FFB300', bg: 'rgba(255,179,0,0.08)',  border: 'rgba(255,179,0,0.25)'  },
  medium: { label: 'MED',  color: '#FFB300', bg: 'rgba(255,179,0,0.08)',  border: 'rgba(255,179,0,0.25)'  },
  full:   { label: 'FULL', color: 'var(--accent)', bg: 'rgba(201,244,0,0.08)',  border: 'rgba(201,244,0,0.25)'  },
}

const STOCK_ORDER: Record<string, number> = { full: 0, medium: 1, low: 2, out: 3 }

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function stalenessColor(dateStr: string) {
  const hrs = (Date.now() - new Date(dateStr).getTime()) / 3600000
  if (hrs < 2) return '#C9F400'
  if (hrs < 12) return '#FFB300'
  if (hrs < 24) return '#FF4545'
  return '#888888'
}

function stalenessLabel(dateStr: string) {
  const hrs = (Date.now() - new Date(dateStr).getTime()) / 3600000
  if (hrs < 2) return 'Fresh'
  if (hrs < 12) return 'Aging'
  if (hrs < 24) return 'Stale'
  return 'Unverified'
}

// Kroger's inventory.stockLevel is a coarse, not-exhaustively-documented
// enum (only "HIGH" confirmed live so far) — fall back to a flat "In Stock"
// label/color for any level we don't recognize rather than guessing.
function krogerStockLabel(inStock: boolean, stockLevel: string | null) {
  if (!inStock) return 'Out of Stock'
  switch (stockLevel?.toUpperCase()) {
    case 'HIGH': return 'High Stock'
    case 'MEDIUM': return 'Medium Stock'
    case 'LOW': return 'Low Stock'
    default: return 'In Stock'
  }
}

function krogerStockColors(inStock: boolean, stockLevel: string | null) {
  if (!inStock) return { bg: 'rgba(255,69,69,0.1)', color: '#FF4545', border: 'rgba(255,69,69,0.25)' }
  switch (stockLevel?.toUpperCase()) {
    case 'HIGH': return { bg: 'rgba(201,244,0,0.08)', color: '#C9F400', border: 'rgba(201,244,0,0.3)' }
    case 'MEDIUM':
    case 'LOW': return { bg: 'rgba(255,179,0,0.1)', color: '#FFB300', border: 'rgba(255,179,0,0.25)' }
    default: return { bg: 'rgba(59,130,246,0.1)', color: '#60a5fa', border: 'rgba(59,130,246,0.3)' }
  }
}

function StoreDetailContent({ id }: { id: string }) {
  const router = useRouter()
  const params = useSearchParams()
  const name = params.get('name') ?? ''
  const { user, profile } = useAuth()
  const isHunterPlus = profile?.is_admin || profile?.tier === 'tracker'
  const isTracker = profile?.is_admin || profile?.tier === 'tracker'

  const [stock, setStock] = useState<any[]>([])
  const [store, setStore] = useState<any>(null)
  const [storeError, setStoreError] = useState(false)
  const [stockError, setStockError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [confirmations, setConfirmations] = useState<Record<string, { yes: number; no: number; userVote: boolean | null }>>({})
  const [krogerStock, setKrogerStock] = useState<Record<string, { inStock: boolean; checkedAt: string; stockLevel: string | null }>>({})
const [expandedBrands, setExpandedBrands] = useState<Set<string>>(new Set())
  const [expandedHistory, setExpandedHistory] = useState<Set<string>>(new Set())
  const [drinkHistory, setDrinkHistory] = useState<Record<string, any[]>>({})
  const [historyLoading, setHistoryLoading] = useState<Set<string>>(new Set())
  const [showFlag, setShowFlag] = useState(false)
  const [flagReason, setFlagReason] = useState('')
  const [flagNotes, setFlagNotes] = useState('')
  const [flagSubmitting, setFlagSubmitting] = useState(false)
  const [flagDone, setFlagDone] = useState(false)
  const [isFavorited, setIsFavorited] = useState(false)
  const [favoriteId, setFavoriteId] = useState<string | null>(null)
  const [favoritingLoading, setFavoritingLoading] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const [toastVisible, setToastVisible] = useState(false)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  function showToast(message: string) {
    clearTimeout(toastTimer.current)
    setToastMessage(message)
    setToastVisible(true)
    toastTimer.current = setTimeout(() => setToastVisible(false), 2500)
  }
  const [search, setSearch] = useState('')
  const [sortMode, setSortMode] = useState<'recent' | 'brand'>('recent')
  const [showAddDrink, setShowAddDrink] = useState(false)
  const [drinkEntries, setDrinkEntries] = useState<{ id: string; brand: string; flavor: string; caffeine_mg: string; duplicate: boolean }[]>([{ id: '1', brand: '', flavor: '', caffeine_mg: '', duplicate: false }])
  const [drinkSubmitting, setDrinkSubmitting] = useState(false)
  const [drinkResults, setDrinkResults] = useState<{ added: number; skipped: number; names: string[] } | null>(null)
  const [drinkDuplicatePopup, setDrinkDuplicatePopup] = useState<string[] | null>(null)

  useEffect(() => {
    fetchStore()
    fetchStock()
    fetchFavorite()

    const channel = supabase
      .channel(`store-detail:${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'stock_reports', filter: `store_id=eq.${id}` }, fetchStock)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [id])

  async function fetchStore() {
    const { data, error } = await supabase.from('stores').select('*').eq('id', id).single()
    if (data) setStore(data)
    else if (error) setStoreError(true)
  }

  async function fetchFavorite() {
    if (!user) return
    const { data } = await supabase
      .from('favorites')
      .select('id')
      .eq('user_id', user.id)
      .eq('store_id', id)
      .maybeSingle()
    if (data) { setIsFavorited(true); setFavoriteId(data.id) }
  }

  async function toggleFavorite() {
    if (!user || favoritingLoading) return
    setFavoritingLoading(true)
    if (isFavorited && favoriteId) {
      await supabase.from('favorites').delete().eq('id', favoriteId)
      setIsFavorited(false)
      setFavoriteId(null)
      showToast('Removed from favorites')
    } else {
      const { data } = await supabase.from('favorites').insert({ user_id: user.id, store_id: id }).select('id').single()
      if (data) { setIsFavorited(true); setFavoriteId(data.id); showToast('Added to favorites') }
    }
    setFavoritingLoading(false)
  }

  async function fetchStock() {
    const [{ data: stockData, error }, { data: krogerData }] = await Promise.all([
      supabase.from('latest_stock').select('drink_id, quantity, reported_at').eq('store_id', id),
      supabase.from('kroger_stock').select('drink_id, in_stock, checked_at, stock_level').eq('store_id', id),
    ])
    if (error) { setStockError(true); setLoading(false); return }

    const krogerMap: Record<string, { inStock: boolean; checkedAt: string; stockLevel: string | null }> = {}
    krogerData?.forEach((k: any) => { krogerMap[k.drink_id] = { inStock: k.in_stock, checkedAt: k.checked_at, stockLevel: k.stock_level ?? null } })
    setKrogerStock(krogerMap)

    // Kroger-matched drinks with no crowdsourced report yet still get a row —
    // otherwise a freshly Kroger-synced store with zero user reports would
    // show "No reports yet" despite having real availability data.
    const reportedDrinkIds = new Set((stockData ?? []).map((d) => d.drink_id).filter(Boolean))
    const krogerOnlyDrinkIds = Object.keys(krogerMap).filter((did) => !reportedDrinkIds.has(did))
    const allDrinkIds = [...new Set([...reportedDrinkIds, ...krogerOnlyDrinkIds])]

    if (allDrinkIds.length > 0) {
      const { data: drinksData } = await supabase
        .from('drinks')
        .select('id, name, brand, flavor, caffeine_mg')
        .in('id', allDrinkIds)
      const drinksMap: Record<string, any> = {}
      drinksData?.forEach((d) => { drinksMap[d.id] = d })
      const reported = (stockData ?? []).map((s) => ({ ...s, drink: drinksMap[s.drink_id] ?? null, isKrogerOnly: false }))
      const krogerOnly = krogerOnlyDrinkIds.map((drinkId) => ({
        drink_id: drinkId,
        quantity: null,
        reported_at: null,
        drink: drinksMap[drinkId] ?? null,
        isKrogerOnly: true,
      }))
      setStock([...reported, ...krogerOnly])
    } else {
      setStock([])
    }

    // Fetch confirmations for this store
    const { data: confirmData } = await supabase
      .from('stock_confirmations')
      .select('drink_id, confirmed, user_id')
      .eq('store_id', id)
    if (confirmData) {
      const map: Record<string, { yes: number; no: number; userVote: boolean | null }> = {}
      for (const c of confirmData) {
        if (!map[c.drink_id]) map[c.drink_id] = { yes: 0, no: 0, userVote: null }
        if (c.confirmed) map[c.drink_id].yes++
        else map[c.drink_id].no++
        if (c.user_id === user?.id) map[c.drink_id].userVote = c.confirmed
      }
      setConfirmations(map)
    }

    setLoading(false)
  }

  function toggleBrand(brand: string) {
    setExpandedBrands((prev) => {
      const next = new Set(prev)
      next.has(brand) ? next.delete(brand) : next.add(brand)
      return next
    })
  }

  async function toggleHistory(drinkId: string) {
    if (!isTracker) return
    setExpandedHistory((prev) => {
      const next = new Set(prev)
      next.has(drinkId) ? next.delete(drinkId) : next.add(drinkId)
      return next
    })
    if (!drinkHistory[drinkId]) {
      setHistoryLoading((prev) => new Set(prev).add(drinkId))
      const { data } = await supabase
        .from('stock_reports')
        .select('id, quantity, reported_at, user_id, reporter:profiles(username, is_verified_reporter)')
        .eq('store_id', id)
        .eq('drink_id', drinkId)
        .order('reported_at', { ascending: false })
        .limit(10)
      setDrinkHistory((prev) => ({ ...prev, [drinkId]: data ?? [] }))
      setHistoryLoading((prev) => { const next = new Set(prev); next.delete(drinkId); return next })
    }
  }

  async function handleConfirm(drinkId: string, vote: boolean) {
    if (!user) { showToast('Sign in to confirm stock'); return }
    const current = confirmations[drinkId] ?? { yes: 0, no: 0, userVote: null }
    const newVote = current.userVote === vote ? null : vote
    let yes = current.yes - (current.userVote === true ? 1 : 0) + (newVote === true ? 1 : 0)
    let no  = current.no  - (current.userVote === false ? 1 : 0) + (newVote === false ? 1 : 0)
    setConfirmations(prev => ({ ...prev, [drinkId]: { yes, no, userVote: newVote } }))
    const { data: { session } } = await supabase.auth.getSession()
    await fetch('/api/stock/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ store_id: id, drink_id: drinkId, confirmed: newVote }),
    })
  }

  function updateEntry(id: string, field: 'brand' | 'flavor' | 'caffeine_mg', value: string) {
    setDrinkEntries((prev) => prev.map((e) => e.id === id ? { ...e, [field]: value, duplicate: false } : e))
  }

  function normalizeEntryBrand(id: string) {
    setDrinkEntries((prev) => prev.map((e) => e.id === id ? { ...e, brand: normalizeBrand(e.brand) } : e))
  }

  function addEntry() {
    setDrinkEntries((prev) => [...prev, { id: String(Date.now()), brand: '', flavor: '', caffeine_mg: '', duplicate: false }])
  }

  function removeEntry(id: string) {
    setDrinkEntries((prev) => prev.length > 1 ? prev.filter((e) => e.id !== id) : prev)
  }

  async function isDuplicate(brand: string, flavor: string): Promise<boolean> {
    const aliasVariants = Object.entries(BRAND_ALIASES)
      .filter(([, canonical]) => canonical.toLowerCase() === brand.toLowerCase())
      .map(([alias]) => alias)
    const brandsToCheck = [...new Set([brand, ...aliasVariants])]
    const { data } = await supabase
      .from('drinks')
      .select('id')
      .in('brand', brandsToCheck.flatMap((b) => [b, b.toLowerCase(), b.toUpperCase(), b.charAt(0).toUpperCase() + b.slice(1).toLowerCase()]))
      .ilike('flavor', flavor)
      .maybeSingle()
    return !!data
  }

  async function submitAddDrink() {
    const filled = drinkEntries.filter((e) => e.brand.trim() && e.flavor.trim())
    if (filled.length === 0) return
    setDrinkSubmitting(true)

    // Daily limit for free tier
    if (!isTracker && user) {
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
      const { count } = await supabase
        .from('drinks')
        .select('id', { count: 'exact', head: true })
        .eq('submitted_by', user.id)
        .gte('created_at', todayStart.toISOString())
      if ((count ?? 0) >= 25) {
        showToast('Daily limit of 25 new drinks reached')
        setDrinkSubmitting(false)
        return
      }
    }

    const duplicateFlags = await Promise.all(
      filled.map((e) => isDuplicate(normalizeBrand(e.brand), e.flavor.trim()))
    )

    const updatedEntries = drinkEntries.map((e) => {
      const idx = filled.findIndex((f) => f.id === e.id)
      if (idx === -1) return e
      return { ...e, duplicate: duplicateFlags[idx] }
    })
    setDrinkEntries(updatedEntries)

    const toInsert = filled.filter((_, i) => !duplicateFlags[i])
    const dupeNames = filled
      .filter((_, i) => duplicateFlags[i])
      .map((e) => `${normalizeBrand(e.brand)} ${e.flavor.trim()}`)

    if (toInsert.length === 0) {
      setDrinkDuplicatePopup(dupeNames)
      setDrinkSubmitting(false)
      return
    }

    await supabase.from('drinks').insert(
      toInsert.map((e) => {
        const brand = normalizeBrand(e.brand)
        const flavor = e.flavor.trim()
        const caffeine_mg = e.caffeine_mg.trim() ? parseInt(e.caffeine_mg.trim()) : null
        return { brand, name: `${brand} ${flavor}`, flavor, caffeine_mg, submitted_by: user?.id ?? null }
      })
    )

    const addedNames = toInsert.map((e) => `${normalizeBrand(e.brand)} ${e.flavor.trim()}`)
    setDrinkResults({ added: toInsert.length, skipped: dupeNames.length, names: addedNames })
    setDrinkSubmitting(false)
  }

  async function submitFlag() {
    if (!flagReason) return
    setFlagSubmitting(true)
    await supabase.from('store_flags').insert({
      store_id: id,
      user_id: user?.id ?? null,
      reason: flagReason,
      notes: flagNotes.trim() || null,
    })
    setFlagSubmitting(false)
    setFlagDone(true)
    showToast('Flag submitted — thanks!')
  }

  function closeFlag() {
    setShowFlag(false)
    setFlagReason('')
    setFlagNotes('')
    setFlagSubmitting(false)
    setFlagDone(false)
  }

  function closeAddDrink() {
    setShowAddDrink(false)
    setDrinkEntries([{ id: '1', brand: '', flavor: '', caffeine_mg: '', duplicate: false }])
    setDrinkSubmitting(false)
    setDrinkResults(null)
    setDrinkDuplicatePopup(null)
  }

  const latestReport = stock.filter((item) => !item.isKrogerOnly).reduce<any>((latest, item) => {
    if (!latest) return item
    return new Date(item.reported_at) > new Date(latest.reported_at) ? item : latest
  }, null)

  const isSearching = search.trim().length > 0
  const filteredStock = isSearching
    ? stock.filter((item) => {
        const q = search.toLowerCase()
        return (
          item.drink?.brand?.toLowerCase().includes(q) ||
          item.drink?.name?.toLowerCase().includes(q) ||
          item.drink?.flavor?.toLowerCase().includes(q)
        )
      })
    : stock

  const byBrand = filteredStock.reduce<Record<string, any[]>>((acc, item) => {
    const brand = item.drink?.brand ?? 'Other'
    if (!acc[brand]) acc[brand] = []
    acc[brand].push(item)
    return acc
  }, {})

  const staleColor = latestReport ? stalenessColor(latestReport.reported_at) : null

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg)', position: 'relative', overflowX: 'hidden' }}>
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, background: 'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(201,244,0,0.07) 0%, transparent 60%)', pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, backgroundImage: 'linear-gradient(rgba(201,244,0,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(201,244,0,0.03) 1px, transparent 1px)', backgroundSize: '32px 32px', pointerEvents: 'none' }} />
      <style>{`@keyframes fadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }`}</style>

      {/* ── Sticky header ─────────────────────────────────────────── */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          backgroundColor: 'var(--header-bg)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid var(--fg-06)',
          paddingTop: 'env(safe-area-inset-top)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
          <button
            onClick={() => router.back()}
            style={{
              width: 36, height: 36, borderRadius: 10, flexShrink: 0,
              backgroundColor: 'var(--fg-07)',
              border: '1px solid var(--fg-10)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 12L6 8l4-4" stroke="var(--fg-75)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {store ? TYPE_ICON[store.type] : '📍'} {name}
            </p>
            {store && (
              <p style={{ margin: '1px 0 0', fontSize: 11, color: 'var(--fg-35)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {TYPE_LABEL[store.type] ?? 'Store'}
              </p>
            )}
          </div>
          {staleColor && latestReport && isHunterPlus && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
              padding: '4px 10px', borderRadius: 999,
              backgroundColor: `${staleColor}18`,
              border: `1px solid ${staleColor}44`,
            }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: staleColor }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: staleColor }}>
                {timeAgo(latestReport.reported_at)}
              </span>
            </div>
          )}
          <button
            onClick={toggleFavorite}
            disabled={favoritingLoading}
            title={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
            style={{
              width: 32, height: 32, borderRadius: 8, flexShrink: 0, cursor: 'pointer',
              backgroundColor: isFavorited ? 'rgba(239,68,68,0.15)' : 'var(--fg-05)',
              border: `1px solid ${isFavorited ? 'rgba(239,68,68,0.4)' : 'var(--fg-08)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.2s ease',
            }}
          >
            <span style={{ fontSize: 13 }}>{isFavorited ? '❤️' : '🤍'}</span>
          </button>
          <button
            onClick={() => setShowFlag(true)}
            title="Flag incorrect location"
            style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, backgroundColor: 'var(--fg-05)', border: '1px solid var(--fg-08)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <span style={{ fontSize: 13 }}>🚩</span>
          </button>
        </div>
      </div>

      <Toast message={toastMessage} visible={toastVisible} />

      <div style={{ position: 'relative', zIndex: 1 }}>

        {/* ── Hero ──────────────────────────────────────────────────── */}
        <div style={{ padding: '20px 16px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{
              width: 62, height: 62, borderRadius: '50%', flexShrink: 0,
              background: 'rgba(201,244,0,0.1)',
              border: '1.5px solid rgba(201,244,0,0.3)',
              boxShadow: '0 0 20px rgba(201,244,0,0.2), 0 0 40px rgba(201,244,0,0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 26,
            }}>
              {store ? TYPE_ICON[store.type] : '📍'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 22, fontWeight: 900, color: 'var(--text)', letterSpacing: '-0.3px' }}>{name}</p>
              {store && (
                <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--fg-40)' }}>{store.address}</p>
              )}
              {staleColor && latestReport && isHunterPlus && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 7 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: staleColor }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: staleColor }}>
                    {stalenessLabel(latestReport.reported_at)} · {timeAgo(latestReport.reported_at)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Action buttons ────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 10, margin: '0 16px 12px' }}>
          <button
            style={{
              flex: 1, borderRadius: 14, padding: '13px 0', cursor: 'pointer',
              backgroundColor: '#C9F400', border: 'none',
              fontSize: 14, fontWeight: 800, color: '#000',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              boxShadow: '0 0 20px rgba(201,244,0,0.3)',
            }}
            onClick={() => router.push(`/submit/drinks?storeId=${id}&storeName=${encodeURIComponent(name)}`)}
          >
            <span style={{ fontSize: 15 }}>⚡</span> Report Stock
          </button>
          <button
            style={{
              flex: 1, borderRadius: 14, padding: '13px 0', cursor: 'pointer',
              backgroundColor: 'var(--fg-06)',
              border: '1.5px solid var(--fg-50)',
              fontSize: 14, fontWeight: 700, color: 'var(--fg-90)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onClick={() => setShowAddDrink(true)}
          >
            Add Drink
          </button>
        </div>

        {/* ── Info chip ─────────────────────────────────────────────── */}
        <div style={{
          margin: '0 16px 20px',
          padding: '10px 14px',
          borderRadius: 12,
          backgroundColor: 'rgba(201,244,0,0.05)',
          border: '1px solid rgba(201,244,0,0.15)',
          display: 'flex', alignItems: 'flex-start', gap: 8,
        }}>
          <span style={{ fontSize: 13, marginTop: 1, flexShrink: 0 }}>💡</span>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--fg-45)', lineHeight: 1.5 }}>
            <span style={{ color: 'var(--fg-75)', fontWeight: 700 }}>Add Drink</span> is for new flavors only. Use <span style={{ color: 'var(--fg-75)', fontWeight: 700 }}>Report Stock</span> to update existing drinks.
          </p>
        </div>

        {/* ── Content ───────────────────────────────────────────────── */}
        {storeError ? (
          <div className="flex flex-col items-center gap-3 mt-20 px-8 text-center">
            <span style={{ fontSize: 48 }}>🏪</span>
            <p className="text-lg font-black text-white">Store not found</p>
            <p className="text-sm text-white/40">This store may have been removed.</p>
            <button onClick={() => router.back()} className="mt-2 text-sm font-bold px-5 py-2.5 rounded-xl" style={{ backgroundColor: 'var(--fg-07)', color: 'var(--fg-60)' }}>← Go back</button>
          </div>
        ) : stockError ? (
          <div className="flex flex-col items-center gap-3 mt-20 px-8 text-center">
            <span style={{ fontSize: 48 }}>⚠️</span>
            <p className="text-lg font-black text-white">Couldn't load stock</p>
            <p className="text-sm text-white/40">Check your connection and try again.</p>
<button onClick={() => { setStockError(false); setLoading(true); fetchStock() }} className="mt-2 text-sm font-bold px-5 py-2.5 rounded-xl" style={{ backgroundColor: 'rgba(201,244,0,0.1)', color: 'var(--accent)', border: '1px solid rgba(201,244,0,0.25)' }}>Retry</button>
          </div>
        ) : loading ? (
          <div className="flex justify-center mt-8">
            <div className="w-8 h-8 border-2 border-[#C9F400] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : stock.length === 0 ? (
          <div className="flex flex-col items-center gap-3 mt-16">
            <span style={{ fontSize: 40 }}>📭</span>
            <p className="text-lg font-bold text-white">No reports yet</p>
            <p className="text-sm text-white/40">Be the first to report stock here!</p>
          </div>
        ) : (
          <div className="px-4 pb-16">
            {/* Search */}
            <div
              className="flex items-center gap-2.5 rounded-xl px-3.5 py-3 mb-4"
              style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--fg-07)' }}
            >
              <span className="text-white/30 text-sm">🔍</span>
              <input
                type="text"
                placeholder="Search drinks & flavors..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/30"
              />
              {search.length > 0 && (
                <button onClick={() => setSearch('')} className="text-white/30 text-xs">✕</button>
              )}
            </div>

            {/* Sort toggle */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {(['recent', 'brand'] as const).map((mode) => {
                const active = sortMode === mode
                const label = mode === 'recent' ? 'Recent' : 'By Brand'
                return (
                  <button key={mode} onClick={() => setSortMode(mode)}
                    style={{ padding: '6px 14px', borderRadius: 99, border: '1px solid', fontSize: 13, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.04em', textTransform: 'uppercase', cursor: 'pointer', borderColor: active ? '#C9F400' : 'rgba(201,244,0,0.12)', backgroundColor: active ? '#C9F400' : 'var(--surface)', color: active ? '#0D1210' : 'var(--fg-50)', boxShadow: active ? '0 0 14px rgba(201,244,0,0.4)' : 'none' }}>
                    {label}
                  </button>
                )
              })}
            </div>

            <p className="text-[10px] font-bold mb-3" style={{ color: 'var(--fg-35)', letterSpacing: '1.5px' }}>
              {isSearching
                ? `${filteredStock.length} result${filteredStock.length !== 1 ? 's' : ''}`
                : sortMode === 'recent'
                  ? `${filteredStock.length} drink${filteredStock.length !== 1 ? 's' : ''} · most recent first`
                  : `BRANDS · ${Object.keys(byBrand).length} found`}
            </p>
            {isSearching && filteredStock.length === 0 && (
              <div className="flex flex-col items-center gap-2 mt-8">
                <span style={{ fontSize: 36 }}>🔍</span>
                <p className="text-sm font-bold text-white">No drinks found</p>
                <p className="text-xs text-white/40">Try a different brand or flavor name</p>
              </div>
            )}

            <div className="flex flex-col gap-2.5">
              {sortMode === 'recent' && !isSearching ? (
                [...filteredStock].sort((a, b) => new Date(b.reported_at).getTime() - new Date(a.reported_at).getTime()).map((item) => {
                  const q = QUANTITY_CONFIG[item.quantity as Quantity]
                  const isKrogerOnly = !!item.isKrogerOnly
                  const freshColor = item.reported_at ? stalenessColor(item.reported_at) : 'var(--fg-30)'
                  const historyOpen = expandedHistory.has(item.drink_id)
                  const history = drinkHistory[item.drink_id] ?? []
                  const loadingHistory = historyLoading.has(item.drink_id)
                  return (
                    <div key={item.drink_id}>
                      <div
                        style={{
                          backgroundColor: 'var(--surface)',
                          border: `1px solid ${q?.border ?? 'rgba(201,244,0,0.1)'}`,
                          boxShadow: `inset 3px 0 0 ${q?.color ?? 'rgba(201,244,0,0.3)'}, 0 0 8px ${q?.color ? q.color + '30' : 'rgba(201,244,0,0.08)'}`,
                          borderRadius: isTracker && historyOpen && !isKrogerOnly ? '12px 12px 0 0' : 12,
                          cursor: isTracker && !isKrogerOnly ? 'pointer' : 'default',
                          padding: 12,
                        }}
                        onClick={() => { if (!isKrogerOnly) toggleHistory(item.drink_id) }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-white truncate">{item.drink?.flavor ?? item.drink?.name}</p>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <p className="text-xs" style={{ color: 'var(--fg-40)' }}>{item.drink?.brand}</p>
                              {isKrogerOnly ? (
                                <p className="text-xs font-semibold" style={{ color: freshColor }}>No reports yet</p>
                              ) : (
                                <p className="text-xs font-semibold" style={{ color: freshColor }}>{stalenessLabel(item.reported_at)}{isHunterPlus ? ` · ${timeAgo(item.reported_at)}` : ''}</p>
                              )}
                              {item.drink?.caffeine_mg && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(201,244,0,0.1)', color: 'rgba(201,244,0,0.85)', border: '1px solid rgba(201,244,0,0.25)' }}>
                                  ⚡ {item.drink.caffeine_mg}mg
                                </span>
                              )}
                              {krogerStock[item.drink_id] && (() => {
                                const k = krogerStock[item.drink_id]
                                const kc = krogerStockColors(k.inStock, k.stockLevel)
                                return (
                                  <span
                                    className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                                    style={{ backgroundColor: kc.bg, color: kc.color, border: `1px solid ${kc.border}` }}
                                    title={`Kroger checked ${timeAgo(k.checkedAt)}`}
                                  >
                                    ✅ Verified: {krogerStockLabel(k.inStock, k.stockLevel)} · {timeAgo(k.checkedAt)}
                                  </span>
                                )
                              })()}
                            </div>
                            {/* Confirmation buttons */}
                            {!isKrogerOnly && (() => { const c = confirmations[item.drink_id]; const yv = c?.userVote === true; const nv = c?.userVote === false; return (
                              <div style={{ display: 'flex', gap: 6, marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
                                <button onClick={() => handleConfirm(item.drink_id, true)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700, cursor: 'pointer', backgroundColor: yv ? 'rgba(201,244,0,0.15)' : 'var(--fg-04)', border: `1px solid ${yv ? 'rgba(201,244,0,0.5)' : 'var(--fg-08)'}`, color: yv ? '#C9F400' : 'var(--fg-40)' }}>✓ {c?.yes ?? 0}</button>
                                <button onClick={() => handleConfirm(item.drink_id, false)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700, cursor: 'pointer', backgroundColor: nv ? 'rgba(255,69,69,0.12)' : 'var(--fg-04)', border: `1px solid ${nv ? 'rgba(255,69,69,0.4)' : 'var(--fg-08)'}`, color: nv ? '#FF4545' : 'var(--fg-40)' }}>✗ {c?.no ?? 0}</button>
                              </div>
                            )})()}
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-2">
                            {!isKrogerOnly && (
                              <div className="px-2.5 py-1 rounded-full" style={{ backgroundColor: q?.bg, border: `1px solid ${q?.border}` }}>
                                <span className="text-[10px] font-bold" style={{ color: q?.color }}>{q?.label}</span>
                              </div>
                            )}
                            {isTracker && !isKrogerOnly && (
                              <span className="text-white/30 text-xs" style={{ transform: historyOpen ? 'rotate(180deg)' : 'rotate(0deg)', display: 'inline-block' }}>▾</span>
                            )}
                          </div>
                        </div>
                      </div>
                      {isTracker && !isKrogerOnly && historyOpen && (
                        <div className="px-3 pb-3" style={{ backgroundColor: 'var(--fg-02)', border: `1.5px solid ${q?.border ?? 'var(--fg-10)'}`, borderTop: 'none', borderRadius: '0 0 12px 12px' }}>
                          <p className="text-[9px] font-bold py-2" style={{ color: 'var(--fg-25)', letterSpacing: '1.5px' }}>REPORT HISTORY</p>
                          {loadingHistory ? (
                            <div className="flex justify-center py-3"><div className="w-4 h-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" /></div>
                          ) : history.length === 0 ? (
                            <p className="text-xs text-white/30 pb-1">No history found.</p>
                          ) : (
                            <div className="flex flex-col gap-1.5">
                              {history.map((h: any, i: number) => {
                                const hq = QUANTITY_CONFIG[h.quantity as Quantity]
                                const reporter = (h.reporter as any)
                                return (
                                  <div key={i} className="flex items-center gap-2 py-1.5" style={{ borderBottom: i < history.length - 1 ? '1px solid var(--fg-05)' : 'none' }}>
                                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: hq?.color ?? 'var(--fg-20)' }} />
                                    <div className="px-1.5 py-0.5 rounded-full shrink-0" style={{ backgroundColor: hq?.bg, border: `1px solid ${hq?.border}` }}>
                                      <span className="text-[9px] font-bold" style={{ color: hq?.color }}>{hq?.label}</span>
                                    </div>
                                    <p className="text-[11px] text-white/50 flex-1">{timeAgo(h.reported_at)}</p>
                                    {reporter?.username && <p className="text-[10px] text-white/30">@{reporter.username}</p>}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })
              ) : null}
              {(sortMode === 'brand' || isSearching) && Object.entries(byBrand).map(([brand, items]) => {
                const reportedItems = items.filter((i) => !i.isKrogerOnly)
                const inStock = reportedItems.filter((i) => i.quantity !== 'out').length
                const total = reportedItems.length
                const pct = total > 0 ? inStock / total : 0
                const barColor = pct === 0 ? '#FF4545' : pct >= 0.75 ? '#C9F400' : '#FFB300'
                const isExpanded = isSearching || expandedBrands.has(brand)
                return (
                  <div
                    key={brand}
                    className="rounded-2xl overflow-hidden"
                    style={{
                      backgroundColor: 'var(--surface)',
                      border: '1px solid rgba(201,244,0,0.1)',
                      boxShadow: 'inset 3px 0 0 rgba(201,244,0,0.25), 0 0 10px rgba(201,244,0,0.06)',
                    }}
                  >
                    <button
                      className="w-full flex items-center gap-3 p-4 text-left"
                      onClick={() => toggleBrand(brand)}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-base font-black text-white">{brand}</p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--fg-08)' }}>
                            <div className="h-full rounded-full" style={{ width: `${pct * 100}%`, backgroundColor: total > 0 ? barColor : 'var(--fg-20)' }} />
                          </div>
                          <p className="text-xs font-semibold shrink-0" style={{ color: total > 0 ? barColor : 'var(--fg-30)' }}>
                            {total > 0 ? `${inStock}/${total} in stock` : 'No reports'}
                          </p>
                        </div>
                      </div>
                      <span
                        className="text-white/30 text-sm transition-transform"
                        style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                      >
                        ▾
                      </span>
                    </button>

                    {isExpanded && (
                      <div className="px-4 pb-3 flex flex-col gap-2">
                        <div className="h-px mb-1" style={{ backgroundColor: 'rgba(201,244,0,0.06)' }} />
                        {[...items].sort((a, b) => (STOCK_ORDER[a.quantity] ?? 4) - (STOCK_ORDER[b.quantity] ?? 4)).map((item) => {
                          const q = QUANTITY_CONFIG[item.quantity as Quantity]
                          const isKrogerOnly = !!item.isKrogerOnly
                          const freshColor = item.reported_at ? stalenessColor(item.reported_at) : 'var(--fg-30)'
                          const historyOpen = expandedHistory.has(item.drink_id)
                          const history = drinkHistory[item.drink_id] ?? []
                          const loadingHistory = historyLoading.has(item.drink_id)
                          return (
                            <div key={item.drink_id}>
                              <div
                                style={{
                                  backgroundColor: 'var(--fg-04)',
                                  border: `1px solid ${q?.border ?? 'rgba(201,244,0,0.1)'}`,
                                  boxShadow: `inset 3px 0 0 ${q?.color ?? 'rgba(201,244,0,0.3)'}, 0 0 8px ${q?.color ? q.color + '30' : 'rgba(201,244,0,0.08)'}`,
                                  borderRadius: isTracker && historyOpen && !isKrogerOnly ? '12px 12px 0 0' : 12,
                                  cursor: isTracker && !isKrogerOnly ? 'pointer' : 'default',
                                  padding: 12,
                                }}
                                onClick={() => { if (!isKrogerOnly) toggleHistory(item.drink_id) }}
                              >
                                <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-white truncate">
                                      {item.drink?.flavor ?? item.drink?.name}
                                    </p>
                                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                      {isKrogerOnly ? (
                                        <p className="text-xs font-semibold" style={{ color: freshColor }}>No reports yet</p>
                                      ) : (
                                        <p className="text-xs font-semibold" style={{ color: freshColor }}>{stalenessLabel(item.reported_at)}{isHunterPlus ? ` · ${timeAgo(item.reported_at)}` : ''}</p>
                                      )}
                                      {item.drink?.caffeine_mg && (
                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(201,244,0,0.1)', color: 'rgba(201,244,0,0.85)', border: '1px solid rgba(201,244,0,0.25)' }}>
                                          ⚡ {item.drink.caffeine_mg}mg
                                        </span>
                                      )}
                                      {krogerStock[item.drink_id] && (() => {
                                        const k = krogerStock[item.drink_id]
                                        const kc = krogerStockColors(k.inStock, k.stockLevel)
                                        return (
                                          <span
                                            className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                                            style={{ backgroundColor: kc.bg, color: kc.color, border: `1px solid ${kc.border}` }}
                                            title={`Kroger checked ${timeAgo(k.checkedAt)}`}
                                          >
                                            ✅ Verified: {krogerStockLabel(k.inStock, k.stockLevel)} · {timeAgo(k.checkedAt)}
                                          </span>
                                        )
                                      })()}
                                    </div>
                                    {/* Confirmation buttons */}
                                    {!isKrogerOnly && (() => { const c = confirmations[item.drink_id]; const yv = c?.userVote === true; const nv = c?.userVote === false; return (
                                      <div style={{ display: 'flex', gap: 6, marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
                                        <button onClick={() => handleConfirm(item.drink_id, true)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700, cursor: 'pointer', backgroundColor: yv ? 'rgba(201,244,0,0.15)' : 'var(--fg-04)', border: `1px solid ${yv ? 'rgba(201,244,0,0.5)' : 'var(--fg-08)'}`, color: yv ? '#C9F400' : 'var(--fg-40)' }}>✓ {c?.yes ?? 0}</button>
                                        <button onClick={() => handleConfirm(item.drink_id, false)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700, cursor: 'pointer', backgroundColor: nv ? 'rgba(255,69,69,0.12)' : 'var(--fg-04)', border: `1px solid ${nv ? 'rgba(255,69,69,0.4)' : 'var(--fg-08)'}`, color: nv ? '#FF4545' : 'var(--fg-40)' }}>✗ {c?.no ?? 0}</button>
                                      </div>
                                    )})()}
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0 ml-2">
                                    {!isKrogerOnly && (
                                      <div className="px-2.5 py-1 rounded-full" style={{ backgroundColor: q?.bg, border: `1px solid ${q?.border}` }}>
                                        <span className="text-[10px] font-bold" style={{ color: q?.color }}>{q?.label}</span>
                                      </div>
                                    )}
                                    {isTracker && !isKrogerOnly && (
                                      <span className="text-white/30 text-xs" style={{ transform: historyOpen ? 'rotate(180deg)' : 'rotate(0deg)', display: 'inline-block' }}>▾</span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {isTracker && !isKrogerOnly && historyOpen && (
                                <div
                                  className="px-3 pb-3"
                                  style={{
                                    backgroundColor: 'var(--fg-02)',
                                    border: `1.5px solid ${q?.border ?? 'var(--fg-10)'}`,
                                    borderTop: 'none',
                                    borderRadius: '0 0 12px 12px',
                                  }}
                                >
                                  <p className="text-[9px] font-bold py-2" style={{ color: 'var(--fg-25)', letterSpacing: '1.5px' }}>REPORT HISTORY</p>
                                  {loadingHistory ? (
                                    <div className="flex justify-center py-3">
                                      <div className="w-4 h-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
                                    </div>
                                  ) : history.length === 0 ? (
                                    <p className="text-xs text-white/30 pb-1">No history found.</p>
                                  ) : (
                                    <div className="flex flex-col gap-1.5">
                                      {history.map((h: any, i: number) => {
                                        const hq = QUANTITY_CONFIG[h.quantity as Quantity]
                                        const reporter = (h.reporter as any)
                                        return (
                                          <div key={h.id} className="flex items-center gap-2.5">
                                            <div className="w-px self-stretch" style={{ backgroundColor: i === 0 ? hq?.color : 'var(--fg-08)', minHeight: 20 }} />
                                            <div className="px-2 py-0.5 rounded-full shrink-0" style={{ backgroundColor: hq?.bg, border: `1px solid ${hq?.border}` }}>
                                              <span className="text-[9px] font-bold" style={{ color: hq?.color }}>{hq?.label}</span>
                                            </div>
                                            <p className="text-[11px] text-white/50 flex-1">{timeAgo(h.reported_at)}</p>
                                            {reporter?.username && (
                                              <p className="text-[10px] text-white/30">@{reporter.username}</p>
                                            )}
                                          </div>
                                        )
                                      })}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Add Drink modal ───────────────────────────────────────── */}
        {showAddDrink && createPortal(
          <div
            className="fixed inset-0 flex flex-col justify-end z-50"
            style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
            onClick={(e) => { if (e.target === e.currentTarget) closeAddDrink() }}
          >
            <div
              className="rounded-t-3xl p-5"
              style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--fg-08)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-9 h-1 rounded-sm mx-auto mb-4" style={{ backgroundColor: 'var(--fg-20)' }} />

              {drinkResults ? (
                <div className="flex flex-col items-center text-center gap-3 py-4">
                  <span style={{ fontSize: 48 }}>🥤</span>
                  <p className="text-xl font-black text-white">
                    {drinkResults.added > 0 ? `${drinkResults.added} Drink${drinkResults.added !== 1 ? 's' : ''} Added!` : 'Nothing Added'}
                  </p>
                  {drinkResults.names.length > 0 && (
                    <div className="w-full flex flex-col gap-1.5">
                      {drinkResults.names.map((name) => (
                        <div key={name} className="rounded-xl px-3.5 py-2.5 text-sm font-semibold text-white/80 text-left"
                          style={{ backgroundColor: 'rgba(201,244,0,0.08)', border: '1px solid rgba(201,244,0,0.18)' }}>
                          ✓ {name}
                        </div>
                      ))}
                    </div>
                  )}
                  {drinkResults.skipped > 0 && (
                    <p className="text-xs text-white/35">{drinkResults.skipped} skipped — already in the system.</p>
                  )}
                  <button
                    className="mt-1 w-full rounded-2xl p-3.5 font-bold text-white"
                    style={{ backgroundColor: '#C9F400' }}
                    onClick={closeAddDrink}
                  >
                    Done
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-lg font-black text-white mb-1">Add Drinks</p>
                  <p className="text-xs text-white/40 mb-4">Add one or more new flavors below.</p>

                  <div className="flex flex-col gap-3 max-h-[55vh] overflow-y-auto pr-0.5 mb-4">
                    {drinkEntries.map((entry, idx) => (
                      <div
                        key={entry.id}
                        className="rounded-2xl p-3.5"
                        style={{ backgroundColor: 'var(--bg)', border: `1px solid ${entry.duplicate ? 'rgba(245,158,11,0.4)' : 'var(--fg-07)'}` }}
                      >
                        <div className="flex items-center justify-between mb-2.5">
                          <p className="text-[10px] font-bold text-white/35" style={{ letterSpacing: '1.5px' }}>DRINK {idx + 1}</p>
                          {drinkEntries.length > 1 && (
                            <button onClick={() => removeEntry(entry.id)} className="text-white/25 text-xs">✕</button>
                          )}
                        </div>
                        <input
                          type="text"
                          placeholder="Brand (e.g. Monster)"
                          value={entry.brand}
                          onChange={(e) => updateEntry(entry.id, 'brand', e.target.value)}
                          onBlur={() => normalizeEntryBrand(entry.id)}
                          className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none mb-2"
                          style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--fg-07)' }}
                        />
                        <input
                          type="text"
                          placeholder="Flavor (e.g. Ultra White)"
                          value={entry.flavor}
                          onChange={(e) => updateEntry(entry.id, 'flavor', e.target.value)}
                          className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none mb-2"
                          style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--fg-07)' }}
                        />
                        <input
                          type="number"
                          placeholder="Caffeine mg (optional, e.g. 200)"
                          value={entry.caffeine_mg}
                          onChange={(e) => updateEntry(entry.id, 'caffeine_mg', e.target.value)}
                          className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none"
                          style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--fg-07)' }}
                        />
                        {entry.duplicate && (
                          <div className="flex items-center gap-2 mt-2.5">
                            <span style={{ fontSize: 13 }}>⚠️</span>
                            <p className="text-xs font-semibold" style={{ color: '#FFB300' }}>
                              Already in the system — skipped.
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <button
                    className="w-full rounded-xl py-2.5 text-sm font-semibold mb-4 flex items-center justify-center gap-1.5"
                    style={{ backgroundColor: 'var(--fg-05)', border: '1px solid var(--fg-10)', color: 'var(--fg-55)' }}
                    onClick={addEntry}
                  >
                    <span>+</span> Add Another
                  </button>

                  <div className="flex gap-2.5">
                    <button
                      className="flex-1 rounded-xl p-3.5 font-semibold text-sm"
                      style={{ backgroundColor: 'rgba(201,244,0,0.06)', color: 'var(--fg-50)' }}
                      onClick={closeAddDrink}
                    >
                      Cancel
                    </button>
                    <button
                      className="flex-1 rounded-xl p-3.5 font-bold text-white text-sm flex items-center justify-center"
                      style={{
                        backgroundColor: drinkSubmitting || drinkEntries.every((e) => !e.brand.trim() || !e.flavor.trim())
                          ? 'rgba(201,244,0,0.4)' : '#C9F400'
                      }}
                      disabled={drinkSubmitting || drinkEntries.every((e) => !e.brand.trim() || !e.flavor.trim())}
                      onClick={submitAddDrink}
                    >
                      {drinkSubmitting
                        ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        : `Submit ${drinkEntries.filter((e) => e.brand.trim() && e.flavor.trim()).length > 1 ? `${drinkEntries.filter((e) => e.brand.trim() && e.flavor.trim()).length} Drinks` : 'Drink'}`}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>,
          document.body
        )}

        {/* ── Duplicate drink popup ─────────────────────────────────── */}
        {drinkDuplicatePopup && createPortal(
          <div
            className="fixed inset-0 z-[60] flex items-end justify-center"
            style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
            onClick={() => setDrinkDuplicatePopup(null)}
          >
            <div
              className="w-full max-w-md rounded-t-3xl p-6 pb-10"
              style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--fg-08)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-9 h-1 rounded-sm mx-auto mb-5" style={{ backgroundColor: 'var(--fg-20)' }} />
              <div className="flex items-center gap-3 mb-3">
                <span style={{ fontSize: 32 }}>🥤</span>
                <p className="text-lg font-black text-white">
                  {drinkDuplicatePopup.length === 1 ? 'Already in the System' : 'Drinks Already Exist'}
                </p>
              </div>
              <p className="text-sm text-white/50 leading-relaxed mb-4">
                {drinkDuplicatePopup.length === 1
                  ? `"${drinkDuplicatePopup[0]}" is already in our drinks database. If it's at this store, use Report Stock to update its status.`
                  : 'These drinks are already in our database. Use Report Stock to update their status instead.'}
              </p>
              {drinkDuplicatePopup.length > 1 && (
                <div className="flex flex-col gap-1.5 mb-4">
                  {drinkDuplicatePopup.map((d) => (
                    <div key={d} className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ backgroundColor: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                      <span style={{ fontSize: 12 }}>⚠️</span>
                      <p className="text-sm font-semibold text-white/70">{d}</p>
                    </div>
                  ))}
                </div>
              )}
              <button
                className="w-full rounded-2xl p-4 font-bold text-white"
                style={{ backgroundColor: '#C9F400' }}
                onClick={() => setDrinkDuplicatePopup(null)}
              >
                Got it
              </button>
            </div>
          </div>,
          document.body
        )}

        {/* ── Flag location modal ──────────────────────────────────── */}
        {showFlag && createPortal(
          <div
            className="fixed inset-0 flex flex-col justify-end z-50"
            style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
            onClick={(e) => { if (e.target === e.currentTarget) closeFlag() }}
          >
            <div
              className="rounded-t-3xl p-5"
              style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--fg-08)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-9 h-1 rounded-sm mx-auto mb-4" style={{ backgroundColor: 'var(--fg-20)' }} />

              {flagDone ? (
                <div className="flex flex-col items-center text-center gap-3 py-4">
                  <span style={{ fontSize: 48 }}>✅</span>
                  <p className="text-xl font-black text-white">Thanks for the report!</p>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--fg-45)' }}>We'll review this location and correct any issues.</p>
                  <button
                    className="mt-2 w-full rounded-2xl p-3.5 font-bold text-white"
                    style={{ backgroundColor: '#C9F400' }}
                    onClick={closeFlag}
                  >
                    Done
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2.5 mb-1">
                    <span style={{ fontSize: 20 }}>🚩</span>
                    <p className="text-lg font-black text-white">Flag Location</p>
                  </div>
                  <p className="text-xs mb-5" style={{ color: 'var(--fg-40)' }}>Something wrong with this location? Let us know so we can fix it.</p>

                  <p className="text-[10px] font-bold mb-2.5" style={{ color: 'var(--fg-35)', letterSpacing: '1.5px' }}>REASON</p>
                  <div className="flex flex-col gap-2 mb-4">
                    {['Wrong location on map', 'Wrong address', "Store doesn't exist", 'Duplicate store', 'Other'].map((reason) => (
                      <button
                        key={reason}
                        className="flex items-center gap-3 rounded-xl px-4 py-3 text-left"
                        style={{
                          backgroundColor: flagReason === reason ? 'rgba(239,68,68,0.08)' : 'var(--fg-04)',
                          border: `1.5px solid ${flagReason === reason ? 'rgba(239,68,68,0.4)' : 'var(--fg-07)'}`,
                        }}
                        onClick={() => setFlagReason(reason)}
                      >
                        <div
                          className="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0"
                          style={{ borderColor: flagReason === reason ? '#FF4545' : 'var(--fg-20)' }}
                        >
                          {flagReason === reason && <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#FF4545' }} />}
                        </div>
                        <span className="text-sm font-semibold" style={{ color: flagReason === reason ? '#fff' : 'var(--fg-60)' }}>{reason}</span>
                      </button>
                    ))}
                  </div>

                  <p className="text-[10px] font-bold mb-2" style={{ color: 'var(--fg-35)', letterSpacing: '1.5px' }}>NOTES (OPTIONAL)</p>
                  <textarea
                    placeholder="Describe the issue in more detail..."
                    value={flagNotes}
                    onChange={(e) => setFlagNotes(e.target.value)}
                    rows={3}
                    className="w-full rounded-xl px-3.5 py-3 text-sm text-white outline-none resize-none mb-4"
                    style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--fg-07)' }}
                  />

                  <div className="flex gap-2.5">
                    <button
                      className="flex-1 rounded-xl p-3.5 font-semibold text-sm"
                      style={{ backgroundColor: 'rgba(201,244,0,0.06)', color: 'var(--fg-50)' }}
                      onClick={closeFlag}
                    >
                      Cancel
                    </button>
                    <button
                      className="flex-1 rounded-xl p-3.5 font-bold text-white text-sm flex items-center justify-center"
                      style={{ backgroundColor: !flagReason || flagSubmitting ? 'rgba(239,68,68,0.35)' : '#FF4545' }}
                      disabled={!flagReason || flagSubmitting}
                      onClick={submitFlag}
                    >
                      {flagSubmitting
                        ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        : 'Submit Flag'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>,
          document.body
        )}


      </div>
    </div>
  )
}

export default function StoreDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState<string | null>(null)

  useEffect(() => {
    params.then((p) => setId(p.id))
  }, [params])

  if (!id) return null

  return (
    <Suspense>
      <StoreDetailContent id={id} />
    </Suspense>
  )
}
