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
  return L.divIcon({
    className: '',
    html: `<div style="
      background:${isSelected ? '#0a0a0f' : '#1a1a24'};
      border:1.5px solid ${isSelected ? '#22c55e' : 'rgba(255,255,255,0.15)'};
      border-radius:12px;
      padding:6px 10px;
      display:flex;align-items:center;gap:5px;
      font-family:system-ui,sans-serif;
      white-space:nowrap;
      box-shadow:0 2px 8px rgba(0,0,0,0.5);
      cursor:pointer;
    ">
      <span style="font-size:14px;">${emoji}</span>
      <span style="font-size:11px;font-weight:700;color:#fff;">${name}</span>
    </div>`,
    iconAnchor: [0, 10],
  })
}

function RecenterMap({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap()
  const centered = useRef(false)

  useEffect(() => {
    if (!centered.current) {
      map.setView([lat, lng], 14)
      centered.current = true
    }
  }, [lat, lng, map])

  return null
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
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />
      <RecenterMap lat={lat} lng={lng} />
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
