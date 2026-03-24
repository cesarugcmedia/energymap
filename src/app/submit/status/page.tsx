'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
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

  const [submitting, setSubmitting] = useState(false)

  async function submitReport(quantity: Quantity) {
    setSubmitting(true)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('stock_reports').insert({ store_id: storeId, drink_id: drinkId, quantity, user_id: user?.id ?? null })
    router.replace(
      `/submit/result?storeId=${storeId}&storeName=${encodeURIComponent(storeName)}&drinkName=${encodeURIComponent(drinkName)}&drinkFlavor=${encodeURIComponent(drinkFlavor)}&quantity=${quantity}`
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] px-6" style={{ paddingTop: "calc(56px + env(safe-area-inset-top))" }}>
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

        {submitting ? (
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
