'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocation } from '@/hooks/useLocation'
import { useNearbyStores } from '@/hooks/useNearbyStores'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import NotificationBell from '@/components/NotificationBell'
import type { Quantity, Store } from '@/lib/types'

const TYPE_ICON: Record<string, string> = {
  gas_station: '⛽',
  convenience: '🏪',
  grocery: '🛒',
  other: '📍',
}

const QUANTITY_CONFIG: Record<Quantity, { label: string; color: string }> = {
  out:    { label: 'OUT',  color: '#ef4444' },
  low:    { label: 'LOW',  color: '#f59e0b' },
  medium: { label: 'MED',  color: '#f97316' },
  full:   { label: 'FULL', color: '#22c55e' },
}

function getDistance(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 3958.8
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
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

function openDirections(destLat: number, destLng: number) {
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent)
  if (isIOS) {
    window.open(`https://maps.apple.com/?daddr=${destLat},${destLng}&dirflg=d`, '_blank')
  } else {
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLng}&travelmode=driving`,
      '_blank'
    )
  }
}

function getLatestReport(stock: any[]) {
  return stock.reduce<any>((latest, item) => {
    if (!latest) return item
    return new Date(item.reported_at) > new Date(latest.reported_at) ? item : latest
  }, null)
}

const FREE_RADIUS_OPTIONS = [5, 10]
const HUNTER_RADIUS_OPTIONS = [10, 15, 20, 25, null]

const TYPE_FILTERS = [
  { value: null,          label: 'All'       },
  { value: 'gas_station', label: '⛽ Gas'     },
  { value: 'convenience', label: '🏪 Conv.'   },
  { value: 'grocery',     label: '🛒 Grocery' },
  { value: 'other',       label: '📍 Other'   },
]

const SORT_OPTIONS = [
  { value: 'distance', label: '📍 Nearest'      },
  { value: 'stocked',  label: '✅ Most Stocked'  },
  { value: 'freshest', label: '🕐 Freshest'      },
]

type SortMode = 'distance' | 'stocked' | 'freshest'

export default function StoresPage() {
  const router = useRouter()
  const { user, profile, loading: authLoading } = useAuth()
  const isHunterPlus = profile?.is_admin || profile?.tier === 'tracker'

  useEffect(() => {
    if (!authLoading && !user) router.replace('/account')
  }, [user, authLoading])

  const { location, loading: locLoading, error: locError } = useLocation()
  const lat = location?.coords.latitude ?? 0
  const lng = location?.coords.longitude ?? 0
  const { stores, loading: storesLoading } = useNearbyStores(lat, lng)
  const liveUpdateTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const [storeStock, setStoreStock] = useState<Record<string, any[]>>({})
  const [liveUpdates, setLiveUpdates] = useState<Record<string, { id: string; username: string; drinkName: string; quantity: Quantity }[]>>({})
  const [radius, setRadius] = useState<number | null>(10)
  const [radiusInitialized, setRadiusInitialized] = useState(false)
  const [typeFilter, setTypeFilter] = useState<string | null>(null)
  const [sort, setSort] = useState<SortMode>('distance')
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!authLoading && !radiusInitialized) {
      setRadius(isHunterPlus ? 25 : 10)
      setRadiusInitialized(true)
    }
  }, [authLoading, isHunterPlus, radiusInitialized])

  useEffect(() => {
    if (stores.length === 0) return
    supabase
      .from('latest_stock')
      .select('store_id, quantity, reported_at')
      .in('store_id', stores.map((s) => s.id))
      .then(({ data }) => {
        if (!data) return
        const grouped: Record<string, any[]> = {}
        data.forEach((row) => {
          if (!grouped[row.store_id]) grouped[row.store_id] = []
          grouped[row.store_id].push(row)
        })
        setStoreStock(grouped)
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

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') window.location.reload()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  const loading = locLoading || storesLoading

  if (locError) {
    return (
      <div className="flex flex-col items-center justify-center h-screen px-8 text-center gap-5" style={{ backgroundColor: '#070710' }}>
        <span style={{ fontSize: 48 }}>📍</span>
        <div>
          <p className="text-xl font-black text-white mb-2">Location Access Needed</p>
          <p className="text-sm text-white/45 leading-relaxed">
            Amped Map uses your location to show nearby stores. Please allow location access to continue.
          </p>
        </div>
        <div className="w-full rounded-2xl p-4 text-left" style={{ backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.07)' }}>
          <p className="text-xs font-bold text-white/40 mb-3" style={{ letterSpacing: '1px' }}>HOW TO ENABLE IN YOUR BROWSER</p>
          <div className="flex flex-col gap-2.5">
            <p className="text-xs text-white/50 leading-relaxed"><span className="text-white/70 font-semibold">Chrome / Edge:</span> Click the lock icon → Site settings → Location → Allow</p>
            <p className="text-xs text-white/50 leading-relaxed"><span className="text-white/70 font-semibold">Safari:</span> Settings → Safari → Location → Allow</p>
            <p className="text-xs text-white/50 leading-relaxed"><span className="text-white/70 font-semibold">Firefox:</span> Click the shield icon → Permissions → Location → Allow</p>
          </div>
        </div>
      </div>
    )
  }

  const byDistance = [...stores].sort((a, b) =>
    getDistance(lat, lng, a.lat, a.lng) - getDistance(lat, lng, b.lat, b.lng)
  )

  const sorted = [...stores]
    .sort((a, b) => {
      if (sort === 'stocked') {
        const aStock = storeStock[a.id] ?? []
        const bStock = storeStock[b.id] ?? []
        const aPct = aStock.length > 0 ? aStock.filter((s) => s.quantity !== 'out').length / aStock.length : -1
        const bPct = bStock.length > 0 ? bStock.filter((s) => s.quantity !== 'out').length / bStock.length : -1
        return bPct - aPct
      }
      if (sort === 'freshest') {
        const aLatest = getLatestReport(storeStock[a.id] ?? [])
        const bLatest = getLatestReport(storeStock[b.id] ?? [])
        if (!aLatest && !bLatest) return 0
        if (!aLatest) return 1
        if (!bLatest) return -1
        return new Date(bLatest.reported_at).getTime() - new Date(aLatest.reported_at).getTime()
      }
      return getDistance(lat, lng, a.lat, a.lng) - getDistance(lat, lng, b.lat, b.lng)
    })
    .filter((s) => radius === null || getDistance(lat, lng, s.lat, s.lng) <= radius)
    .filter((s) => typeFilter === null || s.type === typeFilter)
    .filter((s) => {
      if (!search.trim()) return true
      const q = search.toLowerCase()
      return s.name.toLowerCase().includes(q) || s.address?.toLowerCase().includes(q)
    })

  const nearest = byDistance[0] ?? null
  const nearestDist = nearest ? getDistance(lat, lng, nearest.lat, nearest.lng) : null
  const isAtStore = nearestDist !== null && nearestDist < 0.15

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#070710', color: '#fff', overflowX: 'hidden', paddingTop: 'calc(56px + env(safe-area-inset-top))' }}>
      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        .store-card { transition: border-color 0.2s ease; }
        .store-card:hover { border-color: rgba(34,197,94,0.25) !important; }
        .action-btn { transition: opacity 0.15s ease, transform 0.15s ease; cursor: pointer; }
        .action-btn:hover { opacity: 0.85; transform: translateY(-1px); }
        .action-btn:active { transform: translateY(0); }
        .pill-btn { transition: all 0.15s ease; cursor: pointer; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      <div style={{ position: 'fixed', inset: 0, zIndex: 0, background: 'radial-gradient(ellipse 60% 40% at 50% 0%, rgba(34,197,94,0.05) 0%, transparent 60%)', pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)', backgroundSize: '40px 40px', pointerEvents: 'none' }} />

      <div style={{ position: 'relative', zIndex: 1, padding: '0 16px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '12px 0 16px', animation: 'fadeUp 0.5s ease' }}>
          <div>
            <h1 className="text-2xl font-black text-white" style={{ letterSpacing: '-0.5px' }}>Nearby Stores</h1>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
              {loading ? 'Loading…' : `${sorted.length} store${sorted.length !== 1 ? 's' : ''} found`}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <NotificationBell />
            <button
              className="action-btn"
              onClick={() => router.push('/add-store')}
              style={{ display: 'flex', alignItems: 'center', gap: 5, backgroundColor: '#22c55e', border: 'none', borderRadius: 20, padding: '9px 15px', color: '#fff', fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", boxShadow: '0 4px 14px rgba(34,197,94,0.3)' }}
            >
              + Add Store
            </button>
          </div>
        </div>

        {/* Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '11px 14px', marginBottom: 12, animation: 'fadeUp 0.5s ease 0.03s both' }}>
          <span style={{ fontSize: 15, color: 'rgba(255,255,255,0.3)' }}>🔍</span>
          <input
            type="text"
            placeholder="Search stores..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, background: 'none', border: 'none', color: '#fff', fontSize: 14, fontFamily: "'DM Sans', sans-serif", outline: 'none' }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: 13 }}>✕</button>
          )}
        </div>

        {/* Radius filter */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 8, overflowX: 'auto', paddingBottom: 2 }} className="no-scrollbar">
          {(isHunterPlus ? HUNTER_RADIUS_OPTIONS : FREE_RADIUS_OPTIONS).map((r) => {
            const active = radius === r
            return (
              <button key={r ?? 'all'} className="pill-btn"
                onClick={() => setRadius(r)}
                style={{ flexShrink: 0, padding: '7px 15px', borderRadius: 20, border: '1px solid', borderColor: active ? '#22c55e' : 'rgba(255,255,255,0.1)', backgroundColor: active ? '#22c55e' : 'transparent', color: active ? '#fff' : 'rgba(255,255,255,0.45)', fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>
                {r === null ? 'All' : `${r} mi`}
              </button>
            )
          })}
        </div>

        {/* Type filter */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 8, overflowX: 'auto', paddingBottom: 2 }} className="no-scrollbar">
          {TYPE_FILTERS.map((f) => {
            const active = typeFilter === f.value
            return (
              <button key={f.value ?? 'all'} className="pill-btn"
                onClick={() => setTypeFilter(f.value)}
                style={{ flexShrink: 0, padding: '7px 14px', borderRadius: 20, border: '1px solid', borderColor: active ? '#22c55e' : 'rgba(255,255,255,0.1)', backgroundColor: active ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.04)', color: active ? '#22c55e' : 'rgba(255,255,255,0.45)', fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>
                {f.label}
              </button>
            )
          })}
        </div>

        {/* Sort */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto', paddingBottom: 2 }} className="no-scrollbar">
          {SORT_OPTIONS.map((s) => {
            const active = sort === s.value
            return (
              <button key={s.value} className="pill-btn"
                onClick={() => setSort(s.value as SortMode)}
                style={{ flexShrink: 0, padding: '7px 14px', borderRadius: 20, border: '1px solid', borderColor: active ? '#a78bfa' : 'rgba(255,255,255,0.1)', backgroundColor: active ? 'rgba(167,139,250,0.12)' : 'rgba(255,255,255,0.04)', color: active ? '#a78bfa' : 'rgba(255,255,255,0.45)', fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>
                {s.label}
              </button>
            )
          })}
        </div>

        {/* Nearest / You're At card */}
        {loading ? (
          <div style={{ marginBottom: 20 }}>
            <div style={{ height: 10, width: 80, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.07)', marginBottom: 8 }} />
            <div style={{ borderRadius: 18, height: 96, backgroundColor: '#1a1a24' }} className="animate-pulse" />
          </div>
        ) : nearest && (
          <div style={{ marginBottom: 20, animation: 'fadeUp 0.5s ease 0.08s both' }}>
            <p style={{ fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.35)', letterSpacing: 1.5, marginBottom: 8 }}>
              {isAtStore ? "YOU'RE AT" : 'NEAREST TO YOU'}
            </p>
            <div className="store-card" style={{ backgroundColor: '#1a1a24', borderRadius: 18, padding: 16, border: `1px solid ${isAtStore ? 'rgba(34,197,94,0.4)' : 'rgba(34,197,94,0.25)'}`, boxShadow: isAtStore ? '0 0 0 1px rgba(34,197,94,0.15), 0 4px 24px rgba(34,197,94,0.1)' : '0 4px 20px rgba(34,197,94,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}
                onClick={() => router.push(`/store/${nearest.id}?name=${encodeURIComponent(nearest.name)}`)}
                className="cursor-pointer"
              >
                <div style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
                  {TYPE_ICON[nearest.type]}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 16, fontWeight: 800, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nearest.name}</p>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nearest.address}</p>
                </div>
                <p style={{ fontSize: 14, fontWeight: 700, color: isAtStore ? '#22c55e' : 'rgba(255,255,255,0.5)', flexShrink: 0 }}>
                  {isAtStore ? '● Here' : `${nearestDist!.toFixed(1)} mi`}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="action-btn" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: '#22c55e', border: 'none', borderRadius: 12, padding: '11px 0', color: '#fff', fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", boxShadow: '0 4px 14px rgba(34,197,94,0.3)' }}
                  onClick={() => router.push(`/submit/drinks?storeId=${nearest.id}&storeName=${encodeURIComponent(nearest.name)}`)}>
                  ⚡ Report Stock
                </button>
                <button className="action-btn" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '11px 0', color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}
                  onClick={() => router.push(`/store/${nearest.id}?name=${encodeURIComponent(nearest.name)}`)}>
                  View Stock
                </button>
                {!isAtStore && (
                  <button className="action-btn" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '11px 0', color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}
                    onClick={() => openDirections(nearest.lat, nearest.lng)}>
                    🧭 Directions
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* All stores */}
        <p style={{ fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.35)', letterSpacing: 1.5, marginBottom: 12 }}>
          {search ? `RESULTS (${sorted.length})` : 'ALL STORES'}
        </p>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
            <div className="w-8 h-8 border-2 border-[#22c55e] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : sorted.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '56px 0' }}>
            <span style={{ fontSize: 40 }}>🏪</span>
            <p style={{ fontSize: 16, fontWeight: 700 }}>No stores found</p>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>Try a different search or filter</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 100, animation: 'fadeUp 0.5s ease 0.12s both' }}>
            {sorted.map((store) => {
              const stock = storeStock[store.id] ?? []
              const dist = getDistance(lat, lng, store.lat, store.lng).toFixed(1)
              const latestReport = getLatestReport(stock)
              const inStockCount = stock.filter((s) => s.quantity !== 'out').length
              const pct = stock.length > 0 ? (inStockCount / stock.length) * 100 : 0
              const hasReports = stock.length > 0
              const barColor = !hasReports ? '#333' : pct === 0 ? '#ef4444' : pct >= 75 ? '#22c55e' : '#f59e0b'

              return (
                <div key={store.id} className="store-card"
                  style={{ backgroundColor: '#1a1a24', borderRadius: 18, padding: 16, border: `1px solid ${barColor === '#333' ? 'rgba(255,255,255,0.07)' : `${barColor}33`}`, boxShadow: `inset 3px 0 0 ${barColor === '#333' ? 'rgba(255,255,255,0.08)' : barColor}` }}>

                  {/* Top row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, cursor: 'pointer' }}
                    onClick={() => router.push(`/store/${store.id}?name=${encodeURIComponent(store.name)}`)}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
                      {TYPE_ICON[store.type]}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 15, fontWeight: 800, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{store.name}</p>
                      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{store.address}</p>
                    </div>
                    <p style={{ fontSize: 14, fontWeight: 800, color: 'rgba(255,255,255,0.6)', flexShrink: 0 }}>{dist} mi</p>
                  </div>

                  {/* Stock bar or Be First CTA */}
                  {hasReports ? (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <div style={{ flex: 1, height: 6, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, backgroundColor: barColor, borderRadius: 3, transition: 'width 0.4s ease' }} />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: barColor, flexShrink: 0 }}>
                          {inStockCount}/{stock.length} in stock
                        </span>
                      </div>
                      {latestReport && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                          <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: stalenessColor(latestReport.reported_at), flexShrink: 0 }} />
                          <span style={{ fontSize: 12, fontWeight: 600, color: stalenessColor(latestReport.reported_at) }}>
                            Updated {timeAgo(latestReport.reported_at)}
                          </span>
                        </div>
                      )}
                    </>
                  ) : (
                    <button
                      className="action-btn"
                      style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12, padding: '10px 0', borderRadius: 12, backgroundColor: 'rgba(34,197,94,0.06)', border: '1px dashed rgba(34,197,94,0.3)', cursor: 'pointer' }}
                      onClick={() => router.push(`/submit/drinks?storeId=${store.id}&storeName=${encodeURIComponent(store.name)}`)}
                    >
                      <span style={{ fontSize: 13 }}>⚡</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(34,197,94,0.8)', fontFamily: "'DM Sans', sans-serif" }}>Be the first to report here →</span>
                    </button>
                  )}

                  {/* Live update notifications */}
                  {(liveUpdates[store.id] ?? []).map((update) => {
                    const qColor = update.quantity === 'full' ? '#22c55e' : update.quantity === 'out' ? '#ef4444' : update.quantity === 'low' ? '#f59e0b' : '#f97316'
                    const qLabel = QUANTITY_CONFIG[update.quantity]?.label ?? update.quantity.toUpperCase()
                    return (
                      <div key={update.id} style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 10, padding: '8px 12px', marginBottom: 10, backgroundColor: `${qColor}10`, border: `1px solid ${qColor}33` }}>
                        <div className="animate-pulse" style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: qColor, flexShrink: 0 }} />
                        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', flex: 1 }}>
                          <span style={{ fontWeight: 700, color: '#fff' }}>@{update.username}</span> reported{' '}
                          <span style={{ fontWeight: 600 }}>{update.drinkName}</span> as{' '}
                          <span style={{ fontWeight: 700, color: qColor }}>{qLabel}</span>
                        </p>
                      </div>
                    )
                  })}

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="action-btn" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: '#22c55e', border: 'none', borderRadius: 12, padding: '10px 0', color: '#fff', fontSize: 12, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", boxShadow: '0 4px 12px rgba(34,197,94,0.25)' }}
                      onClick={() => router.push(`/submit/drinks?storeId=${store.id}&storeName=${encodeURIComponent(store.name)}`)}>
                      ⚡ Report
                    </button>
                    <button className="action-btn" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '10px 0', color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}
                      onClick={() => router.push(`/store/${store.id}?name=${encodeURIComponent(store.name)}`)}>
                      View Stock
                    </button>
                    <button className="action-btn" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '10px 0', color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}
                      onClick={() => openDirections(store.lat, store.lng)}>
                      🧭 Go
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
