'use client'

import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import type { Store } from '@/lib/types'

const TYPE_ICON: Record<string, string> = {
  gas_station: '⛽',
  convenience: '🏪',
  grocery: '🛒',
  other: '📍',
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 3958.8
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function createStoreEl(store: Store, isSelected: boolean): HTMLElement {
  const emoji = TYPE_ICON[store.type] ?? '📍'
  const name = store.name.length > 14 ? store.name.slice(0, 14) + '…' : store.name
  const bg = isSelected ? '#0f0f17' : '#1a1a24'
  const border = isSelected ? '#22c55e' : 'rgba(34,197,94,0.5)'
  const glow = isSelected
    ? '0 0 0 3px rgba(34,197,94,0.2), 0 0 16px rgba(34,197,94,0.55), 0 2px 8px rgba(0,0,0,0.7)'
    : '0 0 0 2px rgba(34,197,94,0.12), 0 0 10px rgba(34,197,94,0.3), 0 2px 6px rgba(0,0,0,0.6)'
  const tipColor = isSelected ? '#22c55e' : 'rgba(34,197,94,0.5)'

  const el = document.createElement('div')
  el.style.cssText = 'display:flex;flex-direction:column;align-items:center;cursor:pointer;'
  el.innerHTML = `
    <div style="background:${bg};border:1.5px solid ${border};border-radius:10px;padding:5px 9px;display:flex;align-items:center;gap:5px;font-family:system-ui,sans-serif;white-space:nowrap;box-shadow:${glow};">
      <span style="font-size:13px;line-height:1;">${emoji}</span>
      <span style="font-size:11px;font-weight:700;color:#fff;letter-spacing:0.01em;">${name}</span>
    </div>
    <div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:5px solid ${tipColor};margin-top:-1px;"></div>
  `
  return el
}

interface MapViewProps {
  lat: number
  lng: number
  stores: Store[]
  selected: Store | null
  onSelectStore: (store: Store) => void
  onMapReady?: (map: mapboxgl.Map) => void
}

export default function MapView({ lat, lng, stores, selected, onSelectStore, onMapReady }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<mapboxgl.Marker[]>([])
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null)
  const fittedRef = useRef(false)
  const onMapReadyRef = useRef(onMapReady)
  onMapReadyRef.current = onMapReady
  const onSelectStoreRef = useRef(onSelectStore)
  onSelectStoreRef.current = onSelectStore

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [lng, lat],
      zoom: 14,
      attributionControl: false,
    })

    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-left')

    // Inject pulse keyframes once
    if (!document.getElementById('amped-map-styles')) {
      const styleEl = document.createElement('style')
      styleEl.id = 'amped-map-styles'
      styleEl.textContent = `
        @keyframes ampPulse {
          0%   { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(3); opacity: 0; }
        }
        @keyframes ampPulse2 {
          0%   { transform: scale(1); opacity: 0.35; }
          100% { transform: scale(4.5); opacity: 0; }
        }
      `
      document.head.appendChild(styleEl)
    }

    // Tune map colors to match app theme on style load
    map.on('style.load', () => {
      const style = map.getStyle()
      style?.layers?.forEach((layer) => {
        try {
          if (layer.type === 'background') {
            map.setPaintProperty(layer.id, 'background-color', '#070710')
          }
          if (layer.type === 'fill' && layer.id.toLowerCase().includes('water')) {
            map.setPaintProperty(layer.id, 'fill-color', '#08091a')
          }
          if (layer.type === 'line' && layer.id.toLowerCase().includes('water')) {
            map.setPaintProperty(layer.id, 'line-color', '#08091a')
          }
          if (layer.type === 'line' && /^road/.test(layer.id)) {
            map.setPaintProperty(layer.id, 'line-color', [
              'match', ['get', 'class'],
              ['motorway', 'trunk'],    '#1a2e1e',
              ['primary', 'secondary'], '#142014',
              '#0f180f',
            ])
          }
        } catch {}
      })

      onMapReadyRef.current?.(map)
    })

    // Pulsing user location dot
    const userEl = document.createElement('div')
    userEl.style.cssText = 'position:relative;width:16px;height:16px;'
    userEl.innerHTML = `
      <div style="position:absolute;inset:0;border-radius:50%;background:rgba(59,130,246,0.45);animation:ampPulse 2s ease-out infinite;"></div>
      <div style="position:absolute;inset:0;border-radius:50%;background:rgba(59,130,246,0.2);animation:ampPulse2 2s ease-out infinite 0.6s;"></div>
      <div style="position:relative;width:16px;height:16px;background:#3b82f6;border:3px solid white;border-radius:50%;box-shadow:0 0 8px rgba(59,130,246,0.7);"></div>
    `
    userMarkerRef.current = new mapboxgl.Marker({ element: userEl, anchor: 'center' })
      .setLngLat([lng, lat])
      .addTo(map)

    mapRef.current = map

    return () => {
      markersRef.current.forEach((m) => m.remove())
      markersRef.current = []
      userMarkerRef.current?.remove()
      userMarkerRef.current = null
      fittedRef.current = false
      map.remove()
      mapRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep user marker in sync with location
  useEffect(() => {
    userMarkerRef.current?.setLngLat([lng, lat])
  }, [lat, lng])

  // Rebuild store markers whenever stores or selection changes
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    markersRef.current.forEach((m) => m.remove())
    markersRef.current = []

    // Fit bounds on first store load
    if (!fittedRef.current && stores.length > 0) {
      fittedRef.current = true
      const nearby = stores.filter((s) => haversine(lat, lng, s.lat, s.lng) <= 25)
      const pts = nearby.length > 0 ? nearby : stores
      const lngs = pts.map((s) => s.lng)
      const lats = pts.map((s) => s.lat)
      map.fitBounds(
        [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
        { padding: 80, maxZoom: 14, duration: 800 }
      )
    }

    stores.forEach((store) => {
      const el = createStoreEl(store, selected?.id === store.id)
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        onSelectStoreRef.current(store)
      })
      const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([store.lng, store.lat])
        .addTo(map)
      markersRef.current.push(marker)
    })
  }, [stores, selected, lat, lng])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
