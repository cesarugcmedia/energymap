'use client'

import { useEffect, useState } from 'react'
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
  out: { label: 'OUT', color: '#ef4444' },
  low: { label: 'LOW', color: '#f59e0b' },
  medium: { label: 'MED', color: '#f97316' },
  full: { label: 'FULL', color: '#22c55e' },
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
  // No origin passed — both apps use device GPS automatically, avoiding duplicate stop
  if (isIOS) {
    window.open(`https://maps.apple.com/?daddr=${destLat},${destLng}&dirflg=d`, '_blank')
  } else {
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLng}&travelmode=driving`,
      '_blank'
    )
  }
}

const FREE_RADIUS_OPTIONS = [5, 10]
const HUNTER_RADIUS_OPTIONS = [10, 25, 50, 100, null] // null = All

const TYPE_FILTERS = [
  { value: null, label: 'All' },
  { value: 'gas_station', label: '⛽ Gas' },
  { value: 'convenience', label: '🏪 Convenience' },
  { value: 'grocery', label: '🛒 Grocery' },
  { value: 'other', label: '📍 Other' },
]

export default function StoresPage() {
  const router = useRouter()
  const { user, profile, loading: authLoading } = useAuth()
  const isHunterPlus = profile?.tier === 'hunter' || profile?.tier === 'tracker'

  useEffect(() => {
    if (!authLoading && !user) router.replace('/account')
  }, [user, authLoading])

  const { location, loading: locLoading } = useLocation()
  const lat = location?.coords.latitude ?? 35.3015
  const lng = location?.coords.longitude ?? -81.0694
  const { stores, loading: storesLoading } = useNearbyStores(lat, lng)
  const [storeStock, setStoreStock] = useState<Record<string, any[]>>({})
  const [radius, setRadius] = useState<number | null>(isHunterPlus ? 25 : 10)
  const [typeFilter, setTypeFilter] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (stores.length === 0) return
    supabase
      .from('latest_stock')
      .select('*, drink:drinks(name, brand, flavor)')
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
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') window.location.reload()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  const loading = locLoading || storesLoading

  const sorted = [...stores]
    .sort((a, b) => getDistance(lat, lng, a.lat, a.lng) - getDistance(lat, lng, b.lat, b.lng))
    .filter((s) => radius === null || getDistance(lat, lng, s.lat, s.lng) <= radius)
    .filter((s) => typeFilter === null || s.type === typeFilter)
    .filter((s) => {
      if (!search.trim()) return true
      const q = search.toLowerCase()
      return s.name.toLowerCase().includes(q) || s.address?.toLowerCase().includes(q)
    })

  const nearest = sorted[0] ?? null
  const nearestDist = nearest ? getDistance(lat, lng, nearest.lat, nearest.lng) : null
  // "You're at" if within ~0.15 miles (~240m), otherwise "Nearest store"
  const isAtStore = nearestDist !== null && nearestDist < 0.15

  return (
    <div className="bg-[#0a0a0f]">
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 pb-4"
        style={{ paddingTop: 'calc(56px + env(safe-area-inset-top))' }}
      >
        <div>
          <p className="text-2xl font-black text-white">Nearby Stores</p>
          <p className="text-xs text-white/40 mt-0.5">Sorted by distance</p>
        </div>
        <div className="flex items-center gap-2">
          <NotificationBell />
          <button
            onClick={() => router.push('/add-store')}
            className="text-xs font-bold px-3 py-1.5 rounded-full"
            style={{
              color: '#22c55e',
              backgroundColor: 'rgba(34,197,94,0.15)',
              border: '1px solid rgba(34,197,94,0.3)',
            }}
          >
          + Add Store
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 mb-3">
        <div
          className="flex items-center gap-2.5 rounded-xl px-3.5 py-3"
          style={{ backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <span className="text-white/30 text-sm">🔍</span>
          <input
            type="text"
            placeholder="Search stores..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/30"
          />
          {search.length > 0 && (
            <button onClick={() => setSearch('')} className="text-white/30 text-xs">✕</button>
          )}
        </div>
      </div>

      {/* Radius selector */}
      <div className="flex gap-2 px-4 mb-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {(isHunterPlus ? HUNTER_RADIUS_OPTIONS : FREE_RADIUS_OPTIONS).map((r) => {
          const active = radius === r
          return (
            <button
              key={r ?? 'all'}
              onClick={() => setRadius(r)}
              className="shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold"
              style={{
                backgroundColor: active ? '#22c55e' : 'rgba(255,255,255,0.06)',
                color: active ? '#000' : 'rgba(255,255,255,0.45)',
                border: active ? 'none' : '1px solid rgba(255,255,255,0.08)',
              }}
            >
              {r === null ? 'All' : `${r} mi`}
            </button>
          )
        })}
      </div>

      {/* Store type filter */}
      <div className="flex gap-2 px-4 mb-4 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {TYPE_FILTERS.map((f) => {
          const active = typeFilter === f.value
          return (
            <button
              key={f.value ?? 'all'}
              onClick={() => setTypeFilter(f.value)}
              className="shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold"
              style={{
                backgroundColor: active ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.06)',
                color: active ? '#22c55e' : 'rgba(255,255,255,0.45)',
                border: active ? '1px solid rgba(34,197,94,0.4)' : '1px solid rgba(255,255,255,0.08)',
              }}
            >
              {f.label}
            </button>
          )
        })}
      </div>

      {/* You're At / Nearest Store card */}
      {!loading && nearest && (
        <div className="px-4 mb-4">
          <p
            className="text-[10px] font-bold mb-2"
            style={{ color: 'rgba(255,255,255,0.35)', letterSpacing: '1.5px' }}
          >
            {isAtStore ? "YOU'RE AT" : 'NEAREST TO YOU'}
          </p>
          <button
            className="w-full rounded-2xl p-4 text-left"
            style={{
              backgroundColor: isAtStore ? 'rgba(34,197,94,0.08)' : '#1a1a24',
              border: `1px solid ${isAtStore ? 'rgba(34,197,94,0.4)' : 'rgba(34,197,94,0.25)'}`,
              boxShadow: isAtStore
                ? '0 0 0 1px rgba(34,197,94,0.15), 0 2px 16px rgba(34,197,94,0.15)'
                : '0 0 0 1px rgba(34,197,94,0.08), 0 2px 12px rgba(0,0,0,0.4)',
            }}
            onClick={() =>
              router.push(`/store/${nearest.id}?name=${encodeURIComponent(nearest.name)}`)
            }
          >
            <div className="flex items-center gap-3">
              <span style={{ fontSize: 28 }}>{TYPE_ICON[nearest.type]}</span>
              <div className="flex-1 min-w-0">
                <p className="text-base font-bold text-white truncate">{nearest.name}</p>
                <p className="text-xs text-white/40 mt-0.5 truncate">{nearest.address}</p>
              </div>
              <div className="text-right shrink-0">
                <p
                  className="text-xs font-bold"
                  style={{ color: isAtStore ? '#22c55e' : 'rgba(255,255,255,0.5)' }}
                >
                  {isAtStore ? '● Here' : `${nearestDist!.toFixed(1)} mi`}
                </p>
              </div>
            </div>

            {/* Quick actions */}
            <div className="flex gap-2 mt-3">
              <button
                className="flex-1 rounded-xl py-2 text-xs font-bold text-white"
                style={{ backgroundColor: '#22c55e' }}
                onClick={(e) => {
                  e.stopPropagation()
                  router.push(
                    `/submit/drinks?storeId=${nearest.id}&storeName=${encodeURIComponent(nearest.name)}`
                  )
                }}
              >
                ⚡ Report Stock
              </button>
              <button
                className="flex-1 rounded-xl py-2 text-xs font-semibold"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.06)',
                  border: '1.5px solid rgba(255,255,255,0.5)',
                  color: 'rgba(255,255,255,0.9)',
                  boxShadow: '0 0 12px rgba(255,255,255,0.15), 0 0 24px rgba(255,255,255,0.07)',
                }}
                onClick={(e) => {
                  e.stopPropagation()
                  router.push(`/store/${nearest.id}?name=${encodeURIComponent(nearest.name)}`)
                }}
              >
                View Stock
              </button>
              {!isAtStore && (
                <button
                  className="flex-1 rounded-xl py-2 text-xs font-semibold"
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.06)',
                    border: '1.5px solid rgba(255,255,255,0.5)',
                    color: 'rgba(255,255,255,0.9)',
                    boxShadow: '0 0 12px rgba(255,255,255,0.15), 0 0 24px rgba(255,255,255,0.07)',
                  }}
                  onClick={(e) => {
                    e.stopPropagation()
                    openDirections(nearest.lat, nearest.lng)
                  }}
                >
                  🧭 Directions
                </button>
              )}
            </div>
          </button>
        </div>
      )}

      {/* Loading skeleton for nearest card */}
      {loading && (
        <div className="px-4 mb-4">
          <div className="h-3 w-20 rounded mb-2" style={{ backgroundColor: 'rgba(255,255,255,0.07)' }} />
          <div className="rounded-2xl p-4 h-24 animate-pulse" style={{ backgroundColor: '#1a1a24' }} />
        </div>
      )}

      {/* All stores list */}
      <div className="px-4 mb-2">
        <p
          className="text-[10px] font-bold"
          style={{ color: 'rgba(255,255,255,0.35)', letterSpacing: '1.5px' }}
        >
          ALL STORES
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 border-2 border-[#22c55e] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : stores.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 gap-3">
          <span style={{ fontSize: 40 }}>🏪</span>
          <p className="text-lg font-bold text-white">No stores found</p>
          <p className="text-sm text-white/40">Tap + Add Store to add one!</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5 px-4 pb-6">
          {sorted.map((store) => {
            const stock = storeStock[store.id] ?? []
            const dist = getDistance(lat, lng, store.lat, store.lng).toFixed(1)
            const latestReport = stock.reduce<any>((latest, item) => {
              if (!latest) return item
              return new Date(item.reported_at) > new Date(latest.reported_at) ? item : latest
            }, null)
            const inStockCount = stock.filter((s) => s.quantity !== 'out').length
            const pct = stock.length > 0 ? (inStockCount / stock.length) * 100 : 0
            const barColor =
              stock.length === 0
                ? '#333'
                : pct === 0
                  ? '#ef4444'
                  : pct >= 75
                    ? '#22c55e'
                    : '#f59e0b'

            return (
              <button
                key={store.id}
                className="rounded-2xl p-4 text-left w-full"
                style={{
                  backgroundColor: '#1a1a24',
                  border: '1px solid rgba(34,197,94,0.25)',
                  boxShadow: '0 0 0 1px rgba(34,197,94,0.08), 0 2px 12px rgba(0,0,0,0.4)',
                }}
                onClick={() =>
                  router.push(`/store/${store.id}?name=${encodeURIComponent(store.name)}`)
                }
              >
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-3 flex-1">
                    <span style={{ fontSize: 26 }}>{TYPE_ICON[store.type]}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white truncate">{store.name}</p>
                      <p className="text-xs text-white/40 mt-0.5 truncate">{store.address}</p>
                    </div>
                  </div>
                  <p className="text-sm font-bold text-white ml-2">{dist} mi</p>
                </div>

                <div className="flex items-center gap-2.5 mb-2">
                  <div
                    className="flex-1 h-1.5 rounded-full overflow-hidden"
                    style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, backgroundColor: barColor }}
                    />
                  </div>
                  <p className="text-xs font-bold" style={{ color: barColor, minWidth: 95, textAlign: 'right' }}>
                    {stock.length === 0 ? 'No reports' : `${inStockCount}/${stock.length} available`}
                  </p>
                </div>

                {latestReport && (
                  <div className="flex items-center gap-1.5 mb-2">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: stalenessColor(latestReport.reported_at) }} />
                    <p className="text-xs font-semibold" style={{ color: stalenessColor(latestReport.reported_at) }}>
                      Updated {timeAgo(latestReport.reported_at)}
                    </p>
                  </div>
                )}

                <div className="flex gap-2 mt-2">
                  <button
                    className="flex-1 rounded-xl py-2 text-xs font-semibold"
                    style={{
                      backgroundColor: 'rgba(255,255,255,0.06)',
                      border: '1.5px solid rgba(255,255,255,0.5)',
                      color: 'rgba(255,255,255,0.9)',
                      boxShadow: '0 0 12px rgba(255,255,255,0.15), 0 0 24px rgba(255,255,255,0.07)',
                    }}
                    onClick={(e) => {
                      e.stopPropagation()
                      openDirections(store.lat, store.lng)
                    }}
                  >
                    🧭 Directions
                  </button>
                  <button
                    className="flex-1 rounded-xl py-2 text-xs font-semibold"
                    style={{
                      backgroundColor: 'rgba(255,255,255,0.06)',
                      border: '1.5px solid rgba(255,255,255,0.5)',
                      color: 'rgba(255,255,255,0.9)',
                      boxShadow: '0 0 12px rgba(255,255,255,0.15), 0 0 24px rgba(255,255,255,0.07)',
                    }}
                    onClick={(e) => {
                      e.stopPropagation()
                      router.push(`/store/${store.id}?name=${encodeURIComponent(store.name)}`)
                    }}
                  >
                    View Stock
                  </button>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
