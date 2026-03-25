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
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
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
