'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { BRAND_COLORS } from '@/components/BrandLogo'
import { useAuth } from '@/contexts/AuthContext'
import type { Drink, Quantity } from '@/lib/types'

const QUANTITY_OPTIONS: { value: Quantity; label: string; color: string; bg: string; border: string }[] = [
  { value: 'out',    label: 'Out',  color: '#ef4444', bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.35)'  },
  { value: 'low',    label: 'Low',  color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.35)' },
  { value: 'medium', label: 'Med',  color: '#f97316', bg: 'rgba(249,115,22,0.12)', border: 'rgba(249,115,22,0.35)' },
  { value: 'full',   label: 'Full', color: '#22c55e', bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.35)'  },
]

function DrinksContent() {
  const router = useRouter()
  const params = useSearchParams()
  const storeId = params.get('storeId') ?? ''
  const storeName = params.get('storeName') ?? ''

  const { user, profile, loading: authLoading } = useAuth()
  const isTracker = profile?.is_admin || profile?.tier === 'tracker'

  useEffect(() => {
    if (!authLoading && !user) router.replace('/account')
  }, [user, authLoading])

  const [drinks, setDrinks] = useState<Drink[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expandedBrands, setExpandedBrands] = useState<Set<string>>(new Set())
  const [expandedDrinks, setExpandedDrinks] = useState<Set<string>>(new Set())
  const [selections, setSelections] = useState<Record<string, Quantity>>({})
  const [submitting, setSubmitting] = useState(false)

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

  function toggleDrink(drinkId: string) {
    setExpandedDrinks((prev) => {
      const next = new Set(prev)
      next.has(drinkId) ? next.delete(drinkId) : next.add(drinkId)
      return next
    })
  }

  function selectQuantity(drinkId: string, qty: Quantity) {
    setSelections((prev) => ({ ...prev, [drinkId]: qty }))
    setExpandedDrinks((prev) => {
      const next = new Set(prev)
      next.delete(drinkId)
      return next
    })
  }

  async function handleSubmit() {
    const entries = Object.entries(selections)
    if (entries.length === 0 || submitting) return
    setSubmitting(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()

      let toSubmit = entries
      if (user) {
        const since = new Date(Date.now() - 30 * 60 * 1000).toISOString()
        const { data: recent } = await supabase
          .from('stock_reports')
          .select('drink_id')
          .eq('user_id', user.id)
          .eq('store_id', storeId)
          .gte('reported_at', since)
        const recentIds = new Set((recent ?? []).map((r: any) => r.drink_id))
        toSubmit = entries.filter(([drinkId]) => !recentIds.has(drinkId))
      }

      if (toSubmit.length > 0) {
        await supabase.from('stock_reports').insert(
          toSubmit.map(([drinkId, quantity]) => ({
            store_id: storeId,
            drink_id: drinkId,
            quantity,
            user_id: user?.id ?? null,
          }))
        )

        const [firstDrinkId, firstQuantity] = toSubmit[0]
        const firstDrink = drinks.find((d) => d.id === firstDrinkId)
        if (firstDrink && profile?.username) {
          const drinkLabel = toSubmit.length > 1
            ? `${firstDrink.name} +${toSubmit.length - 1} more`
            : firstDrink.name
          await supabase.rpc('notify_stock_update', {
            p_store_id: storeId,
            p_drink_name: drinkLabel,
            p_quantity: firstQuantity,
            p_reporter_username: profile.username,
          })
        }
      }

      router.replace(
        `/submit/result?storeId=${storeId}&storeName=${encodeURIComponent(storeName)}&count=${toSubmit.length}`
      )
    } catch {
      setSubmitting(false)
    }
  }

  const filtered = drinks.filter((d) => {
    const q = search.toLowerCase()
    return (
      d.name.toLowerCase().includes(q) ||
      d.brand.toLowerCase().includes(q) ||
      (d.flavor ?? '').toLowerCase().includes(q)
    )
  })

  const grouped = filtered.reduce<Record<string, Drink[]>>((acc, d) => {
    if (!acc[d.brand]) acc[d.brand] = []
    acc[d.brand].push(d)
    return acc
  }, {})

  const isSearching = search.length > 0
  const selectionCount = Object.keys(selections).length

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#070710', position: 'relative', overflowX: 'hidden' }}>

      {/* ── Sticky header ─────────────────────────────────────────── */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          backgroundColor: 'rgba(7,7,16,0.88)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          paddingTop: 'env(safe-area-inset-top)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
          <button
            onClick={() => router.back()}
            style={{
              width: 36, height: 36, borderRadius: 10, flexShrink: 0,
              backgroundColor: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 12L6 8l4-4" stroke="rgba(255,255,255,0.75)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#fff' }}>Report Stock</p>
            {storeName && (
              <p style={{ margin: '1px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.35)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {storeName}
              </p>
            )}
          </div>
          {selectionCount > 0 && (
            <div style={{
              padding: '4px 10px', borderRadius: 999,
              backgroundColor: 'rgba(34,197,94,0.15)',
              border: '1px solid rgba(34,197,94,0.4)',
            }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#22c55e' }}>{selectionCount} selected</span>
            </div>
          )}
        </div>
      </div>

      <div style={{ position: 'relative', zIndex: 1 }}>

        {/* ── Search ────────────────────────────────────────────────── */}
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            margin: '16px 16px 12px',
            padding: '10px 14px',
            borderRadius: 12,
            backgroundColor: '#1a1a24',
            border: '1px solid rgba(255,255,255,0.07)',
          }}
        >
          <span style={{ fontSize: 14, opacity: 0.3 }}>🔍</span>
          <input
            type="text"
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 14, color: '#fff' }}
            placeholder="Search drinks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, cursor: 'pointer', background: 'none', border: 'none' }}>✕</button>
          )}
        </div>

        {/* ── Info chip ─────────────────────────────────────────────── */}
        <div style={{
          margin: '0 16px 16px',
          padding: '10px 14px',
          borderRadius: 12,
          backgroundColor: 'rgba(34,197,94,0.05)',
          border: '1px solid rgba(34,197,94,0.15)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 13, flexShrink: 0 }}>💡</span>
          <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 }}>
            Tap a brand to expand, then tap a drink to set its stock level.
          </p>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 40 }}>
            <div className="w-8 h-8 border-2 border-[#22c55e] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 16px 160px' }}>
            {Object.entries(grouped).map(([brand, brandDrinks]) => {
              const color = BRAND_COLORS[brand] ?? 'rgba(255,255,255,0.4)'
              const expanded = isSearching || expandedBrands.has(brand)
              const brandSelections = brandDrinks.filter((d) => selections[d.id])
              const hasBrandSelection = brandSelections.length > 0

              return (
                <div
                  key={brand}
                  style={{
                    borderRadius: 16, overflow: 'hidden',
                    backgroundColor: '#1a1a24',
                    border: `1.5px solid ${hasBrandSelection ? 'rgba(34,197,94,0.6)' : `${color}55`}`,
                    boxShadow: hasBrandSelection
                      ? '0 0 12px rgba(34,197,94,0.2), 0 0 24px rgba(34,197,94,0.08)'
                      : `0 0 12px ${color}22, 0 0 24px ${color}0d`,
                  }}
                >
                  <button
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: 16, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
                    onClick={() => toggleBrand(brand)}
                  >
                    <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: 0, fontSize: 15, fontWeight: 900, color: '#fff' }}>{brand}</p>
                      <p style={{ margin: '2px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
                        {hasBrandSelection
                          ? `${brandSelections.length} of ${brandDrinks.length} reported`
                          : `${brandDrinks.length} flavor${brandDrinks.length !== 1 ? 's' : ''}`}
                      </p>
                    </div>
                    {hasBrandSelection && (
                      <div style={{
                        width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                        backgroundColor: '#22c55e',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#000' }}>{brandSelections.length}</span>
                      </div>
                    )}
                    <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, transform: expanded ? 'rotate(180deg)' : 'none', display: 'inline-block', flexShrink: 0 }}>▾</span>
                  </button>

                  {expanded && (
                    <div style={{ padding: '0 16px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ height: 1, marginBottom: 4, backgroundColor: 'rgba(255,255,255,0.06)' }} />
                      {brandDrinks.map((drink) => {
                        const selected = selections[drink.id]
                        const pickerOpen = expandedDrinks.has(drink.id)
                        const selectedOpt = QUANTITY_OPTIONS.find((o) => o.value === selected)

                        return (
                          <div key={drink.id}>
                            <button
                              style={{
                                width: '100%', display: 'flex', alignItems: 'center', textAlign: 'left',
                                background: selected ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.03)',
                                border: `1.5px solid ${selected ? (selectedOpt?.border ?? 'rgba(255,255,255,0.06)') : `${color}44`}`,
                                borderRadius: pickerOpen ? '12px 12px 0 0' : 12,
                                boxShadow: selected ? `0 0 10px ${selectedOpt?.color ?? color}33` : `0 0 8px ${color}1a`,
                                cursor: 'pointer',
                              }}
                              onClick={() => toggleDrink(drink.id)}
                            >
                              <div style={{
                                alignSelf: 'stretch', width: 4, flexShrink: 0,
                                backgroundColor: selected ? (selectedOpt?.color ?? color) : color,
                                borderRadius: pickerOpen ? '10px 0 0 0' : '10px 0 0 10px',
                              }} />
                              <div style={{ flex: 1, padding: 12 }}>
                                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#fff' }}>
                                  {drink.flavor ?? drink.name}
                                </p>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                                  {drink.flavor && (
                                    <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{drink.name}</p>
                                  )}
                                  {drink.caffeine_mg && (
                                    <span style={{
                                      fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 999,
                                      backgroundColor: 'rgba(34,197,94,0.1)',
                                      color: 'rgba(34,197,94,0.85)',
                                      border: '1px solid rgba(34,197,94,0.25)',
                                    }}>
                                      ⚡ {drink.caffeine_mg}mg
                                    </span>
                                  )}
                                </div>
                              </div>
                              {selected ? (
                                <div style={{
                                  padding: '4px 10px', borderRadius: 999, marginRight: 12, flexShrink: 0,
                                  backgroundColor: selectedOpt?.bg, border: `1px solid ${selectedOpt?.border}`,
                                }}>
                                  <span style={{ fontSize: 11, fontWeight: 700, color: selectedOpt?.color }}>{selectedOpt?.label}</span>
                                </div>
                              ) : (
                                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginRight: 12, flexShrink: 0 }}>Tap to report</span>
                              )}
                            </button>

                            {pickerOpen && (
                              <div style={{
                                display: 'flex',
                                borderRadius: '0 0 12px 12px',
                                overflow: 'hidden',
                                border: '1.5px solid rgba(255,255,255,0.06)',
                                borderTop: 'none',
                              }}>
                                {QUANTITY_OPTIONS.map((opt) => (
                                  <button
                                    key={opt.value}
                                    style={{
                                      flex: 1, padding: '12px 0',
                                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                                      backgroundColor: selected === opt.value ? opt.bg : 'rgba(255,255,255,0.03)',
                                      borderRight: opt.value !== 'full' ? '1px solid rgba(255,255,255,0.06)' : 'none',
                                      border: 'none', cursor: 'pointer',
                                    }}
                                    onClick={() => selectQuantity(drink.id, opt.value)}
                                  >
                                    <span style={{ fontSize: 16, lineHeight: 1 }}>
                                      {opt.value === 'out' ? '❌' : opt.value === 'low' ? '🟡' : opt.value === 'medium' ? '🟠' : '✅'}
                                    </span>
                                    <span style={{ fontSize: 10, fontWeight: 700, color: selected === opt.value ? opt.color : 'rgba(255,255,255,0.35)' }}>
                                      {opt.label}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* ── Sticky submit CTA ─────────────────────────────────────── */}
        {selectionCount > 0 && (
          <div
            style={{
              position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
              width: '100%', maxWidth: 448,
              padding: '16px 16px',
              paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)',
              backgroundColor: 'rgba(7,7,16,0.95)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              borderTop: '1px solid rgba(255,255,255,0.07)',
              zIndex: 30,
            }}
          >
            <button
              style={{
                width: '100%', borderRadius: 16, padding: '15px 0',
                backgroundColor: submitting ? 'rgba(34,197,94,0.5)' : '#22c55e',
                border: 'none', cursor: submitting ? 'default' : 'pointer',
                fontSize: 15, fontWeight: 800, color: '#000',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                boxShadow: submitting ? 'none' : '0 0 24px rgba(34,197,94,0.35)',
              }}
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <div className="w-5 h-5 border-2 border-black/40 border-t-black rounded-full animate-spin" />
              ) : (
                <>⚡ Submit {selectionCount} Report{selectionCount !== 1 ? 's' : ''}</>
              )}
            </button>
          </div>
        )}
      </div>
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
