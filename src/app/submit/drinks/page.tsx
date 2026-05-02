'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import BrandLogo, { BRAND_COLORS } from '@/components/BrandLogo'
import { useAuth } from '@/contexts/AuthContext'
import type { Drink, Quantity } from '@/lib/types'

const QUANTITY_OPTIONS: { value: Quantity; label: string; color: string; bg: string; border: string }[] = [
  { value: 'out',    label: 'Out',  color: '#FF4545', bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.35)'  },
  { value: 'low',    label: 'Low',  color: '#FFB300', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.35)' },
  { value: 'medium', label: 'Med',  color: '#FFB300', bg: 'rgba(255,179,0,0.12)',  border: 'rgba(255,179,0,0.35)'  },
  { value: 'full',   label: 'Full', color: 'var(--accent)', bg: 'rgba(201,244,0,0.12)',  border: 'rgba(201,244,0,0.35)'  },
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
  const [limitError, setLimitError] = useState<string | null>(null)

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

      // Daily limit for free tier
      if (user && !isTracker) {
        const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
        const { count } = await supabase
          .from('stock_reports')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .gte('reported_at', todayStart.toISOString())
        if ((count ?? 0) >= 25) {
          setLimitError("You've reached the daily limit of 25 stock reports. Upgrade to Tracker for unlimited.")
          setSubmitting(false)
          return
        }
      }

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
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg)', position: 'relative', overflowX: 'hidden' }}>
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, background: 'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(201,244,0,0.07) 0%, transparent 60%)', pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, backgroundImage: 'linear-gradient(rgba(201,244,0,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(201,244,0,0.03) 1px, transparent 1px)', backgroundSize: '32px 32px', pointerEvents: 'none' }} />

      {/* ── Sticky header ─────────────────────────────────────────── */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          backgroundColor: 'var(--header-bg)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(201,244,0,0.1)',
          paddingTop: 'env(safe-area-inset-top)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
          <button
            onClick={() => router.back()}
            style={{
              width: 36, height: 36, borderRadius: 10, flexShrink: 0,
              backgroundColor: 'var(--fg-07)',
              border: '1px solid var(--fg-10)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 12L6 8l4-4" stroke="var(--fg-75)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>Report Stock</p>
            {storeName && (
              <p style={{ margin: '1px 0 0', fontSize: 11, color: 'var(--fg-35)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {storeName}
              </p>
            )}
          </div>
          {selectionCount > 0 && (
            <div style={{
              padding: '4px 10px', borderRadius: 999,
              backgroundColor: 'rgba(201,244,0,0.15)',
              border: '1px solid rgba(201,244,0,0.4)',
            }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>{selectionCount} selected</span>
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
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--fg-07)',
          }}
        >
          <span style={{ fontSize: 14, opacity: 0.3 }}>🔍</span>
          <input
            type="text"
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 14, color: 'var(--text)' }}
            placeholder="Search drinks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ color: 'var(--fg-30)', fontSize: 12, cursor: 'pointer', background: 'none', border: 'none' }}>✕</button>
          )}
        </div>

        {/* ── Info chip ─────────────────────────────────────────────── */}
        <div style={{
          margin: '0 16px 16px',
          padding: '10px 14px',
          borderRadius: 12,
          backgroundColor: 'rgba(201,244,0,0.05)',
          border: '1px solid rgba(201,244,0,0.15)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 13, flexShrink: 0 }}>💡</span>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--fg-45)', lineHeight: 1.5 }}>
            Tap a brand to expand, then tap a drink to set its stock level.
          </p>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 40 }}>
            <div className="w-8 h-8 border-2 border-[#C9F400] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 16px 160px' }}>
            {Object.entries(grouped).map(([brand, brandDrinks]) => {
              const color = BRAND_COLORS[brand] ?? 'var(--fg-40)'
              const expanded = isSearching || expandedBrands.has(brand)
              const brandSelections = brandDrinks.filter((d) => selections[d.id])
              const hasBrandSelection = brandSelections.length > 0

              return (
                <div
                  key={brand}
                  style={{
                    borderRadius: 16, overflow: 'hidden',
                    backgroundColor: 'var(--surface)',
                    border: `1px solid ${hasBrandSelection ? 'rgba(201,244,0,0.4)' : 'rgba(201,244,0,0.1)'}`,
                    boxShadow: hasBrandSelection
                      ? 'inset 3px 0 0 #C9F400, 0 0 14px rgba(201,244,0,0.15)'
                      : 'inset 3px 0 0 rgba(201,244,0,0.2), 0 0 8px rgba(201,244,0,0.06)',
                  }}
                >
                  <button
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: 16, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
                    onClick={() => toggleBrand(brand)}
                  >
                    <BrandLogo brand={brand} size={36} />
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: 0, fontSize: 15, fontWeight: 900, color: 'var(--text)' }}>{brand}</p>
                      <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--fg-35)' }}>
                        {hasBrandSelection
                          ? `${brandSelections.length} of ${brandDrinks.length} reported`
                          : `${brandDrinks.length} flavor${brandDrinks.length !== 1 ? 's' : ''}`}
                      </p>
                    </div>
                    {hasBrandSelection && (
                      <div style={{
                        width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                        backgroundColor: '#C9F400',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#000' }}>{brandSelections.length}</span>
                      </div>
                    )}
                    <span style={{ color: 'var(--fg-30)', fontSize: 13, transform: expanded ? 'rotate(180deg)' : 'none', display: 'inline-block', flexShrink: 0 }}>▾</span>
                  </button>

                  {expanded && (
                    <div style={{ padding: '0 16px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ height: 1, marginBottom: 4, backgroundColor: 'var(--fg-06)' }} />
                      {brandDrinks.map((drink) => {
                        const selected = selections[drink.id]
                        const pickerOpen = expandedDrinks.has(drink.id)
                        const selectedOpt = QUANTITY_OPTIONS.find((o) => o.value === selected)

                        return (
                          <div key={drink.id}>
                            <button
                              style={{
                                width: '100%', display: 'flex', alignItems: 'center', textAlign: 'left',
                                background: selected ? 'var(--fg-05)' : 'var(--fg-03)',
                                border: `1.5px solid ${selected ? (selectedOpt?.border ?? 'var(--fg-06)') : 'var(--fg-10)'}`,
                                borderRadius: pickerOpen ? '12px 12px 0 0' : 12,
                                boxShadow: selected ? `0 0 10px ${selectedOpt?.color ?? 'rgba(201,244,0,0.5)'}33` : 'none',
                                cursor: 'pointer',
                              }}
                              onClick={() => toggleDrink(drink.id)}
                            >
                              <div style={{
                                alignSelf: 'stretch', width: 4, flexShrink: 0,
                                backgroundColor: selected ? (selectedOpt?.color ?? 'rgba(201,244,0,0.6)') : 'rgba(201,244,0,0.2)',
                                borderRadius: pickerOpen ? '10px 0 0 0' : '10px 0 0 10px',
                              }} />
                              <div style={{ flex: 1, padding: 12 }}>
                                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                                  {drink.flavor ?? drink.name}
                                </p>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                                  {drink.flavor && (
                                    <p style={{ margin: 0, fontSize: 11, color: 'var(--fg-35)' }}>{drink.name}</p>
                                  )}
                                  {drink.caffeine_mg && (
                                    <span style={{
                                      fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 999,
                                      backgroundColor: 'rgba(201,244,0,0.1)',
                                      color: 'rgba(201,244,0,0.85)',
                                      border: '1px solid rgba(201,244,0,0.25)',
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
                                <span style={{ fontSize: 11, color: 'var(--fg-25)', marginRight: 12, flexShrink: 0 }}>Tap to report</span>
                              )}
                            </button>

                            {pickerOpen && (
                              <div style={{
                                display: 'flex',
                                borderRadius: '0 0 12px 12px',
                                overflow: 'hidden',
                                border: '1.5px solid var(--fg-06)',
                                borderTop: 'none',
                              }}>
                                {QUANTITY_OPTIONS.map((opt) => (
                                  <button
                                    key={opt.value}
                                    style={{
                                      flex: 1, padding: '14px 0',
                                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                                      backgroundColor: selected === opt.value ? opt.bg : 'var(--fg-02)',
                                      borderRight: opt.value !== 'full' ? '1px solid var(--fg-06)' : 'none',
                                      border: 'none', cursor: 'pointer',
                                    }}
                                    onClick={() => selectQuantity(drink.id, opt.value)}
                                  >
                                    <div style={{
                                      width: 10, height: 10, borderRadius: '50%',
                                      backgroundColor: opt.color,
                                      opacity: selected === opt.value ? 1 : 0.3,
                                      boxShadow: selected === opt.value ? `0 0 8px ${opt.color}` : 'none',
                                    }} />
                                    <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.5px', color: selected === opt.value ? opt.color : 'var(--fg-30)' }}>
                                      {opt.label.toUpperCase()}
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
              backgroundColor: 'var(--header-bg)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              borderTop: '1px solid rgba(201,244,0,0.1)',
              zIndex: 30,
            }}
          >
            {limitError && (
              <p style={{ fontSize: 13, color: '#f87171', textAlign: 'center', marginBottom: 10 }}>{limitError}</p>
            )}
            <button
              style={{
                width: '100%', borderRadius: 16, padding: '15px 0',
                backgroundColor: submitting || limitError ? 'rgba(201,244,0,0.4)' : '#C9F400',
                border: 'none', cursor: submitting ? 'default' : 'pointer',
                fontSize: 15, fontWeight: 800, color: '#0D1210',
                fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.08em', textTransform: 'uppercase',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                boxShadow: submitting ? 'none' : '0 0 24px rgba(201,244,0,0.35)',
              }}
              onClick={handleSubmit}
              disabled={submitting || !!limitError}
            >
              {submitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-black/40 border-t-black rounded-full animate-spin" />
                  Submitting…
                </>
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
