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
  { value: 'out', label: 'Out of Stock', emoji: '❌', color: '#ef4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.25)' },
  { value: 'low', label: 'Low', emoji: '🟡', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)' },
  { value: 'medium', label: 'Medium', emoji: '🟠', color: '#f97316', bg: 'rgba(249,115,22,0.08)', border: 'rgba(249,115,22,0.25)' },
  { value: 'full', label: 'Full', emoji: '✅', color: '#22c55e', bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.25)' },
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
    <div className="min-h-screen px-6" style={{ backgroundColor: '#070710', position: 'relative', paddingTop: "calc(56px + env(safe-area-inset-top))" }}>
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, background: 'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(34,197,94,0.08) 0%, transparent 60%)', pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)', backgroundSize: '40px 40px', pointerEvents: 'none' }} />
      <button
        onClick={() => router.back()}
        className="w-9 h-9 rounded-xl flex items-center justify-center mb-10"
        style={{ backgroundColor: 'rgba(255,255,255,0.07)' }}
      >
        <span className="text-white text-lg">←</span>
      </button>

      <div className="flex flex-col items-center text-center w-full" style={{ marginTop: -40 }}>
        <p
          className="text-xs font-bold mb-2.5"
          style={{ color: 'rgba(255,255,255,0.3)', letterSpacing: '1.5px' }}
        >
          AT {storeName?.toUpperCase()}
        </p>
        <p className="text-2xl font-black text-white text-center">{drinkFlavor}</p>
        <p className="text-sm text-white/40 mt-1 mb-2.5">{drinkName}</p>
        <p className="text-base text-white/45 mb-8">How much is left?</p>

        {limitError ? (
          <div
            className="w-full rounded-2xl p-5 flex flex-col items-center gap-3 text-center"
            style={{ backgroundColor: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.25)' }}
          >
            <span style={{ fontSize: 36 }}>🔥</span>
            <p className="text-base font-black text-white">Daily limit reached</p>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>
              You've hit the 25 report/day limit. Upgrade to Tracker for unlimited reports.
            </p>
            <button
              onClick={() => router.push('/account')}
              className="mt-1 text-sm font-bold px-4 py-2 rounded-full"
              style={{ backgroundColor: 'rgba(249,115,22,0.15)', color: '#f97316', border: '1px solid rgba(249,115,22,0.3)' }}
            >
              Upgrade to Tracker →
            </button>
          </div>
        ) : rateLimited ? (
          <div
            className="w-full rounded-2xl p-5 flex flex-col items-center gap-3 text-center"
            style={{ backgroundColor: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}
          >
            <span style={{ fontSize: 36 }}>⏱️</span>
            <p className="text-base font-black text-white">Already reported</p>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>
              You already reported this drink here in the last 30 minutes. Come back later!
            </p>
            <button
              onClick={() => router.back()}
              className="mt-1 text-sm font-bold px-4 py-2 rounded-full"
              style={{ backgroundColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }}
            >
              ← Go Back
            </button>
          </div>
        ) : submitting ? (
          <div className="w-8 h-8 border-2 border-[#22c55e] border-t-transparent rounded-full animate-spin mt-10" />
        ) : (
          <div className="flex flex-col gap-3 w-full">
            {QUANTITY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className="flex items-center gap-3.5 rounded-2xl p-4 w-full text-left"
                style={{
                  backgroundColor: opt.bg,
                  border: `1.5px solid ${opt.border}`,
                }}
                onClick={() => submitReport(opt.value)}
              >
                <span style={{ fontSize: 24 }}>{opt.emoji}</span>
                <span className="text-lg font-bold" style={{ color: opt.color }}>
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
