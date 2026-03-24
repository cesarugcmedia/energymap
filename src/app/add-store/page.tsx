'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const STORE_TYPES = [
  { value: 'gas_station', label: 'Gas Station', icon: '⛽' },
  { value: 'convenience', label: 'Convenience Store', icon: '🏪' },
  { value: 'grocery', label: 'Grocery Store', icon: '🛒' },
  { value: 'other', label: 'Other', icon: '📍' },
]

export default function AddStorePage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [type, setType] = useState<string | null>(null)
  const [geocoding, setGeocoding] = useState(false)
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function geocodeAddress() {
    if (!address.trim()) {
      setError('Please enter a store address first.')
      return
    }
    setError(null)
    setGeocoding(true)
    setCoords(null)

    try {
      const query = encodeURIComponent(address.trim())
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`,
        { headers: { 'User-Agent': 'EnergyMapApp/1.0' } }
      )
      const data = await res.json()

      if (!data || data.length === 0) {
        setError('Address not found. Try adding more detail like city and state.')
        setGeocoding(false)
        return
      }

      setCoords({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) })
    } catch {
      setError('Could not look up address. Check your internet connection.')
    }

    setGeocoding(false)
  }

  async function handleSubmit() {
    if (!name.trim() || !address.trim() || !type || !coords) {
      setError('Please fill all fields and verify the address.')
      return
    }
    setError(null)
    setSubmitting(true)

    const { error: dbError } = await supabase.from('stores').insert({
      name: name.trim(),
      address: address.trim(),
      type,
      lat: coords.lat,
      lng: coords.lng,
      status: 'pending',
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
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#0a0a0f] px-8 text-center">
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
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] overflow-y-auto pb-16">
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
          <p className="text-xl font-black text-white">Add a Store</p>
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
  )
}
