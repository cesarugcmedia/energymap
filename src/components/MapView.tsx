'use client'

import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import Supercluster from 'supercluster'
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

function createClusterEl(count: number): HTMLElement {
  const size = count >= 100 ? 54 : count >= 10 ? 46 : 40
  const fontSize = count >= 100 ? 13 : 14
  const el = document.createElement('div')
  el.style.cssText = 'cursor:pointer;pointer-events:auto;display:flex;align-items:center;justify-content:center;'
  el.innerHTML = `
    <div style="width:${size}px;height:${size}px;background:rgba(34,197,94,0.15);border:1.5px solid rgba(34,197,94,0.65);border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 5px rgba(34,197,94,0.07),0 0 20px rgba(34,197,94,0.4);pointer-events:none;">
      <span style="font-size:${fontSize}px;font-weight:900;color:#22c55e;font-family:system-ui,sans-serif;pointer-events:none;">${count}</span>
    </div>
  `
  return el
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
  el.style.cssText = 'display:flex;flex-direction:column;align-items:center;cursor:pointer;pointer-events:auto;'
  el.innerHTML = `
    <div style="position:relative;width:${orbSize}px;height:${orbSize}px;">
      ${pulseRings}
      <div style="width:${orbSize}px;height:${orbSize}px;background:${orbBg};border:1.5px solid ${orbBorder};border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:${orbGlow};">
        <span style="font-size:${isSelected ? 22 : 17}px;line-height:1;pointer-events:none;">${emoji}</span>
      </div>
    </div>
    ${isSelected
      ? `<div style="margin-top:5px;background:rgba(10,10,18,0.9);border:1px solid rgba(34,197,94,0.45);border-radius:7px;padding:3px 9px;white-space:nowrap;font-family:system-ui,sans-serif;font-size:10px;font-weight:700;color:#fff;letter-spacing:0.02em;box-shadow:0 0 10px rgba(34,197,94,0.25);pointer-events:none;">${name}</div>`
      : ''}
    <div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:7px solid ${tipColor};margin-top:2px;filter:drop-shadow(0 2px 4px rgba(34,197,94,0.5));pointer-events:none;"></div>
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
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map())
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null)
  const fittedRef = useRef(false)
  const scRef = useRef<Supercluster<Store> | null>(null)
  const onMapReadyRef = useRef(onMapReady)
  onMapReadyRef.current = onMapReady
  const onSelectStoreRef = useRef(onSelectStore)
  onSelectStoreRef.current = onSelectStore
  const selectedRef = useRef(selected)
  selectedRef.current = selected
  const prevSelectedRef = useRef<Store | null>(null)
  const latRef = useRef(lat)
  latRef.current = lat
  const lngRef = useRef(lng)
  lngRef.current = lng

  function updateMarkers() {
    const map = mapRef.current
    const sc = scRef.current
    if (!map || !map.isStyleLoaded()) return

    const bounds = map.getBounds()
    if (!bounds) return
    const bbox: [number, number, number, number] = [
      bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth(),
    ]
    const zoom = Math.floor(map.getZoom())

    // When selection changes, force-recreate the two affected store markers
    const prev = prevSelectedRef.current
    const curr = selectedRef.current
    if (prev?.id !== curr?.id) {
      if (prev?.id) {
        markersRef.current.get(`store_${prev.id}`)?.remove()
        markersRef.current.delete(`store_${prev.id}`)
      }
      if (curr?.id) {
        markersRef.current.get(`store_${curr.id}`)?.remove()
        markersRef.current.delete(`store_${curr.id}`)
      }
      prevSelectedRef.current = curr
    }

    const clusters = sc ? sc.getClusters(bbox, zoom) : []
    const newKeys = new Set<string>()

    clusters.forEach((feature) => {
      const props = feature.properties!
      const coords = feature.geometry.coordinates as [number, number]

      if ((props as any).cluster) {
        const cp = props as unknown as Supercluster.ClusterProperties
        const key = `cluster_${cp.cluster_id}`
        newKeys.add(key)
        if (!markersRef.current.has(key)) {
          const el = createClusterEl(cp.point_count)
          el.addEventListener('click', () => {
            const expansionZoom = Math.min(sc!.getClusterExpansionZoom(cp.cluster_id), 20)
            map.easeTo({ center: coords, zoom: expansionZoom, duration: 400 })
          })
          const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
            .setLngLat(coords)
            .addTo(map)
          markersRef.current.set(key, marker)
        }
      } else {
        const store = props as Store
        const key = `store_${store.id}`
        newKeys.add(key)
        if (!markersRef.current.has(key)) {
          const isSelected = selectedRef.current?.id === store.id
          const el = createStoreEl(store, isSelected)
          el.addEventListener('click', (e) => { e.stopPropagation(); onSelectStoreRef.current(store) })
          el.addEventListener('touchend', (e) => { e.stopPropagation(); onSelectStoreRef.current(store) })
          const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
            .setLngLat([store.lng, store.lat])
            .addTo(map)
          markersRef.current.set(key, marker)
        }
      }
    })

    // Remove markers that scrolled out of view
    markersRef.current.forEach((marker, key) => {
      if (!newKeys.has(key)) {
        marker.remove()
        markersRef.current.delete(key)
      }
    })
  }

  // Rebuild supercluster index when stores change
  useEffect(() => {
    const map = mapRef.current

    markersRef.current.forEach((m) => m.remove())
    markersRef.current.clear()
    prevSelectedRef.current = null

    if (stores.length === 0) {
      scRef.current = null
      return
    }

    const sc = new Supercluster<Store>({ radius: 60, maxZoom: 16 })
    sc.load(stores.map((store) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [store.lng, store.lat] },
      properties: store,
    })))
    scRef.current = sc

    if (map) {
      if (!fittedRef.current) {
        fittedRef.current = true
        const nearby = stores.filter((s) => haversine(latRef.current, lngRef.current, s.lat, s.lng) <= 25)
        const pts = nearby.length > 0 ? nearby : stores
        const lngs = pts.map((s) => s.lng)
        const lats = pts.map((s) => s.lat)
        map.fitBounds(
          [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
          { padding: 80, maxZoom: 14, duration: 800 }
        )
        map.once('moveend', updateMarkers)
      } else {
        updateMarkers()
      }
    }
  }, [stores]) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-render markers when selection changes
  useEffect(() => {
    updateMarkers()
  }, [selected]) // eslint-disable-line react-hooks/exhaustive-deps

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
          if (layer.type === 'line' && /^road/.test(layer.id)) {
            map.setPaintProperty(layer.id, 'line-color', [
              'match', ['get', 'class'],
              ['motorway', 'trunk'],    '#1e5c2e',
              ['primary', 'secondary'], '#163d1e',
              ['tertiary', 'street'],   '#0f2614',
              '#0a1a0d',
            ])
          }
          if (layer.id === 'building') {
            map.setPaintProperty(layer.id, 'fill-color', '#0a0f0d')
          }
        } catch {}
      })

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
            'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 14, 0, 15, ['get', 'height']],
            'fill-extrusion-base':   ['interpolate', ['linear'], ['zoom'], 14, 0, 15, ['get', 'min_height']],
            'fill-extrusion-opacity': 0.88,
          },
        })
      }

      onMapReadyRef.current?.(map)
      updateMarkers()
    })

    map.on('move', updateMarkers)
    map.on('zoomend', updateMarkers)

    // Pulsing user dot
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
      markersRef.current.clear()
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

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
