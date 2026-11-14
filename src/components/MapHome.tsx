'use client'

import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useState, useEffect, useRef, useMemo } from 'react'
import { useLocation } from '@/hooks/useLocation'
import { useNearbyStores } from '@/hooks/useNearbyStores'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import type { Drink, Quantity, Store } from '@/lib/types'
import { StoreTypeIcon, SearchIcon, PinIcon, ClockIcon, CloseIcon, GroceryIcon, DrinkIcon, ChevronRightIcon } from '@/components/Icons'
import ui from '@/components/ui/ui.module.css'

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

  const sorted = useMemo(() => {
    const q = search.trim().toLowerCase()
    return byDistance
      .filter((s) => radius === null || getDistance(lat, lng, s.lat, s.lng) <= radius)
      .filter((s) => typeFilter === null || s.type === typeFilter)
      .filter((s) => brandFilter === null || (storeBrands[s.id] ?? []).includes(brandFilter))
      .filter((s) => !q || s.name.toLowerCase().includes(q) || s.address?.toLowerCase().includes(q) ||
        (storeStock[s.id] ?? []).some((r) => drinkLookup[r.drink_id]?.includes(q)))
      .filter((s) => !drinkFilter || (storeStock[s.id] ?? []).some((r) => r.drink_id === drinkFilter.id && r.quantity !== 'out'))
  }, [byDistance, radius, typeFilter, brandFilter, storeBrands, search, lat, lng, storeStock, drinkLookup, drinkFilter])

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

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg)', color: 'var(--text)' }}>
      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        .store-card { transition: border-color 0.2s ease, box-shadow 0.2s ease; }
        .store-card:hover { border-color: rgba(201,244,0,0.3) !important; box-shadow: 0 4px 24px rgba(0,0,0,0.3), 0 0 20px rgba(201,244,0,0.06) !important; }
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
                stores={sorted}
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
                style={{ bottom: 'calc(160px + env(safe-area-inset-bottom))', right: 16 }}
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

            {/* Freshness legend — always visible, no toggle needed now that
                markers themselves are colored by freshness */}
            <div
              className="absolute z-10 rounded-xl p-2.5 flex flex-col gap-1.5"
              style={{
                bottom: 'calc(90px + env(safe-area-inset-bottom))', left: 16,
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

            {/* Bottom sheet when store selected */}
            {selected && (
              <div
                className="absolute bottom-0 left-0 right-0 z-20 rounded-t-3xl p-5"
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

              {/* Search + Add Store */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
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

              {/* Filters */}
              <div className={ui.chipRow} style={{ marginBottom: 8 }}>
                {(isTracker ? HUNTER_RADIUS_OPTIONS : FREE_RADIUS_OPTIONS).map((r) => (
                  <button key={r ?? 'all'} onClick={() => setRadius(r)} className={`${ui.chip} ${radius === r ? ui.chipActive : ''}`}>
                    {r === null ? 'Any distance' : `${r} mi`}
                  </button>
                ))}
              </div>
              <div className={ui.chipRow} style={{ marginBottom: 8 }}>
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
                <div className={ui.chipRow} style={{ marginBottom: 18 }}>
                  <button onClick={() => setBrandFilter(null)} className={`${ui.chip} ${brandFilter === null ? ui.chipActive : ''}`}>All brands</button>
                  {availableBrands.map((brand) => {
                    const active = brandFilter === brand
                    return (
                      <button key={brand} onClick={() => setBrandFilter(active ? null : brand)} className={`${ui.chip} ${active ? ui.chipActive : ''}`}>{brand}</button>
                    )
                  })}
                </div>
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
                      <button className={ui.btnPrimary} style={{ flex: 1 }} onClick={() => router.push(`/submit/drinks?storeId=${nearest.id}&storeName=${encodeURIComponent(nearest.name)}`)}>
                        Report stock
                      </button>
                      {!isAtStore && (
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
              <p className={ui.sectionLabel}>{search ? `Results (${sorted.length})` : 'All stores'}</p>

              {storesLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
                  <div style={{ width: 32, height: 32, border: '2px solid #C9F400', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                </div>
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
                  {sorted.map((store) => {
                    const stock = storeStock[store.id] ?? []
                    const dist = getDistance(lat, lng, store.lat, store.lng).toFixed(1)
                    const latestReport = getLatestReport(stock)
                    const inStockCount = stock.filter((s) => s.quantity !== 'out').length
                    const pct = stock.length > 0 ? (inStockCount / stock.length) * 100 : 0
                    const hasReports = stock.length > 0
                    const barColor = pct === 0 ? '#FF4545' : pct >= 75 ? '#C9F400' : '#FFB300'
                    const daysSinceReport = latestReport ? (Date.now() - new Date(latestReport.reported_at).getTime()) / 86400000 : null
                    const isDormant = hasReports && daysSinceReport !== null && daysSinceReport > 7
                    const reportHref = `/submit/drinks?storeId=${store.id}&storeName=${encodeURIComponent(store.name)}`

                    return (
                      <div key={store.id} className={ui.card}>
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
                            <div key={update.id} style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 10, padding: '8px 12px', marginBottom: 10, backgroundColor: 'var(--fg-04)' }}>
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
                          <button className={ui.btnPrimary} style={{ flex: 1 }} onClick={() => router.push(reportHref)}>
                            Report stock
                          </button>
                          <button className={ui.btnSecondary} style={{ flex: 1 }} onClick={() => openDirections(store.lat, store.lng)}>
                            Directions
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
      </div>
    </div>
  )
}
