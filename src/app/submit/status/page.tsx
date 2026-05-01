'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Quantity } from '@/lib/types'

const QUANTITY_OPTIONS: {
  value: Quantity
  label: string
  emoji: string
  color: string
  bg: string
  border: string
}[] = [
  { value: 'out', label: 'Out of Stock', emoji: '❌', color: '#FF4545', bg: 'rgba(255,69,69,0.08)', border: 'rgba(255,69,69,0.25)' },
  { value: 'low', label: 'Low', emoji: '🟡', color: '#FFB300', bg: 'rgba(255,179,0,0.08)', border: 'rgba(255,179,0,0.25)' },
  { value: 'medium', label: 'Medium', emoji: '🟠', color: '#FFB300', bg: 'rgba(255,179,0,0.08)',  border: 'rgba(255,179,0,0.25)'  },
  { value: 'full', label: 'Full', emoji: '✅', color: '#C9F400', bg: 'rgba(201,244,0,0.08)', border: 'rgba(201,244,0,0.25)' },
]

function StatusContent() {
  const router = useRouter()
  const params = useSearchParams()
  const storeId = params.get('storeId') ?? ''
  const storeName = params.get('storeName') ?? ''
  const drinkId = params.get('drinkId') ?? ''
  const drinkName = params.get('drinkName') ?? ''
  const drinkFlavor = params.get('drinkFlavor') ?? ''

  const { profile } = useAuth()
  const isTracker = profile?.is_admin || profile?.tier === 'tracker'

  const [submitting, setSubmitting] = useState(false)
  const [rateLimited, setRateLimited] = useState(false)
  const [limitError, setLimitError] = useState(false)

  async function submitReport(quantity: Quantity) {
    setSubmitting(true)
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
        setLimitError(true)
        setSubmitting(false)
        return
      }
    }

    // Block duplicate reports on same drink+store within 30 minutes
    if (user) {
      const since = new Date(Date.now() - 30 * 60 * 1000).toISOString()
      const { data: recent } = await supabase
        .from('stock_reports')
        .select('id')
        .eq('user_id', user.id)
        .eq('store_id', storeId)
        .eq('drink_id', drinkId)
        .gte('reported_at', since)
        .limit(1)
      if (recent && recent.length > 0) {
        setRateLimited(true)
        setSubmitting(false)
        return
      }
    }

    await supabase.from('stock_reports').insert({ store_id: storeId, drink_id: drinkId, quantity, user_id: user?.id ?? null })
    router.replace(
      `/submit/result?storeId=${storeId}&storeName=${encodeURIComponent(storeName)}&drinkName=${encodeURIComponent(drinkName)}&drinkFlavor=${encodeURIComponent(drinkFlavor)}&quantity=${quantity}`
    )
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#141A1F', color: '#F0F4E8', position: 'relative', padding: 'calc(56px + env(safe-area-inset-top)) 24px 40px' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <button
        onClick={() => router.back()}
        style={{ width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 40, backgroundColor: '#1C2329', border: '1px solid rgba(201,244,0,0.12)', cursor: 'pointer', color: '#F0F4E8', fontSize: 18 }}
      >
        ←
      </button>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', width: '100%', marginTop: -40 }}>
        <p
          style={{ fontSize: 11, fontWeight: 700, color: '#4A5F50', letterSpacing: '0.14em', marginBottom: 10, fontFamily: "'Barlow Condensed', sans-serif", textTransform: 'uppercase' }}
        >
          At {storeName}
        </p>
        <p style={{ fontSize: 26, fontWeight: 800, color: '#F0F4E8', textAlign: 'center', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.02em', textTransform: 'uppercase' }}>{drinkFlavor}</p>
        <p style={{ fontSize: 13, color: '#7A8F80', marginTop: 4, marginBottom: 10 }}>{drinkName}</p>
        <p style={{ fontSize: 16, color: '#7A8F80', marginBottom: 32 }}>How much is left?</p>

        {limitError ? (
          <div
            style={{ width: '100%', borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center', backgroundColor: 'rgba(201,244,0,0.04)', border: '1px solid rgba(201,244,0,0.15)' }}
          >
            <span style={{ fontSize: 36 }}>⚡</span>
            <p style={{ fontSize: 18, fontWeight: 800, color: '#F0F4E8', fontFamily: "'Barlow Condensed', sans-serif", textTransform: 'uppercase', letterSpacing: '0.02em' }}>Daily limit reached</p>
            <p style={{ fontSize: 13, color: '#7A8F80' }}>
              You've hit the 25 report/day limit. Upgrade to Tracker for unlimited reports.
            </p>
            <button
              onClick={() => router.push('/account')}
              style={{ marginTop: 4, fontSize: 13, fontWeight: 800, padding: '10px 20px', borderRadius: 99, backgroundColor: '#C9F400', color: '#0D1210', border: 'none', cursor: 'pointer', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.06em', textTransform: 'uppercase', boxShadow: '0 0 12px rgba(201,244,0,0.3)' }}
            >
              Upgrade to Tracker →
            </button>
          </div>
        ) : rateLimited ? (
          <div
            style={{ width: '100%', borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center', backgroundColor: 'rgba(255,179,0,0.08)', border: '1px solid rgba(255,179,0,0.25)' }}
          >
            <span style={{ fontSize: 36 }}>⏱️</span>
            <p style={{ fontSize: 18, fontWeight: 800, color: '#F0F4E8', fontFamily: "'Barlow Condensed', sans-serif", textTransform: 'uppercase', letterSpacing: '0.02em' }}>Already reported</p>
            <p style={{ fontSize: 13, color: '#7A8F80' }}>
              You already reported this drink here in the last 30 minutes. Come back later!
            </p>
            <button
              onClick={() => router.back()}
              style={{ marginTop: 4, fontSize: 13, fontWeight: 700, padding: '10px 20px', borderRadius: 99, backgroundColor: '#1C2329', color: '#7A8F80', border: '1px solid rgba(201,244,0,0.12)', cursor: 'pointer', fontFamily: "'Barlow Condensed', sans-serif" }}
            >
              ← Go Back
            </button>
          </div>
        ) : submitting ? (
          <div style={{ width: 32, height: 32, border: '2px solid #C9F400', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginTop: 40 }} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
            {QUANTITY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14, borderRadius: 16, padding: 16, width: '100%', textAlign: 'left', cursor: 'pointer', border: `1.5px solid ${opt.border}`,
                  backgroundColor: opt.bg,
                  transition: 'transform 0.1s ease',
                }}
                onClick={() => submitReport(opt.value)}
              >
                <span style={{ fontSize: 24 }}>{opt.emoji}</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: opt.color, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  {opt.label}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function StatusPage() {
  return (
    <Suspense>
      <StatusContent />
    </Suspense>
  )
}
