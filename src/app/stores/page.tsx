'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocation } from '@/hooks/useLocation'
import { useNearbyStores } from '@/hooks/useNearbyStores'
import { supabase } from '@/lib/supabase'
import type { Quantity } from '@/lib/types'

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
  return (R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(1)
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

export default function StoresPage() {
  const router = useRouter()
  const { location, loading: locLoading } = useLocation()
  const lat = location?.coords.latitude ?? 35.3015
  const lng = location?.coords.longitude ?? -81.0694
  const { stores, loading: storesLoading } = useNearbyStores(lat, lng)
  const [storeStock, setStoreStock] = useState<Record<string, any[]>>({})

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

  const loading = locLoading || storesLoading

  const sorted = [...stores].sort((a, b) => {
    return (
      parseFloat(getDistance(lat, lng, a.lat, a.lng)) -
      parseFloat(getDistance(lat, lng, b.lat, b.lng))
    )
  })

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pb-4" style={{ paddingTop: "calc(56px + env(safe-area-inset-top))" }}>
        <div>
          <p className="text-2xl font-black text-white">Nearby Stores</p>
          <p className="text-xs text-white/40 mt-0.5">Sorted by distance</p>
        </div>
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

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-[#22c55e] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : stores.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 gap-3">
          <span style={{ fontSize: 40 }}>🏪</span>
          <p className="text-lg font-bold text-white">No stores found</p>
          <p className="text-sm text-white/40">Tap + Add Store to add one!</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5 px-4 pb-6">
          {sorted.map((store) => {
            const stock = storeStock[store.id] ?? []
            const dist = getDistance(lat, lng, store.lat, store.lng)
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
                  border: '1px solid rgba(255,255,255,0.07)',
                }}
                onClick={() =>
                  router.push(`/store/${store.id}?name=${encodeURIComponent(store.name)}`)
                }
              >
                {/* Top row */}
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

                {/* Progress bar */}
                <div className="flex items-center gap-2.5 mb-2">
                  <div
                    className="flex-1 h-1.5 rounded-full overflow-hidden"
                    style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
                  >
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: barColor }}
                    />
                  </div>
                  <p className="text-xs font-bold" style={{ color: barColor, minWidth: 95, textAlign: 'right' }}>
                    {stock.length === 0 ? 'No reports' : `${inStockCount}/${stock.length} available`}
                  </p>
                </div>

                {/* Staleness */}
                {latestReport && (
                  <div className="flex items-center gap-1.5 mb-2">
                    <div
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: stalenessColor(latestReport.reported_at) }}
                    />
                    <p className="text-xs font-semibold" style={{ color: stalenessColor(latestReport.reported_at) }}>
                      Updated {timeAgo(latestReport.reported_at)}
                    </p>
                  </div>
                )}

                {/* Drink badges */}
                {stock.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {stock.slice(0, 4).map((item) => {
                      const q = QUANTITY_CONFIG[item.quantity as Quantity]
                      return (
                        <div
                          key={item.drink_id}
                          className="flex items-center gap-1 rounded-lg px-2 py-1"
                          style={{
                            backgroundColor: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.07)',
                          }}
                        >
                          <span className="text-xs text-white/60 max-w-[80px] truncate">
                            {item.drink?.flavor}
                          </span>
                          <span className="text-[10px] font-bold" style={{ color: q?.color }}>
                            {q?.label}
                          </span>
                        </div>
                      )
                    })}
                    {stock.length > 4 && (
                      <div
                        className="rounded-lg px-2 py-1 flex items-center"
                        style={{
                          backgroundColor: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(255,255,255,0.07)',
                        }}
                      >
                        <span className="text-xs text-white/30">+{stock.length - 4} more</span>
                      </div>
                    )}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
