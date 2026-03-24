'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Drink } from '@/lib/types'

const BRAND_COLORS: Record<string, string> = {
  Monster: '#00cc44',
  'Red Bull': '#e63946',
  Celsius: '#7c3aed',
  Ghost: '#06b6d4',
  Reign: '#f97316',
  Rockstar: '#facc15',
  Bang: '#ec4899',
  NOS: '#3b82f6',
}

function DrinksContent() {
  const router = useRouter()
  const params = useSearchParams()
  const storeId = params.get('storeId') ?? ''
  const storeName = params.get('storeName') ?? ''

  const [drinks, setDrinks] = useState<Drink[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('drinks')
      .select('*')
      .order('brand', { ascending: true })
      .then(({ data }) => {
        if (data) setDrinks(data)
        setLoading(false)
      })
  }, [])

  const filtered = drinks.filter(
    (d) =>
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.brand.toLowerCase().includes(search.toLowerCase())
  )

  const grouped = filtered.reduce<Record<string, Drink[]>>((acc, drink) => {
    if (!acc[drink.brand]) acc[drink.brand] = []
    acc[drink.brand].push(drink)
    return acc
  }, {})

  const sections = Object.entries(grouped)

  return (
    <div className="min-h-screen bg-[#0a0a0f] relative">
      {/* Header */}
      <div className="flex items-center gap-3.5 px-5 pt-14 pb-4">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: 'rgba(255,255,255,0.07)' }}
        >
          <span className="text-white text-lg">←</span>
        </button>
        <div>
          <p className="text-xl font-black text-white">Select a Drink</p>
          <p className="text-xs text-white/40 mt-0.5">{storeName}</p>
        </div>
      </div>

      {/* Search */}
      <div
        className="flex items-center mx-5 mb-2 px-3.5 py-2.5 rounded-xl"
        style={{ backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.07)' }}
      >
        <span className="text-sm mr-2">🔍</span>
        <input
          type="text"
          className="flex-1 bg-transparent text-white text-sm outline-none placeholder:text-white/25"
          placeholder="Search drinks..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button onClick={() => setSearch('')}>
            <span className="text-white/30 text-xs">✕</span>
          </button>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center mt-10">
          <div className="w-8 h-8 border-2 border-[#22c55e] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="pb-36">
          {sections.map(([brand, brandDrinks]) => (
            <div key={brand} className="px-5 mt-5">
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: BRAND_COLORS[brand] ?? '#888' }}
                />
                <p
                  className="text-xs font-bold"
                  style={{ color: 'rgba(255,255,255,0.4)', letterSpacing: 1 }}
                >
                  {brand.toUpperCase()}
                </p>
              </div>
              {brandDrinks.map((drink) => (
                <button
                  key={drink.id}
                  className="flex items-center w-full rounded-xl mb-1.5 overflow-hidden text-left"
                  style={{
                    backgroundColor: '#1a1a24',
                    border: `1.5px solid ${selected === drink.id ? '#22c55e' : 'transparent'}`,
                  }}
                  onClick={() => setSelected(drink.id === selected ? null : drink.id)}
                >
                  <div
                    className="self-stretch w-1"
                    style={{ backgroundColor: BRAND_COLORS[brand] ?? '#888' }}
                  />
                  <div className="flex-1 p-3.5">
                    <p className="text-sm font-semibold text-white">{drink.name}</p>
                    {drink.flavor && (
                      <p className="text-xs text-white/35 mt-0.5">{drink.flavor}</p>
                    )}
                  </div>
                  {selected === drink.id && (
                    <div className="w-6 h-6 rounded-full bg-[#22c55e] flex items-center justify-center mr-3">
                      <span className="text-white text-xs font-bold">✓</span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Sticky CTA */}
      {selected && (
        <div
          className="fixed bottom-0 left-0 right-0 p-5"
          style={{
            maxWidth: 448,
            margin: '0 auto',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: '#0a0a0f',
            borderTop: '1px solid rgba(255,255,255,0.07)',
            paddingBottom: 36,
          }}
        >
          <button
            className="w-full rounded-2xl p-4 font-bold text-white text-base"
            style={{ backgroundColor: '#22c55e' }}
            onClick={() => {
              const drinkName = drinks.find((d) => d.id === selected)?.name ?? ''
              const drinkFlavor = drinks.find((d) => d.id === selected)?.flavor ?? ''
              router.push(
                `/submit/status?storeId=${storeId}&storeName=${encodeURIComponent(storeName)}&drinkId=${selected}&drinkName=${encodeURIComponent(drinkName)}&drinkFlavor=${encodeURIComponent(drinkFlavor)}`
              )
            }}
          >
            Is it in stock? →
          </button>
        </div>
      )}
    </div>
  )
}

export default function DrinksPage() {
  return (
    <Suspense>
      <DrinksContent />
    </Suspense>
  )
}
