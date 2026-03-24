'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Quantity } from '@/lib/types'

const QUANTITY_CONFIG: Record<Quantity, { label: string; color: string; bg: string; border: string }> = {
  out: { label: 'OUT', color: '#ef4444', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.25)' },
  low: { label: 'LOW', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.25)' },
  medium: { label: 'MED', color: '#f97316', bg: 'rgba(249,115,22,0.1)', border: 'rgba(249,115,22,0.25)' },
  full: { label: 'FULL', color: '#22c55e', bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.25)' },
}

function ResultContent() {
  const router = useRouter()
  const params = useSearchParams()
  const storeId = params.get('storeId') ?? ''
  const storeName = params.get('storeName') ?? ''
  const drinkName = params.get('drinkName') ?? ''
  const drinkFlavor = params.get('drinkFlavor') ?? ''
  const quantity = (params.get('quantity') ?? 'full') as Quantity

  const [stock, setStock] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const config = QUANTITY_CONFIG[quantity]

  useEffect(() => {
    fetchStock()
    const channel = supabase
      .channel(`result-stock:${storeId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'stock_reports', filter: `store_id=eq.${storeId}` }, fetchStock)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [storeId])

  async function fetchStock() {
    const { data } = await supabase
      .from('latest_stock')
      .select('*, drink:drinks(name, brand, flavor)')
      .eq('store_id', storeId)
    if (data) setStock(data)
    setLoading(false)
  }

  const grouped = stock.reduce<Record<string, any[]>>((acc, item) => {
    const brand = item.drink?.brand ?? 'Other'
    if (!acc[brand]) acc[brand] = []
    acc[brand].push(item)
    return acc
  }, {})

  return (
    <div className="min-h-screen bg-[#0a0a0f] overflow-y-auto pb-16">
      {/* Banner */}
      <div
        className="flex items-center gap-3.5 mx-5 mt-16 rounded-2xl p-4"
        style={{ backgroundColor: config?.bg, border: `1px solid ${config?.border}` }}
      >
        <span style={{ fontSize: 32 }}>⚡</span>
        <div>
          <p className="text-base font-bold text-white">Report submitted!</p>
          <p className="text-xs text-white/45 mt-0.5">{drinkFlavor} — {config?.label}</p>
        </div>
      </div>

      <p className="text-xs font-bold px-5 mt-4" style={{ color: 'rgba(255,255,255,0.3)', letterSpacing: '1.5px' }}>
        CURRENT STOCK AT
      </p>
      <p className="text-xl font-black text-white px-5 mt-1 mb-4">{storeName}</p>

      {loading ? (
        <div className="flex justify-center mt-6">
          <div className="w-8 h-8 border-2 border-[#22c55e] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : stock.length === 0 ? (
        <p className="text-center text-white/30 mt-6 text-sm">No other reports yet for this store.</p>
      ) : (
        Object.entries(grouped).map(([brand, items]) => (
          <div key={brand} className="px-5 mb-5">
            <p className="text-xs font-bold text-white/30 mb-2" style={{ letterSpacing: 1 }}>
              {brand.toUpperCase()}
            </p>
            {items.map((item) => {
              const q = QUANTITY_CONFIG[item.quantity as Quantity]
              return (
                <div
                  key={item.drink_id}
                  className="flex items-center rounded-xl mb-2 p-3.5"
                  style={{ backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-white">{item.drink?.flavor}</p>
                    <p className="text-xs text-white/35 mt-0.5">{item.drink?.brand}</p>
                  </div>
                  <div
                    className="px-2.5 py-1 rounded-full"
                    style={{ backgroundColor: q?.bg, border: `1px solid ${q?.border}` }}
                  >
                    <span className="text-xs font-bold" style={{ color: q?.color }}>{q?.label}</span>
                  </div>
                </div>
              )
            })}
          </div>
        ))
      )}

      <div className="flex flex-col gap-2.5 px-5 mt-4">
        <button
          className="w-full rounded-2xl p-3.5 font-bold text-[#22c55e]"
          style={{ backgroundColor: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)' }}
          onClick={() =>
            router.replace(`/submit/drinks?storeId=${storeId}&storeName=${encodeURIComponent(storeName)}`)
          }
        >
          Report Another Drink
        </button>
        <button
          className="w-full rounded-2xl p-3.5 font-semibold"
          style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)' }}
          onClick={() => router.replace('/')}
        >
          Back to Map
        </button>
      </div>
    </div>
  )
}

export default function ResultPage() {
  return (
    <Suspense>
      <ResultContent />
    </Suspense>
  )
}
