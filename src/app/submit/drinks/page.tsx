'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Drink } from '@/lib/types'
import { SearchIcon, PinIcon, CloseIcon, ChevronDownIcon, ChevronLeftIcon, CheckIcon, CameraIcon } from '@/components/Icons'
import { addSightingPhoto } from '@/lib/sightingPhoto'
import { XP_PHOTO } from '@/lib/xp'
import SkeletonList from '@/components/ui/SkeletonList'
import ui from '@/components/ui/ui.module.css'
import { addToQueue, removeFromQueue, isNetworkFailure } from '@/lib/reportQueue'
import { haptic } from '@/lib/haptics'
import { AMOUNT_LABEL, NOT_THERE_HEX, SPOTTED_TEXT, isReliable, sightingLine, sightingOf, type Amount, type Sighting, type SightingRow } from '@/lib/sightings'

// Log sightings at one store. Each flavor has two one-tap actions —
// Spotted and Not there — that save immediately. After a Spotted saves, an
// optional "Just a few / Plenty" choice appears on that row (skippable);
// it's added to the saved sighting afterwards, never blocking the save.

const MAX_DISTANCE_M = 500

function getDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function groupByBrand(list: Drink[]) {
  return list.reduce<Record<string, Drink[]>>((acc, d) => {
    if (!acc[d.brand]) acc[d.brand] = []
    acc[d.brand].push(d)
    return acc
  }, {})
}

// What happened to each flavor tapped on this visit.
type Logged = {
  sighting: Sighting
  amount: Amount | null
  status: 'saving' | 'saved' | 'queued' | 'error'
  reportId?: string
  queueId?: string
  error?: string
  xp?: number
  bounty?: number
  photo?: 'uploading' | 'done' | 'error'
}

type LastReport = { ids: string[]; storeId: string; at: number; collection: { newFlavors: string[]; found: number; total: number } | null }

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
  const [storeReports, setStoreReports] = useState<Record<string, SightingRow>>({})
  const [search, setSearch] = useState('')
  const [expandedBrands, setExpandedBrands] = useState<Set<string>>(new Set())
  const [autoExpanded, setAutoExpanded] = useState(false)
  const [showOther, setShowOther] = useState(false)
  const [logged, setLogged] = useState<Record<string, Logged>>({})
  const [pageError, setPageError] = useState<string | null>(null)
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [storeCoords, setStoreCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [locationChecking, setLocationChecking] = useState(true)
  // True once we've decided not to auto-request GPS (permission was never
  // granted), so opening this page never triggers a surprise prompt. Logging
  // without location is allowed; the server skips the geofence then.
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

  // The latest sighting per flavor here, so this store's brands lead the page.
  useEffect(() => {
    if (!storeId) return
    supabase
      .from('latest_stock')
      .select('*')
      .eq('store_id', storeId)
      .then(({ data }) => {
        if (!data) return
        const map: Record<string, SightingRow> = {}
        data.forEach((r: SightingRow & { drink_id: string }) => { map[r.drink_id] = r })
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
    // as useLocation.ts) — otherwise wait for an explicit tap.
    (async () => {
      if (!navigator.geolocation) { setLocationChecking(false); setLocationSkipped(true); return }
      try {
        const result = await navigator.permissions.query({ name: 'geolocation' as PermissionName })
        if (result.state === 'granted') checkLocation()
        else { setLocationChecking(false); setLocationSkipped(true) }
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

  const setRow = (drinkId: string, patch: Partial<Logged> | null) =>
    setLogged((prev) => {
      const next = { ...prev }
      if (patch === null) delete next[drinkId]
      else next[drinkId] = { ...(prev[drinkId] as Logged), ...patch }
      return next
    })

  // Undo + the thank-you screen read this (ids, collection progress).
  function remember(ids: string[], collection: LastReport['collection']) {
    try {
      const prev = JSON.parse(sessionStorage.getItem('last_report') ?? 'null') as LastReport | null
      const same = prev && prev.storeId === storeId && Date.now() - prev.at < 10 * 60 * 1000
      const merged: LastReport = {
        ids: [...(same ? prev!.ids : []), ...ids],
        storeId,
        at: same ? prev!.at : Date.now(),
        collection: collection
          ? { ...collection, newFlavors: [...new Set([...(same && prev!.collection ? prev!.collection.newFlavors : []), ...collection.newFlavors])] }
          : same ? prev!.collection : null,
      }
      sessionStorage.setItem('last_report', JSON.stringify(merged))
    } catch { /* ignore */ }
  }

  function forget(id: string) {
    try {
      const prev = JSON.parse(sessionStorage.getItem('last_report') ?? 'null') as LastReport | null
      if (prev) sessionStorage.setItem('last_report', JSON.stringify({ ...prev, ids: prev.ids.filter((x) => x !== id) }))
    } catch { /* ignore */ }
  }

  async function authHeaders() {
    const { data: { session } } = await supabase.auth.getSession()
    return session ? { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` } : null
  }

  function queueOffline(drinkId: string, sighting: Sighting) {
    const q = addToQueue({ storeId, storeName, reports: [{ drink_id: drinkId, sighting, amount: null }], lat: gpsCoords?.lat, lng: gpsCoords?.lng })
    setRow(drinkId, { status: 'queued', queueId: q.id })
  }

  // One tap = saved. The amount choice appears afterwards.
  async function log(drinkId: string, sighting: Sighting) {
    if (logged[drinkId] && logged[drinkId].status !== 'error') return
    haptic(sighting === 'spotted' ? [12, 30, 12] : 10)
    setPageError(null)
    setLogged((prev) => ({ ...prev, [drinkId]: { sighting, amount: null, status: 'saving' } }))
    if (typeof navigator !== 'undefined' && !navigator.onLine) { queueOffline(drinkId, sighting); return }
    try {
      const headers = await authHeaders()
      if (!headers) { setRow(drinkId, { status: 'error', error: 'Session expired. Sign in again.' }); return }
      const res = await fetch('/api/stock/report', {
        method: 'POST',
        headers,
        body: JSON.stringify({ store_id: storeId, reports: [{ drink_id: drinkId, sighting }], lat: gpsCoords?.lat, lng: gpsCoords?.lng }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setRow(drinkId, { status: 'error', error: body.error ?? 'Could not save. Try again.' }); return }
      if (!body.submitted) { setRow(drinkId, { status: 'error', error: 'You logged this here in the last 30 minutes.' }); return }
      const reportId = body.byDrink?.[drinkId] ?? body.ids?.[0]
      remember(reportId ? [reportId] : [], body.collection ?? null)
      setRow(drinkId, { status: 'saved', reportId, xp: body.xp ?? 10, bounty: body.bounty ?? 0 })
    } catch (err) {
      if (isNetworkFailure(err)) { queueOffline(drinkId, sighting); return }
      setRow(drinkId, { status: 'error', error: 'Could not save. Try again.' })
    }
  }

  // Optional, after the save. Tapping the chosen amount again clears it.
  async function setAmount(drinkId: string, amount: Amount) {
    const row = logged[drinkId]
    if (!row || row.sighting !== 'spotted') return
    const next = row.amount === amount ? null : amount
    haptic(8)
    setRow(drinkId, { amount: next })
    if (row.status === 'queued' && row.queueId) {
      // Not sent yet: rewrite the queued item with the amount.
      removeFromQueue(row.queueId)
      const q = addToQueue({ storeId, storeName, reports: [{ drink_id: drinkId, sighting: 'spotted', amount: next }], lat: gpsCoords?.lat, lng: gpsCoords?.lng })
      setRow(drinkId, { queueId: q.id })
      return
    }
    if (!row.reportId) return
    const headers = await authHeaders()
    if (!headers) return
    fetch('/api/stock/amount', { method: 'POST', headers, body: JSON.stringify({ id: row.reportId, amount: next }) }).catch(() => {})
  }

  // Optional photo on a saved Spotted (+15 XP).
  async function attachPhoto(drinkId: string, file: File) {
    const row = logged[drinkId]
    if (!row?.reportId || !user) return
    setRow(drinkId, { photo: 'uploading' })
    const res = await addSightingPhoto(user.id, row.reportId, file)
    if (res.ok) setRow(drinkId, { photo: 'done', xp: (row.xp ?? 10) + XP_PHOTO })
    else { setRow(drinkId, { photo: 'error' }); setPageError(res.message) }
  }

  async function undo(drinkId: string) {
    const row = logged[drinkId]
    if (!row) return
    if (row.status === 'queued' && row.queueId) { removeFromQueue(row.queueId); setRow(drinkId, null); return }
    if (!row.reportId) { setRow(drinkId, null); return }
    const headers = await authHeaders()
    if (!headers) return
    const res = await fetch('/api/stock/undo', { method: 'POST', headers, body: JSON.stringify({ ids: [row.reportId] }) }).catch(() => null)
    if (res?.ok) { forget(row.reportId); setRow(drinkId, null) }
    else setPageError('Too late to undo that one.')
  }

  const q = search.trim().toLowerCase()
  const isSearching = q.length > 0
  const searchGrouped = groupByBrand(drinks.filter((d) =>
    d.name.toLowerCase().includes(q) || d.brand.toLowerCase().includes(q) || (d.flavor ?? '').toLowerCase().includes(q)
  ))

  // A brand counts as "this store's" once any of its flavors has been logged
  // here; its other catalog flavors join it. Flavors with sightings first.
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

  useEffect(() => {
    if (autoExpanded || storeBrandNames.length === 0) return
    setAutoExpanded(true)
    if (storeBrandNames.length <= 2) setExpandedBrands(new Set(storeBrandNames))
  }, [autoExpanded, storeBrandNames])

  const done = Object.values(logged).filter((r) => r.status === 'saved' || r.status === 'queued')
  const savedCount = done.filter((r) => r.status === 'saved').length
  const queuedCount = done.filter((r) => r.status === 'queued').length
  const xpTotal = done.reduce((n, r) => n + (r.xp ?? 0), 0)
  const tooFar = !profile?.is_admin && !locationChecking && distanceM !== null && distanceM > MAX_DISTANCE_M

  // ── Render helpers (plain functions, so nothing remounts on re-render) ──

  const actionBtn = (label: string, color: string, bg: string, border: string, onClick: () => void, disabled: boolean) => (
    <button
      className="press"
      onClick={onClick}
      disabled={disabled}
      style={{
        minHeight: 42, borderRadius: 11, fontFamily: 'inherit', fontSize: 14, fontWeight: 600, cursor: disabled ? 'default' : 'pointer',
        border: `1px solid ${border}`, background: bg, color, opacity: disabled ? 0.45 : 1,
      }}
    >
      {label}
    </button>
  )

  const flavorRow = (drink: Drink, i: number) => {
    const last = storeReports[drink.id]
    const row = logged[drink.id]
    const lastSeen = last ? sightingOf(last) : null
    return (
      <div key={drink.id} style={{ padding: '12px 0', borderTop: i ? '1px solid var(--fg-06)' : 'none' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
          <p style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {drink.flavor ?? drink.name}
          </p>
          <span style={{ fontSize: 12, flexShrink: 0, color: !last ? 'var(--text-dim)' : !isReliable(last.reported_at) ? 'var(--text-dim)' : lastSeen === 'spotted' ? SPOTTED_TEXT : NOT_THERE_HEX }}>
            {last ? sightingLine(last) : 'No sightings yet'}
          </span>
        </div>

        {!row || row.status === 'error' ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 8 }}>
              {actionBtn('Spotted', 'var(--accent-text)', 'rgba(201,244,0,0.12)', 'rgba(201,244,0,0.45)', () => log(drink.id, 'spotted'), tooFar)}
              {actionBtn('Not there', 'var(--text-muted)', 'transparent', 'var(--fg-10)', () => log(drink.id, 'not_there'), tooFar)}
            </div>
            {row?.error && <p style={{ fontSize: 12, color: '#FF6B6B', marginTop: 6 }}>{row.error}</p>}
          </>
        ) : (
          <div className="anim-fade" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '8px 10px', borderRadius: 11, background: row.sighting === 'spotted' ? 'rgba(201,244,0,0.08)' : 'rgba(255,69,69,0.07)', border: `1px solid ${row.sighting === 'spotted' ? 'rgba(201,244,0,0.3)' : 'rgba(255,69,69,0.25)'}` }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: row.sighting === 'spotted' ? SPOTTED_TEXT : NOT_THERE_HEX }}>
              {row.status === 'saving'
                ? <span style={{ width: 12, height: 12, border: '2px solid var(--fg-15)', borderTopColor: 'currentColor', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                : <CheckIcon size={14} color="currentColor" />}
              {row.sighting === 'spotted' ? 'Spotted' : 'Not there'}
              {row.status === 'queued' && <span style={{ fontWeight: 400, color: 'var(--text-dim)' }}>· sends when online</span>}
              {row.status === 'saved' && row.xp ? <span style={{ fontWeight: 700, color: 'var(--accent-text)' }}>+{row.xp} XP</span> : null}
              {row.status === 'saved' && row.bounty ? <span style={{ fontWeight: 600, color: '#FFB300' }}>· bounty!</span> : null}
            </span>
            {row.sighting === 'spotted' && row.status !== 'saving' && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>How many?</span>
                {(['few', 'plenty'] as Amount[]).map((a) => (
                  <button key={a} onClick={() => setAmount(drink.id, a)} className={`${ui.chip} ${row.amount === a ? ui.chipActive : ''}`} style={{ minHeight: 30, padding: '0 10px', fontSize: 12 }}>
                    {AMOUNT_LABEL[a]}
                  </button>
                ))}
              </span>
            )}
            {row.sighting === 'spotted' && row.status === 'saved' && row.reportId && (
              <label title="Add a photo (+15 XP)" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: row.photo === 'done' ? 'var(--accent-text)' : 'var(--text-dim)', cursor: row.photo ? 'default' : 'pointer', padding: '4px 2px' }}>
                <CameraIcon size={14} color="currentColor" />
                {row.photo === 'uploading' ? 'Uploading…' : row.photo === 'done' ? 'Photo added' : 'Photo'}
                {!row.photo && <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const file = e.target.files?.[0]; if (file) attachPhoto(drink.id, file); e.target.value = '' }} />}
              </label>
            )}
            {row.status !== 'saving' && (
              <button onClick={() => undo(drink.id)} style={{ marginLeft: row.sighting === 'spotted' ? 0 : 'auto', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 2px' }}>
                Undo
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  const brandCard = (brand: string, list: Drink[], forceOpen = false) => {
    const open = forceOpen || expandedBrands.has(brand)
    const picked = list.filter((d) => logged[d.id] && logged[d.id].status !== 'error').length
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
            <span key={picked} className="anim-bump" style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-text)', background: 'rgba(201,244,0,0.12)', borderRadius: 999, padding: '3px 9px' }}>{picked} logged</span>
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

  function finish() {
    if (savedCount === 0) { router.replace(`/store/${storeId}?name=${encodeURIComponent(storeName)}`); return }
    router.replace(`/submit/result?storeId=${storeId}&storeName=${encodeURIComponent(storeName)}&count=${savedCount}`)
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
            <p style={{ fontSize: 17, fontWeight: 600, color: 'var(--text)' }}>Log sightings</p>
            {storeName && <p style={{ fontSize: 13, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{storeName}</p>}
          </div>
        </div>
      </div>

      <div style={{ padding: '16px 16px 180px' }}>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.45 }}>
          Tap <strong style={{ color: 'var(--text)' }}>Spotted</strong> for each flavor you see, or <strong style={{ color: 'var(--text)' }}>Not there</strong> if you looked and it&apos;s missing. Each tap saves right away.
        </p>

        {tooFar && (
          <p style={{ ...statusStyle('#FF6B6B'), marginBottom: 14 }}><PinIcon size={13} color="#FF6B6B" /> You need to be at the store to log sightings.</p>
        )}

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
                  <p style={{ fontSize: 14, color: 'var(--text-dim)', margin: '-4px 2px 12px' }}>No sightings here yet. Open a brand to start.</p>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {Object.entries(otherGrouped).map(([brand, list]) => brandCard(brand, list))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* ── Done bar ── */}
      {(done.length > 0 || pageError) && (
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
            ) : distanceM !== null && !tooFar && !profile?.is_admin ? (
              <p style={statusStyle('var(--accent-text)')}><PinIcon size={13} color="var(--accent-text)" /> You&apos;re at the store</p>
            ) : locationSkipped && !profile?.is_admin ? (
              <p style={statusStyle('var(--text-dim)')}>
                Logging without location is okay.
                <button onClick={checkLocation} style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: 'var(--accent-text)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  Verify location
                </button>
              </p>
            ) : null}
            {pageError && <p style={{ fontSize: 13, color: '#FF6B6B', textAlign: 'center', marginBottom: 10 }}>{pageError}</p>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span key={done.length} className="anim-bump" style={{ flex: 1, fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>
                {done.length} sighting{done.length === 1 ? '' : 's'} logged{xpTotal > 0 && <span style={{ color: 'var(--accent-text)' }}> · +{xpTotal} XP</span>}
                {queuedCount > 0 && <span style={{ display: 'block', fontSize: 12, fontWeight: 400, color: 'var(--text-dim)' }}>{queuedCount} saved on your phone until you&apos;re back online</span>}
              </span>
              <button className={`${ui.btnPrimary} ${ui.btnLarge}`} onClick={finish} style={{ minWidth: 120 }}>Done</button>
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
