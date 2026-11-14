'use client'

import dynamic from 'next/dynamic'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { useState, useEffect, useRef, useMemo } from 'react'
import { useLocation } from '@/hooks/useLocation'
import { useNearbyStores } from '@/hooks/useNearbyStores'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import type { Drink, Quantity, Store } from '@/lib/types'
import { StoreTypeIcon, SearchIcon, PinIcon, ClockIcon, CloseIcon, GroceryIcon, DrinkIcon, ChevronRightIcon, HeartIcon } from '@/components/Icons'
import ui from '@/components/ui/ui.module.css'
import SkeletonList from '@/components/ui/SkeletonList'

type View = 'map' | 'list'

function getDistance(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 3958.8
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function openDirections(destLat: number, destLng: number) {
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent)
  if (isIOS) {
    window.open(`https://maps.apple.com/?daddr=${destLat},${destLng}&dirflg=d`, '_blank')
  } else {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLng}&travelmode=driving`, '_blank')
  }
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
  if (hrs < 2) return '#C9F400'
  if (hrs < 12) return '#FFB300'
  if (hrs < 24) return '#FF4545'
  return '#888888'
}

function getLatestReport(stock: any[]) {
  return stock.reduce<any>((latest, item) => {
    if (!latest) return item
    return new Date(item.reported_at) > new Date(latest.reported_at) ? item : latest
  }, null)
}

const FRESHNESS_LEGEND = [
  { color: '#C9F400', label: 'Mostly fresh' },
  { color: '#FFB300', label: 'Mixed' },
  { color: '#8A8F86', label: 'Mostly stale' },
]

const QUANTITY_CONFIG: Record<Quantity, { label: string; color: string }> = {
  out:    { label: 'OUT',  color: '#FF4545' },
  low:    { label: 'LOW',  color: '#FFB300' },
  medium: { label: 'MED',  color: '#FFB300' },
  full:   { label: 'FULL', color: 'var(--accent)' },
}

const FREE_RADIUS_OPTIONS = [5]
const HUNTER_RADIUS_OPTIONS = [5, 10, 15, 20, 25, null]

const TYPE_FILTERS = [
  { value: null,          label: 'All'     },
  { value: 'gas_station', label: 'Gas'     },
  { value: 'convenience', label: 'Conv.'   },
  { value: 'grocery',     label: 'Grocery' },
  { value: 'other',       label: 'Other'   },
]

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false })

// Rendered by HomeGate (src/app/page.tsx) for signed-in users only; logged-out
// visitors get the marketing landing page at / instead.
export default function MapHome() {
  const router = useRouter()
  const { user, profile, loading: authLoading } = useAuth()
  const isTracker = profile?.is_admin || profile?.tier === 'tracker'

  const { location, loading: locLoading, error: locError, retry } = useLocation()
  // Fallback for users who don't want to grant live GPS access — search by
  // ZIP code instead. Once set, this takes over as the effective location
  // everywhere on this page; live GPS (if later granted) is not needed.
  const [manualLocation, setManualLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [zipInput, setZipInput] = useState('')
  const [zipLoading, setZipLoading] = useState(false)
  const [zipError, setZipError] = useState<string | null>(null)
  const lat = manualLocation?.lat ?? location?.coords.latitude ?? 0
  const lng = manualLocation?.lng ?? location?.coords.longitude ?? 0
  const tierKey = !user ? 'anon' : isTracker ? 'tracker' : 'free'
  const { stores, nearbyCount, loading: storesLoading, error: storesError, refetch } = useNearbyStores(lat, lng, tierKey)

  async function searchByZip() {
    const zip = zipInput.trim()
    if (!/^\d{5}$/.test(zip)) { setZipError('Enter a 5-digit ZIP code.'); return }
    setZipError(null)
    setZipLoading(true)
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(zip)}`)
      const data = await res.json()
      if (!res.ok || data.error) {
        setZipError('ZIP code not found. Double-check it and try again.')
        setZipLoading(false)
        return
      }
      setManualLocation({ lat: data.lat, lng: data.lng })
    } catch {
      setZipError('Could not look up that ZIP code. Try again.')
    }
    setZipLoading(false)
  }

  const [view, setView] = useState<View>('map')

  // Map-view state
  const [selected, setSelected] = useState<Store | null>(null)
  // One-time welcome tips, shown the first time the map opens on this device.
  const [showWelcome, setShowWelcome] = useState(() => {
    try { return typeof window !== 'undefined' && !localStorage.getItem('welcome_seen_v1') } catch { return false }
  })
  function dismissWelcome() {
    setShowWelcome(false)
    try { localStorage.setItem('welcome_seen_v1', '1') } catch {}
  }
  // At-store report prompt: dismissed per store for the rest of the session.
  const [dismissedAtStore, setDismissedAtStore] = useState<string | null>(() => {
    try { return typeof window !== 'undefined' ? sessionStorage.getItem('at_store_dismissed') : null } catch { return null }
  })
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [leafletMap, setLeafletMap] = useState<any>(null)
  const swipeStartY = useRef<number | null>(null)
  const lastFetchRef = useRef<number>(Date.now())

  // List-view state
  const liveUpdateTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const [storeStock, setStoreStock] = useState<Record<string, any[]>>({})
  const [liveUpdates, setLiveUpdates] = useState<Record<string, { id: string; username: string; drinkName: string; quantity: Quantity }[]>>({})
  const [radius, setRadius] = useState<number | null>(10)
  const [radiusInitialized, setRadiusInitialized] = useState(false)
  const [typeFilter, setTypeFilter] = useState<string | null>(null)
  const [storeBrands, setStoreBrands] = useState<Record<string, string[]>>({})
  const [availableBrands, setAvailableBrands] = useState<string[]>([])
  const [brandFilter, setBrandFilter] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [allDrinks, setAllDrinks] = useState<Drink[]>([])
  const [drinkFilter, setDrinkFilter] = useState<{ id: string; label: string } | null>(null)
  const [searchFocused, setSearchFocused] = useState(false)
  // Map: show only stores reported in the last 12h. List: sort, filter sheet,
  // incremental rendering. Map sheet: swipe-up nearby list. Saved stores.
  const [freshOnly, setFreshOnly] = useState(false)
  const [sortMode, setSortMode] = useState<'nearest' | 'freshest' | 'most'>('nearest')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [listLimit, setListLimit] = useState(30)
  const [sheetExpanded, setSheetExpanded] = useState(false)
  const [favoriteIds, setFavoriteIds] = useState<Map<string, string>>(new Map())
  const listScrollRef = useRef<HTMLDivElement>(null)
  const listSentinelRef = useRef<HTMLDivElement>(null)
  const sheetTouchY = useRef<number | null>(null)

  // Saved stores (Tracker) — store_id -> favorites row id, for the list hearts.
  useEffect(() => {
    if (!user || !isTracker) return
    supabase.from('favorites').select('id, store_id').eq('user_id', user.id).then(({ data }) => {
      if (data) setFavoriteIds(new Map(data.map((f: any) => [f.store_id, f.id])))
    })
  }, [user, isTracker])

  async function toggleFavorite(storeId: string) {
    if (!user) return
    const existing = favoriteIds.get(storeId)
    const next = new Map(favoriteIds)
    if (existing) {
      next.delete(storeId)
      setFavoriteIds(next)
      const { error } = await supabase.from('favorites').delete().eq('id', existing)
      if (error) setFavoriteIds(new Map(favoriteIds))
    } else {
      next.set(storeId, 'pending')
      setFavoriteIds(next)
      const { data, error } = await supabase.from('favorites').insert({ user_id: user.id, store_id: storeId }).select('id').single()
      setFavoriteIds((prev) => { const m = new Map(prev); if (error || !data) m.delete(storeId); else m.set(storeId, data.id); return m })
    }
  }

  // Fetched once — powers the drink half of the search-bar suggestions.
  useEffect(() => {
    supabase.from('drinks').select('id, name, brand, flavor, caffeine_mg').then(({ data }) => {
      if (data) setAllDrinks(data)
    })
  }, [])

  useEffect(() => {
    if (!selected) { setLastUpdated(null); return }
    supabase
      .from('latest_stock')
      .select('reported_at')
      .eq('store_id', selected.id)
      .order('reported_at', { ascending: false })
      .limit(1)
      .then(({ data }) => setLastUpdated(data?.[0]?.reported_at ?? null))
  }, [selected])

  useEffect(() => {
    if (!user || !lat || !lng) return
    supabase
      .from('profiles')
      .update({ last_lat: lat, last_lng: lng })
      .eq('id', user.id)
      .then(() => {})
  }, [user?.id, lat, lng])

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastFetchRef.current > 5 * 60 * 1000) {
        lastFetchRef.current = Date.now()
        refetch()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [refetch])

  useEffect(() => {
    if (!authLoading && !radiusInitialized) {
      setRadius(isTracker ? 25 : 5)
      setRadiusInitialized(true)
    }
  }, [authLoading, isTracker, radiusInitialized])

  useEffect(() => {
    if (stores.length === 0) return
    supabase
      .from('latest_stock')
      .select('store_id, drink_id, quantity, reported_at')
      .in('store_id', stores.map((s) => s.id))
      .then(async ({ data }) => {
        if (!data) return

        const grouped: Record<string, any[]> = {}
        data.forEach((row) => {
          if (!grouped[row.store_id]) grouped[row.store_id] = []
          grouped[row.store_id].push(row)
        })
        setStoreStock(grouped)

        const drinkIds = [...new Set(data.map((d) => d.drink_id).filter(Boolean))]
        if (drinkIds.length === 0) return

        const { data: drinksData } = await supabase
          .from('drinks')
          .select('id, brand')
          .in('id', drinkIds)
        if (!drinksData) return

        const drinkBrandMap: Record<string, string> = {}
        drinksData.forEach((d) => { drinkBrandMap[d.id] = d.brand })

        const brandsByStore: Record<string, Set<string>> = {}
        const allBrands = new Set<string>()
        data.forEach((row) => {
          const brand = drinkBrandMap[row.drink_id]
          if (brand && row.quantity !== 'out') {
            if (!brandsByStore[row.store_id]) brandsByStore[row.store_id] = new Set()
            brandsByStore[row.store_id].add(brand)
            allBrands.add(brand)
          }
        })

        setStoreBrands(Object.fromEntries(
          Object.entries(brandsByStore).map(([k, v]) => [k, Array.from(v)])
        ))
        setAvailableBrands(Array.from(allBrands).sort())
      })
  }, [stores])

  useEffect(() => {
    if (stores.length === 0) return
    const storeIds = new Set(stores.map((s) => s.id))

    const channel = supabase
      .channel('stores-live-updates')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'stock_reports' }, async (payload) => {
        const report = payload.new as any
        if (!storeIds.has(report.store_id)) return

        const [{ data: drinkData }, { data: profileData }] = await Promise.all([
          supabase.from('drinks').select('name, flavor').eq('id', report.drink_id).single(),
          report.user_id
            ? supabase.from('profiles').select('username').eq('id', report.user_id).single()
            : Promise.resolve({ data: null }),
        ])

        const drinkName = drinkData?.flavor ?? drinkData?.name ?? 'a drink'
        const username = profileData?.username ?? 'Someone'
        const updateId = `${report.store_id}-${Date.now()}`

        setLiveUpdates((prev) => ({
          ...prev,
          [report.store_id]: [
            { id: updateId, username, drinkName, quantity: report.quantity },
            ...(prev[report.store_id] ?? []),
          ].slice(0, 3),
        }))

        const timer = setTimeout(() => {
          setLiveUpdates((prev) => ({
            ...prev,
            [report.store_id]: (prev[report.store_id] ?? []).filter((u) => u.id !== updateId),
          }))
        }, 8000)
        liveUpdateTimersRef.current.push(timer)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      liveUpdateTimersRef.current.forEach(clearTimeout)
      liveUpdateTimersRef.current = []
    }
  }, [stores])

  // Must run before any early return below (Rules of Hooks)
  const byDistance = useMemo(() =>
    [...stores].sort((a, b) => getDistance(lat, lng, a.lat, a.lng) - getDistance(lat, lng, b.lat, b.lng)),
    [stores, lat, lng]
  )

  // drink_id -> lowercased "brand name flavor" for free-text search matching
  // against what's actually in stock, not just store name/address.
  const drinkLookup = useMemo(() => {
    const map: Record<string, string> = {}
    allDrinks.forEach((d) => { map[d.id] = `${d.brand} ${d.name} ${d.flavor ?? ''}`.toLowerCase() })
    return map
  }, [allDrinks])

  // Every filter except a picked drink. The map plots this list and uses the
  // drink filter only to highlight (dimming the rest) so the whole map stays
  // visible; the list applies the drink filter for real (`sorted`).
  const sortedBase = useMemo(() => {
    const q = drinkFilter ? '' : search.trim().toLowerCase()
    return byDistance
      .filter((s) => radius === null || getDistance(lat, lng, s.lat, s.lng) <= radius)
      .filter((s) => typeFilter === null || s.type === typeFilter)
      .filter((s) => brandFilter === null || (storeBrands[s.id] ?? []).includes(brandFilter))
      .filter((s) => !q || s.name.toLowerCase().includes(q) || s.address?.toLowerCase().includes(q) ||
        (storeStock[s.id] ?? []).some((r) => drinkLookup[r.drink_id]?.includes(q)))
  }, [byDistance, radius, typeFilter, brandFilter, storeBrands, search, lat, lng, storeStock, drinkLookup, drinkFilter])

  const drinkStoreIds = useMemo(() => {
    if (!drinkFilter) return null
    const ids = new Set<string>()
    for (const [storeId, rows] of Object.entries(storeStock)) {
      if (rows.some((r) => r.drink_id === drinkFilter.id && r.quantity !== 'out')) ids.add(storeId)
    }
    return ids
  }, [drinkFilter, storeStock])

  const sorted = useMemo(() => (drinkStoreIds ? sortedBase.filter((s) => drinkStoreIds.has(s.id)) : sortedBase), [sortedBase, drinkStoreIds])

  // Per-store at-a-glance stock: counts + the top 3 in-stock flavors
  // (fullest first, then freshest) for the map popup and list cards.
  const drinkById = useMemo(() => new Map(allDrinks.map((d) => [d.id, d])), [allDrinks])
  const storeSummary = useMemo(() => {
    const order: Record<string, number> = { full: 0, medium: 1, low: 2 }
    const out: Record<string, { inStock: number; total: number; top: { label: string; quantity: Quantity }[] }> = {}
    for (const [storeId, rows] of Object.entries(storeStock)) {
      const inStock = rows.filter((r) => r.quantity !== 'out')
      const top = [...inStock]
        .sort((a, b) => (order[a.quantity] - order[b.quantity]) || b.reported_at.localeCompare(a.reported_at))
        .slice(0, 3)
        .map((r) => { const d = drinkById.get(r.drink_id); return { label: d ? `${d.brand} ${d.flavor || d.name}` : 'Drink', quantity: r.quantity as Quantity } })
      out[storeId] = { inStock: inStock.length, total: rows.length, top }
    }
    return out
  }, [storeStock, drinkById])

  // List sort order
  const listStores = useMemo(() => {
    if (sortMode === 'nearest') return sorted
    const latestAt = (id: string) => getLatestReport(storeStock[id] ?? [])?.reported_at ?? ''
    if (sortMode === 'freshest') return [...sorted].sort((a, b) => latestAt(b.id).localeCompare(latestAt(a.id)))
    return [...sorted].sort((a, b) => (storeSummary[b.id]?.inStock ?? 0) - (storeSummary[a.id]?.inStock ?? 0))
  }, [sorted, sortMode, storeStock, storeSummary])

  // Render the list 30 at a time (Tracker's unlimited radius can mean 1,000+
  // stores); reset when the result set changes.
  useEffect(() => { setListLimit(30) }, [search, radius, typeFilter, brandFilter, drinkFilter, sortMode])
  useEffect(() => {
    const root = listScrollRef.current
    const el = listSentinelRef.current
    if (!root || !el) return
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) setListLimit((n) => (n < listStores.length ? n + 30 : n))
    }, { root, rootMargin: '400px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [listStores.length, view])

  // Search-bar typeahead — drink suggestions are limited to drinks actually
  // in stock (non-'out') at a currently loaded nearby store, so picking one
  // never filters down to zero results.
  const inStockDrinkIds = useMemo(() => {
    const set = new Set<string>()
    Object.values(storeStock).forEach((rows) => rows.forEach((r) => { if (r.quantity !== 'out') set.add(r.drink_id) }))
    return set
  }, [storeStock])

  const drinkSuggestions = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return []
    return allDrinks
      .filter((d) => inStockDrinkIds.has(d.id))
      .filter((d) => d.brand.toLowerCase().includes(q) || d.name.toLowerCase().includes(q) || d.flavor?.toLowerCase().includes(q))
      .slice(0, 5)
  }, [allDrinks, inStockDrinkIds, search])

  const storeSuggestions = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return []
    return byDistance
      .filter((s) => s.name.toLowerCase().includes(q) || s.address?.toLowerCase().includes(q))
      .slice(0, 5)
  }, [byDistance, search])

  function selectStoreSuggestion(store: Store) {
    setSearchFocused(false)
    router.push(`/store/${store.id}?name=${encodeURIComponent(store.name)}`)
  }

  function selectDrinkSuggestion(drink: Drink) {
    const label = `${drink.brand} ${drink.flavor || drink.name}`
    setDrinkFilter({ id: drink.id, label })
    setSearch(label)
    setSearchFocused(false)
  }

  const showSuggestions = searchFocused && search.trim().length > 0 && (drinkSuggestions.length > 0 || storeSuggestions.length > 0)
  const suggestionSectionLabelStyle = { fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', padding: '6px 10px 4px' }
  const suggestionRowStyle = { width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' as const }

  const searchSuggestions = showSuggestions && (
    <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 30, backgroundColor: 'var(--surface)', border: '1px solid var(--fg-10)', borderRadius: 14, boxShadow: '0 8px 24px rgba(0,0,0,0.45)', maxHeight: 320, overflowY: 'auto', padding: 6 }}>
      {drinkSuggestions.length > 0 && (
        <>
          <p style={suggestionSectionLabelStyle}>Drinks</p>
          {drinkSuggestions.map((d) => (
            <button key={d.id} onMouseDown={(e) => e.preventDefault()} onClick={() => selectDrinkSuggestion(d)} style={suggestionRowStyle}>
              <DrinkIcon size={16} color="var(--text-muted)" />
              <p style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.brand} {d.flavor || d.name}</p>
            </button>
          ))}
        </>
      )}
      {storeSuggestions.length > 0 && (
        <>
          <p style={suggestionSectionLabelStyle}>Stores</p>
          {storeSuggestions.map((s) => (
            <button key={s.id} onMouseDown={(e) => e.preventDefault()} onClick={() => selectStoreSuggestion(s)} style={suggestionRowStyle}>
              <StoreTypeIcon type={s.type} size={16} color="var(--text-muted)" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 15, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</p>
                {s.address && <p style={{ fontSize: 13, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.address}</p>}
              </div>
            </button>
          ))}
        </>
      )}
    </div>
  )

  // Collapsed to a binary signal for map coloring — 'fresh' covers the
  // store page's Fresh+Aging buckets (< 12h), everything else (including no
  // reports at all) reads as 'stale' so a cold pin can't look misleadingly fresh.
  const storeFreshness = useMemo(() => {
    const map: Record<string, 'fresh' | 'stale'> = {}
    for (const store of stores) {
      const latest = getLatestReport(storeStock[store.id] ?? [])
      const hrs = latest ? (Date.now() - new Date(latest.reported_at).getTime()) / 3600000 : Infinity
      map[store.id] = hrs < 12 ? 'fresh' : 'stale'
    }
    return map
  }, [stores, storeStock])

  // What the map plots: every filter except the drink pick (that only
  // highlights), plus the optional "Fresh only" toggle.
  const mapStores = useMemo(
    () => (freshOnly ? sortedBase.filter((s) => storeFreshness[s.id] === 'fresh') : sortedBase),
    [sortedBase, freshOnly, storeFreshness]
  )

  if (authLoading || !user) {
    return (
      <div className="flex items-center justify-center h-screen ">
        <div className="w-8 h-8 border-2 border-[#C9F400] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (locLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-3 ">
        <div className="w-8 h-8 border-2 border-[#C9F400] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Finding your location…</p>
      </div>
    )
  }

  const zipFallback = (
    <div className="w-full" style={{ marginTop: 4 }}>
      <div className="flex items-center gap-2.5" style={{ margin: '18px 0 12px' }}>
        <span style={{ flex: 1, height: 1, background: 'var(--fg-10)' }} />
        <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>or</span>
        <span style={{ flex: 1, height: 1, background: 'var(--fg-10)' }} />
      </div>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 10, textAlign: 'left' }}>Rather not share your location? Search by ZIP code.</p>
      <div className="flex gap-2">
        <input
          type="text"
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={5}
          placeholder="ZIP code"
          value={zipInput}
          onChange={(e) => { setZipInput(e.target.value.replace(/\D/g, '')); setZipError(null) }}
          onKeyDown={(e) => { if (e.key === 'Enter') searchByZip() }}
          className={ui.input}
          style={{ flex: 1 }}
        />
        <button onClick={searchByZip} disabled={zipLoading} className={ui.btnSecondary}>
          {zipLoading ? 'Searching…' : 'Search'}
        </button>
      </div>
      {zipError && <p style={{ fontSize: 14, marginTop: 8, color: '#FF6B6B', textAlign: 'left' }}>{zipError}</p>}
    </div>
  )

  if (!location && !locError && !manualLocation) {
    return (
      <div className="flex flex-col items-center justify-center h-screen px-6 text-center gap-4" style={{ maxWidth: 420, margin: '0 auto' }}>
        <span style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(201,244,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <PinIcon size={26} color="#C9F400" />
        </span>
        <div>
          <p style={{ fontSize: 22, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>Find stores near you</p>
          <p style={{ fontSize: 15, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Share your location to see what&apos;s in stock around you.
          </p>
        </div>
        <button onClick={retry} className={`${ui.btnPrimary} ${ui.btnBlock} ${ui.btnLarge}`}>
          Use my location
        </button>
        {zipFallback}
      </div>
    )
  }

  if (locError && !manualLocation) {
    const isPermissionDenied = locError === 'denied'
    return (
      <div className="flex flex-col items-center justify-center h-screen px-6 text-center gap-4" style={{ maxWidth: 420, margin: '0 auto' }}>
        <span style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(201,244,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <PinIcon size={26} color="#C9F400" />
        </span>
        <div>
          <p style={{ fontSize: 22, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
            {isPermissionDenied ? 'No location? No problem.' : "Couldn't get your location"}
          </p>
          <p style={{ fontSize: 15, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {isPermissionDenied
              ? 'Search by ZIP code below, or turn on location anytime for automatic results.'
              : "Location is allowed, but we couldn't get a fix. Make sure location services are on, then try again."}
          </p>
        </div>

        <button onClick={retry} className={`${ui.btnPrimary} ${ui.btnBlock} ${ui.btnLarge}`}>
          Try again
        </button>

        {isPermissionDenied && (
          <details className={ui.card} style={{ width: '100%', textAlign: 'left' }}>
            <summary style={{ cursor: 'pointer', fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>How to turn location back on</summary>
            <ul style={{ margin: '12px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              <li><strong style={{ color: 'var(--text)', fontWeight: 600 }}>iPhone Safari:</strong> tap <strong style={{ color: 'var(--text)', fontWeight: 600 }}>aA</strong> in the address bar → Website Settings → Location → Allow. Also check Settings → Privacy &amp; Security → Location Services → Safari Websites → While Using.</li>
              <li><strong style={{ color: 'var(--text)', fontWeight: 600 }}>Chrome / Edge:</strong> tap the lock icon in the address bar → Site settings → Location → Allow.</li>
              <li><strong style={{ color: 'var(--text)', fontWeight: 600 }}>Firefox:</strong> tap the shield icon → Permissions → Access Your Location → Allow.</li>
            </ul>
          </details>
        )}
        {zipFallback}
      </div>
    )
  }

  const nearest = byDistance[0] ?? null
  const nearestDist = nearest ? getDistance(lat, lng, nearest.lat, nearest.lng) : null
  const isAtStore = nearestDist !== null && nearestDist < 0.15
  // Swipe-up "nearby stores" sheet on the map — hidden while a store popup,
  // the welcome sheet, or the at-store banner's store popup is showing.
  const showMapSheet = view === 'map' && !selected && !showWelcome && !storesLoading && mapStores.length > 0
  const sheetStores = (drinkStoreIds ? mapStores.filter((s) => drinkStoreIds.has(s.id)) : mapStores).slice(0, 25)

  function stockChips(storeId: string, max = 3) {
    const sum = storeSummary[storeId]
    if (!sum || sum.top.length === 0) return null
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {sum.top.slice(0, max).map((t, i) => {
          const c = t.quantity === 'full' ? '#C9F400' : t.quantity === 'low' ? '#FF8A3D' : '#FFB300'
          return (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, maxWidth: '100%', padding: '4px 9px', borderRadius: 999, background: 'var(--fg-06)', fontSize: 13, color: 'var(--text)' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: c, flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.label}</span>
            </span>
          )
        })}
        {sum.inStock > max && <span style={{ alignSelf: 'center', fontSize: 13, color: 'var(--text-dim)' }}>+{sum.inStock - max} more</span>}
      </div>
    )
  }

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg)', color: 'var(--text)' }}>
      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        .action-btn { transition: opacity 0.15s ease, transform 0.15s ease; cursor: pointer; }
        .action-btn:hover { opacity: 0.88; transform: translateY(-1px); }
        .action-btn:active { transform: scale(0.97); }
        .pill-btn { transition: all 0.15s ease; cursor: pointer; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {/* Shared header + view toggle */}
      <div
        style={{
          flexShrink: 0,
          position: 'relative',
          zIndex: 40,
          paddingTop: 'env(safe-area-inset-top)',
          backgroundColor: 'var(--header-bg)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 30, height: 30, borderRadius: 8, background: '#C9F400', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 2 4.5 13.5h6.2L9.8 22l9-11.6h-6.3L13.5 2z" fill="#0D1210" /></svg>
            </span>
            <div>
              <p style={{ fontSize: 17, fontWeight: 600, color: 'var(--text)', lineHeight: 1.1 }}>AmpedMap</p>
              <p style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>
                {storesLoading ? 'Loading stores…' : `${nearbyCount} store${nearbyCount === 1 ? '' : 's'} nearby`}
              </p>
            </div>
          </div>
          <div className={ui.segmented} role="tablist" aria-label="View">
            <button role="tab" aria-selected={view === 'map'} onClick={() => setView('map')} className={`${ui.segment} ${view === 'map' ? ui.segmentActive : ''}`}>Map</button>
            <button role="tab" aria-selected={view === 'list'} onClick={() => setView('list')} className={`${ui.segment} ${view === 'list' ? ui.segmentActive : ''}`}>List</button>
          </div>
        </div>

        {view === 'map' && (
          <div style={{ padding: '0 16px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', display: 'flex' }}><SearchIcon size={16} color="var(--text-dim)" /></span>
              <input
                type="text"
                placeholder="Search stores or flavors"
                value={search}
                onChange={(e) => { setSearch(e.target.value); if (drinkFilter) setDrinkFilter(null) }}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
                className={`${ui.input} ${ui.inputWithIcon}`}
                style={{ padding: '10px 36px 10px 40px', fontSize: 15 }}
              />
              {search && (
                <button onClick={() => { setSearch(''); setDrinkFilter(null) }} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', display: 'flex', cursor: 'pointer' }}><CloseIcon size={13} color="var(--text-dim)" /></button>
              )}
              {searchSuggestions}
            </div>
            <div className={ui.chipRow}>
              <button onClick={() => setFreshOnly((v) => !v)} className={`${ui.chip} ${freshOnly ? ui.chipActive : ''}`} aria-pressed={freshOnly}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: freshOnly ? '#0D1210' : '#C9F400' }} />Fresh only
              </button>
              {TYPE_FILTERS.map((f) => {
                const active = typeFilter === f.value
                return (
                  <button key={f.value ?? 'all'} onClick={() => setTypeFilter(f.value)} className={`${ui.chip} ${active ? ui.chipActive : ''}`}>
                    {f.value && <StoreTypeIcon type={f.value} size={14} color={active ? '#0D1210' : 'var(--text-muted)'} />}
                    {f.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Content area — cross-fades between map canvas and store list; both
          stay mounted so the map keeps its zoom/pan state and Mapbox instance
          alive when List View is showing. */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>

        {/* Dismiss backdrop for the search-suggestions dropdown — sits above
            the map/list (which have no explicit z-index above 1) but below
            the header (z-index 40, set above), so the search box + chips
            stay interactive while this dims and captures taps on the map/
            list underneath, closing the dropdown on the first tap instead
            of the dropdown just silently overlapping unreachable content. */}
        {showSuggestions && (
          <div
            onMouseDown={() => setSearchFocused(false)}
            style={{ position: 'absolute', inset: 0, zIndex: 24, backgroundColor: 'rgba(5,6,4,0.55)' }}
          />
        )}

        {/* Map layer */}
        <div
          className="absolute inset-0"
          style={{
            zIndex: view === 'map' ? 1 : 0,
            opacity: view === 'map' ? 1 : 0,
            transform: view === 'map' ? 'translateY(0)' : 'translateY(-8px)',
            pointerEvents: view === 'map' ? 'auto' : 'none',
            transition: 'opacity 0.2s ease, transform 0.2s ease',
          }}
        >
          <>
            <div className="absolute inset-0" style={{ zIndex: 0 }}>
              <MapView
                lat={lat}
                lng={lng}
                stores={mapStores}
                highlightIds={drinkStoreIds}
                selected={selected}
                onSelectStore={setSelected}
                onMapReady={setLeafletMap}
                storeFreshness={storeFreshness}
              />
            </div>

            {/* Zoom + locate controls */}
            {leafletMap && (
              <div
                className="absolute z-10 flex flex-col gap-2"
                style={{ bottom: `calc(${showMapSheet ? 224 : 160}px + env(safe-area-inset-bottom))`, right: 16, transition: 'bottom 0.2s ease' }}
              >
                {[{ label: '+', aria: 'Zoom in', fn: () => leafletMap.zoomIn() }, { label: '−', aria: 'Zoom out', fn: () => leafletMap.zoomOut() }].map(({ label, aria, fn }) => (
                  <button key={label} onClick={fn} aria-label={aria} className={ui.iconBtn} style={{ fontSize: 22, fontWeight: 300, boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>
                    {label}
                  </button>
                ))}
                <button
                  onClick={() => leafletMap.flyTo({ center: [lng, lat], zoom: 15 })}
                  className={ui.iconBtn}
                  style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}
                  title="Re-center on my location"
                  aria-label="Re-center on my location"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C9F400" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
                  </svg>
                </button>
              </div>
            )}

            {/* First-run welcome tips */}
            {showWelcome && (
              <div className="absolute inset-0 z-30 flex items-end anim-fade" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }} onClick={dismissWelcome}>
                <div className="w-full rounded-t-3xl anim-sheet" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--fg-08)', padding: '20px 20px calc(70px + env(safe-area-inset-bottom) + 20px)' }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Welcome to AmpedMap">
                  <div className="w-9 h-1 rounded-sm mx-auto" style={{ backgroundColor: 'var(--fg-20)', marginBottom: 18 }} />
                  <p style={{ fontSize: 22, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Welcome to AmpedMap</p>
                  <p style={{ fontSize: 15, color: 'var(--text-muted)', marginBottom: 18 }}>Three things to know:</p>
                  <ul style={{ listStyle: 'none', margin: '0 0 22px', padding: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <li style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <span style={{ display: 'flex', gap: 3, paddingTop: 5, flexShrink: 0 }}>{FRESHNESS_LEGEND.map((l) => <span key={l.label} style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: l.color }} />)}</span>
                      <span style={{ fontSize: 15, color: 'var(--text-muted)', lineHeight: 1.45 }}><strong style={{ color: 'var(--text)', fontWeight: 600 }}>Pin colors show freshness.</strong> Lime means someone reported in the last 12 hours.</span>
                    </li>
                    <li style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <span style={{ paddingTop: 2, flexShrink: 0, width: 30, display: 'flex', justifyContent: 'center' }}><DrinkIcon size={18} color="#C9F400" /></span>
                      <span style={{ fontSize: 15, color: 'var(--text-muted)', lineHeight: 1.45 }}><strong style={{ color: 'var(--text)', fontWeight: 600 }}>Tap a store to see its cooler.</strong> Every flavor shows how full it was and when.</span>
                    </li>
                    <li style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <span style={{ paddingTop: 2, flexShrink: 0, width: 30, display: 'flex', justifyContent: 'center' }}><PinIcon size={18} color="#C9F400" /></span>
                      <span style={{ fontSize: 15, color: 'var(--text-muted)', lineHeight: 1.45 }}><strong style={{ color: 'var(--text)', fontWeight: 600 }}>At a store? Report what you see.</strong> It takes seconds and saves the next person a trip.</span>
                    </li>
                  </ul>
                  <button className={`${ui.btnPrimary} ${ui.btnBlock} ${ui.btnLarge}`} onClick={dismissWelcome}>Got it</button>
                </div>
              </div>
            )}

            {/* At-store prompt — the cards lead with "View stock", so someone
                standing in a store gets a direct path to reporting here. */}
            {isAtStore && nearest && !selected && dismissedAtStore !== nearest.id && (
              <div className={`absolute z-10 ${ui.card} anim-rise`} style={{ top: 12, left: 12, right: 12, display: 'flex', alignItems: 'center', gap: 12, padding: '12px 12px 12px 14px', boxShadow: '0 8px 24px rgba(0,0,0,0.45)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>You&apos;re at {nearest.name}</p>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Seen the cooler? Report what&apos;s there.</p>
                </div>
                <button className={ui.btnPrimary} style={{ minHeight: 38, padding: '8px 14px', fontSize: 14 }} onClick={() => router.push(`/submit/drinks?storeId=${nearest.id}&storeName=${encodeURIComponent(nearest.name)}`)}>
                  Report stock
                </button>
                <button aria-label="Dismiss" className={ui.iconBtn} style={{ width: 32, height: 32, borderRadius: 10, flexShrink: 0 }} onClick={() => { setDismissedAtStore(nearest.id); try { sessionStorage.setItem('at_store_dismissed', nearest.id) } catch {} }}>
                  <CloseIcon size={11} color="var(--text-muted)" />
                </button>
              </div>
            )}

            {/* Freshness legend — always visible, no toggle needed now that
                markers themselves are colored by freshness */}
            <div
              className="absolute z-10 rounded-xl p-2.5 flex flex-col gap-1.5"
              style={{
                bottom: `calc(${showMapSheet ? 154 : 90}px + env(safe-area-inset-bottom))`, left: 16, transition: 'bottom 0.2s ease',
                backgroundColor: 'rgba(19,21,17,0.92)',
                border: '1px solid var(--fg-10)',
                backdropFilter: 'blur(12px)',
              }}
            >
              {FRESHNESS_LEGEND.map((item) => (
                <div key={item.label} className="flex items-center gap-1.5">
                  <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: item.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' }}>{item.label}</span>
                </div>
              ))}
            </div>

            {/* Swipe-up nearby stores sheet */}
            {showMapSheet && (
              <div
                className="absolute left-0 right-0 bottom-0 z-20 anim-sheet"
                style={{
                  background: 'var(--surface)',
                  borderTop: '1px solid var(--fg-08)',
                  borderRadius: '22px 22px 0 0',
                  boxShadow: '0 -10px 30px rgba(0,0,0,0.4)',
                  paddingBottom: 'calc(70px + env(safe-area-inset-bottom))',
                  maxHeight: sheetExpanded ? '62%' : undefined,
                  display: 'flex',
                  flexDirection: 'column',
                  transition: 'max-height 0.25s ease',
                }}
              >
                <button
                  onClick={() => setSheetExpanded((v) => !v)}
                  onTouchStart={(e) => { sheetTouchY.current = e.touches[0].clientY }}
                  onTouchEnd={(e) => {
                    if (sheetTouchY.current === null) return
                    const dy = e.changedTouches[0].clientY - sheetTouchY.current
                    if (dy < -30) setSheetExpanded(true)
                    if (dy > 30) setSheetExpanded(false)
                    sheetTouchY.current = null
                  }}
                  aria-expanded={sheetExpanded}
                  style={{ display: 'block', width: '100%', padding: '10px 16px 12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', flexShrink: 0 }}
                >
                  <span style={{ display: 'block', width: 36, height: 4, borderRadius: 2, background: 'var(--fg-20)', margin: '0 auto 10px' }} />
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>
                      {drinkFilter ? `${sheetStores.length} store${sheetStores.length === 1 ? '' : 's'} with ${drinkFilter.label}` : `${mapStores.length} store${mapStores.length === 1 ? '' : 's'} nearby`}
                    </span>
                    <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>{sheetExpanded ? 'Swipe down' : 'Swipe up'}</span>
                  </span>
                </button>
                {sheetExpanded && (
                  <div className="anim-fade" style={{ overflowY: 'auto', padding: '0 12px 8px', minHeight: 0 }}>
                    {sheetStores.map((s) => {
                      const sum = storeSummary[s.id]
                      const fresh = storeFreshness[s.id] === 'fresh'
                      return (
                        <button
                          key={s.id}
                          onClick={() => { setSelected(s); setSheetExpanded(false); leafletMap?.flyTo({ center: [s.lng, s.lat], zoom: Math.max(leafletMap.getZoom(), 14) }) }}
                          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 4px', background: 'none', border: 'none', borderTop: '1px solid var(--fg-06)', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}
                        >
                          <span style={{ width: 38, height: 38, borderRadius: 11, background: 'var(--fg-06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <StoreTypeIcon type={s.type} size={18} color={fresh ? '#C9F400' : 'var(--text-muted)'} />
                          </span>
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: 'block', fontSize: 15, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                            <span style={{ display: 'block', fontSize: 13, color: 'var(--text-dim)' }}>
                              {sum?.total ? `${sum.inStock} of ${sum.total} in stock` : 'No reports yet'}
                            </span>
                          </span>
                          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-muted)', flexShrink: 0 }}>{getDistance(lat, lng, s.lat, s.lng).toFixed(1)} mi</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Bottom sheet when store selected */}
            {selected && (
              <div
                key={selected.id}
                className="anim-sheet absolute bottom-0 left-0 right-0 z-20 rounded-t-3xl p-5"
                style={{
                  backgroundColor: 'var(--surface)',
                  border: '1px solid var(--fg-08)',
                  paddingBottom: 'calc(70px + env(safe-area-inset-bottom) + 12px)',
                }}
                onTouchStart={(e) => { swipeStartY.current = e.touches[0].clientY }}
                onTouchEnd={(e) => {
                  if (swipeStartY.current === null) return
                  const delta = e.changedTouches[0].clientY - swipeStartY.current
                  if (delta > 60) setSelected(null)
                  swipeStartY.current = null
                }}
              >
                <div className="w-9 h-1 rounded-sm mx-auto mb-4" style={{ backgroundColor: 'var(--fg-20)' }} />

                <div className="flex items-start justify-between" style={{ marginBottom: 10 }}>
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--fg-06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <StoreTypeIcon type={selected.type} size={22} color="var(--text-muted)" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate" style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>{selected.name}</p>
                      <p className="truncate" style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 1 }}>{selected.address}</p>
                    </div>
                  </div>
                  <button onClick={() => setSelected(null)} aria-label="Close" className={ui.iconBtn} style={{ width: 32, height: 32, borderRadius: 10, marginLeft: 8, flexShrink: 0 }}>
                    <CloseIcon size={12} color="var(--text-muted)" />
                  </button>
                </div>

                <div className="flex items-center flex-wrap" style={{ gap: '4px 14px', marginBottom: 16, fontSize: 14, color: 'var(--text-muted)' }}>
                  <span className="flex items-center gap-1.5"><PinIcon size={13} color="var(--text-dim)" />{getDistance(lat, lng, selected.lat, selected.lng).toFixed(1)} mi away</span>
                  {lastUpdated && isTracker && (
                    <span className="flex items-center gap-1.5"><ClockIcon size={13} color="var(--text-dim)" />Updated {timeAgo(lastUpdated)}</span>
                  )}
                </div>

                {/* Stock preview — decide if the trip is worth it without opening the store */}
                <div style={{ marginBottom: 16 }}>
                  {storeSummary[selected.id]?.total ? (
                    <>
                      <p style={{ fontSize: 15, color: 'var(--text-muted)', marginBottom: 8 }}>
                        <strong style={{ color: 'var(--text)', fontWeight: 600 }}>{storeSummary[selected.id].inStock} of {storeSummary[selected.id].total}</strong> flavors in stock
                      </p>
                      {stockChips(selected.id)}
                    </>
                  ) : (
                    <p style={{ fontSize: 14, color: 'var(--text-dim)' }}>No stock reports yet. Be the first.</p>
                  )}
                </div>

                <div className="flex gap-2.5">
                  <button className={ui.btnSecondary} style={{ flex: 1 }} onClick={() => openDirections(selected.lat, selected.lng)}>
                    Directions
                  </button>
                  <button className={ui.btnPrimary} style={{ flex: 1 }} onClick={() => router.push(`/store/${selected.id}?name=${encodeURIComponent(selected.name)}`)}>
                    View stock
                  </button>
                </div>
                <div style={{ textAlign: 'center', marginTop: 12 }}>
                  <button className={ui.linkQuiet} onClick={() => router.push(`/store/${selected.id}?name=${encodeURIComponent(selected.name)}&flag=1`)}>
                    Pin in the wrong spot?
                  </button>
                </div>
              </div>
            )}
          </>
        </div>

        {/* List layer */}
        <div
          ref={listScrollRef}
          style={{
            position: 'absolute', inset: 0, overflowY: 'auto',
            zIndex: view === 'list' ? 1 : 0,
            opacity: view === 'list' ? 1 : 0,
            transform: view === 'list' ? 'translateY(0)' : 'translateY(8px)',
            pointerEvents: view === 'list' ? 'auto' : 'none',
            transition: 'opacity 0.2s ease, transform 0.2s ease',
          }}
        >
            <div style={{ padding: '16px 16px 100px' }}>

              {/* Sticky search + controls */}
              <div style={{ position: 'sticky', top: 0, zIndex: 6, margin: '-16px -16px 14px', padding: '12px 16px 10px', background: 'var(--bg)', borderBottom: '1px solid var(--fg-06)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                    <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', display: 'flex' }}><SearchIcon size={16} color="var(--text-dim)" /></span>
                    <input
                      type="text"
                      placeholder="Search stores or flavors"
                      value={search}
                      onChange={(e) => { setSearch(e.target.value); if (drinkFilter) setDrinkFilter(null) }}
                      onFocus={() => setSearchFocused(true)}
                      onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
                      className={`${ui.input} ${ui.inputWithIcon}`}
                      style={{ paddingRight: 36, fontSize: 15 }}
                    />
                    {search && (
                      <button onClick={() => { setSearch(''); setDrinkFilter(null) }} aria-label="Clear search" style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', display: 'flex', cursor: 'pointer' }}><CloseIcon size={13} color="var(--text-dim)" /></button>
                    )}
                    {searchSuggestions}
                  </div>
                  <button className={ui.btnSecondary} onClick={() => router.push('/add-store')} style={{ flexShrink: 0 }}>
                    + Add store
                  </button>
                </div>
                {(() => {
                  const defaultRadius = isTracker ? 25 : 5
                  const activeFilters = (radius !== defaultRadius ? 1 : 0) + (typeFilter ? 1 : 0) + (brandFilter ? 1 : 0)
                  return (
                    <div className={ui.chipRow}>
                      <button onClick={() => setFiltersOpen(true)} className={`${ui.chip} ${activeFilters > 0 ? ui.chipActive : ''}`}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
                        Filters{activeFilters > 0 ? ` · ${activeFilters}` : ''}
                      </button>
                      {([['nearest', 'Nearest'], ['freshest', 'Freshest'], ['most', 'Most in stock']] as const).map(([key, label]) => (
                        <button key={key} onClick={() => setSortMode(key)} className={`${ui.chip} ${sortMode === key ? ui.chipActive : ''}`}>{label}</button>
                      ))}
                    </div>
                  )
                })()}
              </div>

              {/* Filters sheet */}
              {filtersOpen && createPortal(
                <div className="anim-fade" onClick={() => setFiltersOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end' }}>
                  <div className="anim-sheet" onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxHeight: '80vh', overflowY: 'auto', background: 'var(--surface)', borderRadius: '24px 24px 0 0', border: '1px solid var(--fg-08)', padding: '16px 16px calc(env(safe-area-inset-bottom) + 20px)' }}>
                    <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--fg-20)', margin: '0 auto 16px' }} />
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                      <p style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>Filters</p>
                      <button className={ui.btnGhost} onClick={() => { setRadius(isTracker ? 25 : 5); setTypeFilter(null); setBrandFilter(null) }}>Reset</button>
                    </div>
                    <p className={ui.sectionLabel}>Distance</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
                      {(isTracker ? HUNTER_RADIUS_OPTIONS : FREE_RADIUS_OPTIONS).map((r) => (
                        <button key={r ?? 'all'} onClick={() => setRadius(r)} className={`${ui.chip} ${radius === r ? ui.chipActive : ''}`}>
                          {r === null ? 'Any distance' : `${r} mi`}
                        </button>
                      ))}
                    </div>
                    <p className={ui.sectionLabel}>Store type</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
                      {TYPE_FILTERS.map((f) => {
                        const active = typeFilter === f.value
                        return (
                          <button key={f.value ?? 'all'} onClick={() => setTypeFilter(f.value)} className={`${ui.chip} ${active ? ui.chipActive : ''}`}>
                            {f.value && <StoreTypeIcon type={f.value} size={14} color={active ? '#0D1210' : 'var(--text-muted)'} />}
                            {f.label}
                          </button>
                        )
                      })}
                    </div>
                    {availableBrands.length > 0 && (
                      <>
                        <p className={ui.sectionLabel}>Brand in stock</p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
                          <button onClick={() => setBrandFilter(null)} className={`${ui.chip} ${brandFilter === null ? ui.chipActive : ''}`}>All brands</button>
                          {availableBrands.map((brand) => (
                            <button key={brand} onClick={() => setBrandFilter(brandFilter === brand ? null : brand)} className={`${ui.chip} ${brandFilter === brand ? ui.chipActive : ''}`}>{brand}</button>
                          ))}
                        </div>
                      </>
                    )}
                    <button className={`${ui.btnPrimary} ${ui.btnBlock} ${ui.btnLarge}`} onClick={() => setFiltersOpen(false)}>
                      Show {sorted.length} store{sorted.length === 1 ? '' : 's'}
                    </button>
                  </div>
                </div>,
                document.body
              )}

              {/* Nearest / You're at */}
              {storesLoading ? (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ height: 12, width: 110, borderRadius: 6, backgroundColor: 'var(--fg-06)', marginBottom: 10 }} />
                  <div style={{ borderRadius: 16, height: 120, backgroundColor: 'var(--surface)' }} className="animate-pulse" />
                </div>
              ) : nearest && (
                <div style={{ marginBottom: 22 }}>
                  <p className={ui.sectionLabel}>{isAtStore ? "You're here" : 'Nearest to you'}</p>
                  <div className={ui.card} style={{ borderColor: isAtStore ? 'rgba(201,244,0,0.45)' : 'var(--border)' }}>
                    <button
                      onClick={() => router.push(`/store/${nearest.id}?name=${encodeURIComponent(nearest.name)}`)}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', color: 'inherit', fontFamily: 'inherit' }}
                    >
                      <span style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: 'var(--fg-06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <StoreTypeIcon type={nearest.type} size={22} color="var(--text-muted)" />
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 17, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nearest.name}</span>
                        <span style={{ display: 'block', fontSize: 13, color: 'var(--text-dim)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nearest.address}</span>
                      </span>
                      <span style={{ fontSize: 14, fontWeight: 600, color: isAtStore ? 'var(--accent)' : 'var(--text-muted)', flexShrink: 0 }}>
                        {isAtStore ? 'Here' : `${nearestDist!.toFixed(1)} mi`}
                      </span>
                      <ChevronRightIcon size={16} color="var(--text-dim)" />
                    </button>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className={ui.btnPrimary} style={{ flex: 1 }} onClick={() => router.push(`/store/${nearest.id}?name=${encodeURIComponent(nearest.name)}`)}>
                        View stock
                      </button>
                      {isAtStore ? (
                        <button className={ui.btnSecondary} style={{ flex: 1 }} onClick={() => router.push(`/submit/drinks?storeId=${nearest.id}&storeName=${encodeURIComponent(nearest.name)}`)}>
                          Report stock
                        </button>
                      ) : (
                        <button className={ui.btnSecondary} style={{ flex: 1 }} onClick={() => openDirections(nearest.lat, nearest.lng)}>
                          Directions
                        </button>
                      )}
                    </div>
                    <div style={{ textAlign: 'center', marginTop: 10 }}>
                      <button className={ui.linkQuiet} onClick={() => router.push(`/store/${nearest.id}?name=${encodeURIComponent(nearest.name)}&flag=1`)}>Pin in the wrong spot?</button>
                    </div>
                  </div>
                </div>
              )}

              {/* All stores */}
              <p className={ui.sectionLabel}>{search || drinkFilter ? `Results (${sorted.length})` : `All stores (${sorted.length})`}</p>

              {storesLoading ? (
                <div style={{ padding: 0 }}><SkeletonList count={4} /></div>
              ) : storesError && stores.length === 0 ? (
                <div className={ui.emptyState}>
                  <GroceryIcon size={36} color="var(--text-dim)" />
                  <p className={ui.emptyTitle}>Couldn&apos;t load stores</p>
                  <p className={ui.emptyBody}>Check your connection and try again.</p>
                  <button onClick={() => refetch()} className={ui.btnSecondary} style={{ marginTop: 6 }}>Try again</button>
                </div>
              ) : sorted.length === 0 ? (
                <div className={ui.emptyState}>
                  <GroceryIcon size={36} color="var(--text-dim)" />
                  <p className={ui.emptyTitle}>No stores found</p>
                  <p className={ui.emptyBody}>
                    {brandFilter ? `No stores with ${brandFilter} in stock nearby.` : typeFilter ? `No ${typeFilter.replace('_', ' ')} stores in this area.` : search ? `No stores matching "${search}".` : 'No stores in range. Try a wider distance.'}
                  </p>
                  <button className={ui.btnSecondary} style={{ marginTop: 6 }} onClick={() => router.push('/add-store')}>Add a missing store</button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {listStores.slice(0, listLimit).map((store) => {
                    const stock = storeStock[store.id] ?? []
                    const dist = getDistance(lat, lng, store.lat, store.lng).toFixed(1)
                    const latestReport = getLatestReport(stock)
                    const inStockCount = stock.filter((s) => s.quantity !== 'out').length
                    const pct = stock.length > 0 ? (inStockCount / stock.length) * 100 : 0
                    const hasReports = stock.length > 0
                    const barColor = pct === 0 ? '#FF4545' : pct >= 75 ? '#C9F400' : '#FFB300'
                    const daysSinceReport = latestReport ? (Date.now() - new Date(latestReport.reported_at).getTime()) / 86400000 : null
                    const isDormant = hasReports && daysSinceReport !== null && daysSinceReport > 7
                    const storeHref = `/store/${store.id}?name=${encodeURIComponent(store.name)}`

                    return (
                      <div key={store.id} className={`${ui.card} reveal`}>
                        <button
                          onClick={() => router.push(`/store/${store.id}?name=${encodeURIComponent(store.name)}`)}
                          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', color: 'inherit', fontFamily: 'inherit' }}
                        >
                          <span style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: 'var(--fg-06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <StoreTypeIcon type={store.type} size={22} color="var(--text-muted)" />
                          </span>
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: 'block', fontSize: 17, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{store.name}</span>
                            <span style={{ display: 'block', fontSize: 13, color: 'var(--text-dim)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{store.address}</span>
                          </span>
                          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-muted)', flexShrink: 0 }}>{dist} mi</span>
                          <ChevronRightIcon size={16} color="var(--text-dim)" />
                        </button>

                        {hasReports ? (
                          <div style={{ marginBottom: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                              <div style={{ flex: 1, height: 6, backgroundColor: 'var(--fg-06)', borderRadius: 3, overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${pct}%`, backgroundColor: barColor, borderRadius: 3, transition: 'width 0.4s ease' }} />
                              </div>
                              <span style={{ fontSize: 13, fontWeight: 600, color: barColor, flexShrink: 0 }}>
                                {inStockCount} of {stock.length} in stock
                              </span>
                            </div>
                            {stockChips(store.id) && <div style={{ marginBottom: 8 }}>{stockChips(store.id)}</div>}
                            {latestReport && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-muted)' }}>
                                <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: stalenessColor(latestReport.reported_at), flexShrink: 0 }} />
                                Reported {timeAgo(latestReport.reported_at)}
                              </div>
                            )}
                            {isDormant && (
                              <p style={{ margin: '8px 0 0', fontSize: 13, color: '#FFB300' }}>
                                No one&apos;s checked in over {Math.floor(daysSinceReport!)} days. Be the one to confirm it.
                              </p>
                            )}
                          </div>
                        ) : (
                          <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-dim)' }}>No reports yet. Be the first to report here.</p>
                        )}

                        {(liveUpdates[store.id] ?? []).map((update) => {
                          const qColor = update.quantity === 'full' ? '#C9F400' : update.quantity === 'out' ? '#FF4545' : '#FFB300'
                          const qLabel = QUANTITY_CONFIG[update.quantity]?.label ?? update.quantity.toUpperCase()
                          return (
                            <div key={update.id} className="anim-rise" style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 10, padding: '8px 12px', marginBottom: 10, backgroundColor: 'var(--fg-04)' }}>
                              <div className="animate-pulse" style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: qColor, flexShrink: 0 }} />
                              <p style={{ fontSize: 13, color: 'var(--text-muted)', flex: 1 }}>
                                <span style={{ fontWeight: 600, color: 'var(--text)' }}>@{update.username}</span> reported{' '}
                                <span style={{ fontWeight: 500, color: 'var(--text)' }}>{update.drinkName}</span> as{' '}
                                <span style={{ fontWeight: 600, color: qColor }}>{qLabel}</span>
                              </p>
                            </div>
                          )
                        })}

                        <div style={{ display: 'flex', gap: 8 }}>
                          <button className={ui.btnPrimary} style={{ flex: 1 }} onClick={() => router.push(storeHref)}>
                            View stock
                          </button>
                          <button className={ui.btnSecondary} style={{ flex: 1 }} onClick={() => openDirections(store.lat, store.lng)}>
                            Directions
                          </button>
                          {isTracker && (
                            <button
                              onClick={() => toggleFavorite(store.id)}
                              aria-label={favoriteIds.has(store.id) ? 'Remove from saved stores' : 'Save this store'}
                              title={favoriteIds.has(store.id) ? 'Saved' : 'Save this store'}
                              className={ui.btnSecondary}
                              style={{ width: 44, padding: 0, flexShrink: 0, borderColor: favoriteIds.has(store.id) ? 'rgba(255,69,69,0.45)' : undefined }}
                            >
                              <span key={favoriteIds.has(store.id) ? 'on' : 'off'} className={favoriteIds.has(store.id) ? 'anim-pop' : ''} style={{ display: 'flex' }}>
                                <HeartIcon size={16} color={favoriteIds.has(store.id) ? '#FF4545' : 'var(--text-muted)'} filled={favoriteIds.has(store.id)} />
                              </span>
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
              <div ref={listSentinelRef} style={{ height: 1 }} />
              {!storesLoading && listStores.length > listLimit && (
                <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-dim)', marginTop: 14 }}>Showing {listLimit} of {listStores.length} stores…</p>
              )}
            </div>
          </div>
      </div>
    </div>
  )
}
