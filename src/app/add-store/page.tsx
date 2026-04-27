'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

const STORE_TYPES = [
  { value: 'gas_station', label: 'Gas Station', icon: '⛽' },
  { value: 'convenience', label: 'Convenience Store', icon: '🏪' },
  { value: 'grocery', label: 'Grocery Store', icon: '🛒' },
  { value: 'other', label: 'Other', icon: '📍' },
]

export default function AddStorePage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()

  useEffect(() => {
    if (!authLoading && !user) router.replace('/account')
  }, [user, authLoading])
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [type, setType] = useState<string | null>(null)
  const [geocoding, setGeocoding] = useState(false)
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [duplicate, setDuplicate] = useState<'approved' | 'pending' | null>(null)
  const [manualCoords, setManualCoords] = useState(false)
  const [manualLat, setManualLat] = useState('')
  const [manualLng, setManualLng] = useState('')

  async function geocodeAddress() {
    if (!address.trim()) {
      setError('Please enter a store address first.')
      return
    }
    setError(null)
    setGeocoding(true)
    setCoords(null)

    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(address.trim())}`)
      const data = await res.json()

      if (!res.ok || data.error) {
        setError('Address not found. Double-check the street number, city, and state — or enter coordinates manually.')
        setGeocoding(false)
        return
      }

      setCoords({ lat: data.lat, lng: data.lng })
    } catch {
      setError('Could not look up address. Try entering coordinates manually.')
    }

    setGeocoding(false)
  }

  function applyManualCoords() {
    const lat = parseFloat(manualLat)
    const lng = parseFloat(manualLng)
    if (isNaN(lat) || isNaN(lng)) {
      setError('Please enter valid latitude and longitude.')
      return
    }
    setCoords({ lat, lng })
    setError(null)
  }

  async function handleSubmit() {
    if (!name.trim() || !address.trim() || !type || !coords) {
      setError('Please fill all fields and verify the address.')
      return
    }
    setError(null)
    setSubmitting(true)

    // Check for duplicate address
    const { data: existing } = await supabase
      .from('stores')
      .select('status')
      .ilike('address', address.trim())
      .in('status', ['approved', 'pending'])
      .limit(1)
      .maybeSingle()

    if (existing) {
      setDuplicate(existing.status === 'approved' ? 'approved' : 'pending')
      setSubmitting(false)
      return
    }

    const { error: dbError } = await supabase.from('stores').insert({
      name: name.trim(),
      address: address.trim(),
      type,
      lat: coords.lat,
      lng: coords.lng,
      status: 'pending',
      submitted_by: user?.id ?? null,
    })

    if (dbError) {
      setError('Could not submit store. Please try again.')
      setSubmitting(false)
      return
    }

    setSubmitted(true)
    setSubmitting(false)
  }

  if (submitted) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#070710', position: 'relative', overflowX: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 32px', textAlign: 'center' }}>
        <div style={{ position: 'fixed', inset: 0, zIndex: 0, background: 'radial-gradient(ellipse 60% 40% at 20% 20%, rgba(34,197,94,0.04) 0%, transparent 60%)', pointerEvents: 'none' }} />
        <div style={{ position: 'fixed', inset: 0, zIndex: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)', backgroundSize: '40px 40px', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', zIndex: 1, width: '100%' }}>
        <span style={{ fontSize: 56, marginBottom: 16 }}>🎉</span>
        <p className="text-2xl font-black text-white mb-2.5">Store Submitted!</p>
        <p className="text-sm text-white/45 mb-10 leading-relaxed">
          Thanks! Your store will appear on the map once it&apos;s been reviewed.
        </p>
        <button
          className="w-full rounded-2xl p-4 font-bold text-white mb-2.5"
          style={{ backgroundColor: '#22c55e' }}
          onClick={() => router.replace('/')}
        >
          Back to Map
        </button>
        <button
          className="w-full rounded-2xl p-4 font-semibold"
          style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)' }}
          onClick={() => {
            setName('')
            setAddress('')
            setType(null)
            setCoords(null)
            setSubmitted(false)
          }}
        >
          Add Another Store
        </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#070710', position: 'relative', overflowX: 'hidden' }}>
      <style>{`@keyframes fadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, background: 'radial-gradient(ellipse 60% 40% at 20% 20%, rgba(34,197,94,0.04) 0%, transparent 60%)', pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)', backgroundSize: '40px 40px', pointerEvents: 'none' }} />
      <div style={{ position: 'relative', zIndex: 1, overflowY: 'auto', paddingBottom: 80 }}>
      {/* Header */}
      <div className="flex items-center gap-3.5 px-5 pb-4" style={{ paddingTop: "calc(56px + env(safe-area-inset-top))" }}>
        <button
          onClick={() => router.back()}
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: 'rgba(255,255,255,0.07)' }}
        >
          <span className="text-white text-lg">←</span>
        </button>
        <div>
          <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, letterSpacing: 2, color: '#fff', lineHeight: 1 }}>Add a Store</h1>
          <p className="text-xs text-white/40 mt-0.5">Help grow the map ⚡</p>
        </div>
      </div>

      {error && (
        <div className="mx-5 mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/25">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Store name */}
      <div className="mx-5 mb-6">
        <p className="text-xs font-bold text-white/35 mb-2" style={{ letterSpacing: '1.5px' }}>
          STORE NAME *
        </p>
        <input
          type="text"
          className="w-full rounded-xl p-3.5 text-sm text-white outline-none"
          style={{ backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.07)' }}
          placeholder="e.g. Circle K, Shell Station"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      {/* Address */}
      <div className="mx-5 mb-6">
        <p className="text-xs font-bold text-white/35 mb-2" style={{ letterSpacing: '1.5px' }}>
          STORE ADDRESS *
        </p>
        <textarea
          className="w-full rounded-xl p-3.5 text-sm text-white outline-none resize-none"
          style={{ backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.07)', minHeight: 60 }}
          placeholder="e.g. 703 Tuckaseege Rd, Mount Holly, NC 28120"
          value={address}
          rows={2}
          onChange={(e) => {
            setAddress(e.target.value)
            setCoords(null)
          }}
        />
        <p className="text-xs text-white/30 mt-1.5">
          Include street number, city and state for best results
        </p>

        <button
          className="mt-2.5 w-full rounded-xl p-3.5 font-bold text-white text-sm flex items-center justify-center"
          style={{ backgroundColor: geocoding ? 'rgba(59,130,246,0.4)' : '#3b82f6' }}
          onClick={geocodeAddress}
          disabled={geocoding}
        >
          {geocoding ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            coords ? '✓ Address Verified — Re-verify' : '🔍 Verify Address'
          )}
        </button>

        {coords && (
          <div
            className="flex items-center gap-2.5 mt-2.5 rounded-xl p-3"
            style={{ backgroundColor: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)' }}
          >
            <span style={{ fontSize: 20 }}>📍</span>
            <div>
              <p className="text-sm font-bold text-[#22c55e]">Location found!</p>
              <p className="text-xs text-white/40 mt-0.5">
                {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
              </p>
            </div>
          </div>
        )}

        {/* Manual coordinates fallback */}
        <button
          className="mt-3 text-xs font-semibold text-white/35 underline underline-offset-2"
          onClick={() => setManualCoords((v) => !v)}
        >
          {manualCoords ? 'Hide manual entry' : "Can't find address? Enter coordinates manually"}
        </button>

        {manualCoords && (
          <div className="mt-2.5 flex flex-col gap-2">
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="decimal"
                className="flex-1 rounded-xl p-3 text-sm text-white outline-none"
                style={{ backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.07)' }}
                placeholder="Latitude (e.g. 35.301)"
                value={manualLat}
                onChange={(e) => setManualLat(e.target.value)}
              />
              <input
                type="text"
                inputMode="decimal"
                className="flex-1 rounded-xl p-3 text-sm text-white outline-none"
                style={{ backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.07)' }}
                placeholder="Longitude (e.g. -81.069)"
                value={manualLng}
                onChange={(e) => setManualLng(e.target.value)}
              />
            </div>
            <button
              className="w-full rounded-xl p-3 font-bold text-white text-sm"
              style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
              onClick={applyManualCoords}
            >
              Use These Coordinates
            </button>
          </div>
        )}
      </div>

      {/* Store type */}
      <div className="mx-5 mb-6">
        <p className="text-xs font-bold text-white/35 mb-2" style={{ letterSpacing: '1.5px' }}>
          STORE TYPE *
        </p>
        <div className="flex flex-wrap gap-2.5">
          {STORE_TYPES.map((t) => (
            <button
              key={t.value}
              className="flex items-center gap-2 rounded-xl px-3.5 py-3"
              style={{
                backgroundColor: type === t.value ? 'rgba(34,197,94,0.08)' : '#1a1a24',
                border: `1.5px solid ${type === t.value ? '#22c55e' : 'transparent'}`,
                minWidth: '47%',
              }}
              onClick={() => setType(t.value)}
            >
              <span style={{ fontSize: 18 }}>{t.icon}</span>
              <span
                className="text-sm font-semibold"
                style={{ color: type === t.value ? '#fff' : 'rgba(255,255,255,0.5)' }}
              >
                {t.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Review notice */}
      <div
        className="flex items-start gap-2.5 mx-5 mb-6 rounded-xl p-3.5"
        style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        <span style={{ fontSize: 16 }}>🔍</span>
        <p className="text-sm text-white/40 leading-relaxed flex-1">
          Stores are reviewed before appearing on the map to keep data accurate.
        </p>
      </div>

      {/* Submit */}
      <button
        className="mx-5 w-[calc(100%-40px)] rounded-2xl p-4 font-bold text-white text-base flex items-center justify-center"
        style={{
          backgroundColor:
            !name.trim() || !address.trim() || !type || !coords || submitting
              ? 'rgba(255,255,255,0.08)'
              : '#22c55e',
        }}
        onClick={handleSubmit}
        disabled={!name.trim() || !address.trim() || !type || !coords || submitting}
      >
        {submitting ? (
          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
        ) : (
          'Submit Store →'
        )}
      </button>
      </div>

      {/* Duplicate store modal */}
      {duplicate && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={() => setDuplicate(null)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl p-6 pb-10"
            style={{ backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.08)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-9 h-1 rounded-sm mx-auto mb-5" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }} />
            <div className="flex items-center gap-3 mb-3">
              <span style={{ fontSize: 32 }}>{duplicate === 'approved' ? '🗺️' : '⏳'}</span>
              <p className="text-lg font-black text-white">
                {duplicate === 'approved' ? 'Already on the Map' : 'Already Submitted'}
              </p>
            </div>
            <p className="text-sm text-white/50 leading-relaxed mb-6">
              {duplicate === 'approved'
                ? 'This store already exists on the map. You can find it by searching nearby stores.'
                : 'This store has already been submitted and is currently pending approval. Check back soon!'}
            </p>
            <button
              className="w-full rounded-2xl p-4 font-bold text-white"
              style={{ backgroundColor: '#22c55e' }}
              onClick={() => setDuplicate(null)}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
