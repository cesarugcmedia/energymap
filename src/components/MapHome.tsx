'use client'

import dynamic from 'next/dynamic'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { useState, useEffect, useRef, useMemo } from 'react'
import { useLocation } from '@/hooks/useLocation'
import { useNearbyStores } from '@/hooks/useNearbyStores'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import type { Drink, Store } from '@/lib/types'
import { StoreTypeIcon, SearchIcon, PinIcon, ClockIcon, CloseIcon, GroceryIcon, DrinkIcon, ChevronRightIcon, HeartIcon, EyeIcon, LightningIcon } from '@/components/Icons'
import ui from '@/components/ui/ui.module.css'
import { usePreferences } from '@/lib/preferences'
import Onboarding, { type OnboardingSummary } from '@/components/onboarding/Onboarding'
import SkeletonList from '@/components/ui/SkeletonList'
import SlideHighlight from '@/components/ui/SlideHighlight'
import BoltLoader from '@/components/ui/BoltLoader'
import Burst from '@/components/ui/Burst'
import { isFresh, stalenessOf, type Staleness } from '@/lib/freshness'
import { FREE_RADIUS_MILES } from '@/lib/plans'
import { agoText, amountOf, isReliable, sightingOf, startOfToday, NOT_THERE_HEX, SPOTTED_TEXT, type Sighting } from '@/lib/sightings'
import { XP_BOUNTY, daysSince, hasBounty } from '@/lib/xp'

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


// Same buckets as the store page (src/lib/freshness.ts).
const STALENESS_COLOR: Record<Staleness, string> = { Fresh: '#C9F400', Aging: '#FFB300', Stale: '#FF4545', Unverified: 'var(--text-dim)' }
const stalenessColor = (dateStr: string) => STALENESS_COLOR[stalenessOf(dateStr)]

// "12m", "1h", "3d" for compact chips.
function shortAgo(iso: string) {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000))
  if (mins < 60) return `${Math.max(1, mins)}m`
  const h = Math.floor(mins / 60)
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`
}

function getLatestReport(stock: any[]) {
  return stock.reduce<any>((latest, item) => {
    if (!latest) return item
    return new Date(item.reported_at) > new Date(latest.reported_at) ? item : latest
  }, null)
}

const FREE_RADIUS_OPTIONS = [5, 10, 15, FREE_RADIUS_MILES]
const HUNTER_RADIUS_OPTIONS = [5, 10, 15, 20, 25, 50, null]

const TYPE_FILTERS = [
  { value: null,          label: 'All'     },
  { value: 'gas_station', label: 'Gas'     },
  { value: 'convenience', label: 'Conv.'   },
  { value: 'grocery',     label: 'Grocery' },
  { value: 'other',       label: 'Other'   },
]

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false })
type PinInfo = import('@/components/MapView').PinInfo

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
  const { stores, nearbyCount, loading: storesLoading, error: storesError, refetch } = useNearbyStores(lat, lng, tierKey, !authLoading)

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
  // First-time welcome flow (src/components/onboarding/Onboarding.tsx) —
  // replaces the old one-screen tips sheet. Shown once, until prefs.done.
  const { prefs, ready: prefsReady, save: savePrefs } = usePreferences()
  const [onboardingClosed, setOnboardingClosed] = useState(false)
  const showOnboarding = prefsReady && !prefs.done && !onboardingClosed
  const showWelcome = showOnboarding
  // Highlight stores carrying the user's favorite brands (map chip).
  const [myBrandsOn, setMyBrandsOn] = useState(false)
  const appliedTypePref = useRef(false)
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
  const [pinFlash, setPinFlash] = useState<{ id: string; n: number } | null>(null)
  const [locatePing, setLocatePing] = useState(0)
  const [liveUpdates, setLiveUpdates] = useState<Record<string, { id: string; username: string; drinkName: string; sighting: Sighting }[]>>({})
  const [radius, setRadius] = useState<number | null>(10)
  const [radiusInitialized, setRadiusInitialized] = useState(false)
  const [typeFilter, setTypeFilter] = useState<string | null>(null)
  const [brandFilter, setBrandFilter] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [allDrinks, setAllDrinks] = useState<Drink[]>([])
  const [drinkFilter, setDrinkFilter] = useState<{ id: string; label: string } | null>(null)
  const [searchFocused, setSearchFocused] = useState(false)
  // Map: show only stores reported in the last day. List: sort, filter sheet,
  // incremental rendering. Map sheet: swipe-up nearby list. Saved stores.
  const [sortMode, setSortMode] = useState<'nearest' | 'today' | 'bounties'>('nearest')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [legendOpen, setLegendOpen] = useState(false)
  useEffect(() => {
    try { if (!localStorage.getItem('map_legend_seen_v1')) { setLegendOpen(true); localStorage.setItem('map_legend_seen_v1', '1') } } catch { /* storage unavailable */ }
  }, [])
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

  const [heartBurst, setHeartBurst] = useState<{ id: string; n: number } | null>(null)
  async function toggleFavorite(storeId: string) {
    if (!user) return
    if (!favoriteIds.has(storeId)) setHeartBurst((b) => ({ id: storeId, n: (b?.n ?? 0) + 1 }))
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

  // Welcome-flow answers: a saved home area stands in for GPS when there is
  // no location yet, and a single preferred store type becomes the default filter.
  useEffect(() => {
    if (!location && !manualLocation && prefs.homeLat != null && prefs.homeLng != null) {
      setManualLocation({ lat: prefs.homeLat, lng: prefs.homeLng })
    }
  }, [location, manualLocation, prefs.homeLat, prefs.homeLng])
  useEffect(() => {
    if (!prefsReady || appliedTypePref.current) return
    appliedTypePref.current = true
    if (prefs.storeTypes.length === 1) setTypeFilter(prefs.storeTypes[0])
  }, [prefsReady, prefs.storeTypes])

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
      setRadius(isTracker ? 25 : FREE_RADIUS_MILES)
      setRadiusInitialized(true)
    }
  }, [authLoading, isTracker, radiusInitialized])

  // Latest stock for every loaded store. Store ids go in chunks (a long
  // .in() list can exceed URL limits) and each chunk is paged, because
  // Supabase caps a response at 1,000 rows — a single query silently dropped
  // stock in busy areas and for Tracker's unlimited radius.
  useEffect(() => {
    if (stores.length === 0) return
    let cancelled = false
    const ids = stores.map((s) => s.id)
    const CHUNK = 150
    const PAGE = 1000
    const loadChunk = async (chunk: string[]) => {
      const rows: any[] = []
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from('latest_stock')
          .select('*')
          .in('store_id', chunk)
          .range(from, from + PAGE - 1)
        if (error || !data) break
        // sighting / amount from the new columns, or the legacy level.
        rows.push(...data.map((r: any) => ({ ...r, sighting: sightingOf(r), amount: amountOf(r) })))
        if (data.length < PAGE) break
      }
      return rows
    }
    ;(async () => {
      const chunks: string[][] = []
      for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK))
      const results = await Promise.all(chunks.map(loadChunk))
      if (cancelled) return
      const grouped: Record<string, any[]> = {}
      for (const row of results.flat()) (grouped[row.store_id] ??= []).push(row)
      setStoreStock(grouped)
    })()
    return () => { cancelled = true }
  }, [stores])

  // Brands in stock per store, from the drinks catalog already loaded for
  // search (no second round-trip).
  const { storeBrands, availableBrands } = useMemo(() => {
    const brandOf = new Map(allDrinks.map((d) => [d.id, d.brand]))
    const byStore: Record<string, string[]> = {}
    const all = new Set<string>()
    for (const [storeId, rows] of Object.entries(storeStock)) {
      const set = new Set<string>()
      for (const r of rows) {
        const brand = brandOf.get(r.drink_id)
        if (brand && r.sighting === 'spotted') { set.add(brand); all.add(brand) }
      }
      if (set.size) byStore[storeId] = [...set]
    }
    return { storeBrands: byStore, availableBrands: [...all].sort() }
  }, [storeStock, allDrinks])

  useEffect(() => {
    if (stores.length === 0) return
    const storeIds = new Set(stores.map((s) => s.id))

    const channel = supabase
      .channel('stores-live-updates')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'stock_reports' }, async (payload) => {
        const report = payload.new as any
        if (!storeIds.has(report.store_id)) return
        setPinFlash({ id: report.store_id, n: Date.now() })

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
            { id: updateId, username, drinkName, sighting: sightingOf(report) },
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
      if (rows.some((r) => r.drink_id === drinkFilter.id && r.sighting === 'spotted')) ids.add(storeId)
    }
    return ids
  }, [drinkFilter, storeStock])

  const sorted = useMemo(() => (drinkStoreIds ? sortedBase.filter((s) => drinkStoreIds.has(s.id)) : sortedBase), [sortedBase, drinkStoreIds])

  // Stores with any of the user's favorite brands in stock ("My brands" chip).
  const brandStoreIds = useMemo(() => {
    if (!prefs.brands.length) return null
    const ids = new Set<string>()
    for (const [storeId, brandsHere] of Object.entries(storeBrands)) if (brandsHere.some((b) => prefs.brands.includes(b))) ids.add(storeId)
    return ids
  }, [prefs.brands, storeBrands])

  // Per-store at a glance: how many flavors were last seen as Spotted, the
  // newest sighting, and the top 3 spotted flavors (favorite brands, then
  // newest) for the map popup and list cards.
  const drinkById = useMemo(() => new Map(allDrinks.map((d) => [d.id, d])), [allDrinks])
  const storeSummary = useMemo(() => {
    const out: Record<string, { inStock: number; total: number; lastSpotted: string | null; top: { label: string; reliable: boolean }[] }> = {}
    for (const [storeId, rows] of Object.entries(storeStock)) {
      const spotted = rows.filter((r) => r.sighting === 'spotted')
      const sortedSpotted = [...spotted].sort((a, b) => {
        const fa = prefs.brands.includes(drinkById.get(a.drink_id)?.brand ?? '') ? 0 : 1
        const fb = prefs.brands.includes(drinkById.get(b.drink_id)?.brand ?? '') ? 0 : 1
        return (fa - fb) || b.reported_at.localeCompare(a.reported_at)
      })
      const top = sortedSpotted.slice(0, 3)
        .map((r) => { const d = drinkById.get(r.drink_id); return { label: d ? `${d.brand} ${d.flavor || d.name}` : 'Drink', reliable: isReliable(r.reported_at) } })
      const lastSpotted = spotted.reduce<string | null>((m, r) => (!m || r.reported_at > m ? r.reported_at : m), null)
      out[storeId] = { inStock: spotted.length, total: rows.length, lastSpotted, top }
    }
    return out
  }, [storeStock, drinkById, prefs.brands])

  // "12 sightings near you today": stores in range whose latest report for a
  // flavor is a Spotted from today.
  const sightingsToday = useMemo(() => {
    const since = startOfToday()
    let n = 0
    for (const rows of Object.values(storeStock)) for (const r of rows) if (r.sighting === 'spotted' && new Date(r.reported_at).getTime() >= since) n++
    return n
  }, [storeStock])

  // List sort order
  // Per store: flavors spotted today (newest first), the newest check of any
  // kind (bounties) and a Not there from the last day.
  const storeToday = useMemo(() => {
    const since = startOfToday()
    const out: Record<string, { today: any[]; lastAny: string | null; notFound: any | null }> = {}
    for (const [id, rows] of Object.entries(storeStock)) {
      const today = rows.filter((r) => r.sighting === 'spotted' && new Date(r.reported_at).getTime() >= since)
        .sort((a, b) => b.reported_at.localeCompare(a.reported_at))
      const lastAny = rows.reduce<string | null>((m, r) => (!m || r.reported_at > m ? r.reported_at : m), null)
      const notFound = rows.filter((r) => r.sighting === 'not_there' && isReliable(r.reported_at))
        .sort((a, b) => b.reported_at.localeCompare(a.reported_at))[0] ?? null
      out[id] = { today, lastAny, notFound }
    }
    return out
  }, [storeStock])

  // Map pin per store (see PinInfo in MapView): fresh (spotted < 24 h, with
  // today's count) → out (Not there in the last day) → bounty (no check in
  // 48 h+) → older (last check 1–2 days ago).
  const storePins = useMemo(() => {
    const out: Record<string, PinInfo> = {}
    for (const st of stores) {
      const rows = storeStock[st.id] ?? []
      const t = storeToday[st.id]
      const lastSpot = rows.filter((r) => r.sighting === 'spotted').reduce<string | null>((m, r) => (!m || r.reported_at > m ? r.reported_at : m), null)
      const lastAny = t?.lastAny ?? null
      if (lastSpot && isReliable(lastSpot)) out[st.id] = { kind: 'fresh', count: t?.today.length ?? 0 }
      else if (t?.notFound) out[st.id] = { kind: 'out' }
      else if (hasBounty(lastAny)) out[st.id] = { kind: 'bounty', label: `+${XP_BOUNTY}` }
      else out[st.id] = { kind: 'older', label: shortAgo(lastAny!) }
    }
    return out
  }, [stores, storeStock, storeToday])

  const listStores = useMemo(() => {
    if (sortMode === 'nearest') return sorted
    if (sortMode === 'today') {
      return sorted.filter((s) => (storeToday[s.id]?.today.length ?? 0) > 0)
        .sort((a, b) => (storeToday[b.id].today.length - storeToday[a.id].today.length) || storeToday[b.id].today[0].reported_at.localeCompare(storeToday[a.id].today[0].reported_at))
    }
    if (sortMode === 'bounties') return sorted.filter((s) => hasBounty(storeToday[s.id]?.lastAny))
    return sorted
  }, [sorted, sortMode, storeToday])

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
    Object.values(storeStock).forEach((rows) => rows.forEach((r) => { if (r.sighting === 'spotted') set.add(r.drink_id) }))
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

  // Recent searches (this device) and the flavors in stock at the most
  // nearby stores — shown when the search box is focused but still empty.
  type Recent = { kind: 'drink' | 'store'; id: string; label: string }
  const RECENTS_KEY = 'ampedmap_recent_searches'
  const [recents, setRecents] = useState<Recent[]>([])
  useEffect(() => { try { setRecents(JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '[]')) } catch { /* ignore */ } }, [])
  function rememberSearch(r: Recent) {
    setRecents((prev) => {
      const next = [r, ...prev.filter((p) => !(p.kind === r.kind && p.id === r.id))].slice(0, 5)
      try { localStorage.setItem(RECENTS_KEY, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }
  function clearRecents() {
    setRecents([])
    try { localStorage.removeItem(RECENTS_KEY) } catch { /* ignore */ }
  }
  const popularNearby = useMemo(() => {
    const count = new Map<string, number>()
    Object.values(storeStock).forEach((rows) => rows.forEach((r) => { if (r.sighting === 'spotted') count.set(r.drink_id, (count.get(r.drink_id) ?? 0) + 1) }))
    const byId = new Map(allDrinks.map((d) => [d.id, d]))
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([id, n]) => ({ drink: byId.get(id), n })).filter((x): x is { drink: Drink; n: number } => !!x.drink).slice(0, 6)
  }, [storeStock, allDrinks])

  function selectStoreSuggestion(store: Store) {
    rememberSearch({ kind: 'store', id: store.id, label: store.name })
    setSearchFocused(false)
    router.push(`/store/${store.id}?name=${encodeURIComponent(store.name)}`)
  }

  function selectDrinkSuggestion(drink: Drink) {
    const label = `${drink.brand} ${drink.flavor || drink.name}`
    rememberSearch({ kind: 'drink', id: drink.id, label })
    setDrinkFilter({ id: drink.id, label })
    setSearch(label)
    setSearchFocused(false)
  }

  const showSuggestions = searchFocused && search.trim().length > 0 && (drinkSuggestions.length > 0 || storeSuggestions.length > 0)
  const showStarters = searchFocused && search.trim().length === 0 && (recents.length > 0 || popularNearby.length > 0)
  function openRecent(r: Recent) {
    if (r.kind === 'store') {
      const store = byDistance.find((s) => s.id === r.id)
      if (store) selectStoreSuggestion(store)
      else { setSearchFocused(false); router.push(`/store/${r.id}?name=${encodeURIComponent(r.label)}`) }
    } else {
      const drink = allDrinks.find((d) => d.id === r.id)
      if (drink) selectDrinkSuggestion(drink)
    }
  }
  const suggestionSectionLabelStyle = { fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', padding: '6px 10px 4px' }
  const suggestionRowStyle = { width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' as const }

  const starterPanel = showStarters && (
    <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 30, backgroundColor: 'var(--surface)', border: '1px solid var(--fg-10)', borderRadius: 14, boxShadow: '0 8px 24px rgba(0,0,0,0.25)', maxHeight: 360, overflowY: 'auto', padding: 6 }} className="anim-rise">
      {recents.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <p style={suggestionSectionLabelStyle}>Recent</p>
            <button onMouseDown={(e) => e.preventDefault()} onClick={clearRecents} style={{ background: 'none', border: 'none', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', padding: '6px 10px', cursor: 'pointer' }}>Clear</button>
          </div>
          {recents.map((r) => (
            <button key={`${r.kind}-${r.id}`} onMouseDown={(e) => e.preventDefault()} onClick={() => openRecent(r)} style={suggestionRowStyle}>
              <ClockIcon size={16} color="var(--text-dim)" />
              <p style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</p>
              <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{r.kind === 'store' ? 'Store' : 'Flavor'}</span>
            </button>
          ))}
        </>
      )}
      {popularNearby.length > 0 && (
        <>
          <p style={suggestionSectionLabelStyle}>In stock near you</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '2px 8px 8px' }}>
            {popularNearby.map(({ drink, n }) => (
              <button key={drink.id} onMouseDown={(e) => e.preventDefault()} onClick={() => selectDrinkSuggestion(drink)} className={ui.chip} style={{ fontSize: 13 }}>
                {drink.brand} {drink.flavor || drink.name}
                <span style={{ color: 'var(--text-dim)', fontWeight: 500 }}> · {n}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )

  const searchSuggestions = showSuggestions ? (
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
  ) : starterPanel

  // Collapsed to a binary signal for map coloring — 'fresh' covers the
  // store page's Fresh bucket (< 1 day), everything else (including no
  // reports at all) reads as 'stale' so a cold pin can't look misleadingly fresh.
  const storeFreshness = useMemo(() => {
    const map: Record<string, 'fresh' | 'stale'> = {}
    for (const store of stores) {
      const latest = getLatestReport(storeStock[store.id] ?? [])
      map[store.id] = isFresh(latest?.reported_at) ? 'fresh' : 'stale'
    }
    return map
  }, [stores, storeStock])

  // What the map plots: every filter except the drink pick (that only
  // highlights), narrowed by the Spotted today / Bounties chips — the same
  // choice as List view's chips. The pins show fresh / older / out / bounty.
  const mapStores = useMemo(() => {
    if (sortMode === 'today') return sortedBase.filter((s) => storePins[s.id]?.kind === 'fresh')
    if (sortMode === 'bounties') return sortedBase.filter((s) => storePins[s.id]?.kind === 'bounty')
    return sortedBase
  }, [sortedBase, sortMode, storePins])

  if (authLoading || !user) {
    return (
      <BoltLoader message="Charging up the map…" />
    )
  }

  if (locLoading) {
    return (
      <BoltLoader message="Finding stores near you…" />
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
          <PinIcon size={26} color="var(--accent-text)" />
        </span>
        <div>
          <p style={{ fontSize: 22, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>Find stores near you</p>
          <p style={{ fontSize: 15, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Share your location to see what&apos;s been spotted around you.
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
          <PinIcon size={26} color="var(--accent-text)" />
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

  // Personalized line for the welcome flow's finish screen, from real data.
  function onboardingSummary(brands: string[]): OnboardingSummary {
    const nearby = byDistance.filter((s) => getDistance(lat, lng, s.lat, s.lng) <= 5)
    // Only offer "Report at X" when they're actually there (reports are
    // geofenced to ~500m server-side); otherwise the finish screen points them
    // at the "You're at…" banner for next time.
    const closest = byDistance[0]
    const reportStore = closest && getDistance(lat, lng, closest.lat, closest.lng) < 0.3 ? { id: closest.id, name: closest.name } : null
    if (brands.length > 0) {
      const withBrand = nearby.filter((s) => (storeBrands[s.id] ?? []).some((b) => brands.includes(b)))
      const label = brands.length === 1 ? brands[0] : brands.length === 2 ? `${brands[0]} or ${brands[1]}` : 'your brands'
      if (withBrand.length > 0) {
        return { text: `${withBrand.length} store${withBrand.length === 1 ? '' : 's'} within 5 miles ${withBrand.length === 1 ? 'has' : 'have'} ${label} spotted lately.`, reportStore }
      }
      return { text: `No recent ${label} sightings nearby yet. Tap “My brands” on the map anytime to find them, or be the first to log one.`, reportStore }
    }
    return { text: `${nearby.length} store${nearby.length === 1 ? '' : 's'} within 5 miles. Tap any pin to see what’s in the cooler.`, reportStore }
  }

  function stockChips(storeId: string, max = 3) {
    const sum = storeSummary[storeId]
    if (!sum || sum.top.length === 0) return null
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {sum.top.slice(0, max).map((t, i) => {
          const c = t.reliable ? '#C9F400' : 'var(--fg-25)'
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

      {showOnboarding && user && (
        <Onboarding
          userId={user.id}
          initial={prefs}
          mode="first"
          getSummary={onboardingSummary}
          onSave={async (p) => {
            await savePrefs(p)
            if (p.storeTypes.length === 1) setTypeFilter(p.storeTypes[0])
            if (p.brands.length > 0) setMyBrandsOn(true)
          }}
          onClose={() => setOnboardingClosed(true)}
          onReport={(s) => router.push(`/submit/drinks?storeId=${s.id}&storeName=${encodeURIComponent(s.name)}`)}
        />
      )}

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
                {storesLoading ? 'Loading stores…' : sightingsToday > 0
                  ? <><strong style={{ color: 'var(--accent-text)', fontWeight: 700 }}>{sightingsToday} sighting{sightingsToday === 1 ? '' : 's'}</strong> near you today</>
                  : `${nearbyCount} store${nearbyCount === 1 ? '' : 's'} nearby`}
              </p>
            </div>
          </div>
          <div className={`${ui.segmented} ${ui.segSlide}`} role="tablist" aria-label="View">
            <SlideHighlight activeKey={view} />
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
              {(() => {
                const defaultRadius = isTracker ? 25 : FREE_RADIUS_MILES
                const activeFilters = (radius !== defaultRadius ? 1 : 0) + (typeFilter ? 1 : 0) + (brandFilter ? 1 : 0)
                return (
                  <button onClick={() => setFiltersOpen(true)} className={`${ui.chip} ${activeFilters > 0 ? ui.chipActive : ''}`}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
                    Filters{activeFilters > 0 ? ` · ${activeFilters}` : ''}
                  </button>
                )
              })()}
              <button onClick={() => setSortMode(sortMode === 'today' ? 'nearest' : 'today')} className={`${ui.chip} ${sortMode === 'today' ? ui.chipActive : ''}`} aria-pressed={sortMode === 'today'}>
                <EyeIcon size={14} color="currentColor" />Spotted today
              </button>
              <button onClick={() => setSortMode(sortMode === 'bounties' ? 'nearest' : 'bounties')} className={`${ui.chip} ${sortMode === 'bounties' ? ui.chipActive : ''}`} aria-pressed={sortMode === 'bounties'}>
                <LightningIcon size={14} color="currentColor" />Bounties
              </button>
              {prefs.brands.length > 0 && (
                <button onClick={() => setMyBrandsOn((v) => !v)} className={`${ui.chip} ${myBrandsOn ? ui.chipActive : ''}`} aria-pressed={myBrandsOn} title={prefs.brands.join(', ')}>
                  <DrinkIcon size={14} color={myBrandsOn ? '#0D1210' : 'var(--text-muted)'} />My brands
                </button>
              )}
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
        {(showSuggestions || showStarters) && (
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
                highlightIds={drinkStoreIds ?? (myBrandsOn ? brandStoreIds : null)}
                selected={selected}
                onSelectStore={setSelected}
                onMapReady={setLeafletMap}
                storeFreshness={storeFreshness}
                storePins={storePins}
                flash={pinFlash}
                locatePing={locatePing}
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
                  onClick={() => { leafletMap.flyTo({ center: [lng, lat], zoom: 15 }); setLocatePing((n) => n + 1) }}
                  className={ui.iconBtn}
                  style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}
                  title="Re-center on my location"
                  aria-label="Re-center on my location"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-text)" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
                  </svg>
                </button>
              </div>
            )}

            {/* At-store prompt — the cards lead with "View sightings", so someone
                standing in a store gets a direct path to reporting here. */}
            {isAtStore && nearest && !selected && dismissedAtStore !== nearest.id && (
              <div className={`absolute z-10 ${ui.card} anim-rise`} style={{ top: 12, left: 12, right: 12, display: 'flex', alignItems: 'center', gap: 12, padding: '12px 12px 12px 14px', boxShadow: '0 8px 24px rgba(0,0,0,0.45)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>You&apos;re at {nearest.name}</p>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Seen the cooler? Log what you spot.</p>
                </div>
                <button className={ui.btnPrimary} style={{ minHeight: 38, padding: '8px 14px', fontSize: 14 }} onClick={() => router.push(`/submit/drinks?storeId=${nearest.id}&storeName=${encodeURIComponent(nearest.name)}`)}>
                  Log sighting
                </button>
                <button aria-label="Dismiss" className={ui.iconBtn} style={{ width: 32, height: 32, borderRadius: 10, flexShrink: 0 }} onClick={() => { setDismissedAtStore(nearest.id); try { sessionStorage.setItem('at_store_dismissed', nearest.id) } catch {} }}>
                  <CloseIcon size={11} color="var(--text-muted)" />
                </button>
              </div>
            )}

            {/* "12 sightings near you today" */}
            {sightingsToday > 0 && !(isAtStore && nearest && !selected && dismissedAtStore !== nearest.id) && (
              <div className="absolute z-10 anim-rise" style={{ top: 12, left: 12, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 999, background: 'var(--header-bg)', border: '1px solid var(--fg-10)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', boxShadow: '0 4px 14px rgba(0,0,0,0.3)' }}>
                <span className="live-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: '#C9F400' }} />
                <span style={{ fontSize: 14, color: 'var(--text)' }}><strong style={{ color: 'var(--accent-text)' }}>{sightingsToday} sighting{sightingsToday === 1 ? '' : 's'}</strong> near you today</span>
              </div>
            )}

            {/* Pin legend, behind a "?" — the pins mostly speak for themselves.
                Opens by itself once per device (localStorage map_legend_seen_v1). */}
            <div
              className="absolute z-10"
              style={{ bottom: `calc(${showMapSheet ? 154 : 90}px + env(safe-area-inset-bottom))`, left: 12, transition: 'bottom 0.2s ease', display: 'flex', alignItems: 'flex-end', gap: 8 }}
            >
              <button
                onClick={() => { setLegendOpen((v) => !v); try { localStorage.setItem('map_legend_seen_v1', '1') } catch {} }}
                aria-label="What the pins mean"
                aria-expanded={legendOpen}
                className={ui.iconBtn}
                style={{ width: 36, height: 36, borderRadius: 999, fontSize: 16, fontWeight: 700, color: legendOpen ? '#0D1210' : 'var(--text)', background: legendOpen ? '#C9F400' : 'var(--header-bg)', boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}
              >
                ?
              </button>
              {legendOpen && (
                <div className="anim-rise" style={{ padding: '10px 12px', borderRadius: 14, background: 'var(--header-bg)', border: '1px solid var(--fg-10)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', boxShadow: '0 6px 18px rgba(0,0,0,0.35)', display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {([
                    ['Spotted today', <span key="f" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '1px 6px', borderRadius: 999, background: '#C9F400', color: '#0D1210', fontSize: 10, fontWeight: 800 }}><EyeIcon size={10} color="#0D1210" />3</span>],
                    ['Not found (zoom in for “Out”)', <span key="o" style={{ width: 10, height: 10, borderRadius: '50%', background: '#FF5A78' }} />],
                    ['+50 XP bounty', <span key="b" style={{ width: 11, height: 11, borderRadius: '50%', border: '2px dashed #FFC94D', background: 'rgba(255,179,0,0.25)' }} />],
                    ['Older or no sightings', <span key="g" style={{ width: 9, height: 9, borderRadius: '50%', background: '#7E8A80' }} />],
                  ] as const).map(([label, icon]) => (
                    <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' }}>
                      <span style={{ width: 28, display: 'flex', justifyContent: 'center' }}>{icon}</span>{label}
                    </span>
                  ))}
                </div>
              )}
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
                            <StoreTypeIcon type={s.type} size={18} color={fresh ? 'var(--accent-text)' : 'var(--text-muted)'} />
                          </span>
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: 'block', fontSize: 15, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                            <span style={{ display: 'block', fontSize: 13, color: 'var(--text-dim)' }}>
                              {sum?.lastSpotted ? `${sum.inStock} spotted · last ${agoText(sum.lastSpotted)}` : sum?.total ? 'Nothing spotted lately' : 'No sightings yet'}
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
                  {lastUpdated && (
                    <span className="flex items-center gap-1.5"><ClockIcon size={13} color="var(--text-dim)" />Last sighting {agoText(lastUpdated)}</span>
                  )}
                </div>

                {/* Stock preview — decide if the trip is worth it without opening the store */}
                <div style={{ marginBottom: 16 }}>
                  {storeSummary[selected.id]?.total ? (
                    <>
                      <p style={{ fontSize: 15, color: 'var(--text-muted)', marginBottom: 8 }}>
                        <strong style={{ color: 'var(--text)', fontWeight: 600 }}>{storeSummary[selected.id].inStock}</strong> flavor{storeSummary[selected.id].inStock === 1 ? '' : 's'} spotted
                      </p>
                      {stockChips(selected.id)}
                    </>
                  ) : (
                    <p style={{ fontSize: 14, color: 'var(--text-dim)' }}>No sightings yet. Be the first.</p>
                  )}
                  {hasBounty(storeToday[selected.id]?.lastAny) && (
                    <p style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 13, color: 'var(--text-muted)' }}>
                      <LightningIcon size={14} color="#FFB300" /><strong style={{ color: '#FFB300' }}>+{XP_BOUNTY} XP bounty</strong> for the next sighting here
                    </p>
                  )}
                </div>

                <div className="flex gap-2.5">
                  <button className={ui.btnSecondary} style={{ flex: 1 }} onClick={() => openDirections(selected.lat, selected.lng)}>
                    Directions
                  </button>
                  <button className={ui.btnPrimary} style={{ flex: 1 }} onClick={() => router.push(`/store/${selected.id}?name=${encodeURIComponent(selected.name)}`)}>
                    View sightings
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
                  const defaultRadius = isTracker ? 25 : FREE_RADIUS_MILES
                  const activeFilters = (radius !== defaultRadius ? 1 : 0) + (typeFilter ? 1 : 0) + (brandFilter ? 1 : 0)
                  return (
                    <div className={ui.chipRow}>
                      <button onClick={() => setFiltersOpen(true)} className={`${ui.chip} ${activeFilters > 0 ? ui.chipActive : ''}`}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
                        Filters{activeFilters > 0 ? ` · ${activeFilters}` : ''}
                      </button>
                      {([['nearest', 'Nearest'], ['today', 'Spotted today'], ['bounties', 'Bounties']] as const).map(([key, label]) => (
                        <button key={key} onClick={() => setSortMode(key)} className={`${ui.chip} ${sortMode === key ? ui.chipActive : ''}`}>
                          {key === 'today' && <EyeIcon size={14} color="currentColor" />}{label}
                        </button>
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
                      <button className={ui.btnGhost} onClick={() => { setRadius(isTracker ? 25 : FREE_RADIUS_MILES); setTypeFilter(null); setBrandFilter(null) }}>Reset</button>
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
                        <p className={ui.sectionLabel}>Brand spotted</p>
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
                      <span style={{ fontSize: 14, fontWeight: 600, color: isAtStore ? 'var(--accent-text)' : 'var(--text-muted)', flexShrink: 0 }}>
                        {isAtStore ? 'Here' : `${nearestDist!.toFixed(1)} mi`}
                      </span>
                      <ChevronRightIcon size={16} color="var(--text-dim)" />
                    </button>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className={ui.btnPrimary} style={{ flex: 1 }} onClick={() => router.push(`/store/${nearest.id}?name=${encodeURIComponent(nearest.name)}`)}>
                        View sightings
                      </button>
                      {isAtStore ? (
                        <button className={ui.btnSecondary} style={{ flex: 1 }} onClick={() => router.push(`/submit/drinks?storeId=${nearest.id}&storeName=${encodeURIComponent(nearest.name)}`)}>
                          Log sighting
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
                    {brandFilter ? `No stores with ${brandFilter} spotted nearby.` : typeFilter ? `No ${typeFilter.replace('_', ' ')} stores in this area.` : search ? `No stores matching "${search}".` : 'No stores in range. Try a wider distance.'}
                  </p>
                  <button className={ui.btnSecondary} style={{ marginTop: 6 }} onClick={() => router.push('/add-store')}>Add a missing store</button>
                </div>
              ) : listStores.length === 0 ? (
                <div className={ui.emptyState}>
                  {sortMode === 'today' ? <EyeIcon size={36} color="var(--text-dim)" /> : <LightningIcon size={36} color="var(--text-dim)" />}
                  <p className={ui.emptyTitle}>{sortMode === 'today' ? 'Nothing spotted nearby today' : 'No bounties right now'}</p>
                  <p className={ui.emptyBody}>{sortMode === 'today' ? 'Be the first. Open a store and tap Spotted on what you see.' : 'Every store nearby was checked in the last 2 days. Nice work, hunters.'}</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {sortMode !== 'nearest' && (
                    <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', margin: '2px 2px 2px' }}>
                      {sortMode === 'today' ? 'Spotted today' : `Bounties · +${XP_BOUNTY} XP each`} <span style={{ fontWeight: 400, color: 'var(--text-dim)' }}>({listStores.length} store{listStores.length === 1 ? '' : 's'})</span>
                    </p>
                  )}
                  {listStores.slice(0, listLimit).map((store) => {
                    const stock = storeStock[store.id] ?? []
                    const dist = getDistance(lat, lng, store.lat, store.lng).toFixed(1)
                    const latestReport = getLatestReport(stock)
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

                        {(() => {
                          const t = storeToday[store.id]
                          const today = t?.today ?? []
                          const lastAny = t?.lastAny ?? null
                          const bounty = hasBounty(lastAny)
                          return (
                            <div style={{ marginBottom: 12 }}>
                              {today.length > 0 ? (
                                <>
                                  <p style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, marginBottom: 10, color: 'var(--text-muted)' }}>
                                    <span className="live-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: '#C9F400', flexShrink: 0 }} />
                                    <span><strong style={{ color: 'var(--text)', fontWeight: 700 }}>{today.length} sighting{today.length === 1 ? '' : 's'} today</strong> · last {agoText(today[0].reported_at)}</span>
                                  </p>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: t?.notFound ? 10 : 0 }}>
                                    {today.slice(0, 3).map((r) => {
                                      const d = drinkById.get(r.drink_id)
                                      return (
                                        <span key={r.drink_id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: '100%', padding: '6px 11px', borderRadius: 999, background: 'var(--fg-06)', fontSize: 14, color: 'var(--text)' }}>
                                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#C9F400', flexShrink: 0 }} />
                                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d ? `${d.brand} ${d.flavor || d.name}` : 'Drink'}</span>
                                          <span style={{ color: 'var(--text-dim)', fontSize: 12, flexShrink: 0 }}>{shortAgo(r.reported_at)}</span>
                                        </span>
                                      )
                                    })}
                                    {today.length > 3 && <span style={{ alignSelf: 'center', fontSize: 14, color: 'var(--text-dim)' }}>+{today.length - 3} more</span>}
                                  </div>
                                </>
                              ) : (
                                <p style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, color: 'var(--text-muted)', marginBottom: bounty ? 10 : 0 }}>
                                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--fg-25)', flexShrink: 0 }} />
                                  {lastAny ? `Last sighting ${agoText(lastAny)}` : 'No sightings yet'}
                                </p>
                              )}
                              {t?.notFound && (
                                <p style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: NOT_THERE_HEX }}>
                                  <CloseIcon size={11} color={NOT_THERE_HEX} />
                                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    Not found {shortAgo(t.notFound.reported_at)} ago: {(() => { const d = drinkById.get(t.notFound.drink_id); return d ? `${d.brand} ${d.flavor || d.name}` : 'a flavor' })()}
                                  </span>
                                </p>
                              )}
                              {bounty && today.length === 0 && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 14, border: '1px dashed rgba(255,179,0,0.55)', background: 'rgba(255,179,0,0.07)', marginTop: 10 }}>
                                  <LightningIcon size={18} color="#FFB300" />
                                  <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                                    <strong style={{ color: '#FFB300' }}>+{XP_BOUNTY} XP bounty</strong> · {lastAny ? `Nobody's checked this store in ${daysSince(lastAny)} days` : 'Nobody has checked this store yet'}
                                  </p>
                                </div>
                              )}
                            </div>
                          )
                        })()}

                        {(liveUpdates[store.id] ?? []).map((update) => {
                          const qColor = update.sighting === 'spotted' ? '#C9F400' : NOT_THERE_HEX
                          return (
                            <div key={update.id} className="anim-rise" style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 10, padding: '8px 12px', marginBottom: 10, backgroundColor: 'var(--fg-04)' }}>
                              <div className="animate-pulse" style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: qColor, flexShrink: 0 }} />
                              <p style={{ fontSize: 13, color: 'var(--text-muted)', flex: 1 }}>
                                <span style={{ fontWeight: 600, color: 'var(--text)' }}>@{update.username}</span> {update.sighting === 'spotted' ? 'spotted' : 'couldn’t find'}{' '}
                                <span style={{ fontWeight: 600, color: update.sighting === 'spotted' ? SPOTTED_TEXT : NOT_THERE_HEX }}>{update.drinkName}</span>
                              </p>
                            </div>
                          )
                        })}

                        <div style={{ display: 'flex', gap: 8 }}>
                          <button className={ui.btnPrimary} style={{ flex: 1 }} onClick={() => router.push(storeHref)}>
                            View sightings
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
                              style={{ position: 'relative', overflow: 'visible', width: 44, padding: 0, flexShrink: 0, borderColor: favoriteIds.has(store.id) ? 'rgba(255,69,69,0.45)' : undefined }}
                            >
                              <Burst trigger={heartBurst?.id === store.id && favoriteIds.has(store.id) ? heartBurst.n : 0} colors={['#FF4545', '#FF8A3D', '#F472B6', '#FF4545']} />
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
