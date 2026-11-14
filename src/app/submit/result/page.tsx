'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import ui from '@/components/ui/ui.module.css'

// Clean confirmation after a stock report — just the thanks and where to go
// next. (It used to list the store's current stock; that lives on the store
// page instead.)
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

  const storeHref = `/store/${storeId}?name=${encodeURIComponent(storeName)}`

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', color: 'var(--text)', display: 'flex', flexDirection: 'column', padding: 'calc(env(safe-area-inset-top) + 16px) 16px calc(env(safe-area-inset-bottom) + 24px)' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', maxWidth: 360, width: '100%', margin: '0 auto' }}>
        <div className="anim-pop" style={{ width: 80, height: 80, borderRadius: '50%', marginBottom: 22, background: 'rgba(201,244,0,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#C9F400" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path className="anim-draw" d="M5 12.5l4.5 4.5L19 7.5" /></svg>
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 8 }}>
          {count !== null ? `${shownCount} report${count !== 1 ? 's' : ''} sent` : 'Report sent'}
        </h1>
        <p style={{ fontSize: 15, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Thanks for updating{storeName ? <> <span style={{ color: 'var(--text)', fontWeight: 600 }}>{storeName}</span></> : ' this store'}.
          <br />You just helped everyone nearby find their drink.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 360, width: '100%', margin: '0 auto' }}>
        <button className={`${ui.btnPrimary} ${ui.btnBlock} ${ui.btnLarge}`} onClick={() => router.replace('/')}>
          Done
        </button>
        <button className={`${ui.btnSecondary} ${ui.btnBlock} ${ui.btnLarge}`} onClick={() => router.replace(`/submit/drinks?storeId=${storeId}&storeName=${encodeURIComponent(storeName)}`)}>
          Report more flavors
        </button>
        <button className={ui.btnGhost} onClick={() => router.replace(storeHref)}>
          View store
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
