'use client'

import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { useLocation } from '@/hooks/useLocation'
import { useNearbyStores } from '@/hooks/useNearbyStores'
import { useAuth } from '@/contexts/AuthContext'
import type { Store } from '@/lib/types'

const LEGEND_ITEMS = [
  { icon: '⛽', label: 'Gas Station' },
  { icon: '🏪', label: 'Convenience' },
  { icon: '🛒', label: 'Grocery' },
  { icon: '📍', label: 'Other' },
]

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false })

const TYPE_ICON: Record<string, string> = {
  gas_station: '⛽',
  convenience: '🏪',
  grocery: '🛒',
  other: '📍',
}

export default function MapPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()

  useEffect(() => {
    if (!authLoading && !user) router.replace('/account')
  }, [user, authLoading])

  const { location, loading: locLoading, error: locError, retry } = useLocation()
  const lat = location?.coords.latitude ?? 35.3015
  const lng = location?.coords.longitude ?? -81.0694
  const { stores, loading: storesLoading, refetch } = useNearbyStores(lat, lng)
  const [selected, setSelected] = useState<Store | null>(null)
  const [legendOpen, setLegendOpen] = useState(false)

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refetch()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [refetch])

  if (authLoading || !user) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0a0a0f]">
        <div className="w-8 h-8 border-2 border-[#22c55e] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (locLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-3 bg-[#0a0a0f]">
        <div className="w-8 h-8 border-2 border-[#22c55e] border-t-transparent rounded-full animate-spin" />
        <p className="text-white/40 text-sm">Finding your location…</p>
      </div>
    )
  }

  if (locError) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#0a0a0f] px-8 text-center gap-5">
        <span style={{ fontSize: 48 }}>📍</span>
        <div>
          <p className="text-xl font-black text-white mb-2">Location Access Needed</p>
          <p className="text-sm text-white/45 leading-relaxed">
            EnergyMap uses your location to show nearby stores. Please allow location access to continue.
          </p>
        </div>

        <button
          onClick={retry}
          className="w-full rounded-2xl p-4 font-bold text-white"
          style={{ backgroundColor: '#22c55e' }}
        >
          Enable Location →
        </button>

        <div
          className="w-full rounded-2xl p-4 text-left"
          style={{ backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <p className="text-xs font-bold text-white/40 mb-3" style={{ letterSpacing: '1px' }}>
            HOW TO ENABLE IN YOUR BROWSER
          </p>
          <div className="flex flex-col gap-2.5">
            <div className="flex items-start gap-2.5">
              <span className="text-sm mt-0.5">🔒</span>
              <p className="text-xs text-white/50 leading-relaxed">
                <span className="text-white/70 font-semibold">Chrome / Edge:</span> Click the lock icon in the address bar → Site settings → Location → Allow
              </p>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="text-sm mt-0.5">🧭</span>
              <p className="text-xs text-white/50 leading-relaxed">
                <span className="text-white/70 font-semibold">Safari:</span> Settings → Safari → Location → Allow
              </p>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="text-sm mt-0.5">🦊</span>
              <p className="text-xs text-white/50 leading-relaxed">
                <span className="text-white/70 font-semibold">Firefox:</span> Click the shield icon → Permissions → Access Your Location → Allow
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative bg-[#0a0a0f]" style={{ height: '100dvh' }}>
      {/* Header */}
      <div
        className="absolute top-0 left-0 right-0 z-10 px-5 pb-4 pointer-events-none"
        style={{ paddingTop: 'calc(56px + env(safe-area-inset-top))' }}
      >
        <p className="text-xl font-black text-white">⚡ EnergyMap</p>
        <p className="text-xs text-white/45 mt-0.5">
          {storesLoading ? 'Finding stores…' : `${stores.length} stores nearby`}
        </p>
      </div>

      {/* Map */}
      <div className="absolute inset-0" style={{ zIndex: 0 }}>
        <MapView
          lat={lat}
          lng={lng}
          stores={stores}
          selected={selected}
          onSelectStore={setSelected}
        />
      </div>

      {/* Map legend */}
      <div
        className="absolute z-10"
        style={{ bottom: 'calc(90px + env(safe-area-inset-bottom))', right: 16 }}
      >
        {legendOpen && (
          <div
            className="mb-2 rounded-2xl p-3 flex flex-col gap-2"
            style={{
              backgroundColor: 'rgba(10,10,15,0.92)',
              border: '1px solid rgba(255,255,255,0.1)',
              backdropFilter: 'blur(12px)',
              minWidth: 150,
            }}
          >
            <p className="text-[10px] font-bold text-white/40" style={{ letterSpacing: '1.5px' }}>MAP KEY</p>
            {LEGEND_ITEMS.map((item) => (
              <div key={item.label} className="flex items-center gap-2.5">
                <span style={{ fontSize: 14 }}>{item.icon}</span>
                <span className="text-xs font-semibold text-white/70">{item.label}</span>
              </div>
            ))}
          </div>
        )}
        <button
          onClick={() => setLegendOpen((o) => !o)}
          className="w-10 h-10 rounded-full flex items-center justify-center ml-auto"
          style={{
            backgroundColor: legendOpen ? '#22c55e' : 'rgba(10,10,15,0.92)',
            border: '1px solid rgba(255,255,255,0.15)',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
          }}
        >
          <span style={{ fontSize: 16 }}>{legendOpen ? '✕' : '🗺️'}</span>
        </button>
      </div>

      {/* Bottom sheet when store selected */}
      {selected && (
        <div
          className="absolute bottom-0 left-0 right-0 z-20 rounded-t-3xl p-5"
          style={{
            backgroundColor: '#1a1a24',
            border: '1px solid rgba(255,255,255,0.08)',
            paddingBottom: 36,
          }}
        >
          <div
            className="w-9 h-1 rounded-sm mx-auto mb-4"
            style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
          />
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3 flex-1">
              <span style={{ fontSize: 28 }}>{TYPE_ICON[selected.type]}</span>
              <div>
                <p className="text-lg font-bold text-white">{selected.name}</p>
                <p className="text-xs text-white/40 mt-0.5">{selected.address}</p>
              </div>
            </div>
            <button
              onClick={() => setSelected(null)}
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: 'rgba(255,255,255,0.07)' }}
            >
              <span className="text-white/50 text-xs">✕</span>
            </button>
          </div>
          <div className="flex gap-2.5">
            <button
              className="flex-1 rounded-xl py-3 font-bold text-white text-sm"
              style={{ backgroundColor: '#22c55e' }}
              onClick={() =>
                router.push(
                  `/submit/drinks?storeId=${selected.id}&storeName=${encodeURIComponent(selected.name)}`
                )
              }
            >
              ⚡ Report Stock
            </button>
            <button
              className="flex-1 rounded-xl py-3 font-semibold text-sm"
              style={{
                backgroundColor: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: 'rgba(255,255,255,0.6)',
              }}
              onClick={() =>
                router.push(
                  `/store/${selected.id}?name=${encodeURIComponent(selected.name)}`
                )
              }
            >
              View Stock
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
