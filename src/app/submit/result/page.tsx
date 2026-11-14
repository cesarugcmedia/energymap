'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Quantity } from '@/lib/types'
import ui from '@/components/ui/ui.module.css'

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

  // Tick the headline count up from 0 for a little celebration (instant when
  // the OS asks for reduced motion).
  const [shownCount, setShownCount] = useState(0)
  useEffect(() => {
    if (!count) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setShownCount(count); return }
    const start = performance.now()
    const duration = Math.min(700, 200 + count * 60)
    let frame = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      setShownCount(Math.round(count * (1 - Math.pow(1 - t, 3))))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [count])

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
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg)', position: 'relative', overflowX: 'hidden', color: 'var(--text)' }}>

      <div style={{ position: 'relative', zIndex: 1, paddingBottom: 80 }}>

        {/* ── Success hero ──────────────────────────────────────────── */}
        <div style={{ padding: 'calc(env(safe-area-inset-top) + 48px) 16px 24px', textAlign: 'center' }}>
          <div className="anim-pop" style={{
            width: 72, height: 72, borderRadius: '50%', margin: '0 auto 16px',
            background: 'rgba(201,244,0,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#C9F400" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path className="anim-draw" d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          </div>
          <p style={{ margin: '0 0 6px', fontSize: 24, fontWeight: 600, color: 'var(--text)' }}>
            {count !== null ? `${shownCount} report${count !== 1 ? 's' : ''} sent` : 'Report sent'}
          </p>
          <p style={{ margin: 0, fontSize: 15, color: 'var(--text-muted)' }}>
            Thanks for updating <span style={{ color: 'var(--text)', fontWeight: 600 }}>{storeName}</span>
          </p>
        </div>

        {/* ── Current stock snapshot ────────────────────────────────── */}
        <div style={{ padding: '0 16px' }}>
          <p style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: 'var(--text-muted)' }}>
            What&apos;s in stock now
          </p>

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 24 }}>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              <div style={{ width: 28, height: 28, border: '2px solid #C9F400', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            </div>
          ) : stock.length === 0 ? (
            <p style={{ fontSize: 14, color: 'var(--text-dim)', textAlign: 'center', marginTop: 20 }}>
              No other reports for this store yet.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {Object.entries(grouped).map(([brand, items]) => (
                <div key={brand}>
                  <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: 'var(--text-dim)' }}>
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
                            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                              {item.drink?.flavor ?? item.drink?.name}
                            </p>
                          </div>
                          <div style={{
                            padding: '4px 10px', borderRadius: 999,
                            backgroundColor: q?.bg, border: `1px solid ${q?.border}`,
                          }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: q?.color }}>{q?.label}</span>
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
            className={`${ui.btnPrimary} ${ui.btnBlock} ${ui.btnLarge}`}
            onClick={() => router.replace(`/submit/drinks?storeId=${storeId}&storeName=${encodeURIComponent(storeName)}`)}
          >
            Report more flavors
          </button>
          <button
            className={`${ui.btnSecondary} ${ui.btnBlock} ${ui.btnLarge}`}
            onClick={() => router.replace(`/store/${storeId}?name=${encodeURIComponent(storeName)}`)}
          >
            View store
          </button>
          <button
            style={{
              width: '100%', borderRadius: 14, padding: '12px 0', cursor: 'pointer',
              background: 'none', border: 'none',
              fontSize: 13, fontWeight: 500, color: 'var(--text-dim)',
            }}
            onClick={() => router.replace('/')}
          >
            Back to map
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
