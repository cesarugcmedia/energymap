'use client'

import { useState } from 'react'

export const BRAND_COLORS: Record<string, string> = {
  Monster:    '#00cc44',
  'Red Bull': '#e63946',
  Celsius:    '#7c3aed',
  Ghost:      '#06b6d4',
  Reign:      '#f97316',
  Rockstar:   '#facc15',
  Bang:       '#ec4899',
  NOS:        '#3b82f6',
  'Alani Nu': '#f472b6',
}

const BRAND_DOMAINS: Record<string, string> = {
  Monster:    'monsterenergy.com',
  'Red Bull': 'redbull.com',
  Celsius:    'celsius.com',
  Ghost:      'ghostlifestyle.com',
  Reign:      'reignbodyfuel.com',
  Rockstar:   'rockstarenergy.com',
  Bang:       'bangenergy.com',
  NOS:        'drinknos.com',
  'Alani Nu': 'alaninu.com',
}

export default function BrandLogo({ brand, size = 32 }: { brand: string; size?: number }) {
  const color = BRAND_COLORS[brand] ?? 'rgba(255,255,255,0.4)'
  const domain = BRAND_DOMAINS[brand]
  const [failed, setFailed] = useState(false)

  if (!domain || failed) {
    return (
      <div
        className="shrink-0 flex items-center justify-center rounded-xl"
        style={{
          width: size,
          height: size,
          backgroundColor: `${color}22`,
          border: `1.5px solid ${color}55`,
        }}
      >
        <span
          className="font-black"
          style={{ color, fontSize: size * 0.3 }}
        >
          {brand.slice(0, 2).toUpperCase()}
        </span>
      </div>
    )
  }

  return (
    <img
      src={`https://logo.clearbit.com/${domain}`}
      alt={brand}
      onError={() => setFailed(true)}
      className="shrink-0 rounded-xl object-contain"
      style={{ width: size, height: size, backgroundColor: '#fff', padding: size * 0.06 }}
    />
  )
}
