'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocation } from '@/hooks/useLocation'
import { useNearbyStores } from '@/hooks/useNearbyStores'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import NotificationBell from '@/components/NotificationBell'
import { BRAND_COLORS } from '@/components/BrandLogo'
import type { Quantity, Store } from '@/lib/types'

const TYPE_ICON: Record<string, string> = {
  gas_station: '⛽',
  convenience: '🏪',
  grocery: '🛒',
  other: '📍',
}

const QUANTITY_CONFIG: Record<Quantity, { label: string; color: string }> = {
  out:    { label: 'OUT',  color: '#FF4545' },
  low:    { label: 'LOW',  color: '#FFB300' },
  medium: { label: 'MED',  color: '#FFB300' },
  full:   { label: 'FULL', color: 'var(--accent)' },
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
  if (hrs < 2) return '#C9F400'
  if (hrs < 12) return '#FFB300'
  return '#FF4545'
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

const FREE_RADIUS_OPTIONS = [5]
const HUNTER_RADIUS_OPTIONS = [5, 10, 15, 20, 25, null]

const TYPE_FILTERS = [
  { value: null,          label: 'All'       },
  { value: 'gas_station', label: '⛽ Gas'     },
  { value: 'convenience', label: '🏪 Conv.'   },
  { value: 'grocery',     label: '🛒 Grocery' },
  { value: 'other',       label: '📍 Other'   },
]


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
  const { stores, loading: storesLoading, refetch: refetchStores } = useNearbyStores(lat, lng)
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

  useEffect(() => {
    if (!authLoading && !radiusInitialized) {
      setRadius(isHunterPlus ? 25 : 5)
      setRadiusInitialized(true)
    }
  }, [authLoading, isHunterPlus, radiusInitialized])

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

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refetchStores()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [refetchStores])

  const loading = locLoading || storesLoading

  if (locError) {
    return (
      <div className="flex flex-col items-center justify-center h-screen px-8 text-center gap-5" style={{ backgroundColor: 'var(--bg)' }}>
        <span style={{ fontSize: 48 }}>📍</span>
        <div>
          <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', marginBottom: 8, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.02em', textTransform: 'uppercase' }}>Location Access Needed</p>
          <p style={{ fontSize: 14, color: '#7A8F80', lineHeight: 1.6 }}>
            Amped Map uses your location to show nearby stores. Please allow location access to continue.
          </p>
        </div>
        <div className="w-full rounded-2xl p-4 text-left" style={{ backgroundColor: 'var(--surface)', border: '1px solid rgba(201,244,0,0.12)' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#4A5F50', marginBottom: 12, letterSpacing: '1.4px', fontFamily: "'Barlow Condensed', sans-serif", textTransform: 'uppercase' }}>How to enable in your browser</p>
          <div className="flex flex-col gap-2.5">
            <p style={{ fontSize: 12, color: '#7A8F80', lineHeight: 1.6 }}><span style={{ color: 'var(--text)', fontWeight: 600 }}>Chrome / Edge:</span> Click the lock icon → Site settings → Location → Allow</p>
            <p style={{ fontSize: 12, color: '#7A8F80', lineHeight: 1.6 }}><span style={{ color: 'var(--text)', fontWeight: 600 }}>Safari:</span> Settings → Safari → Location → Allow</p>
            <p style={{ fontSize: 12, color: '#7A8F80', lineHeight: 1.6 }}><span style={{ color: 'var(--text)', fontWeight: 600 }}>Firefox:</span> Click the shield icon → Permissions → Location → Allow</p>
          </div>
        </div>
      </div>
    )
  }

  const byDistance = useMemo(() =>
    [...stores].sort((a, b) => getDistance(lat, lng, a.lat, a.lng) - getDistance(lat, lng, b.lat, b.lng)),
    [stores, lat, lng]
  )

  const sorted = useMemo(() => {
    const q = search.trim().toLowerCase()
    return byDistance
      .filter((s) => radius === null || getDistance(lat, lng, s.lat, s.lng) <= radius)
      .filter((s) => typeFilter === null || s.type === typeFilter)
      .filter((s) => brandFilter === null || (storeBrands[s.id] ?? []).includes(brandFilter))
      .filter((s) => !q || s.name.toLowerCase().includes(q) || s.address?.toLowerCase().includes(q))
  }, [byDistance, radius, typeFilter, brandFilter, storeBrands, search, lat, lng])

  const nearest = byDistance[0] ?? null
  const nearestDist = nearest ? getDistance(lat, lng, nearest.lat, nearest.lng) : null
  const isAtStore = nearestDist !== null && nearestDist < 0.15

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg)', color: 'var(--text)', overflowX: 'hidden', position: 'relative', paddingTop: 'calc(56px + env(safe-area-inset-top))' }}>
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

      <div style={{ position: 'relative', zIndex: 1, padding: '0 16px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '12px 0 16px', animation: 'fadeUp 0.5s ease' }}>
          <div>
            <h1 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 32, fontWeight: 800, letterSpacing: '0.02em', textTransform: 'uppercase', color: 'var(--text)', lineHeight: 1 }}>
              Nearby <span style={{ color: 'var(--accent)' }}>Stores</span>
            </h1>
            <p style={{ fontSize: 13, color: '#7A8F80', marginTop: 4, fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase', fontFamily: "'Barlow Condensed', sans-serif" }}>
              {loading ? 'Loading…' : <><strong style={{ color: 'var(--accent)', fontWeight: 700 }}>{sorted.length}</strong> stores found</>}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <NotificationBell />
            <button
              className="action-btn"
              onClick={() => router.push('/add-store')}
              style={{ display: 'flex', alignItems: 'center', gap: 6, backgroundColor: '#C9F400', border: 'none', borderRadius: 12, padding: '10px 16px', color: '#0D1210', fontSize: 14, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.08em', textTransform: 'uppercase', boxShadow: '0 0 20px rgba(201,244,0,0.35), 0 4px 12px rgba(0,0,0,0.4)' }}
            >
              + ADD STORE
            </button>
          </div>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 14, animation: 'fadeUp 0.5s ease 0.03s both' }}>
          <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#7A8F80', fontSize: 15 }}>🔍</span>
          <input
            type="text"
            placeholder="Search stores..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%', backgroundColor: 'var(--surface)', border: '1px solid rgba(201,244,0,0.12)', borderRadius: 14, padding: '13px 14px 13px 42px', color: 'var(--text)', fontFamily: "'Barlow', sans-serif", fontSize: 15, outline: 'none' }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#4A5F50', cursor: 'pointer', fontSize: 13 }}>✕</button>
          )}
        </div>

        {/* Radius filter */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 8, overflowX: 'auto', paddingBottom: 2 }} className="no-scrollbar">
          {(isHunterPlus ? HUNTER_RADIUS_OPTIONS : FREE_RADIUS_OPTIONS).map((r) => {
            const active = radius === r
            return (
              <button key={r ?? 'all'} className="pill-btn"
                onClick={() => setRadius(r)}
                style={{ flexShrink: 0, padding: '7px 16px', borderRadius: 99, border: '1px solid', borderColor: active ? '#C9F400' : 'rgba(201,244,0,0.12)', backgroundColor: active ? '#C9F400' : 'var(--surface)', color: active ? '#0D1210' : '#7A8F80', fontSize: 14, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.05em', boxShadow: active ? '0 0 14px rgba(201,244,0,0.4)' : 'none' }}>
                {r === null ? 'ALL' : `${r} MI`}
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
                style={{ flexShrink: 0, padding: '7px 14px', borderRadius: 99, border: '1px solid', borderColor: active ? '#C9F400' : 'rgba(201,244,0,0.12)', backgroundColor: active ? '#C9F400' : 'var(--surface)', color: active ? '#0D1210' : '#7A8F80', fontSize: 14, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.04em', boxShadow: active ? '0 0 14px rgba(201,244,0,0.4)' : 'none' }}>
                {f.label}
              </button>
            )
          })}
        </div>

        {/* Brand filter */}
        {availableBrands.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto', paddingBottom: 2 }} className="no-scrollbar">
            <button className="pill-btn"
              onClick={() => setBrandFilter(null)}
              style={{ flexShrink: 0, padding: '7px 14px', borderRadius: 99, border: '1px solid', borderColor: brandFilter === null ? '#C9F400' : 'rgba(201,244,0,0.12)', backgroundColor: brandFilter === null ? '#C9F400' : 'var(--surface)', color: brandFilter === null ? '#0D1210' : '#7A8F80', fontSize: 14, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.04em', boxShadow: brandFilter === null ? '0 0 14px rgba(201,244,0,0.4)' : 'none' }}>
              ALL BRANDS
            </button>
            {availableBrands.map((brand) => {
              const color = BRAND_COLORS[brand] ?? '#7A8F80'
              const active = brandFilter === brand
              return (
                <button key={brand} className="pill-btn"
                  onClick={() => setBrandFilter(active ? null : brand)}
                  style={{ flexShrink: 0, padding: '7px 14px', borderRadius: 99, border: '1px solid', borderColor: active ? '#C9F400' : 'rgba(201,244,0,0.12)', backgroundColor: active ? '#C9F400' : 'var(--surface)', color: active ? '#0D1210' : '#7A8F80', fontSize: 14, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.04em', boxShadow: active ? '0 0 14px rgba(201,244,0,0.4)' : 'none' }}>
                  {brand}
                </button>
              )
            })}
          </div>
        )}

        {/* Nearest / You're At card */}
        {loading ? (
          <div style={{ marginBottom: 20 }}>
            <div style={{ height: 10, width: 80, borderRadius: 6, backgroundColor: 'rgba(201,244,0,0.07)', marginBottom: 8 }} />
            <div style={{ borderRadius: 16, height: 96, backgroundColor: 'var(--surface)' }} className="animate-pulse" />
          </div>
        ) : nearest && (
          <div style={{ marginBottom: 20, animation: 'fadeUp 0.5s ease 0.08s both' }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#4A5F50', letterSpacing: '0.14em', marginBottom: 10, fontFamily: "'Barlow Condensed', sans-serif", textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 8 }}>
              ⚡ {isAtStore ? "You're At" : 'Nearest to You'}
              <span style={{ flex: 1, height: 1, background: 'rgba(201,244,0,0.12)', display: 'block' }} />
            </p>
            <div className="store-card" style={{ backgroundColor: 'var(--surface)', borderRadius: 16, padding: 14, border: `1px solid ${isAtStore ? 'rgba(201,244,0,0.4)' : 'rgba(201,244,0,0.25)'}`, boxShadow: '0 0 24px rgba(201,244,0,0.08)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}
                onClick={() => router.push(`/store/${nearest.id}?name=${encodeURIComponent(nearest.name)}`)}
                className="cursor-pointer"
              >
                <div style={{ width: 46, height: 46, borderRadius: 12, backgroundColor: 'var(--fg-06)', border: '1px solid var(--fg-08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
                  {TYPE_ICON[nearest.type]}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.02em', textTransform: 'uppercase' }}>{nearest.name}</p>
                  <p style={{ fontSize: 12, color: 'var(--fg-40)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nearest.address}</p>
                </div>
                <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--accent)', flexShrink: 0, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.04em' }}>
                  {isAtStore ? '● HERE' : `${nearestDist!.toFixed(1)} mi`}
                </p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button className="action-btn" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: '#C9F400', border: 'none', borderRadius: 10, padding: '11px 0', color: '#0D1210', fontSize: 14, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.06em', textTransform: 'uppercase', boxShadow: '0 0 14px rgba(201,244,0,0.3)' }}
                  onClick={() => router.push(`/submit/drinks?storeId=${nearest.id}&storeName=${encodeURIComponent(nearest.name)}`)}>
                  ⚡ REPORT
                </button>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="action-btn" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--fg-06)', border: '1.5px solid var(--fg-50)', borderRadius: 10, padding: '10px 0', color: 'var(--fg-90)', fontSize: 14, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.06em', textTransform: 'uppercase' }}
                    onClick={() => router.push(`/store/${nearest.id}?name=${encodeURIComponent(nearest.name)}`)}>
                    View
                  </button>
                  {!isAtStore && (
                    <button className="action-btn" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: 'var(--fg-06)', border: '1.5px solid var(--fg-50)', borderRadius: 10, padding: '10px 0', color: 'var(--fg-90)', fontSize: 14, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.06em', textTransform: 'uppercase' }}
                      onClick={() => openDirections(nearest.lat, nearest.lng)}>
                      Directions
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* All stores */}
        <p style={{ fontSize: 11, fontWeight: 700, color: '#4A5F50', letterSpacing: '0.14em', marginBottom: 10, fontFamily: "'Barlow Condensed', sans-serif", textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 8 }}>
          {search ? `Results (${sorted.length})` : 'All Stores'}
          <span style={{ flex: 1, height: 1, background: 'rgba(201,244,0,0.12)', display: 'block' }} />
        </p>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
            <div style={{ width: 32, height: 32, border: '2px solid #C9F400', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : sorted.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '56px 0' }}>
            <span style={{ fontSize: 40 }}>🏪</span>
            <p style={{ fontSize: 18, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", textTransform: 'uppercase', letterSpacing: '0.02em' }}>No stores found</p>
            <p style={{ fontSize: 13, color: '#7A8F80', textAlign: 'center', paddingInline: 24 }}>
              {brandFilter ? `No stores with ${brandFilter} in stock nearby` : typeFilter ? `No ${typeFilter.replace('_', ' ')} stores in this area` : search ? `No stores matching "${search}"` : 'No stores in range — try a wider radius'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 100, animation: 'fadeUp 0.5s ease 0.12s both' }}>
            {sorted.map((store) => {
              const stock = storeStock[store.id] ?? []
              const dist = getDistance(lat, lng, store.lat, store.lng).toFixed(1)
              const latestReport = getLatestReport(stock)
              const inStockCount = stock.filter((s) => s.quantity !== 'out').length
              const pct = stock.length > 0 ? (inStockCount / stock.length) * 100 : 0
              const hasReports = stock.length > 0
              const barColor = !hasReports ? 'rgba(201,244,0,0.12)' : pct === 0 ? '#FF4545' : pct >= 75 ? '#C9F400' : '#FFB300'

              return (
                <div key={store.id} className="store-card"
                  style={{ backgroundColor: 'var(--surface)', borderRadius: 16, padding: 14, border: `1px solid rgba(201,244,0,0.12)` }}>

                  {/* Top row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, cursor: 'pointer' }}
                    onClick={() => router.push(`/store/${store.id}?name=${encodeURIComponent(store.name)}`)}>
                    <div style={{ width: 46, height: 46, borderRadius: 12, backgroundColor: 'var(--fg-06)', border: '1px solid var(--fg-08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
                      {TYPE_ICON[store.type]}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.02em', textTransform: 'uppercase' }}>{store.name}</p>
                      <p style={{ fontSize: 12, color: 'var(--fg-40)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{store.address}</p>
                    </div>
                    <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--accent)', flexShrink: 0, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.04em' }}>{dist} mi</p>
                  </div>

                  {/* Stock bar or Be First CTA */}
                  {hasReports ? (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <div style={{ flex: 1, height: 6, backgroundColor: 'rgba(201,244,0,0.08)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, backgroundColor: barColor, borderRadius: 3, transition: 'width 0.4s ease' }} />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: barColor, flexShrink: 0, fontFamily: "'Barlow Condensed', sans-serif" }}>
                          {inStockCount}/{stock.length} IN STOCK
                        </span>
                      </div>
                      {latestReport && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                          <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: stalenessColor(latestReport.reported_at), flexShrink: 0 }} />
                          <span style={{ fontSize: 12, fontWeight: 600, color: stalenessColor(latestReport.reported_at), fontFamily: "'Barlow Condensed', sans-serif" }}>
                            {timeAgo(latestReport.reported_at)}
                          </span>
                        </div>
                      )}
                    </>
                  ) : (
                    <button
                      className="action-btn"
                      style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12, padding: '10px 14px', borderRadius: 10, backgroundColor: 'rgba(201,244,0,0.03)', border: '1.5px dashed rgba(201,244,0,0.35)', cursor: 'pointer' }}
                      onClick={() => router.push(`/submit/drinks?storeId=${store.id}&storeName=${encodeURIComponent(store.name)}`)}
                    >
                      <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 14, fontWeight: 700, letterSpacing: '0.04em', color: 'var(--accent)' }}>⚡ Be the first to report here →</span>
                    </button>
                  )}

                  {/* Live update notifications */}
                  {(liveUpdates[store.id] ?? []).map((update) => {
                    const qColor = update.quantity === 'full' ? '#C9F400' : update.quantity === 'out' ? '#FF4545' : update.quantity === 'low' ? '#FFB300' : '#FFB300'
                    const qLabel = QUANTITY_CONFIG[update.quantity]?.label ?? update.quantity.toUpperCase()
                    return (
                      <div key={update.id} style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 10, padding: '8px 12px', marginBottom: 10, backgroundColor: `${qColor}10`, border: `1px solid ${qColor}33` }}>
                        <div className="animate-pulse" style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: qColor, flexShrink: 0 }} />
                        <p style={{ fontSize: 12, color: '#7A8F80', flex: 1 }}>
                          <span style={{ fontWeight: 700, color: 'var(--text)' }}>@{update.username}</span> reported{' '}
                          <span style={{ fontWeight: 600 }}>{update.drinkName}</span> as{' '}
                          <span style={{ fontWeight: 700, color: qColor }}>{qLabel}</span>
                        </p>
                      </div>
                    )
                  })}

                  {/* Actions */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <button className="action-btn" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: '#C9F400', border: 'none', borderRadius: 10, padding: '10px 0', color: '#0D1210', fontSize: 14, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.06em', textTransform: 'uppercase', boxShadow: '0 0 14px rgba(201,244,0,0.3)' }}
                      onClick={() => router.push(`/submit/drinks?storeId=${store.id}&storeName=${encodeURIComponent(store.name)}`)}>
                      ⚡ REPORT
                    </button>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="action-btn" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--fg-06)', border: '1.5px solid var(--fg-50)', borderRadius: 10, padding: '10px 0', color: 'var(--fg-90)', fontSize: 14, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.06em', textTransform: 'uppercase' }}
                        onClick={() => router.push(`/store/${store.id}?name=${encodeURIComponent(store.name)}`)}>
                        View
                      </button>
                      <button className="action-btn" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--fg-06)', border: '1.5px solid var(--fg-50)', borderRadius: 10, padding: '10px 0', color: 'var(--fg-90)', fontSize: 14, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.06em', textTransform: 'uppercase' }}
                        onClick={() => openDirections(store.lat, store.lng)}>
                        Directions
                      </button>
                    </div>
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
