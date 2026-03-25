'use client'

import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Store } from '@/lib/types'

const TYPE_ICON: Record<string, string> = {
  gas_station: '⛽',
  convenience: '🏪',
  grocery: '🛒',
  other: '📍',
}

const userIcon = L.divIcon({
  className: '',
  html: `<div style="
    width:16px;height:16px;
    background:#3b82f6;
    border:3px solid white;
    border-radius:50%;
    box-shadow:0 0 0 3px rgba(59,130,246,0.3);
  "></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
})

function createStoreIcon(store: Store, isSelected: boolean) {
  const emoji = TYPE_ICON[store.type] ?? '📍'
  const name = store.name.length > 14 ? store.name.slice(0, 14) + '…' : store.name
  const bg = isSelected ? '#0f0f17' : '#1a1a24'
  const border = isSelected ? '#22c55e' : 'rgba(34,197,94,0.5)'
  const glow = isSelected
    ? '0 0 0 3px rgba(34,197,94,0.2), 0 0 16px rgba(34,197,94,0.55), 0 2px 8px rgba(0,0,0,0.7)'
    : '0 0 0 2px rgba(34,197,94,0.12), 0 0 10px rgba(34,197,94,0.3), 0 2px 6px rgba(0,0,0,0.6)'
  const tipColor = isSelected ? '#22c55e' : 'rgba(34,197,94,0.5)'

  return L.divIcon({
    className: '',
    html: `
      <div style="
        position:relative;
        display:inline-flex;
        flex-direction:column;
        align-items:center;
        transform:translate(-50%, -100%);
      ">
        <div style="
          background:${bg};
          border:1.5px solid ${border};
          border-radius:10px;
          padding:5px 9px;
          display:flex;align-items:center;gap:5px;
          font-family:system-ui,sans-serif;
          white-space:nowrap;
          box-shadow:${glow};
          cursor:pointer;
        ">
          <span style="font-size:13px;line-height:1;">${emoji}</span>
          <span style="font-size:11px;font-weight:700;color:#fff;letter-spacing:0.01em;">${name}</span>
        </div>
        <div style="
          width:0;height:0;
          border-left:5px solid transparent;
          border-right:5px solid transparent;
          border-top:5px solid ${tipColor};
          margin-top:-1px;
        "></div>
      </div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  })
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

function FitStores({ lat, lng, stores }: { lat: number; lng: number; stores: Store[] }) {
  const map = useMap()
  const fitted = useRef(false)

  useEffect(() => {
    if (fitted.current || stores.length === 0) return
    fitted.current = true

    const nearby = stores.filter((s) => haversine(lat, lng, s.lat, s.lng) <= 25)
    const points: [number, number][] = [[lat, lng], ...(nearby.length > 0 ? nearby : stores).map((s) => [s.lat, s.lng] as [number, number])]
    const bounds = L.latLngBounds(points)
    map.fitBounds(bounds, { padding: [60, 60], maxZoom: 14 })
  }, [stores, lat, lng, map])

  return null
}

function ZoomControls() {
  const map = useMap()
  const btnStyle = {
    backgroundColor: 'rgba(10,10,15,0.92)',
    border: '1px solid rgba(255,255,255,0.15)',
    backdropFilter: 'blur(12px)',
    boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
    color: '#fff',
    fontSize: 22,
    fontWeight: 300,
    lineHeight: 1,
  }
  return (
    <div
      className="absolute z-[1000] flex flex-col gap-2"
      style={{ bottom: 'calc(150px + env(safe-area-inset-bottom))', right: 16 }}
    >
      <button onClick={() => map.zoomIn()} className="w-10 h-10 rounded-full flex items-center justify-center" style={btnStyle}>+</button>
      <button onClick={() => map.zoomOut()} className="w-10 h-10 rounded-full flex items-center justify-center" style={btnStyle}>−</button>
    </div>
  )
}

interface MapViewProps {
  lat: number
  lng: number
  stores: Store[]
  selected: Store | null
  onSelectStore: (store: Store | null) => void
}

export default function MapView({ lat, lng, stores, selected, onSelectStore }: MapViewProps) {
  return (
    <MapContainer
      center={[lat, lng]}
      zoom={14}
      style={{ width: '100%', height: '100%' }}
      zoomControl={false}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
      />
      <FitStores lat={lat} lng={lng} stores={stores} />
      <ZoomControls />
      <Marker position={[lat, lng]} icon={userIcon} />
      {stores.map((store) => (
        <Marker
          key={store.id}
          position={[store.lat, store.lng]}
          icon={createStoreIcon(store, selected?.id === store.id)}
          eventHandlers={{ click: () => onSelectStore(store) }}
        />
      ))}
    </MapContainer>
  )
}
