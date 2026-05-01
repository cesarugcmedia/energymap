'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Quantity } from '@/lib/types'

const QUANTITY_CONFIG: Record<Quantity, { label: string; color: string; bg: string; border: string }> = {
  out:    { label: 'OUT',  color: '#FF4545', bg: 'rgba(255,69,69,0.08)',  border: 'rgba(255,69,69,0.25)'  },
  low:    { label: 'LOW',  color: '#FFB300', bg: 'rgba(255,179,0,0.08)',  border: 'rgba(255,179,0,0.25)'  },
  medium: { label: 'MED',  color: '#FFB300', bg: 'rgba(255,179,0,0.08)',  border: 'rgba(255,179,0,0.25)'  },
  full:   { label: 'FULL', color: 'var(--accent)', bg: 'rgba(201,244,0,0.08)',  border: 'rgba(201,244,0,0.25)'  },
}

function ResultContent() {
  const router = useRouter()
  const params = useSearchParams()
  const storeId = params.get('storeId') ?? ''
  const storeName = params.get('storeName') ?? ''
  const count = params.get('count') ? parseInt(params.get('count')!) : null

  const [stock, setStock] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchStock()
    const channel = supabase
      .channel(`result-stock:${storeId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'stock_reports', filter: `store_id=eq.${storeId}` }, fetchStock)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [storeId])

  async function fetchStock() {
    const { data: stockData } = await supabase
      .from('latest_stock')
      .select('drink_id, quantity, reported_at')
      .eq('store_id', storeId)
    if (stockData && stockData.length > 0) {
      const drinkIds = [...new Set(stockData.map((d) => d.drink_id).filter(Boolean))]
      const { data: drinksData } = await supabase
        .from('drinks')
        .select('id, name, brand, flavor')
        .in('id', drinkIds)
      const drinksMap: Record<string, any> = {}
      drinksData?.forEach((d) => { drinksMap[d.id] = d })
      setStock(stockData.map((s) => ({ ...s, drink: drinksMap[s.drink_id] ?? null })))
    } else {
      setStock([])
    }
    setLoading(false)
  }

  const grouped = stock.reduce<Record<string, any[]>>((acc, item) => {
    const brand = item.drink?.brand ?? 'Other'
    if (!acc[brand]) acc[brand] = []
    acc[brand].push(item)
    return acc
  }, {})

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg)', position: 'relative', overflowX: 'hidden', color: '#F0F4E8' }}>
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, background: 'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(201,244,0,0.07) 0%, transparent 60%)', pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, backgroundImage: 'linear-gradient(rgba(201,244,0,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(201,244,0,0.03) 1px, transparent 1px)', backgroundSize: '32px 32px', pointerEvents: 'none' }} />

      <div style={{ position: 'relative', zIndex: 1, paddingBottom: 80 }}>

        {/* ── Success hero ──────────────────────────────────────────── */}
        <div style={{ padding: 'calc(env(safe-area-inset-top) + 48px) 16px 24px', textAlign: 'center' }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%', margin: '0 auto 16px',
            background: 'rgba(201,244,0,0.1)',
            border: '1.5px solid rgba(201,244,0,0.4)',
            boxShadow: '0 0 30px rgba(201,244,0,0.25), 0 0 60px rgba(201,244,0,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 32,
          }}>
            ⚡
          </div>
          <p style={{ margin: '0 0 6px', fontSize: 26, fontWeight: 800, color: '#F0F4E8', fontFamily: "'Barlow Condensed', sans-serif", textTransform: 'uppercase', letterSpacing: '0.02em' }}>
            {count !== null ? `${count} Report${count !== 1 ? 's' : ''} Submitted!` : 'Report Submitted!'}
          </p>
          <p style={{ margin: 0, fontSize: 13, color: '#7A8F80' }}>
            Thanks for updating <span style={{ color: '#F0F4E8', fontWeight: 600 }}>{storeName}</span>
          </p>
        </div>

        {/* ── Current stock snapshot ────────────────────────────────── */}
        <div style={{ padding: '0 16px' }}>
          <p style={{ margin: '0 0 12px', fontSize: 11, fontWeight: 700, color: '#4A5F50', letterSpacing: '0.14em', fontFamily: "'Barlow Condensed', sans-serif", textTransform: 'uppercase' }}>
            Current Stock at {storeName}
          </p>

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 24 }}>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              <div style={{ width: 28, height: 28, border: '2px solid #C9F400', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            </div>
          ) : stock.length === 0 ? (
            <p style={{ fontSize: 13, color: '#4A5F50', textAlign: 'center', marginTop: 20 }}>
              No other reports for this store yet.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {Object.entries(grouped).map(([brand, items]) => (
                <div key={brand}>
                  <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: '#4A5F50', letterSpacing: '0.14em', fontFamily: "'Barlow Condensed', sans-serif", textTransform: 'uppercase' }}>
                    {brand}
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {items.map((item) => {
                      const q = QUANTITY_CONFIG[item.quantity as Quantity]
                      return (
                        <div
                          key={item.drink_id}
                          style={{
                            display: 'flex', alignItems: 'center',
                            padding: '12px 14px',
                            borderRadius: 12,
                            backgroundColor: 'var(--surface)',
                            border: `1px solid ${q?.border ?? 'rgba(201,244,0,0.1)'}`,
                          }}
                        >
                          <div style={{ flex: 1 }}>
                            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#F0F4E8' }}>
                              {item.drink?.flavor ?? item.drink?.name}
                            </p>
                          </div>
                          <div style={{
                            padding: '4px 10px', borderRadius: 999,
                            backgroundColor: q?.bg, border: `1px solid ${q?.border}`,
                          }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: q?.color, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.06em' }}>{q?.label}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Actions ───────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '24px 16px 0' }}>
          <button
            style={{
              width: '100%', borderRadius: 14, padding: '14px 0', cursor: 'pointer',
              backgroundColor: '#C9F400', border: 'none',
              fontSize: 14, fontWeight: 800, color: '#0D1210',
              fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.08em', textTransform: 'uppercase',
              boxShadow: '0 0 20px rgba(201,244,0,0.35)',
            }}
            onClick={() => router.replace(`/submit/drinks?storeId=${storeId}&storeName=${encodeURIComponent(storeName)}`)}
          >
            ⚡ Report More Drinks
          </button>
          <button
            style={{
              width: '100%', borderRadius: 14, padding: '14px 0', cursor: 'pointer',
              backgroundColor: 'var(--surface)',
              border: '1px solid rgba(201,244,0,0.12)',
              fontSize: 14, fontWeight: 700, color: '#7A8F80',
              fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.06em', textTransform: 'uppercase',
            }}
            onClick={() => router.replace(`/store/${storeId}?name=${encodeURIComponent(storeName)}`)}
          >
            View Store
          </button>
          <button
            style={{
              width: '100%', borderRadius: 14, padding: '12px 0', cursor: 'pointer',
              background: 'none', border: 'none',
              fontSize: 13, fontWeight: 500, color: '#4A5F50',
            }}
            onClick={() => router.replace('/')}
          >
            Back to Map
          </button>
        </div>
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
