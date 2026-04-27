'use client'

import { useEffect, useState, Suspense } from 'react'
import { createPortal } from 'react-dom'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Quantity } from '@/lib/types'
import { BRAND_COLORS } from '@/components/BrandLogo'

// Canonical brand names — any alias maps to the authoritative spelling
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

const QUANTITY_CONFIG: Record<Quantity, { label: string; color: string; bg: string; border: string }> = {
  out:    { label: 'OUT',  color: '#ef4444', bg: 'rgba(239,68,68,0.1)',  border: 'rgba(239,68,68,0.25)'  },
  low:    { label: 'LOW',  color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.25)' },
  medium: { label: 'MED',  color: '#f97316', bg: 'rgba(249,115,22,0.1)', border: 'rgba(249,115,22,0.25)' },
  full:   { label: 'FULL', color: '#22c55e', bg: 'rgba(34,197,94,0.1)',  border: 'rgba(34,197,94,0.25)'  },
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
  if (hrs < 2) return '#22c55e'
  if (hrs < 12) return '#f59e0b'
  return '#ef4444'
}

function stalenessLabel(dateStr: string) {
  const hrs = (Date.now() - new Date(dateStr).getTime()) / 3600000
  if (hrs < 2) return 'Fresh'
  if (hrs < 12) return 'Aging'
  return 'Stale'
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
  const [profileMap, setProfileMap] = useState<Record<string, { username: string; verified: boolean; tier: string | null }>>({})
  const [expandedBrands, setExpandedBrands] = useState<Set<string>>(new Set())
  const [expandedHistory, setExpandedHistory] = useState<Set<string>>(new Set())
  const [drinkHistory, setDrinkHistory] = useState<Record<string, any[]>>({})
  const [historyLoading, setHistoryLoading] = useState<Set<string>>(new Set())
  const [showAddToList, setShowAddToList] = useState(false)
  const [userLists, setUserLists] = useState<any[]>([])
  const [listsLoading, setListsLoading] = useState(false)
  const [addedToLists, setAddedToLists] = useState<Set<string>>(new Set())
  const [newListName, setNewListName] = useState('')
  const [creatingList, setCreatingList] = useState(false)
const [search, setSearch] = useState('')
  const [showAddDrink, setShowAddDrink] = useState(false)
  const [drinkEntries, setDrinkEntries] = useState<{ id: string; brand: string; flavor: string; duplicate: boolean }[]>([{ id: '1', brand: '', flavor: '', duplicate: false }])
  const [drinkSubmitting, setDrinkSubmitting] = useState(false)
  const [drinkResults, setDrinkResults] = useState<{ added: number; skipped: number } | null>(null)

  useEffect(() => {
    fetchStore()
    fetchStock()

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

  async function openAddToList() {
    setShowAddToList(true)
    if (userLists.length === 0) {
      setListsLoading(true)
      const { data: listsData } = await supabase
        .from('custom_lists')
        .select('id, name')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
      if (listsData) setUserLists(listsData)
      const { data: existingData } = await supabase
        .from('list_stores')
        .select('list_id')
        .eq('store_id', id)
        .in('list_id', (listsData ?? []).map((l: any) => l.id))
      if (existingData) setAddedToLists(new Set(existingData.map((ls: any) => ls.list_id)))
      setListsLoading(false)
    }
  }

  async function toggleStoreInList(listId: string) {
    if (addedToLists.has(listId)) {
      await supabase.from('list_stores').delete().eq('list_id', listId).eq('store_id', id)
      setAddedToLists((prev) => { const next = new Set(prev); next.delete(listId); return next })
    } else {
      await supabase.from('list_stores').insert({ list_id: listId, store_id: id })
      setAddedToLists((prev) => new Set(prev).add(listId))
    }
  }

  async function createAndAddList() {
    if (!newListName.trim() || !user) return
    setCreatingList(true)
    const { data } = await supabase
      .from('custom_lists')
      .insert({ user_id: user.id, name: newListName.trim() })
      .select()
      .single()
    if (data) {
      setUserLists((prev) => [data, ...prev])
      await supabase.from('list_stores').insert({ list_id: data.id, store_id: id })
      setAddedToLists((prev) => new Set(prev).add(data.id))
    }
    setNewListName('')
    setCreatingList(false)
  }

  async function fetchStock() {
    const { data, error } = await supabase
      .from('latest_stock')
      .select('*, drink:drinks(name, brand, flavor)')
      .eq('store_id', id)
    if (error) { setStockError(true); setLoading(false); return }
    if (data) {
      setStock(data)
      const userIds = [...new Set(data.map((d) => d.user_id).filter(Boolean))]
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username, is_verified_reporter, tier')
          .in('id', userIds)
        if (profiles) {
          const map: Record<string, { username: string; verified: boolean; tier: string | null }> = {}
          profiles.forEach((p) => { map[p.id] = { username: p.username, verified: p.is_verified_reporter, tier: p.tier ?? null } })
          setProfileMap(map)
        }
      }
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

  function updateEntry(id: string, field: 'brand' | 'flavor', value: string) {
    setDrinkEntries((prev) => prev.map((e) => e.id === id ? { ...e, [field]: value, duplicate: false } : e))
  }

  function normalizeEntryBrand(id: string) {
    setDrinkEntries((prev) => prev.map((e) => e.id === id ? { ...e, brand: normalizeBrand(e.brand) } : e))
  }

  function addEntry() {
    setDrinkEntries((prev) => [...prev, { id: String(Date.now()), brand: '', flavor: '', duplicate: false }])
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

    // Check each entry for duplicates in parallel
    const duplicateFlags = await Promise.all(
      filled.map((e) => isDuplicate(normalizeBrand(e.brand), e.flavor.trim()))
    )

    // Mark duplicates
    const updatedEntries = drinkEntries.map((e) => {
      const idx = filled.findIndex((f) => f.id === e.id)
      if (idx === -1) return e
      return { ...e, duplicate: duplicateFlags[idx] }
    })
    setDrinkEntries(updatedEntries)

    const toInsert = filled.filter((_, i) => !duplicateFlags[i])
    if (toInsert.length > 0) {
      await supabase.from('drinks').insert(
        toInsert.map((e) => {
          const brand = normalizeBrand(e.brand)
          const flavor = e.flavor.trim()
          return { brand, name: `${brand} ${flavor}`, flavor, submitted_by: user?.id ?? null }
        })
      )
    }

    setDrinkResults({ added: toInsert.length, skipped: duplicateFlags.filter(Boolean).length })
    setDrinkSubmitting(false)
  }

  function closeAddDrink() {
    setShowAddDrink(false)
    setDrinkEntries([{ id: '1', brand: '', flavor: '', duplicate: false }])
    setDrinkSubmitting(false)
    setDrinkResults(null)
  }

  const latestReport = stock.reduce<any>((latest, item) => {
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

  // Group filtered stock by brand
  const byBrand = filteredStock.reduce<Record<string, any[]>>((acc, item) => {
    const brand = item.drink?.brand ?? 'Other'
    if (!acc[brand]) acc[brand] = []
    acc[brand].push(item)
    return acc
  }, {})

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#070710', position: 'relative', overflowX: 'hidden' }}>
      <style>{`@keyframes fadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, background: 'radial-gradient(ellipse 60% 40% at 20% 20%, rgba(34,197,94,0.04) 0%, transparent 60%)', pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)', backgroundSize: '40px 40px', pointerEvents: 'none' }} />
      <div style={{ position: 'relative', zIndex: 1 }}>
      {/* Header */}
      <div className="px-5 pb-4" style={{ paddingTop: 'calc(56px + env(safe-area-inset-top))' }}>
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => router.back()}
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: 'rgba(255,255,255,0.07)' }}
          >
            <span className="text-white text-lg">←</span>
          </button>
        </div>

        <div className="flex items-center gap-3 mb-3">
          <span style={{ fontSize: 32 }}>{store ? TYPE_ICON[store.type] : '📍'}</span>
          <div className="flex-1">
            <p className="text-xl font-black text-white">{name}</p>
            {store && <p className="text-xs text-white/40 mt-0.5">{store.address}</p>}
          </div>
        </div>

        {latestReport && !isHunterPlus && (
          <div
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full"
            style={{ border: `1px solid ${stalenessColor(latestReport.reported_at)}` }}
          >
            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: stalenessColor(latestReport.reported_at) }} />
            <span className="text-xs font-semibold" style={{ color: stalenessColor(latestReport.reported_at) }}>
              {stalenessLabel(latestReport.reported_at)} · {timeAgo(latestReport.reported_at)}
            </span>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2.5 mx-4 mb-2">
        <button
          className="flex-1 rounded-2xl p-3.5 font-bold text-white text-sm"
          style={{ backgroundColor: '#22c55e' }}
          onClick={() => router.push(`/submit/drinks?storeId=${id}&storeName=${encodeURIComponent(name)}`)}
        >
          Report Stock
        </button>
        <button
          className="flex-1 rounded-2xl p-3.5 font-bold text-sm"
          style={{ backgroundColor: 'rgba(255,255,255,0.07)', border: '1.5px solid rgba(255,255,255,0.5)', color: 'rgba(255,255,255,0.9)', boxShadow: '0 0 12px rgba(255,255,255,0.15), 0 0 24px rgba(255,255,255,0.07)' }}
          onClick={() => setShowAddDrink(true)}
        >
          + Add Drink
        </button>
        {isTracker && (
          <button
            className="rounded-2xl p-3.5 font-bold text-sm"
            style={{ backgroundColor: 'rgba(139,92,246,0.12)', border: '1.5px solid rgba(139,92,246,0.4)', color: '#a78bfa', boxShadow: '0 0 12px rgba(139,92,246,0.15)' }}
            onClick={openAddToList}
          >
            📑
          </button>
        )}
      </div>
      <p className="text-xs text-white/55 mx-4 mb-5 leading-relaxed">
        + Add Drink is for <span className="text-white font-semibold">new flavors only</span>. If it already exists, use Report Stock to update its status.
      </p>

      {storeError ? (
        <div className="flex flex-col items-center gap-3 mt-20 px-8 text-center">
          <span style={{ fontSize: 48 }}>🏪</span>
          <p className="text-lg font-black text-white">Store not found</p>
          <p className="text-sm text-white/40">This store may have been removed.</p>
          <button onClick={() => router.back()} className="mt-2 text-sm font-bold px-5 py-2.5 rounded-xl" style={{ backgroundColor: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.6)' }}>← Go back</button>
        </div>
      ) : stockError ? (
        <div className="flex flex-col items-center gap-3 mt-20 px-8 text-center">
          <span style={{ fontSize: 48 }}>⚠️</span>
          <p className="text-lg font-black text-white">Couldn't load stock</p>
          <p className="text-sm text-white/40">Check your connection and try again.</p>
          <button onClick={() => { setStockError(false); setLoading(true); fetchStock() }} className="mt-2 text-sm font-bold px-5 py-2.5 rounded-xl" style={{ backgroundColor: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.25)' }}>Retry</button>
        </div>
      ) : loading ? (
        <div className="flex justify-center mt-8">
          <div className="w-8 h-8 border-2 border-[#22c55e] border-t-transparent rounded-full animate-spin" />
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
            style={{ backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.07)' }}
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

          <p className="text-[10px] font-bold mb-3" style={{ color: 'rgba(255,255,255,0.35)', letterSpacing: '1.5px' }}>
            {isSearching
              ? `${filteredStock.length} result${filteredStock.length !== 1 ? 's' : ''}`
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
            {Object.entries(byBrand).map(([brand, items]) => {
              const inStock = items.filter((i) => i.quantity !== 'out').length
              const total = items.length
              const pct = total > 0 ? inStock / total : 0
              const barColor = pct === 0 ? '#ef4444' : pct >= 0.75 ? '#22c55e' : '#f59e0b'
              const isExpanded = isSearching || expandedBrands.has(brand)
              const brandColor = BRAND_COLORS[brand] ?? 'rgba(255,255,255,0.4)'

              return (
                <div
                  key={brand}
                  className="rounded-2xl overflow-hidden"
                  style={{
                    backgroundColor: '#1a1a24',
                    border: `1.5px solid ${brandColor}55`,
                    boxShadow: `0 0 12px ${brandColor}22, 0 0 24px ${brandColor}0d`,
                  }}
                >
                  {/* Brand header — tap to expand */}
                  <button
                    className="w-full flex items-center gap-3 p-4 text-left"
                    onClick={() => toggleBrand(brand)}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-black text-white">{brand}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        {/* Progress bar */}
                        <div
                          className="flex-1 h-1 rounded-full overflow-hidden"
                          style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
                        >
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${pct * 100}%`, backgroundColor: barColor }}
                          />
                        </div>
                        <p className="text-xs font-semibold shrink-0" style={{ color: barColor }}>
                          {inStock}/{total} in stock
                        </p>
                      </div>
                    </div>

                    {/* Chevron */}
                    <span
                      className="text-white/30 text-sm transition-transform"
                      style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                    >
                      ▾
                    </span>
                  </button>

                  {/* Flavors — shown when expanded */}
                  {isExpanded && (
                    <div className="px-4 pb-3 flex flex-col gap-2">
                      <div className="h-px mb-1" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }} />
                      {[...items].sort((a, b) => (STOCK_ORDER[a.quantity] ?? 4) - (STOCK_ORDER[b.quantity] ?? 4)).map((item) => {
                        const q = QUANTITY_CONFIG[item.quantity as Quantity]
                        const freshColor = stalenessColor(item.reported_at)
                        const historyOpen = expandedHistory.has(item.drink_id)
                        const history = drinkHistory[item.drink_id] ?? []
                        const loadingHistory = historyLoading.has(item.drink_id)
                        return (
                          <div key={item.drink_id}>
                            <div
                              className="flex items-center rounded-xl p-3"
                              style={{
                                backgroundColor: 'rgba(255,255,255,0.04)',
                                border: `1.5px solid ${q?.border ?? `${brandColor}44`}`,
                                boxShadow: `0 0 8px ${q?.color ?? brandColor}22`,
                                borderRadius: isTracker && historyOpen ? '12px 12px 0 0' : 12,
                                cursor: isTracker ? 'pointer' : 'default',
                              }}
                              onClick={() => toggleHistory(item.drink_id)}
                            >
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-white truncate">
                                  {item.drink?.flavor ?? item.drink?.name}
                                </p>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  {isHunterPlus ? (
                                    <p className="text-xs font-semibold" style={{ color: freshColor }}>{timeAgo(item.reported_at)}</p>
                                  ) : (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `${freshColor}18`, color: freshColor, border: `1px solid ${freshColor}44` }}>{stalenessLabel(item.reported_at)}</span>
                                  )}
                                  {profileMap[item.user_id] && (
                                    <div className="flex items-center gap-1 flex-wrap">
                                      <p className="text-xs text-white/30">· @{profileMap[item.user_id].username}</p>
                                      {profileMap[item.user_id].verified && (
                                        <span className="text-[9px] font-bold px-1 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.25)' }}>✓</span>
                                      )}
                                      {profileMap[item.user_id].tier === 'tracker' && (
                                        <span className="text-[9px] font-bold px-1 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(249,115,22,0.15)', color: '#f97316', border: '1px solid rgba(249,115,22,0.3)' }}>🔥 Tracker</span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <div
                                  className="px-2.5 py-1 rounded-full"
                                  style={{ backgroundColor: q?.bg, border: `1px solid ${q?.border}` }}
                                >
                                  <span className="text-[10px] font-bold" style={{ color: q?.color }}>{q?.label}</span>
                                </div>
                                {isTracker && (
                                  <span className="text-white/30 text-xs" style={{ transform: historyOpen ? 'rotate(180deg)' : 'rotate(0deg)', display: 'inline-block' }}>▾</span>
                                )}
                              </div>
                            </div>

                            {/* Stock history panel — Tracker only */}
                            {isTracker && historyOpen && (
                              <div
                                className="px-3 pb-3"
                                style={{
                                  backgroundColor: 'rgba(255,255,255,0.02)',
                                  border: `1.5px solid ${q?.border ?? `${brandColor}44`}`,
                                  borderTop: 'none',
                                  borderRadius: '0 0 12px 12px',
                                }}
                              >
                                <p className="text-[9px] font-bold py-2" style={{ color: 'rgba(255,255,255,0.25)', letterSpacing: '1.5px' }}>REPORT HISTORY</p>
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
                                          <div className="w-px self-stretch" style={{ backgroundColor: i === 0 ? hq?.color : 'rgba(255,255,255,0.08)', minHeight: 20 }} />
                                          <div
                                            className="px-2 py-0.5 rounded-full shrink-0"
                                            style={{ backgroundColor: hq?.bg, border: `1px solid ${hq?.border}` }}
                                          >
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

      {/* Add Drink modal */}
      {showAddDrink && createPortal(
        <div
          className="fixed inset-0 flex flex-col justify-end z-50"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
          onClick={(e) => { if (e.target === e.currentTarget) closeAddDrink() }}
        >
          <div
            className="rounded-t-3xl p-5"
            style={{ backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.08)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-9 h-1 rounded-sm mx-auto mb-4" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }} />

            {drinkResults ? (
              <div className="flex flex-col items-center text-center gap-3 py-4">
                <span style={{ fontSize: 48 }}>🥤</span>
                <p className="text-xl font-black text-white">
                  {drinkResults.added > 0 ? `${drinkResults.added} Drink${drinkResults.added !== 1 ? 's' : ''} Added!` : 'Nothing Added'}
                </p>
                <p className="text-sm text-white/45 leading-relaxed">
                  {drinkResults.added > 0 && `${drinkResults.added} drink${drinkResults.added !== 1 ? 's' : ''} added successfully.`}
                  {drinkResults.skipped > 0 && ` ${drinkResults.skipped} skipped — already in the system.`}
                </p>
                <button
                  className="mt-2 w-full rounded-2xl p-3.5 font-bold text-white"
                  style={{ backgroundColor: '#22c55e' }}
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
                      style={{ backgroundColor: '#070710', border: `1px solid ${entry.duplicate ? 'rgba(245,158,11,0.4)' : 'rgba(255,255,255,0.07)'}` }}
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
                        style={{ backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.07)' }}
                      />
                      <input
                        type="text"
                        placeholder="Flavor (e.g. Ultra White)"
                        value={entry.flavor}
                        onChange={(e) => updateEntry(entry.id, 'flavor', e.target.value)}
                        className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none"
                        style={{ backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.07)' }}
                      />
                      {entry.duplicate && (
                        <div className="flex items-center gap-2 mt-2.5">
                          <span style={{ fontSize: 13 }}>⚠️</span>
                          <p className="text-xs font-semibold" style={{ color: '#f59e0b' }}>
                            Already in the system — skipped.
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <button
                  className="w-full rounded-xl py-2.5 text-sm font-semibold mb-4 flex items-center justify-center gap-1.5"
                  style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.55)' }}
                  onClick={addEntry}
                >
                  <span>+</span> Add Another
                </button>

                <div className="flex gap-2.5">
                  <button
                    className="flex-1 rounded-xl p-3.5 font-semibold text-sm"
                    style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}
                    onClick={closeAddDrink}
                  >
                    Cancel
                  </button>
                  <button
                    className="flex-1 rounded-xl p-3.5 font-bold text-white text-sm flex items-center justify-center"
                    style={{
                      backgroundColor: drinkSubmitting || drinkEntries.every((e) => !e.brand.trim() || !e.flavor.trim())
                        ? 'rgba(34,197,94,0.4)' : '#22c55e'
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

      {/* Add to List modal — Tracker only */}
      {showAddToList && createPortal(
        <div
          className="fixed inset-0 flex flex-col justify-end z-50"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
          onClick={(e) => { if (e.target === e.currentTarget) { setShowAddToList(false); setNewListName('') } }}
        >
          <div
            className="rounded-t-3xl p-5"
            style={{ backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.08)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-9 h-1 rounded-sm mx-auto mb-4" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }} />
            <p className="text-lg font-black text-white mb-1">📑 Add to List</p>
            <p className="text-xs text-white/40 mb-4">Save <span className="text-white font-semibold">{name}</span> to a custom list.</p>

            {listsLoading ? (
              <div className="flex justify-center py-4">
                <div className="w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
              </div>
            ) : (
              <div className="flex flex-col gap-2 mb-4 max-h-[40vh] overflow-y-auto">
                {userLists.map((list) => {
                  const added = addedToLists.has(list.id)
                  return (
                    <button
                      key={list.id}
                      className="flex items-center gap-3 rounded-xl p-3.5 text-left"
                      style={{
                        backgroundColor: added ? 'rgba(139,92,246,0.12)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${added ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.07)'}`,
                      }}
                      onClick={() => toggleStoreInList(list.id)}
                    >
                      <span style={{ fontSize: 18 }}>📑</span>
                      <span className="flex-1 text-sm font-semibold text-white">{list.name}</span>
                      <span className="text-base">{added ? '✅' : '○'}</span>
                    </button>
                  )
                })}
                {userLists.length === 0 && (
                  <p className="text-sm text-white/30 text-center py-2">No lists yet. Create one below.</p>
                )}
              </div>
            )}

            {/* Create new list inline */}
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                className="flex-1 rounded-xl px-3.5 py-2.5 text-sm text-white outline-none"
                style={{ backgroundColor: '#070710', border: '1px solid rgba(255,255,255,0.07)' }}
                placeholder="New list name..."
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') createAndAddList() }}
              />
              <button
                onClick={createAndAddList}
                disabled={!newListName.trim() || creatingList}
                className="px-4 rounded-xl text-sm font-bold text-black"
                style={{ backgroundColor: !newListName.trim() || creatingList ? 'rgba(139,92,246,0.4)' : '#a78bfa' }}
              >
                {creatingList ? '...' : '+ Create'}
              </button>
            </div>

            <button
              className="w-full rounded-xl p-3.5 font-semibold text-sm"
              style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}
              onClick={() => { setShowAddToList(false); setNewListName('') }}
            >
              Done
            </button>
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
