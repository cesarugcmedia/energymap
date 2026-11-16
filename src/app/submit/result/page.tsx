'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import ui from '@/components/ui/ui.module.css'
import { supabase } from '@/lib/supabase'
import { ShareIcon } from '@/components/Icons'
import { shareLink } from '@/lib/share'
import { useAuth } from '@/contexts/AuthContext'

const UNDO_MS = 5 * 60 * 1000

const shell: React.CSSProperties = {
  minHeight: '100dvh', background: 'var(--bg)', color: 'var(--text)', display: 'flex', flexDirection: 'column',
  padding: 'calc(env(safe-area-inset-top) + 16px) 16px calc(env(safe-area-inset-bottom) + 24px)',
}
const center: React.CSSProperties = { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', maxWidth: 360, width: '100%', margin: '0 auto' }
const actions: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 360, width: '100%', margin: '0 auto' }
const circle = (bg: string): React.CSSProperties => ({ width: 80, height: 80, borderRadius: '50%', marginBottom: 22, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' })

// Clean confirmation after a stock report — just the thanks, a short-lived
// Undo, and where to go next. (It used to list the store's current stock;
// that lives on the store page instead.)
function ResultContent() {
  const router = useRouter()
  const params = useSearchParams()
  const storeId = params.get('storeId') ?? ''
  const storeName = params.get('storeName') ?? ''
  const count = params.get('count') ? parseInt(params.get('count')!) : null
  const storeHref = `/store/${storeId}?name=${encodeURIComponent(storeName)}`

  // A report can cross a badge milestone — ask BadgeCelebration to check.
  useEffect(() => {
    const t = setTimeout(() => window.dispatchEvent(new Event('check-badges')), 1600)
    return () => clearTimeout(t)
  }, [])
  // Let the reporter tell friends; the link preview shows the store's stock.
  const [shareNote, setShareNote] = useState<string | null>(null)
  async function shareStore() {
    const r = await shareLink({ url: `${window.location.origin}/store/${storeId}`, title: `${storeName || 'This store'} on AmpedMap`, text: `Just reported what's in stock at ${storeName || 'this store'}` })
    if (r === 'copied') setShareNote('Link copied')
    else if (r === 'failed') setShareNote('Could not share')
  }
  const reportHref = `/submit/drinks?storeId=${storeId}&storeName=${encodeURIComponent(storeName)}`

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

  // Undo: the report page stashes the new report ids in sessionStorage; for
  // 5 minutes this screen can delete them again via /api/stock/undo.
  const [undoIds, setUndoIds] = useState<string[]>([])
  const [undoUntil, setUndoUntil] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const [undoing, setUndoing] = useState(false)
  const [undone, setUndone] = useState(false)
  const [undoError, setUndoError] = useState<string | null>(null)
  // "New flavor! 48 of 212" — set by /api/stock/report when this report added
  // flavors to the person's collection.
  const [collection, setCollection] = useState<{ newFlavors: string[]; found: number; total: number } | null>(null)
  const [shownFound, setShownFound] = useState(0)
  const { profile } = useAuth()

  useEffect(() => {
    try {
      const last = JSON.parse(sessionStorage.getItem('last_report') ?? 'null')
      if (last && last.storeId === storeId && Array.isArray(last.ids) && last.ids.length && Date.now() - last.at < UNDO_MS) {
        setUndoIds(last.ids)
        setUndoUntil(last.at + UNDO_MS)
        if (last.collection?.newFlavors?.length && last.collection.total) setCollection(last.collection)
      }
    } catch { /* storage unavailable */ }
  }, [storeId])

  useEffect(() => {
    if (!collection) return
    const from = Math.max(0, collection.found - collection.newFlavors.length)
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setShownFound(collection.found); return }
    setShownFound(from)
    let raf = 0
    const start = performance.now() + 700
    const tick = (t: number) => {
      const p = Math.min(1, Math.max(0, (t - start) / 600))
      setShownFound(Math.round(from + (collection.found - from) * p))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [collection])

  useEffect(() => {
    if (!undoUntil || undone) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [undoUntil, undone])

  const secondsLeft = Math.max(0, Math.ceil((undoUntil - now) / 1000))
  const canUndo = undoIds.length > 0 && secondsLeft > 0 && !undone

  async function undo() {
    if (undoing) return
    setUndoing(true)
    setUndoError(null)
    const { data: { session } } = await supabase.auth.getSession()
    const res = session
      ? await fetch('/api/stock/undo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ ids: undoIds }),
        }).catch(() => null)
      : null
    setUndoing(false)
    if (res?.ok) {
      setUndone(true)
      try { sessionStorage.removeItem('last_report') } catch { /* ignore */ }
      return
    }
    const body = res ? await res.json().catch(() => ({})) : {}
    setUndoError(body.error ?? 'Couldn’t undo. Check your connection.')
  }

  if (undone) {
    return (
      <div style={shell}>
        <div style={center}>
          <div className="anim-pop" style={circle('var(--fg-06)')}>
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></svg>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 8 }}>Report undone</h1>
          <p style={{ fontSize: 15, color: 'var(--text-muted)', lineHeight: 1.5 }}>We removed it. Want to report again?</p>
        </div>
        <div style={actions}>
          <button className={`${ui.btnPrimary} ${ui.btnBlock} ${ui.btnLarge}`} onClick={() => router.replace(reportHref)}>Report again</button>
          <button className={ui.btnGhost} onClick={() => router.replace('/')}>Back to map</button>
        </div>
      </div>
    )
  }

  return (
    <div style={shell}>
      <div style={center}>
        <div className="anim-pop" style={{ ...circle('rgba(201,244,0,0.12)'), position: 'relative' }}>
          {/* Little celebratory burst of dots around the check. */}
          <span className="burst" aria-hidden="true">
            {[0, 45, 90, 135, 180, 225, 270, 315].map((a, i) => (
              <span key={a} style={{ ['--a' as string]: `${a}deg`, background: ['#C9F400', '#FFB300', '#C9F400', '#60a5fa'][i % 4] } as React.CSSProperties} />
            ))}
          </span>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--accent-text)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path className="anim-draw" d="M5 12.5l4.5 4.5L19 7.5" /></svg>
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 8 }}>
          {count !== null ? `${shownCount} report${count !== 1 ? 's' : ''} sent` : 'Report sent'}
        </h1>
        <p style={{ fontSize: 15, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Thanks for updating{storeName ? <> <span style={{ color: 'var(--text)', fontWeight: 600 }}>{storeName}</span></> : ' this store'}.
          <br />You just helped everyone nearby find their drink.
        </p>
        {collection && !undone && (
          <div className={`${ui.card} anim-rise`} style={{ width: '100%', marginTop: 20, textAlign: 'left', animationDelay: '0.45s', border: '1px solid rgba(201,244,0,0.35)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="anim-pop" style={{ fontSize: 13, fontWeight: 700, color: '#0D1210', background: '#C9F400', borderRadius: 999, padding: '3px 9px', animationDelay: '0.6s' }}>
                +{collection.newFlavors.length}
              </span>
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>
                {collection.newFlavors.length === 1 ? 'New flavor for your collection!' : `${collection.newFlavors.length} new flavors for your collection!`}
              </span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {collection.newFlavors.slice(0, 3).join(', ')}{collection.newFlavors.length > 3 ? ` +${collection.newFlavors.length - 3} more` : ''}
            </p>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 10, fontSize: 13 }}>
              <span style={{ color: 'var(--text)' }}><strong style={{ fontSize: 17 }}>{shownFound}</strong> of {collection.total} flavors</span>
              {profile?.username && <a href={`/u/${profile.username}`} onClick={(e) => { e.preventDefault(); router.push(`/u/${profile.username}`) }} className={ui.linkQuiet} style={{ color: 'var(--accent-text)' }}>See collection</a>}
            </div>
            <div style={{ height: 6, borderRadius: 99, background: 'var(--fg-08)', marginTop: 6, overflow: 'hidden' }}>
              <div style={{ width: `${(shownFound / collection.total) * 100}%`, height: '100%', borderRadius: 99, background: '#C9F400', transition: 'width 0.12s linear' }} />
            </div>
          </div>
        )}
        {canUndo && (
          <div style={{ marginTop: 18 }}>
            <button className={ui.btnGhost} onClick={undo} disabled={undoing} style={{ fontSize: 14 }}>
              {undoing ? 'Undoing…' : `Made a mistake? Undo (${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')})`}
            </button>
            {undoError && <p style={{ fontSize: 13, color: '#FF6B6B', marginTop: 4 }}>{undoError}</p>}
          </div>
        )}
      </div>

      <div style={actions}>
        <button className={`${ui.btnPrimary} ${ui.btnBlock} ${ui.btnLarge}`} onClick={() => router.replace('/')}>
          Done
        </button>
        <button className={`${ui.btnSecondary} ${ui.btnBlock} ${ui.btnLarge}`} onClick={() => router.replace(reportHref)}>
          Report more flavors
        </button>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button className={ui.btnGhost} onClick={() => router.replace(storeHref)}>
            View store
          </button>
          {storeId && (
            <button className={ui.btnGhost} onClick={shareStore} style={{ gap: 6 }}>
              <ShareIcon size={15} color="currentColor" /> {shareNote ?? 'Share'}
            </button>
          )}
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
