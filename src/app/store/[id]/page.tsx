'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Quantity } from '@/lib/types'

const TYPE_ICON: Record<string, string> = {
  gas_station: '⛽',
  convenience: '🏪',
  grocery: '🛒',
  other: '📍',
}

const QUANTITY_CONFIG: Record<Quantity, { label: string; color: string; bg: string; border: string }> = {
  out: { label: 'OUT', color: '#ef4444', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.25)' },
  low: { label: 'LOW', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.25)' },
  medium: { label: 'MED', color: '#f97316', bg: 'rgba(249,115,22,0.1)', border: 'rgba(249,115,22,0.25)' },
  full: { label: 'FULL', color: '#22c55e', bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.25)' },
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function stalenessColor(dateStr: string) {
  const hrs = (Date.now() - new Date(dateStr).getTime()) / 3600000
  if (hrs < 2) return '#22c55e'
  if (hrs < 12) return '#f59e0b'
  return '#ef4444'
}

function stalenessLabel(dateStr: string) {
  const hrs = (Date.now() - new Date(dateStr).getTime()) / 3600000
  if (hrs < 2) return 'Fresh'
  if (hrs < 12) return 'Aging'
  return 'Stale'
}

function StoreDetailContent({ id }: { id: string }) {
  const router = useRouter()
  const params = useSearchParams()
  const name = params.get('name') ?? ''

  const [stock, setStock] = useState<any[]>([])
  const [store, setStore] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchStore()
    fetchStock()

    const channel = supabase
      .channel(`store-detail:${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'stock_reports', filter: `store_id=eq.${id}` }, fetchStock)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [id])

  async function fetchStore() {
    const { data } = await supabase.from('stores').select('*').eq('id', id).single()
    if (data) setStore(data)
  }

  async function fetchStock() {
    const { data } = await supabase
      .from('latest_stock')
      .select('*, drink:drinks(name, brand, flavor)')
      .eq('store_id', id)
    if (data) setStock(data)
    setLoading(false)
  }

  const inStockItems = stock.filter((s) => s.quantity !== 'out')
  const outOfStockItems = stock.filter((s) => s.quantity === 'out')

  const latestReport = stock.reduce<any>((latest, item) => {
    if (!latest) return item
    return new Date(item.reported_at) > new Date(latest.reported_at) ? item : latest
  }, null)

  const grouped = (items: any[]) =>
    items.reduce<Record<string, any[]>>((acc, item) => {
      const brand = item.drink?.brand ?? 'Other'
      if (!acc[brand]) acc[brand] = []
      acc[brand].push(item)
      return acc
    }, {})

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      {/* Header */}
      <div className="px-5 pt-14 pb-4">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 rounded-xl flex items-center justify-center mb-4"
          style={{ backgroundColor: 'rgba(255,255,255,0.07)' }}
        >
          <span className="text-white text-lg">←</span>
        </button>

        <div className="flex items-center gap-3 mb-3">
          <span style={{ fontSize: 32 }}>{store ? TYPE_ICON[store.type] : '📍'}</span>
          <div className="flex-1">
            <p className="text-xl font-black text-white">{name}</p>
            {store && <p className="text-xs text-white/40 mt-0.5">{store.address}</p>}
          </div>
        </div>

        {latestReport && (
          <div
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full"
            style={{ border: `1px solid ${stalenessColor(latestReport.reported_at)}` }}
          >
            <div
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: stalenessColor(latestReport.reported_at) }}
            />
            <span className="text-xs font-semibold" style={{ color: stalenessColor(latestReport.reported_at) }}>
              {stalenessLabel(latestReport.reported_at)} · {timeAgo(latestReport.reported_at)}
            </span>
          </div>
        )}
      </div>

      {/* Report button */}
      <button
        className="mx-4 mb-4 w-[calc(100%-32px)] rounded-2xl p-3.5 font-bold text-white text-base"
        style={{ backgroundColor: '#22c55e' }}
        onClick={() =>
          router.push(`/submit/drinks?storeId=${id}&storeName=${encodeURIComponent(name)}`)
        }
      >
        ⚡ Report Stock Here
      </button>

      {loading ? (
        <div className="flex justify-center mt-8">
          <div className="w-8 h-8 border-2 border-[#22c55e] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : stock.length === 0 ? (
        <div className="flex flex-col items-center gap-3 mt-16">
          <span style={{ fontSize: 40 }}>📭</span>
          <p className="text-lg font-bold text-white">No reports yet</p>
          <p className="text-sm text-white/40">Be the first to report stock here!</p>
        </div>
      ) : (
        <div className="px-4 pb-16">
          {inStockItems.length > 0 && (
            <div className="mb-6">
              <p className="text-xs font-bold text-white/40 mb-2.5" style={{ letterSpacing: 1 }}>
                ✅ AVAILABLE ({inStockItems.length})
              </p>
              {Object.entries(grouped(inStockItems)).map(([brand, items]) => (
                <div key={brand} className="mb-3">
                  <p className="text-[10px] font-bold text-white/25 mb-1.5" style={{ letterSpacing: 1 }}>
                    {brand.toUpperCase()}
                  </p>
                  {items.map((item) => {
                    const q = QUANTITY_CONFIG[item.quantity as Quantity]
                    const freshColor = stalenessColor(item.reported_at)
                    return (
                      <div
                        key={item.drink_id}
                        className="flex items-center rounded-xl p-3.5 mb-1.5"
                        style={{ backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.06)' }}
                      >
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-white">{item.drink?.flavor}</p>
                          <div className="flex items-center gap-1.5 mt-1">
                            <div className="w-1 h-1 rounded-full" style={{ backgroundColor: freshColor }} />
                            <p className="text-xs font-semibold" style={{ color: freshColor }}>
                              {timeAgo(item.reported_at)}
                            </p>
                          </div>
                        </div>
                        <div
                          className="px-2.5 py-1 rounded-full"
                          style={{ backgroundColor: q?.bg, border: `1px solid ${q?.border}` }}
                        >
                          <span className="text-[10px] font-bold" style={{ color: q?.color }}>{q?.label}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}

          {outOfStockItems.length > 0 && (
            <div className="mb-6">
              <p className="text-xs font-bold text-white/40 mb-2.5" style={{ letterSpacing: 1 }}>
                ❌ OUT OF STOCK ({outOfStockItems.length})
              </p>
              {Object.entries(grouped(outOfStockItems)).map(([brand, items]) => (
                <div key={brand} className="mb-3">
                  <p className="text-[10px] font-bold text-white/25 mb-1.5" style={{ letterSpacing: 1 }}>
                    {brand.toUpperCase()}
                  </p>
                  {items.map((item) => {
                    const freshColor = stalenessColor(item.reported_at)
                    return (
                      <div
                        key={item.drink_id}
                        className="flex items-center rounded-xl p-3.5 mb-1.5"
                        style={{ backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.06)' }}
                      >
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-white">{item.drink?.flavor}</p>
                          <div className="flex items-center gap-1.5 mt-1">
                            <div className="w-1 h-1 rounded-full" style={{ backgroundColor: freshColor }} />
                            <p className="text-xs font-semibold" style={{ color: freshColor }}>
                              {timeAgo(item.reported_at)}
                            </p>
                          </div>
                        </div>
                        <div
                          className="px-2.5 py-1 rounded-full"
                          style={{ backgroundColor: QUANTITY_CONFIG.out.bg, border: `1px solid ${QUANTITY_CONFIG.out.border}` }}
                        >
                          <span className="text-[10px] font-bold" style={{ color: QUANTITY_CONFIG.out.color }}>OUT</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function StoreDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState<string | null>(null)

  useEffect(() => {
    params.then((p) => setId(p.id))
  }, [params])

  if (!id) return null

  return (
    <Suspense>
      <StoreDetailContent id={id} />
    </Suspense>
  )
}
