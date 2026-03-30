'use client'

import { useEffect, useState, Suspense, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { BRAND_COLORS } from '@/components/BrandLogo'
import { useAuth } from '@/contexts/AuthContext'
import type { Drink, Quantity } from '@/lib/types'

const QUANTITY_OPTIONS: { value: Quantity; label: string; color: string; bg: string; border: string }[] = [
  { value: 'out',    label: 'Out',    color: '#ef4444', bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.35)'  },
  { value: 'low',    label: 'Low',    color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.35)' },
  { value: 'medium', label: 'Med',    color: '#f97316', bg: 'rgba(249,115,22,0.12)', border: 'rgba(249,115,22,0.35)' },
  { value: 'full',   label: 'Full',   color: '#22c55e', bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.35)'  },
]

function DrinksContent() {
  const router = useRouter()
  const params = useSearchParams()
  const storeId = params.get('storeId') ?? ''
  const storeName = params.get('storeName') ?? ''

  const { profile } = useAuth()
  const isTracker = profile?.is_admin || profile?.tier === 'tracker'
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [drinks, setDrinks] = useState<Drink[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expandedBrands, setExpandedBrands] = useState<Set<string>>(new Set())
  const [expandedDrinks, setExpandedDrinks] = useState<Set<string>>(new Set())
  const [selections, setSelections] = useState<Record<string, Quantity>>({})
  const [submitting, setSubmitting] = useState(false)
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [photoError, setPhotoError] = useState(false)

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
    // Auto-collapse the picker after selection
    setExpandedDrinks((prev) => {
      const next = new Set(prev)
      next.delete(drinkId)
      return next
    })
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhoto(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  function removePhoto() {
    setPhoto(null)
    setPhotoPreview(null)
    setPhotoError(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleSubmit() {
    const entries = Object.entries(selections)
    if (entries.length === 0 || submitting) return
    setSubmitting(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()

      // Upload photo if present
      let photoUrl: string | null = null
      if (photo && user) {
        setPhotoUploading(true)
        const ext = photo.name.split('.').pop() ?? 'jpg'
        const path = `${user.id}/${Date.now()}.${ext}`
        const { error } = await supabase.storage.from('report-photos').upload(path, photo)
        setPhotoUploading(false)
        if (error) {
          setPhotoError(true)
          setSubmitting(false)
          return
        }
        const { data: urlData } = supabase.storage.from('report-photos').getPublicUrl(path)
        photoUrl = urlData.publicUrl
      }

      // Rate-limit check: filter out drinks reported in last 30 min
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
            ...(photoUrl ? { photo_url: photoUrl } : {}),
          }))
        )
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
      <style>{`@keyframes fadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, background: 'radial-gradient(ellipse 60% 40% at 20% 20%, rgba(34,197,94,0.04) 0%, transparent 60%)', pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)', backgroundSize: '40px 40px', pointerEvents: 'none' }} />
      <div style={{ position: 'relative', zIndex: 1 }}>
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
          <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, letterSpacing: 2, color: '#fff', lineHeight: 1 }}>Report Stock</h1>
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

      {/* Instructions */}
      <p className="text-xs text-white/30 px-5 mb-4">
        Tap a brand to expand, then tap a drink to set its stock level.
      </p>

      {loading ? (
        <div className="flex justify-center mt-10">
          <div className="w-8 h-8 border-2 border-[#22c55e] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="flex flex-col gap-2.5 px-5 pb-40">
          {Object.entries(grouped).map(([brand, brandDrinks]) => {
            const color = BRAND_COLORS[brand] ?? 'rgba(255,255,255,0.4)'
            const expanded = isSearching || expandedBrands.has(brand)
            const brandSelections = brandDrinks.filter((d) => selections[d.id])
            const hasBrandSelection = brandSelections.length > 0

            return (
              <div
                key={brand}
                className="rounded-2xl overflow-hidden"
                style={{
                  backgroundColor: '#1a1a24',
                  border: `1.5px solid ${hasBrandSelection ? 'rgba(34,197,94,0.6)' : `${color}55`}`,
                  boxShadow: hasBrandSelection
                    ? '0 0 12px rgba(34,197,94,0.2), 0 0 24px rgba(34,197,94,0.08)'
                    : `0 0 12px ${color}22, 0 0 24px ${color}0d`,
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
                      {hasBrandSelection
                        ? `${brandSelections.length} of ${brandDrinks.length} reported`
                        : `${brandDrinks.length} flavor${brandDrinks.length !== 1 ? 's' : ''}`}
                    </p>
                  </div>
                  {hasBrandSelection && (
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center mr-1 shrink-0"
                      style={{ backgroundColor: '#22c55e' }}
                    >
                      <span className="text-white text-[10px] font-bold">{brandSelections.length}</span>
                    </div>
                  )}
                  <span
                    className="text-white/30 text-sm shrink-0"
                    style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', display: 'inline-block' }}
                  >
                    ▾
                  </span>
                </button>

                {/* Flavors */}
                {expanded && (
                  <div className="px-4 pb-3 flex flex-col gap-2">
                    <div className="h-px mb-1" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }} />
                    {brandDrinks.map((drink) => {
                      const selected = selections[drink.id]
                      const pickerOpen = expandedDrinks.has(drink.id)
                      const selectedOpt = QUANTITY_OPTIONS.find((o) => o.value === selected)

                      return (
                        <div key={drink.id}>
                          {/* Drink row */}
                          <button
                            className="flex items-center w-full rounded-xl text-left"
                            style={{
                              backgroundColor: selected ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.03)',
                              border: `1.5px solid ${selected ? (selectedOpt?.border ?? 'rgba(255,255,255,0.06)') : `${color}44`}`,
                              borderRadius: pickerOpen ? '12px 12px 0 0' : 12,
                              boxShadow: selected
                                ? `0 0 10px ${selectedOpt?.color ?? color}33`
                                : `0 0 8px ${color}1a`,
                            }}
                            onClick={() => toggleDrink(drink.id)}
                          >
                            <div
                              className="self-stretch w-1 shrink-0"
                              style={{
                                backgroundColor: selected ? (selectedOpt?.color ?? color) : color,
                                borderRadius: pickerOpen ? '10px 0 0 0' : '10px 0 0 10px',
                              }}
                            />
                            <div className="flex-1 p-3">
                              <p className="text-sm font-semibold text-white">
                                {drink.flavor ?? drink.name}
                              </p>
                              {drink.flavor && (
                                <p className="text-xs text-white/35 mt-0.5">{drink.name}</p>
                              )}
                            </div>
                            {selected ? (
                              <div
                                className="px-2.5 py-1 rounded-full mr-3 shrink-0"
                                style={{ backgroundColor: selectedOpt?.bg, border: `1px solid ${selectedOpt?.border}` }}
                              >
                                <span className="text-xs font-bold" style={{ color: selectedOpt?.color }}>
                                  {selectedOpt?.label}
                                </span>
                              </div>
                            ) : (
                              <span className="text-white/25 text-xs mr-3 shrink-0">Tap to report</span>
                            )}
                          </button>

                          {/* Inline quantity picker */}
                          {pickerOpen && (
                            <div
                              className="flex"
                              style={{
                                borderRadius: '0 0 12px 12px',
                                overflow: 'hidden',
                                border: '1.5px solid rgba(255,255,255,0.06)',
                                borderTop: 'none',
                              }}
                            >
                              {QUANTITY_OPTIONS.map((opt) => (
                                <button
                                  key={opt.value}
                                  className="flex-1 py-3 flex flex-col items-center gap-0.5"
                                  style={{
                                    backgroundColor: selected === opt.value ? opt.bg : 'rgba(255,255,255,0.03)',
                                    borderRight: opt.value !== 'full' ? '1px solid rgba(255,255,255,0.06)' : 'none',
                                  }}
                                  onClick={() => selectQuantity(drink.id, opt.value)}
                                >
                                  <span className="text-base leading-none">
                                    {opt.value === 'out' ? '❌' : opt.value === 'low' ? '🟡' : opt.value === 'medium' ? '🟠' : '✅'}
                                  </span>
                                  <span
                                    className="text-[10px] font-bold"
                                    style={{ color: selected === opt.value ? opt.color : 'rgba(255,255,255,0.35)' }}
                                  >
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

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handlePhotoChange}
      />

      {/* Sticky submit CTA */}
      {selectionCount > 0 && (
        <div
          className="fixed bottom-0 p-5"
          style={{
            maxWidth: 448,
            width: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: '#070710',
            borderTop: '1px solid rgba(255,255,255,0.07)',
            paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)',
          }}
        >
          {/* Photo error */}
          {photoError && (
            <p className="text-xs font-bold mb-2" style={{ color: '#ef4444' }}>
              ⚠️ Photo upload failed. Remove the photo and try again, or submit without it.
            </p>
          )}

          {/* Photo picker — Tracker only */}
          {isTracker && (
            <div className="flex items-center gap-3 mb-3">
              {photoPreview ? (
                <div className="flex items-center gap-2 flex-1">
                  <img
                    src={photoPreview}
                    alt="shelf photo"
                    className="w-12 h-12 rounded-xl object-cover shrink-0"
                    style={{ border: '1px solid rgba(139,92,246,0.4)' }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-white truncate">{photo?.name}</p>
                    <p className="text-[10px] text-white/40">Photo attached</p>
                  </div>
                  <button
                    onClick={removePhoto}
                    className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                    style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}
                  >
                    <span className="text-xs" style={{ color: '#ef4444' }}>✕</span>
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 flex-1 rounded-xl px-3.5 py-2.5"
                  style={{ backgroundColor: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.25)' }}
                >
                  <span style={{ fontSize: 18 }}>📷</span>
                  <div className="text-left">
                    <p className="text-xs font-bold" style={{ color: '#a78bfa' }}>Attach shelf photo</p>
                    <p className="text-[10px] text-white/30">Tracker exclusive</p>
                  </div>
                </button>
              )}
            </div>
          )}

          <button
            className="w-full rounded-2xl p-4 font-bold text-white text-base flex items-center justify-center gap-2"
            style={{ backgroundColor: submitting ? 'rgba(34,197,94,0.5)' : '#22c55e' }}
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                {photoUploading && <span className="text-sm">Uploading photo...</span>}
              </div>
            ) : (
              `⚡ Submit ${selectionCount} Report${selectionCount !== 1 ? 's' : ''}`
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
