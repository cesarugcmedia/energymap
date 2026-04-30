'use client'

import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import { useLocation } from '@/hooks/useLocation'
import { useNearbyStores } from '@/hooks/useNearbyStores'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import type { Store } from '@/lib/types'

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
  const { user, profile, loading: authLoading } = useAuth()
  const isTracker = profile?.is_admin || profile?.tier === 'tracker'

  useEffect(() => {
    if (!authLoading && !user) router.replace('/account')
  }, [user, authLoading])

  const { location, loading: locLoading, error: locError, retry } = useLocation()
  const lat = location?.coords.latitude ?? 0
  const lng = location?.coords.longitude ?? 0
  const { stores: allStores, loading: storesLoading, refetch } = useNearbyStores(lat, lng)
  const stores = isTracker ? allStores : allStores.filter((s) => getDistance(lat, lng, s.lat, s.lng) <= 5)
  const [selected, setSelected] = useState<Store | null>(null)
  const [legendOpen, setLegendOpen] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [leafletMap, setLeafletMap] = useState<any>(null)
  const swipeStartY = useRef<number | null>(null)
  const lastFetchRef = useRef<number>(Date.now())

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
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastFetchRef.current > 5 * 60 * 1000) {
        lastFetchRef.current = Date.now()
        refetch()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [refetch])

  if (authLoading || !user) {
    return (
      <div className="flex items-center justify-center h-screen ">
        <div className="w-8 h-8 border-2 border-[#22c55e] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (locLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-3 ">
        <div className="w-8 h-8 border-2 border-[#22c55e] border-t-transparent rounded-full animate-spin" />
        <p className="text-white/40 text-sm">Finding your location…</p>
      </div>
    )
  }

  if (locError) {
    return (
      <div className="flex flex-col items-center justify-center h-screen  px-8 text-center gap-5">
        <span style={{ fontSize: 48 }}>📍</span>
        <div>
          <p className="text-xl font-black text-white mb-2">Location Access Needed</p>
          <p className="text-sm text-white/45 leading-relaxed">
            Amped Map uses your location to show nearby stores. Please allow location access to continue.
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
    <div className="relative " style={{ height: '100dvh' }}>
      {/* Header */}
      <div
        className="absolute top-0 left-0 right-0 z-10 px-5 pb-4 pointer-events-none"
        style={{ paddingTop: 'calc(56px + env(safe-area-inset-top))' }}
      >
        <p className="text-xl font-black text-white">⚡ Amped Map</p>
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
          onMapReady={setLeafletMap}
        />
      </div>

      {/* Zoom + locate controls */}
      {leafletMap && (
        <div
          className="absolute z-10 flex flex-col gap-2"
          style={{ bottom: 'calc(160px + env(safe-area-inset-bottom))', right: 16 }}
        >
          {[{ label: '+', fn: () => leafletMap.zoomIn() }, { label: '−', fn: () => leafletMap.zoomOut() }].map(({ label, fn }) => (
            <button
              key={label}
              onClick={fn}
              className="w-10 h-10 rounded-full flex items-center justify-center font-light"
              style={{
                backgroundColor: 'rgba(10,10,15,0.92)',
                border: '1px solid rgba(255,255,255,0.15)',
                backdropFilter: 'blur(12px)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                color: '#fff',
                fontSize: 22,
              }}
            >
              {label}
            </button>
          ))}
          <button
            onClick={() => leafletMap.flyTo({ center: [lng, lat], zoom: 15 })}
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{
              backgroundColor: 'rgba(10,10,15,0.92)',
              border: '1px solid rgba(59,130,246,0.5)',
              backdropFilter: 'blur(12px)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
              fontSize: 18,
            }}
            title="Re-center on my location"
          >
            📍
          </button>
        </div>
      )}

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
          <div className="w-9 h-1 rounded-sm mx-auto mb-4" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }} />

          {/* Store name + close */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <span style={{ fontSize: 28 }}>{TYPE_ICON[selected.type]}</span>
              <div className="min-w-0">
                <p className="text-lg font-bold text-white truncate">{selected.name}</p>
                <p className="text-xs text-white/40 mt-0.5 truncate">{selected.address}</p>
              </div>
            </div>
            <button
              onClick={() => setSelected(null)}
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ml-2"
              style={{ backgroundColor: 'rgba(255,255,255,0.07)' }}
            >
              <span className="text-white/50 text-xs">✕</span>
            </button>
          </div>

          {/* Distance + last updated */}
          <div className="flex items-center gap-3 mb-4">
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
              style={{ backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <span style={{ fontSize: 11 }}>📍</span>
              <span className="text-xs font-semibold text-white/60">
                {getDistance(lat, lng, selected.lat, selected.lng).toFixed(1)} mi away
              </span>
            </div>
            {lastUpdated && isTracker && (
              <div
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                style={{ backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <span style={{ fontSize: 11 }}>🕐</span>
                <span className="text-xs font-semibold text-white/60">
                  Updated {timeAgo(lastUpdated)}
                </span>
              </div>
            )}
          </div>

          {/* Buttons */}
          <div className="flex gap-2.5">
            <button
              className="flex-1 rounded-xl py-3 font-semibold text-sm"
              style={{
                backgroundColor: 'rgba(255,255,255,0.06)',
                border: '1.5px solid rgba(255,255,255,0.5)',
                color: 'rgba(255,255,255,0.9)',
                boxShadow: '0 0 12px rgba(255,255,255,0.15), 0 0 24px rgba(255,255,255,0.07)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
              onClick={() => openDirections(selected.lat, selected.lng)}
            >
              Directions
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
            <button
              className="flex-1 rounded-xl py-3 font-bold text-white text-sm"
              style={{
                backgroundColor: '#22c55e',
                border: '1.5px solid rgba(34,197,94,0.8)',
                boxShadow: '0 0 12px rgba(34,197,94,0.4), 0 0 24px rgba(34,197,94,0.15)',
              }}
              onClick={() => router.push(`/store/${selected.id}?name=${encodeURIComponent(selected.name)}`)}
            >
              View Stock
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
