'use client'

import ui from '@/components/ui/ui.module.css'
import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { StoreTypeIcon, PinIcon, SearchIcon, CheckIcon, ChevronLeftIcon } from '@/components/Icons'

const STORE_TYPES = [
  { value: 'gas_station', label: 'Gas Station' },
  { value: 'convenience', label: 'Convenience Store' },
  { value: 'grocery', label: 'Grocery Store' },
  { value: 'other', label: 'Other' },
]

export default function AddStorePage() {
  const router = useRouter()
  const { user, profile, loading: authLoading } = useAuth()
  const isTracker = profile?.is_admin || profile?.tier === 'tracker'

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

    // Daily limit for free tier
    if (!isTracker && user) {
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
      const { count } = await supabase
        .from('stores')
        .select('id', { count: 'exact', head: true })
        .eq('submitted_by', user.id)
        .gte('created_at', todayStart.toISOString())
      if ((count ?? 0) >= 10) {
        setError("You've reached the daily limit of 10 store submissions. Upgrade to Tracker for unlimited store submissions.")
        setSubmitting(false)
        return
      }
    }

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

  const inputStyle = { width: '100%', borderRadius: 12, padding: '14px', color: 'var(--text)', fontSize: 15, outline: 'none', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', fontFamily: "'Barlow', sans-serif" }
  const labelStyle = { fontSize: 14, fontWeight: 500, color: 'var(--text)', marginBottom: 8, display: 'block' }

  if (submitted) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg)', color: 'var(--text)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 32px', textAlign: 'center' }}>
        <span style={{ width: 64, height: 64, borderRadius: '50%', marginBottom: 16, background: 'rgba(201,244,0,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--accent-text)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
        </span>
        <p style={{ fontSize: 24, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>Store sent for review</p>
        <p style={{ fontSize: 15, color: 'var(--text-muted)', marginBottom: 32, lineHeight: 1.6 }}>
          Thanks! Your store will appear on the map once it&apos;s been reviewed.
        </p>
        <button
          className={`${ui.btnPrimary} ${ui.btnBlock} ${ui.btnLarge}`}
          style={{ marginBottom: 10 }}
          onClick={() => router.replace('/')}
        >
          Back to map
        </button>
        <button
          className={`${ui.btnSecondary} ${ui.btnBlock} ${ui.btnLarge}`}
          onClick={() => {
            setName('')
            setAddress('')
            setType(null)
            setCoords(null)
            setSubmitted(false)
          }}
        >
          Add another store
        </button>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg)', color: 'var(--text)', position: 'relative', overflowX: 'hidden' }}>
      <style>{`@keyframes fadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ position: 'relative', zIndex: 1, overflowY: 'auto', paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 'calc(56px + env(safe-area-inset-top)) 20px 16px' }}>
        <button
          onClick={() => router.back()}
          style={{ width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', cursor: 'pointer', flexShrink: 0 }}
        >
          <ChevronLeftIcon size={18} color="var(--text)" />
        </button>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, color: 'var(--text)', lineHeight: 1.1 }}>Add a store</h1>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 3 }}>Missing a store? Add it to the map.</p>
        </div>
      </div>

      {error && (
        <div style={{ margin: '0 20px 16px', padding: 12, borderRadius: 10, backgroundColor: 'rgba(255,69,69,0.1)', border: '1px solid rgba(255,69,69,0.25)' }}>
          <p style={{ fontSize: 13, color: '#FF4545' }}>{error}</p>
        </div>
      )}

      {/* Store name */}
      <div style={{ margin: '0 20px 24px' }}>
        <span style={labelStyle}>Store Name *</span>
        <input
          type="text"
          style={inputStyle}
          placeholder="e.g. Circle K, Shell Station"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      {/* Address */}
      <div style={{ margin: '0 20px 24px' }}>
        <span style={labelStyle}>Store Address *</span>
        <textarea
          style={{ ...inputStyle, minHeight: 60, resize: 'none' as const }}
          placeholder="e.g. 703 Tuckaseege Rd, Mount Holly, NC 28120"
          value={address}
          rows={2}
          onChange={(e) => {
            setAddress(e.target.value)
            setCoords(null)
          }}
        />
        <p style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 6 }}>
          Include street number, city and state for best results
        </p>

        <button
          style={{ marginTop: 10, width: '100%', borderRadius: 12, padding: '14px', fontWeight: 800, color: 'var(--text)', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: geocoding ? 'not-allowed' : 'pointer', backgroundColor: geocoding ? 'rgba(59,130,246,0.4)' : '#3b82f6' }}
          onClick={geocodeAddress}
          disabled={geocoding}
        >
          {geocoding ? (
            <div style={{ width: 16, height: 16, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          ) : coords ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><CheckIcon size={14} color="#fff" /> Verified — Re-verify</span>
          ) : (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><SearchIcon size={14} color="#fff" /> Verify Address</span>
          )}
        </button>

        {coords && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, borderRadius: 12, padding: 12, backgroundColor: 'rgba(201,244,0,0.08)', border: '1px solid rgba(201,244,0,0.25)' }}>
            <PinIcon size={20} color="var(--accent)" />
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-text)' }}>Location found!</p>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
                {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
              </p>
            </div>
          </div>
        )}

        {/* Manual coordinates fallback */}
        <button
          style={{ marginTop: 12, background: 'none', border: 'none', fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}
          onClick={() => setManualCoords((v) => !v)}
        >
          {manualCoords ? 'Hide manual entry' : "Can't find address? Enter coordinates manually"}
        </button>

        {manualCoords && (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                inputMode="decimal"
                style={{ ...inputStyle, flex: 1 }}
                placeholder="Latitude (e.g. 35.301)"
                value={manualLat}
                onChange={(e) => setManualLat(e.target.value)}
              />
              <input
                type="text"
                inputMode="decimal"
                style={{ ...inputStyle, flex: 1 }}
                placeholder="Longitude (e.g. -81.069)"
                value={manualLng}
                onChange={(e) => setManualLng(e.target.value)}
              />
            </div>
            <button
              style={{ width: '100%', borderRadius: 12, padding: 12, fontWeight: 700, color: 'var(--text)', fontSize: 13, border: '1px solid var(--border)', cursor: 'pointer', backgroundColor: 'var(--surface)' }}
              onClick={applyManualCoords}
            >
              Use These Coordinates
            </button>
          </div>
        )}
      </div>

      {/* Store type */}
      <div style={{ margin: '0 20px 24px' }}>
        <span style={labelStyle}>Store Type *</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {STORE_TYPES.map((t) => (
            <button
              key={t.value}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, borderRadius: 12, padding: '12px 14px', cursor: 'pointer',
                backgroundColor: type === t.value ? 'rgba(201,244,0,0.08)' : 'var(--surface)',
                border: `1.5px solid ${type === t.value ? '#C9F400' : 'var(--border)'}`,
                minWidth: '47%',
              }}
              onClick={() => setType(t.value)}
            >
              <StoreTypeIcon type={t.value} size={18} color={type === t.value ? 'var(--accent-text)' : 'var(--text-muted)'} />
              <span
                style={{ fontSize: 14, fontWeight: 700, color: type === t.value ? '#F0F4E8' : 'var(--text-muted)' }}
              >
                {t.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Review notice */}
      <div
        style={{ display: 'flex', alignItems: 'flex-start', gap: 10, margin: '0 20px 24px', borderRadius: 12, padding: 14, backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <SearchIcon size={16} color="var(--text-muted)" />
        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, flex: 1 }}>
          Stores are reviewed before appearing on the map to keep data accurate.
        </p>
      </div>

      {/* Submit */}
      <div style={{ padding: '0 20px' }}>
        <button
          style={{
            width: '100%', borderRadius: 12, minHeight: 52, fontWeight: 600, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none',
            cursor: !name.trim() || !address.trim() || !type || !coords || submitting ? 'not-allowed' : 'pointer',
            backgroundColor: !name.trim() || !address.trim() || !type || !coords || submitting ? 'rgba(201,244,0,0.4)' : '#C9F400',
            color: '#0D1210',
            boxShadow: 'none',
                                  }}
          onClick={handleSubmit}
          disabled={!name.trim() || !address.trim() || !type || !coords || submitting}
        >
          {submitting ? (
            <div style={{ width: 20, height: 20, border: '2px solid #0D1210', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          ) : (
            'Submit store'
          )}
        </button>
      </div>
      </div>

      {/* Duplicate store modal (portaled so the tab bar can't cover it) */}
      {duplicate && createPortal(
        <div
          className="anim-fade"
          style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={() => setDuplicate(null)}
        >
          <div
            className="anim-sheet"
            style={{ width: '100%', maxWidth: 480, borderRadius: '24px 24px 0 0', padding: '24px 24px 40px', backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ width: 36, height: 4, borderRadius: 2, margin: '0 auto 20px', backgroundColor: 'var(--fg-20)' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <span style={{ fontSize: 32 }}>{duplicate === 'approved' ? '🗺️' : '⏳'}</span>
              <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)' }}>
                {duplicate === 'approved' ? 'Already on the Map' : 'Already Submitted'}
              </p>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 24 }}>
              {duplicate === 'approved'
                ? 'This store already exists on the map. You can find it by searching nearby stores.'
                : 'This store has already been submitted and is currently pending approval. Check back soon!'}
            </p>
            <button
              style={{ width: '100%', borderRadius: 14, padding: '16px', fontWeight: 800, color: '#0D1210', fontSize: 15, border: 'none', cursor: 'pointer', backgroundColor: '#C9F400' }}
              onClick={() => setDuplicate(null)}
            >
              Got it
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
