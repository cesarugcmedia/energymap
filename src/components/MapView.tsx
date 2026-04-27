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
  const name = store.name.length > 18 ? store.name.slice(0, 18) + '…' : store.name
  const orbSize = isSelected ? 46 : 36
  const orbBg = isSelected ? 'rgba(34,197,94,0.18)' : 'rgba(14,14,22,0.92)'
  const orbBorder = isSelected ? '#22c55e' : 'rgba(34,197,94,0.55)'
  const orbGlow = isSelected
    ? '0 0 0 3px rgba(34,197,94,0.18), 0 0 22px rgba(34,197,94,0.75), 0 0 44px rgba(34,197,94,0.35)'
    : '0 0 0 1px rgba(34,197,94,0.08), 0 0 14px rgba(34,197,94,0.45)'
  const tipColor = isSelected ? '#22c55e' : 'rgba(34,197,94,0.55)'

  const pulseRings = isSelected
    ? `<div style="position:absolute;inset:-4px;border-radius:50%;border:1.5px solid rgba(34,197,94,0.55);animation:markerPulse 1.6s ease-out infinite;pointer-events:none;"></div>
       <div style="position:absolute;inset:-4px;border-radius:50%;border:1.5px solid rgba(34,197,94,0.3);animation:markerPulse 1.6s ease-out infinite 0.8s;pointer-events:none;"></div>`
    : ''

  const el = document.createElement('div')
  el.style.cssText = 'display:flex;flex-direction:column;align-items:center;cursor:pointer;'
  el.innerHTML = `
    <div style="position:relative;width:${orbSize}px;height:${orbSize}px;">
      ${pulseRings}
      <div style="width:${orbSize}px;height:${orbSize}px;background:${orbBg};border:1.5px solid ${orbBorder};border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:${orbGlow};">
        <span style="font-size:${isSelected ? 22 : 17}px;line-height:1;">${emoji}</span>
      </div>
    </div>
    ${isSelected
      ? `<div style="margin-top:5px;background:rgba(10,10,18,0.9);border:1px solid rgba(34,197,94,0.45);border-radius:7px;padding:3px 9px;white-space:nowrap;font-family:system-ui,sans-serif;font-size:10px;font-weight:700;color:#fff;letter-spacing:0.02em;box-shadow:0 0 10px rgba(34,197,94,0.25);">${name}</div>`
      : ''}
    <div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:7px solid ${tipColor};margin-top:2px;filter:drop-shadow(0 2px 4px rgba(34,197,94,0.5));"></div>
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
      pitch: 45,
      bearing: -10,
      attributionControl: false,
      maxTileCacheSize: 50,
    })

    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-left')

    // Inject keyframes once
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
        @keyframes markerPulse {
          0%   { transform: scale(1); opacity: 0.8; }
          100% { transform: scale(2.2); opacity: 0; }
        }
      `
      document.head.appendChild(styleEl)
    }

    map.on('style.load', () => {
      // Atmospheric fog
      map.setFog({
        color: '#070710',
        'high-color': '#0d0d1e',
        'horizon-blend': 0.06,
        'space-color': '#00000f',
        'star-intensity': 0.4,
      })

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
          // Neon road tints — brighter greens for major roads
          if (layer.type === 'line' && /^road/.test(layer.id)) {
            map.setPaintProperty(layer.id, 'line-color', [
              'match', ['get', 'class'],
              ['motorway', 'trunk'],    '#1e5c2e',
              ['primary', 'secondary'], '#163d1e',
              ['tertiary', 'street'],   '#0f2614',
              '#0a1a0d',
            ])
          }
          // Hide default building fill so 3D layer shows cleanly
          if (layer.id === 'building') {
            map.setPaintProperty(layer.id, 'fill-color', '#0a0f0d')
          }
        } catch {}
      })

      // 3D buildings with dark green tint
      if (!map.getLayer('amped-3d-buildings')) {
        map.addLayer({
          id: 'amped-3d-buildings',
          source: 'composite',
          'source-layer': 'building',
          filter: ['==', 'extrude', 'true'],
          type: 'fill-extrusion',
          minzoom: 14,
          paint: {
            'fill-extrusion-color': [
              'interpolate', ['linear'], ['get', 'height'],
              0,   '#0a1010',
              50,  '#0d1a14',
              200, '#0f1e16',
            ],
            'fill-extrusion-height': [
              'interpolate', ['linear'], ['zoom'],
              14, 0,
              15, ['get', 'height'],
            ],
            'fill-extrusion-base': [
              'interpolate', ['linear'], ['zoom'],
              14, 0,
              15, ['get', 'min_height'],
            ],
            'fill-extrusion-opacity': 0.88,
          },
        })
      }

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
