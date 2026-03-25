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
  const [expandedBrands, setExpandedBrands] = useState<Set<string>>(new Set())

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

  function toggleBrand(brand: string) {
    setExpandedBrands((prev) => {
      const next = new Set(prev)
      next.has(brand) ? next.delete(brand) : next.add(brand)
      return next
    })
  }

  const filtered = drinks.filter(
    (d) =>
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.brand.toLowerCase().includes(search.toLowerCase()) ||
      (d.flavor ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const grouped = filtered.reduce<Record<string, Drink[]>>((acc, drink) => {
    if (!acc[drink.brand]) acc[drink.brand] = []
    acc[drink.brand].push(drink)
    return acc
  }, {})

  // When searching, auto-expand all matching brands
  const isSearching = search.length > 0
  const isExpanded = (brand: string) => isSearching || expandedBrands.has(brand)

  const selectedDrink = drinks.find((d) => d.id === selected)

  return (
    <div className="min-h-screen bg-[#0a0a0f] relative">
      {/* Header */}
      <div className="flex items-center gap-3.5 px-5 pb-4" style={{ paddingTop: 'calc(56px + env(safe-area-inset-top))' }}>
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
        className="flex items-center mx-5 mb-4 px-3.5 py-2.5 rounded-xl"
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

      {/* Brand accordion list */}
      {loading ? (
        <div className="flex justify-center mt-10">
          <div className="w-8 h-8 border-2 border-[#22c55e] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="flex flex-col gap-2.5 px-5 pb-40">
          {Object.entries(grouped).map(([brand, brandDrinks]) => {
            const color = BRAND_COLORS[brand] ?? 'rgba(255,255,255,0.4)'
            const expanded = isExpanded(brand)
            const isSelectedBrand = brandDrinks.some((d) => d.id === selected)

            return (
              <div
                key={brand}
                className="rounded-2xl overflow-hidden"
                style={{
                  backgroundColor: '#1a1a24',
                  border: `1px solid ${isSelectedBrand ? 'rgba(34,197,94,0.35)' : 'rgba(255,255,255,0.08)'}`,
                }}
              >
                {/* Brand header */}
                <button
                  className="w-full flex items-center gap-3 p-4 text-left"
                  onClick={() => toggleBrand(brand)}
                >
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <div className="flex-1">
                    <p className="text-base font-black text-white">{brand}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
                      {brandDrinks.length} flavor{brandDrinks.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  {isSelectedBrand && (
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center mr-1"
                      style={{ backgroundColor: '#22c55e' }}
                    >
                      <span className="text-white text-[10px] font-bold">✓</span>
                    </div>
                  )}
                  <span
                    className="text-white/30 text-sm"
                    style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', display: 'inline-block' }}
                  >
                    ▾
                  </span>
                </button>

                {/* Flavors */}
                {expanded && (
                  <div className="px-4 pb-3 flex flex-col gap-1.5">
                    <div className="h-px mb-1" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }} />
                    {brandDrinks.map((drink) => {
                      const isSelected = selected === drink.id
                      return (
                        <button
                          key={drink.id}
                          className="flex items-center w-full rounded-xl overflow-hidden text-left"
                          style={{
                            backgroundColor: isSelected ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.04)',
                            border: `1.5px solid ${isSelected ? '#22c55e' : 'rgba(255,255,255,0.06)'}`,
                          }}
                          onClick={() => setSelected(drink.id === selected ? null : drink.id)}
                        >
                          <div
                            className="self-stretch w-1 shrink-0"
                            style={{ backgroundColor: color }}
                          />
                          <div className="flex-1 p-3">
                            <p className="text-sm font-semibold text-white">
                              {drink.flavor ?? drink.name}
                            </p>
                            {drink.flavor && (
                              <p className="text-xs text-white/35 mt-0.5">{drink.name}</p>
                            )}
                          </div>
                          {isSelected && (
                            <div
                              className="w-5 h-5 rounded-full flex items-center justify-center mr-3 shrink-0"
                              style={{ backgroundColor: '#22c55e' }}
                            >
                              <span className="text-white text-[10px] font-bold">✓</span>
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Sticky CTA */}
      {selected && selectedDrink && (
        <div
          className="fixed bottom-0 p-5"
          style={{
            maxWidth: 448,
            width: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: '#0a0a0f',
            borderTop: '1px solid rgba(255,255,255,0.07)',
            paddingBottom: 36,
          }}
        >
          <p className="text-xs text-white/40 text-center mb-3 font-semibold">
            {selectedDrink.brand} · {selectedDrink.flavor ?? selectedDrink.name}
          </p>
          <button
            className="w-full rounded-2xl p-4 font-bold text-white text-base"
            style={{ backgroundColor: '#22c55e' }}
            onClick={() =>
              router.push(
                `/submit/status?storeId=${storeId}&storeName=${encodeURIComponent(storeName)}&drinkId=${selected}&drinkName=${encodeURIComponent(selectedDrink.name)}&drinkFlavor=${encodeURIComponent(selectedDrink.flavor ?? '')}`
              )
            }
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
