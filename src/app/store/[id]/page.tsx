'use client'

import { useEffect, useState, Suspense } from 'react'
import { createPortal } from 'react-dom'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Quantity } from '@/lib/types'

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

const BRAND_COLORS: Record<string, string> = {
  Monster: '#00cc44',
  'Red Bull': '#e63946',
  Celsius: '#7c3aed',
  Ghost: '#06b6d4',
  Reign: '#f97316',
  Rockstar: '#facc15',
  Bang: '#ec4899',
  NOS: '#3b82f6',
}

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
  const { user } = useAuth()

  const [stock, setStock] = useState<any[]>([])
  const [store, setStore] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [profileMap, setProfileMap] = useState<Record<string, { username: string; verified: boolean }>>({})
  const [expandedBrands, setExpandedBrands] = useState<Set<string>>(new Set())
  const [isFavorited, setIsFavorited] = useState(false)
  const [favLoading, setFavLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [showAddDrink, setShowAddDrink] = useState(false)
  const [drinkBrand, setDrinkBrand] = useState('')
  const [drinkFlavor, setDrinkFlavor] = useState('')
  const [drinkSubmitting, setDrinkSubmitting] = useState(false)
  const [drinkSubmitted, setDrinkSubmitted] = useState(false)

  useEffect(() => {
    fetchStore()
    fetchStock()
    if (user) checkFavorite()

    const channel = supabase
      .channel(`store-detail:${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'stock_reports', filter: `store_id=eq.${id}` }, fetchStock)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [id])

  async function fetchStore() {
    const { data } = await supabase.from('stores').select('*').eq('id', id).single()
    if (data) setStore(data)
  }

  async function checkFavorite() {
    if (!user) return
    const { data } = await supabase.from('favorites').select('id').eq('user_id', user.id).eq('store_id', id).maybeSingle()
    setIsFavorited(!!data)
  }

  async function toggleFavorite() {
    if (!user || favLoading) return
    setFavLoading(true)
    if (isFavorited) {
      await supabase.from('favorites').delete().eq('user_id', user.id).eq('store_id', id)
      setIsFavorited(false)
    } else {
      await supabase.from('favorites').insert({ user_id: user.id, store_id: id })
      setIsFavorited(true)
    }
    setFavLoading(false)
  }

  async function fetchStock() {
    const { data } = await supabase
      .from('latest_stock')
      .select('*, drink:drinks(name, brand, flavor)')
      .eq('store_id', id)
    if (data) {
      setStock(data)
      const userIds = [...new Set(data.map((d) => d.user_id).filter(Boolean))]
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username, is_verified_reporter')
          .in('id', userIds)
        if (profiles) {
          const map: Record<string, { username: string; verified: boolean }> = {}
          profiles.forEach((p) => { map[p.id] = { username: p.username, verified: p.is_verified_reporter } })
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

  async function submitAddDrink() {
    if (!drinkBrand.trim() || !drinkFlavor.trim()) return
    setDrinkSubmitting(true)
    const brand = drinkBrand.trim()
    const flavor = drinkFlavor.trim()
    const { error } = await supabase.from('drinks').insert({
      brand,
      name: `${brand} ${flavor}`,
      flavor,
    })
    if (error) {
      window.alert('Could not add drink. Please try again.')
      setDrinkSubmitting(false)
      return
    }
    setDrinkSubmitted(true)
    setDrinkSubmitting(false)
  }

  function closeAddDrink() {
    setShowAddDrink(false)
    setDrinkBrand('')
    setDrinkFlavor('')
    setDrinkSubmitted(false)
    setDrinkSubmitting(false)
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
    <div className="bg-[#0a0a0f]">
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
          {user && (
            <button
              onClick={toggleFavorite}
              disabled={favLoading}
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{
                backgroundColor: isFavorited ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.07)',
                border: isFavorited ? '1px solid rgba(239,68,68,0.3)' : '1px solid transparent',
              }}
            >
              <span style={{ fontSize: 16 }}>{isFavorited ? '❤️' : '🤍'}</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 mb-3">
          <span style={{ fontSize: 32 }}>{store ? TYPE_ICON[store.type] : '📍'}</span>
          <div className="flex-1">
            <p className="text-xl font-black text-white">{name}</p>
            {store && <p className="text-xs text-white/40 mt-0.5">{store.address}</p>}
          </div>
        </div>

        {latestReport && (
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
      <div className="flex gap-2.5 mx-4 mb-5">
        <button
          className="flex-1 rounded-2xl p-3.5 font-bold text-white text-sm"
          style={{ backgroundColor: '#22c55e' }}
          onClick={() => router.push(`/submit/drinks?storeId=${id}&storeName=${encodeURIComponent(name)}`)}
        >
          ⚡ Report Stock
        </button>
        <button
          className="flex-1 rounded-2xl p-3.5 font-bold text-sm"
          style={{ backgroundColor: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)' }}
          onClick={() => setShowAddDrink(true)}
        >
          + Add Drink
        </button>
      </div>

      {loading ? (
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
              const brandColor = BRAND_COLORS[brand] ?? 'rgba(255,255,255,0.5)'
              const isExpanded = isSearching || expandedBrands.has(brand)

              return (
                <div
                  key={brand}
                  className="rounded-2xl overflow-hidden"
                  style={{ backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  {/* Brand header — tap to expand */}
                  <button
                    className="w-full flex items-center gap-3 p-4 text-left"
                    onClick={() => toggleBrand(brand)}
                  >
                    {/* Brand color dot */}
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: brandColor }}
                    />

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
                      {items.map((item) => {
                        const q = QUANTITY_CONFIG[item.quantity as Quantity]
                        const freshColor = stalenessColor(item.reported_at)
                        return (
                          <div
                            key={item.drink_id}
                            className="flex items-center rounded-xl p-3"
                            style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-white truncate">
                                {item.drink?.flavor ?? item.drink?.name}
                              </p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <div className="w-1 h-1 rounded-full" style={{ backgroundColor: freshColor }} />
                                <p className="text-xs" style={{ color: freshColor }}>{timeAgo(item.reported_at)}</p>
                                {profileMap[item.user_id] && (
                                  <div className="flex items-center gap-1">
                                    <p className="text-xs text-white/30">· @{profileMap[item.user_id].username}</p>
                                    {profileMap[item.user_id].verified && (
                                      <span className="text-[9px] font-bold px-1 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.25)' }}>✓</span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div
                              className="px-2.5 py-1 rounded-full shrink-0"
                              style={{ backgroundColor: q?.bg, border: `1px solid ${q?.border}` }}
                            >
                              <span className="text-[10px] font-bold" style={{ color: q?.color }}>{q?.label}</span>
                            </div>
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

            {drinkSubmitted ? (
              <div className="flex flex-col items-center text-center gap-3 py-4">
                <span style={{ fontSize: 48 }}>🥤</span>
                <p className="text-xl font-black text-white">Drink Added!</p>
                <p className="text-sm text-white/45 leading-relaxed">
                  Thanks! It'll show up in the drink list right away.
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
                <p className="text-lg font-black text-white mb-1">Add a Drink</p>
                <p className="text-xs text-white/40 mb-5">Don't see a drink listed? Add it here.</p>

                <p className="text-[10px] font-bold text-white/35 mb-2" style={{ letterSpacing: '1.5px' }}>BRAND *</p>
                <input
                  type="text"
                  placeholder="e.g. Monster, Red Bull, Celsius"
                  value={drinkBrand}
                  onChange={(e) => setDrinkBrand(e.target.value)}
                  className="w-full rounded-xl p-3.5 text-sm text-white outline-none mb-4"
                  style={{ backgroundColor: '#0a0a0f', border: '1px solid rgba(255,255,255,0.07)' }}
                />

                <p className="text-[10px] font-bold text-white/35 mb-2" style={{ letterSpacing: '1.5px' }}>FLAVOR *</p>
                <input
                  type="text"
                  placeholder="e.g. Ultra White, Sugar Free"
                  value={drinkFlavor}
                  onChange={(e) => setDrinkFlavor(e.target.value)}
                  className="w-full rounded-xl p-3.5 text-sm text-white outline-none mb-5"
                  style={{ backgroundColor: '#0a0a0f', border: '1px solid rgba(255,255,255,0.07)' }}
                />

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
                      backgroundColor: !drinkBrand.trim() || !drinkFlavor.trim() || drinkSubmitting
                        ? 'rgba(34,197,94,0.4)' : '#22c55e'
                    }}
                    disabled={!drinkBrand.trim() || !drinkFlavor.trim() || drinkSubmitting}
                    onClick={submitAddDrink}
                  >
                    {drinkSubmitting
                      ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      : 'Add Drink'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body
      )}
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
