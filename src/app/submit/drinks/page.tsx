'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Drink, Quantity } from '@/lib/types'
import { SearchIcon, PinIcon, CloseIcon, ChevronDownIcon, ChevronLeftIcon } from '@/components/Icons'
import SkeletonList from '@/components/ui/SkeletonList'
import ui from '@/components/ui/ui.module.css'
import { addToQueue, removeFromQueue, isNetworkFailure, type QueuedReport } from '@/lib/reportQueue'
import { haptic } from '@/lib/haptics'

const MAX_DISTANCE_M = 500

function getDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Left to right the way people read a cooler: full → out.
const LEVELS: { value: Quantity; label: string; color: string; bg: string; border: string }[] = [
  { value: 'full',   label: 'Full', color: '#C9F400', bg: 'rgba(201,244,0,0.14)', border: 'rgba(201,244,0,0.5)' },
  { value: 'medium', label: 'Med',  color: '#FFB300', bg: 'rgba(255,179,0,0.12)', border: 'rgba(255,179,0,0.45)' },
  { value: 'low',    label: 'Low',  color: '#FF8A3D', bg: 'rgba(255,138,61,0.12)', border: 'rgba(255,138,61,0.45)' },
  { value: 'out',    label: 'Out',  color: '#FF4545', bg: 'rgba(255,69,69,0.12)', border: 'rgba(255,69,69,0.45)' },
]
const LEVEL_WORD: Record<Quantity, string> = { full: 'Full', medium: 'Medium', low: 'Low', out: 'Out' }

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function groupByBrand(list: Drink[]) {
  return list.reduce<Record<string, Drink[]>>((acc, d) => {
    if (!acc[d.brand]) acc[d.brand] = []
    acc[d.brand].push(d)
    return acc
  }, {})
}

function DrinksContent() {
  const router = useRouter()
  const params = useSearchParams()
  const storeId = params.get('storeId') ?? ''
  const storeName = params.get('storeName') ?? ''

  const { user, profile, loading: authLoading } = useAuth()

  useEffect(() => {
    if (!authLoading && !user) router.replace('/account')
  }, [user, authLoading, router])

  const [drinks, setDrinks] = useState<Drink[]>([])
  const [loading, setLoading] = useState(true)
  const [storeReports, setStoreReports] = useState<Record<string, { quantity: Quantity; reported_at: string }>>({})
  const [search, setSearch] = useState('')
  const [expandedBrands, setExpandedBrands] = useState<Set<string>>(new Set())
  const [autoExpanded, setAutoExpanded] = useState(false)
  const [showOther, setShowOther] = useState(false)
  const [selections, setSelections] = useState<Record<string, Quantity>>({})
  const [submitting, setSubmitting] = useState(false)
  const [limitError, setLimitError] = useState<string | null>(null)
  // Set when the phone had no signal: the reports are saved on the device
  // and ReportQueueSync sends them once it's back online.
  const [savedOffline, setSavedOffline] = useState<QueuedReport | null>(null)
  const [offlineUndone, setOfflineUndone] = useState(false)
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [storeCoords, setStoreCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [locationChecking, setLocationChecking] = useState(true)
  // True once we've decided not to auto-request GPS — permission was never
  // granted, so a user who doesn't want to share location never gets an
  // unwanted browser prompt just for opening this page. They can still tap
  // to verify if they change their mind; skipping is not a blocker either
  // way, since the server-side geofence check is skipped without GPS.
  const [locationSkipped, setLocationSkipped] = useState(false)
  const distanceM = gpsCoords && storeCoords ? getDistanceMeters(gpsCoords.lat, gpsCoords.lng, storeCoords.lat, storeCoords.lng) : null

  useEffect(() => {
    supabase
      .from('drinks')
      .select('*')
      .order('brand', { ascending: true })
      .then(({ data }) => {
        if (data) setDrinks(data)
        setLoading(false)
      })
  }, [])

  // Which brands this store actually carries, so those flavors lead the page
  // instead of the full catalog competing for space with what's real here.
  useEffect(() => {
    if (!storeId) return
    supabase
      .from('latest_stock')
      .select('drink_id, quantity, reported_at')
      .eq('store_id', storeId)
      .then(({ data }) => {
        if (!data) return
        const map: Record<string, { quantity: Quantity; reported_at: string }> = {}
        data.forEach((r) => { map[r.drink_id] = { quantity: r.quantity, reported_at: r.reported_at } })
        setStoreReports(map)
      })
  }, [storeId])

  function checkLocation() {
    if (!navigator.geolocation) { setLocationChecking(false); setLocationSkipped(true); return }
    setLocationChecking(true)
    setLocationSkipped(false)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setLocationChecking(false)
      },
      () => {
        setLocationChecking(false)
        setLocationSkipped(true)
      },
      { timeout: 10000, maximumAge: 60000, enableHighAccuracy: false }
    )
  }

  useEffect(() => {
    if (!storeId) return
    supabase
      .from('stores')
      .select('lat, lng')
      .eq('id', storeId)
      .single()
      .then(({ data }) => setStoreCoords(data ?? null))
  }, [storeId])

  useEffect(() => {
    if (!storeId) { setLocationChecking(false); return }
    // Only auto-request GPS if permission is already granted (same pattern
    // as useLocation.ts on the main map) — otherwise wait for an explicit
    // tap, so opening this page never surprises someone with a permission
    // prompt they didn't ask for.
    (async () => {
      if (!navigator.geolocation) { setLocationChecking(false); setLocationSkipped(true); return }
      try {
        const result = await navigator.permissions.query({ name: 'geolocation' as PermissionName })
        if (result.state === 'granted') {
          checkLocation()
        } else {
          setLocationChecking(false)
          setLocationSkipped(true)
        }
      } catch {
        checkLocation()
      }
    })()
  }, [storeId])

  function toggleBrand(brand: string) {
    setExpandedBrands((prev) => {
      const next = new Set(prev)
      if (next.has(brand)) next.delete(brand)
      else next.add(brand)
      return next
    })
  }

  // Tapping the already-selected level clears it.
  function pick(drinkId: string, qty: Quantity) {
    haptic(8)
    setLimitError(null)
    setSelections((prev) => {
      if (prev[drinkId] === qty) {
        const next = { ...prev }
        delete next[drinkId]
        return next
      }
      return { ...prev, [drinkId]: qty }
    })
  }

  function saveOffline(entries: [string, Quantity][]) {
    const q = addToQueue({
      storeId, storeName,
      reports: entries.map(([drinkId, quantity]) => ({ drink_id: drinkId, quantity })),
      lat: gpsCoords?.lat, lng: gpsCoords?.lng,
    })
    haptic([12, 40, 12])
    setSubmitting(false)
    setSavedOffline(q)
  }

  async function handleSubmit() {
    const entries = Object.entries(selections) as [string, Quantity][]
    if (entries.length === 0 || submitting) return
    setSubmitting(true)
    setLimitError(null)
    if (typeof navigator !== 'undefined' && !navigator.onLine) { saveOffline(entries); return }

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setLimitError('Session expired. Please sign in again.')
        setSubmitting(false)
        return
      }

      const res = await fetch('/api/stock/report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          store_id: storeId,
          reports: entries.map(([drinkId, quantity]) => ({ drink_id: drinkId, quantity })),
          lat: gpsCoords?.lat,
          lng: gpsCoords?.lng,
        }),
      })

      const body = await res.json().catch(() => ({}))

      if (!res.ok) {
        setLimitError(body.error ?? 'Could not submit reports. Please try again.')
        setSubmitting(false)
        return
      }

      if (!body.submitted) {
        setLimitError('You already reported these drinks here in the last 30 minutes. Come back later!')
        setSubmitting(false)
        return
      }

      // Remembered for the success screen's Undo (5 minutes).
      try { sessionStorage.setItem('last_report', JSON.stringify({ ids: body.ids ?? [], storeId, at: Date.now() })) } catch { /* ignore */ }
      haptic([12, 40, 12])
      router.replace(
        `/submit/result?storeId=${storeId}&storeName=${encodeURIComponent(storeName)}&count=${body.submitted}`
      )
    } catch (err) {
      if (isNetworkFailure(err)) { saveOffline(entries); return }
      setLimitError('Could not submit reports. Please try again.')
      setSubmitting(false)
    }
  }

  const q = search.trim().toLowerCase()
  const isSearching = q.length > 0
  const searchGrouped = groupByBrand(drinks.filter((d) =>
    d.name.toLowerCase().includes(q) || d.brand.toLowerCase().includes(q) || (d.flavor ?? '').toLowerCase().includes(q)
  ))

  // A brand counts as "this store's" once any of its flavors has ever been
  // reported here — every other catalog flavor of that brand joins it too,
  // since a store carrying a brand plausibly carries flavors nobody's
  // specifically reported yet. Flavors with a report come first.
  const storeBrands = new Set(
    Object.keys(storeReports)
      .map((drinkId) => drinks.find((d) => d.id === drinkId)?.brand)
      .filter((b): b is string => !!b)
  )
  const storeGrouped = groupByBrand(
    drinks
      .filter((d) => storeBrands.has(d.brand))
      .sort((a, b) => (storeReports[b.id] ? 1 : 0) - (storeReports[a.id] ? 1 : 0))
  )
  const otherGrouped = groupByBrand(drinks.filter((d) => !storeBrands.has(d.brand)))
  const storeBrandNames = Object.keys(storeGrouped)

  // Open the store's brands straight away when there are only a couple.
  useEffect(() => {
    if (autoExpanded || storeBrandNames.length === 0) return
    setAutoExpanded(true)
    if (storeBrandNames.length <= 2) setExpandedBrands(new Set(storeBrandNames))
  }, [autoExpanded, storeBrandNames])

  const selectionCount = Object.keys(selections).length
  const tooFar = !profile?.is_admin && !locationChecking && distanceM !== null && distanceM > MAX_DISTANCE_M
  const blocked = submitting || !!limitError || tooFar

  // ── Render helpers (plain functions, so nothing remounts on re-render) ──

  const flavorRow = (drink: Drink, i: number) => {
    const report = storeReports[drink.id]
    const selected = selections[drink.id]
    return (
      <div key={drink.id} style={{ padding: '12px 0', borderTop: i ? '1px solid var(--fg-06)' : 'none' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
          <p style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {drink.flavor ?? drink.name}
          </p>
          <span style={{ fontSize: 12, color: 'var(--text-dim)', flexShrink: 0 }}>
            {report ? `Last: ${LEVEL_WORD[report.quantity]} · ${timeAgo(report.reported_at)}` : 'No reports yet'}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
          {LEVELS.map((lvl) => {
            const on = selected === lvl.value
            return (
              <button
                key={lvl.value}
                className="press"
                onClick={() => pick(drink.id, lvl.value)}
                aria-pressed={on}
                style={{
                  minHeight: 38, borderRadius: 10, fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  border: `1px solid ${on ? lvl.border : 'var(--fg-08)'}`,
                  background: on ? lvl.bg : 'transparent',
                  color: on ? lvl.color : 'var(--text-muted)',
                  transition: 'background 0.15s, border-color 0.15s, color 0.15s',
                }}
              >
                {lvl.label}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const brandCard = (brand: string, list: Drink[], forceOpen = false) => {
    const open = forceOpen || expandedBrands.has(brand)
    const picked = list.filter((d) => selections[d.id]).length
    return (
      <div key={brand} className={`${ui.card} reveal`} style={{ padding: 0, overflow: 'hidden', borderColor: picked ? 'rgba(201,244,0,0.4)' : undefined }}>
        <button
          onClick={() => !forceOpen && toggleBrand(brand)}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: 'none', border: 'none', textAlign: 'left', cursor: forceOpen ? 'default' : 'pointer', fontFamily: 'inherit' }}
        >
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>{brand}</span>
            <span style={{ display: 'block', fontSize: 13, color: 'var(--text-dim)', marginTop: 1 }}>
              {list.length} flavor{list.length !== 1 ? 's' : ''}
            </span>
          </span>
          {picked > 0 && (
            <span key={picked} className="anim-bump" style={{ fontSize: 12, fontWeight: 600, color: '#C9F400', background: 'rgba(201,244,0,0.12)', borderRadius: 999, padding: '3px 9px' }}>{picked} picked</span>
          )}
          {!forceOpen && (
            <span style={{ display: 'flex', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
              <ChevronDownIcon size={18} color="var(--text-dim)" />
            </span>
          )}
        </button>
        {open && <div style={{ padding: '0 16px 4px', borderTop: '1px solid var(--fg-06)' }}>{list.map(flavorRow)}</div>}
      </div>
    )
  }

  if (savedOffline) {
    const n = savedOffline.reports.length
    return (
      <div style={{ minHeight: '100dvh', background: 'var(--bg)', color: 'var(--text)', display: 'flex', flexDirection: 'column', padding: 'calc(env(safe-area-inset-top) + 16px) 16px calc(env(safe-area-inset-bottom) + 24px)' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', maxWidth: 360, width: '100%', margin: '0 auto' }}>
          <div className="anim-pop" style={{ width: 80, height: 80, borderRadius: '50%', marginBottom: 22, background: offlineUndone ? 'var(--fg-06)' : 'rgba(255,179,0,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={offlineUndone ? 'var(--text-muted)' : '#FFB300'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {offlineUndone
                ? <path d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
                : <><path d="M7 18a4.5 4.5 0 0 1-.5-8.97A6 6 0 0 1 18 8.5a4 4 0 0 1-.5 7.97" /><path d="M12 12v8M9 17l3 3 3-3" /></>}
            </svg>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 8 }}>{offlineUndone ? 'Report undone' : `${n} report${n === 1 ? '' : 's'} saved`}</h1>
          <p style={{ fontSize: 15, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {offlineUndone
              ? 'Nothing was sent.'
              : n === 1
                ? 'No signal right now, so it’s saved on your phone. We’ll send it automatically as soon as you’re back online.'
                : 'No signal right now, so they’re saved on your phone. We’ll send them automatically as soon as you’re back online.'}
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 360, width: '100%', margin: '0 auto' }}>
          <button className={`${ui.btnPrimary} ${ui.btnBlock} ${ui.btnLarge}`} onClick={() => router.replace('/')}>Done</button>
          {offlineUndone ? (
            <button className={`${ui.btnSecondary} ${ui.btnBlock} ${ui.btnLarge}`} onClick={() => { setSavedOffline(null); setOfflineUndone(false) }}>Report again</button>
          ) : (
            <button className={ui.btnGhost} onClick={() => { removeFromQueue(savedOffline.id); setOfflineUndone(true) }}>Undo</button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg)', overflowX: 'hidden', color: 'var(--text)' }}>

      {/* ── Header ── */}
      <div style={{ position: 'sticky', top: 0, zIndex: 20, background: 'var(--header-bg)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: '1px solid var(--border)', paddingTop: 'env(safe-area-inset-top)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' }}>
          <button className={ui.iconBtn} onClick={() => router.back()} aria-label="Back">
            <ChevronLeftIcon size={20} color="var(--text)" />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 17, fontWeight: 600, color: 'var(--text)' }}>Report stock</p>
            {storeName && <p style={{ fontSize: 13, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{storeName}</p>}
          </div>
        </div>
      </div>

      <div style={{ padding: '16px 16px 180px' }}>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.45 }}>
          Tap how full each flavor looks in the cooler. Only report what you can see.
        </p>

        {/* ── Search ── */}
        <div style={{ position: 'relative', marginBottom: 18 }}>
          <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', display: 'flex', pointerEvents: 'none' }}>
            <SearchIcon size={16} color="var(--text-dim)" />
          </span>
          <input
            type="text"
            className={`${ui.input} ${ui.inputWithIcon}`}
            style={{ paddingRight: 40 }}
            placeholder="Search any drink or flavor"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch('')} aria-label="Clear search" style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer' }}>
              <CloseIcon size={14} color="var(--text-dim)" />
            </button>
          )}
        </div>

        {loading ? (
          <SkeletonList count={4} avatar={false} />
        ) : isSearching ? (
          Object.keys(searchGrouped).length === 0 ? (
            <div className={ui.emptyState}>
              <p className={ui.emptyTitle}>No drinks match &ldquo;{search.trim()}&rdquo;</p>
              <p className={ui.emptyBody}>Missing a flavor? Add it from the store page.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Object.entries(searchGrouped).map(([brand, list]) => brandCard(brand, list, true))}
            </div>
          )
        ) : (
          <>
            {storeBrandNames.length > 0 && (
              <>
                <p className={ui.sectionLabel} style={{ margin: '0 2px 10px' }}>At this store</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 22 }}>
                  {Object.entries(storeGrouped).map(([brand, list]) => brandCard(brand, list))}
                </div>
              </>
            )}

            {storeBrandNames.length > 0 && !showOther ? (
              <button className={`${ui.btnSecondary} ${ui.btnBlock}`} onClick={() => setShowOther(true)}>
                See something else? Show all brands
              </button>
            ) : (
              <>
                <p className={ui.sectionLabel} style={{ margin: '0 2px 10px' }}>{storeBrandNames.length > 0 ? 'Other brands' : 'All brands'}</p>
                {storeBrandNames.length === 0 && (
                  <p style={{ fontSize: 14, color: 'var(--text-dim)', margin: '-4px 2px 12px' }}>No one has reported here yet. Open a brand to start.</p>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {Object.entries(otherGrouped).map(([brand, list]) => brandCard(brand, list))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* ── Submit bar ── */}
      {selectionCount > 0 && (
        <div
          className="anim-sheet"
          style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 30,
            background: 'var(--header-bg)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
            borderTop: '1px solid var(--border)',
          }}
        >
          <div style={{ maxWidth: 448, margin: '0 auto', padding: '12px 16px calc(env(safe-area-inset-bottom) + 14px)' }}>
          {locationChecking ? (
            <p style={statusStyle('var(--text-dim)')}><PinIcon size={13} color="var(--text-dim)" /> Checking your location…</p>
          ) : tooFar ? (
            <p style={statusStyle('#FF6B6B')}><PinIcon size={13} color="#FF6B6B" /> You need to be at the store to report stock.</p>
          ) : distanceM !== null && !profile?.is_admin ? (
            <p style={statusStyle('#C9F400')}><PinIcon size={13} color="#C9F400" /> You&apos;re at the store</p>
          ) : locationSkipped && !profile?.is_admin ? (
            <p style={statusStyle('var(--text-dim)')}>
              Reporting without location is okay.
              <button onClick={checkLocation} style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                Verify location
              </button>
            </p>
          ) : null}

          {limitError && <p style={{ fontSize: 13, color: '#FF6B6B', textAlign: 'center', marginBottom: 10 }}>{limitError}</p>}

          <div style={{ display: 'flex', gap: 8 }}>
            <button className={ui.btnSecondary} onClick={() => { setSelections({}); setLimitError(null) }} disabled={submitting} style={{ flexShrink: 0 }}>
              Clear
            </button>
            <button className={`${ui.btnPrimary} ${ui.btnLarge}`} style={{ flex: 1 }} onClick={handleSubmit} disabled={blocked}>
              {submitting ? 'Sending…' : <span key={selectionCount} className="anim-bump" style={{ display: 'inline-block' }}>{`Submit ${selectionCount} report${selectionCount !== 1 ? 's' : ''}`}</span>}
            </button>
          </div>
          </div>
        </div>
      )}
    </div>
  )
}

function statusStyle(color: string): React.CSSProperties {
  return { fontSize: 13, color, textAlign: 'center', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }
}

export default function DrinksPage() {
  return (
    <Suspense>
      <DrinksContent />
    </Suspense>
  )
}
