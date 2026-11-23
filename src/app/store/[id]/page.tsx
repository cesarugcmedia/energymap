'use client'

import { useEffect, useMemo, useRef, useState, Suspense } from 'react'
import { createPortal } from 'react-dom'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Avatar } from '@/components/community/RichText'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { AMOUNT_LABEL, NOT_THERE_HEX, SPOTTED_TEXT, agoText, amountOf, isReliable, sightingOf, timesToday, type Sighting } from '@/lib/sightings'
import Toast from '@/components/Toast'
import CountUp from '@/components/ui/CountUp'
import ui from '@/components/ui/ui.module.css'
import { StoreTypeIcon, HeartIcon, FlagIcon, SearchIcon, CheckIcon, CloseIcon, BellIcon, DrinkIcon, LightningIcon, GroceryIcon, ChevronLeftIcon, ChevronDownIcon, DirectionsIcon, ShareIcon } from '@/components/Icons'
import SkeletonList from '@/components/ui/SkeletonList'
import { usePreferences } from '@/lib/preferences'
import Burst from '@/components/ui/Burst'
import { alertSlotsLeft, isAlertLimitError } from '@/lib/flavorAlerts'
import { FREE_ALERT_LIMIT } from '@/lib/plans'
import UpgradeSheet, { ALERT_LIMIT_COPY } from '@/components/ui/UpgradeSheet'
import RestockPatterns from '@/components/store/RestockPatterns'
import { shareLink } from '@/lib/share'
import { stalenessOf, type Staleness } from '@/lib/freshness'

const BRAND_ALIASES: Record<string, string> = {
  'alani':          'Alani Nu',
  'alani nu':       'Alani Nu',
  'red bull':       'Red Bull',
  'redbull':        'Red Bull',
  'monster':        'Monster',
  'monster energy': 'Monster',
  'celsius':        'Celsius',
  'ghost':          'Ghost Energy',
  'ghost energy':   'Ghost Energy',
  'reign':          'Reign',
  'rockstar':       'Rockstar',
  'bang':           'Bang',
  'nos':            'NOS',
}

function normalizeBrand(input: string): string {
  const key = input.trim().toLowerCase()
  return BRAND_ALIASES[key] ?? input.trim()
}


const addLinkStyle: React.CSSProperties = { background: 'none', border: 'none', padding: '6px 4px', fontFamily: 'inherit', fontSize: 14, fontWeight: 500, color: 'var(--accent-text)', cursor: 'pointer' }

function openDirections(lat: number, lng: number) {
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent)
  window.open(isIOS
    ? `https://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`
    : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`, '_blank')
}


// Loose match for catalog suggestions: case/spacing/punctuation-insensitive.
const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, '')

// "Report a problem" reasons, with a matching hint for the optional note.
const FLAG_REASONS: { label: string; hint: string }[] = [
  { label: 'Permanently closed', hint: 'Anything else? e.g. "Closed last month, building is empty"' },
  { label: 'Moved', hint: 'Where did it move to? An address or cross streets helps.' },
  { label: 'Wrong pin on map', hint: 'Where is it actually? e.g. "Across the street, next to the bank"' },
  { label: 'Wrong address', hint: 'What’s the correct address?' },
  { label: 'Duplicate store', hint: 'Which store is it a duplicate of?' },
  { label: 'Not a store', hint: 'What is it instead?' },
  { label: 'Other', hint: 'Tell us what’s wrong.' },
]

// Fresh < 1 day, Aging 1–2 days, Stale 2–3 days, Unverified after (src/lib/freshness.ts).
const STALENESS_COLOR: Record<Staleness, string> = { Fresh: 'var(--accent-text)', Aging: '#FFB300', Stale: '#FF4545', Unverified: 'var(--text-dim)' }
const stalenessColor = (dateStr: string) => STALENESS_COLOR[stalenessOf(dateStr)]

function StoreDetailContent({ id }: { id: string }) {
  const router = useRouter()
  const params = useSearchParams()
  const name = params.get('name') ?? ''
  const { user, profile } = useAuth()
  const isTracker = profile?.is_admin || profile?.tier === 'tracker'
  const [alertLimitOpen, setAlertLimitOpen] = useState(false)

  const [stock, setStock] = useState<any[]>([])
  const [store, setStore] = useState<any>(null)
  const [storeError, setStoreError] = useState(false)
  const [stockError, setStockError] = useState(false)
  const [loading, setLoading] = useState(true)
const [expandedBrands, setExpandedBrands] = useState<Set<string>>(new Set())
  const [showFlag, setShowFlag] = useState(false)
  const [flagReason, setFlagReason] = useState('')
  const [flagNotes, setFlagNotes] = useState('')
  const [flagSubmitting, setFlagSubmitting] = useState(false)
  const [flagDone, setFlagDone] = useState(false)
  const [isFavorited, setIsFavorited] = useState(false)
  const [favoriteId, setFavoriteId] = useState<string | null>(null)
  const [favoritingLoading, setFavoritingLoading] = useState(false)
  const [drinkAlerts, setDrinkAlerts] = useState<Set<string>>(new Set())
  const [alertSheetDrinkId, setAlertSheetDrinkId] = useState<string | null>(null)
  const [alertScope, setAlertScope] = useState<'store' | 'radius' | 'anywhere'>('store')
  const [alertRadius, setAlertRadius] = useState(10)
  const [alertSubmitting, setAlertSubmitting] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const [toastVisible, setToastVisible] = useState(false)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  function showToast(message: string) {
    clearTimeout(toastTimer.current)
    setToastMessage(message)
    setToastVisible(true)
    toastTimer.current = setTimeout(() => setToastVisible(false), 2500)
  }
  const [search, setSearch] = useState('')
  const { prefs } = usePreferences()
  const [stockFilter, setStockFilter] = useState<'all' | 'spotted' | 'not_there'>('all')
  // How many times each flavor was spotted here today (/api/stores/sightings).
  const [todayCounts, setTodayCounts] = useState<Record<string, number>>({})
  const [todayTotal, setTodayTotal] = useState(0)
  const [showAddDrink, setShowAddDrink] = useState(false)
  const [drinkEntries, setDrinkEntries] = useState<{ id: string; brand: string; flavor: string; caffeine_mg: string; duplicate: boolean }[]>([{ id: '1', brand: '', flavor: '', caffeine_mg: '', duplicate: false }])
  const [drinkSubmitting, setDrinkSubmitting] = useState(false)
  const [drinkResults, setDrinkResults] = useState<{ added: number; skipped: number; names: string[] } | null>(null)
  const [drinkDuplicatePopup, setDrinkDuplicatePopup] = useState<string[] | null>(null)
  // Drink catalog for the Add-a-flavor suggestions (loaded when the sheet opens).
  const [catalog, setCatalog] = useState<{ id: string; brand: string; name: string; flavor: string | null }[]>([])
  const [suggestFor, setSuggestFor] = useState<{ id: string; field: 'brand' | 'flavor' } | null>(null)
  const catalogBrands = useMemo(() => [...new Set(catalog.map((d) => d.brand))].sort(), [catalog])
  useEffect(() => {
    if (!showAddDrink || catalog.length) return
    supabase.from('drinks').select('id, brand, name, flavor').then(({ data }) => { if (data) setCatalog(data) })
  }, [showAddDrink, catalog.length])

  // Lets the map/list "Report it" links jump straight to the flag modal
  // instead of landing on the store page with no obvious next step.
  useEffect(() => {
    if (params.get('flag') === '1') setShowFlag(true)
  }, [params])

  // Saved-store heart and flavor bells need the signed-in user, which can
  // arrive after the first render — so they re-run when it does.
  useEffect(() => {
    fetchFavorite()
    fetchDrinkAlerts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user?.id])

  useEffect(() => {
    fetchStore()
    fetchStock()

    const channel = supabase
      .channel(`store-detail:${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'stock_reports', filter: `store_id=eq.${id}` }, onLiveReport)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [id])

  async function fetchStore() {
    const { data, error } = await supabase.from('stores').select('*').eq('id', id).single()
    if (data) setStore(data)
    else if (error) setStoreError(true)
  }

  async function fetchFavorite() {
    if (!user) return
    const { data } = await supabase
      .from('favorites')
      .select('id')
      .eq('user_id', user.id)
      .eq('store_id', id)
      .maybeSingle()
    if (data) { setIsFavorited(true); setFavoriteId(data.id) }
  }

  // Bumped when a store is saved / a flavor is followed, to replay the
  // heart-pop and bell-wiggle animations only on those actions (not on load).
  const [heartAnim, setHeartAnim] = useState(0)
  const [bellAnim, setBellAnim] = useState<{ id: string; n: number } | null>(null)

  async function toggleFavorite() {
    if (!user || favoritingLoading) return
    setFavoritingLoading(true)
    if (isFavorited && favoriteId) {
      await supabase.from('favorites').delete().eq('id', favoriteId)
      setIsFavorited(false)
      setFavoriteId(null)
      showToast('Removed from favorites')
    } else {
      const { data } = await supabase.from('favorites').insert({ user_id: user.id, store_id: id }).select('id').single()
      if (data) { setIsFavorited(true); setFavoriteId(data.id); setHeartAnim((n) => n + 1); showToast('Added to favorites') }
    }
    setFavoritingLoading(false)
  }

  async function fetchDrinkAlerts() {
    if (!user) return
    const { data } = await supabase.from('drink_alerts').select('drink_id').eq('user_id', user.id)
    if (data) setDrinkAlerts(new Set(data.map((a) => a.drink_id)))
  }

  // Active bell → instant unfollow. Inactive bell → open the scope sheet,
  // since following needs a scope decision but unfollowing doesn't.
  async function toggleDrinkAlert(drinkId: string) {
    if (!user) { showToast('Sign in to set alerts'); return }
    if (drinkAlerts.has(drinkId)) {
      setDrinkAlerts((prev) => { const n = new Set(prev); n.delete(drinkId); return n })
      const { error } = await supabase.from('drink_alerts').delete().eq('user_id', user.id).eq('drink_id', drinkId)
      if (error) {
        setDrinkAlerts((prev) => new Set(prev).add(drinkId))
        showToast('Could not remove alert — try again.')
        return
      }
      showToast('Alert removed')
    } else {
      if (user && (await alertSlotsLeft(user.id, !!isTracker)) <= 0) { setAlertLimitOpen(true); return }
      setAlertScope('store')
      setAlertRadius(10)
      setAlertSheetDrinkId(drinkId)
    }
  }

  // Share link previews show the store's live stock (./opengraph-image.tsx).
  async function shareStore() {
    const url = `${window.location.origin}/store/${id}`
    const r = await shareLink({ url, title: `${name} on AmpedMap`, text: inStockTotal > 0 ? `${inStockTotal} flavors spotted at ${name}` : `What's been spotted at ${name}` })
    if (r === 'copied') showToast('Link copied')
    else if (r === 'failed') showToast('Could not share this store')
  }

  async function saveDrinkAlert() {
    if (!user || !alertSheetDrinkId || !store || alertSubmitting) return
    setAlertSubmitting(true)
    const { error } = await supabase.from('drink_alerts').upsert(
      {
        user_id: user.id,
        drink_id: alertSheetDrinkId,
        scope: alertScope,
        store_id: alertScope === 'store' ? id : null,
        radius_miles: alertScope === 'radius' ? alertRadius : null,
        anchor_lat: alertScope === 'radius' ? store.lat : null,
        anchor_lng: alertScope === 'radius' ? store.lng : null,
      },
      { onConflict: 'user_id,drink_id' }
    )
    setAlertSubmitting(false)
    if (!error) {
      setDrinkAlerts((prev) => new Set(prev).add(alertSheetDrinkId))
      setBellAnim((b) => ({ id: alertSheetDrinkId, n: (b?.n ?? 0) + 1 }))
      setAlertSheetDrinkId(null)
      showToast("You'll be notified when it's back")
    } else if (isAlertLimitError(error)) {
      setAlertSheetDrinkId(null)
      setAlertLimitOpen(true)
    } else {
      showToast('Could not save alert — try again.')
    }
  }

  // Flavors whose level changed in a live update (someone reported while
  // this page is open) — their rows flash and the level pill pops.
  const prevLevels = useRef<Map<string, string> | null>(null)
  const [changedIds, setChangedIds] = useState<Set<string>>(new Set())
  const changedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // drink_id → username of whoever filed its latest report ("by @name").
  const [reporters, setReporters] = useState<Record<string, string>>({})
  const [reporterAvatars, setReporterAvatars] = useState<Record<string, string>>({})
  async function fetchReporters(): Promise<Record<string, string>> {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return {}
    const res = await fetch(`/api/stores/reporters?store_id=${id}`, { headers: { Authorization: `Bearer ${session.access_token}` } }).catch(() => null)
    if (!res?.ok) return {}
    const json = await res.json()
    setReporters(json.reporters ?? {})
    setReporterAvatars(json.avatars ?? {})
    return json.reporters ?? {}
  }

  // "@name just spotted Kiwi Guava" — slides in when someone else logs a
  // sighting at this store while the page is open.
  const [justReported, setJustReported] = useState<{ key: number; name: string | null; avatar: string | null; drink: string; sighting: Sighting } | null>(null)
  const justTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const userIdRef = useRef<string | null>(null)
  userIdRef.current = user?.id ?? null
  async function onLiveReport(payload: { new: Record<string, any> }) {
    const r = payload.new
    const reportersP = fetchStock()
    if (!r?.drink_id || (r.user_id && r.user_id === userIdRef.current)) return
    const [{ data: d }, names] = await Promise.all([
      supabase.from('drinks').select('brand, name, flavor').eq('id', r.drink_id).maybeSingle(),
      reportersP,
    ])
    const name = names[r.drink_id] ?? null
    setJustReported({ key: Date.now(), name, avatar: null, drink: d ? (d.flavor || d.name) : 'a flavor', sighting: sightingOf(r) })
    clearTimeout(justTimer.current)
    justTimer.current = setTimeout(() => setJustReported(null), 4500)
  }

  async function fetchToday() {
    const res = await fetch(`/api/stores/sightings?store_id=${encodeURIComponent(id)}&tz=${new Date().getTimezoneOffset()}`).catch(() => null)
    const body = res?.ok ? await res.json().catch(() => null) : null
    if (body) { setTodayCounts(body.spotted ?? {}); setTodayTotal(body.total ?? 0) }
  }

  async function fetchStock(): Promise<Record<string, string>> {
    const reportersP = fetchReporters()
    fetchToday()
    // '*' so the new sighting / amount columns come back once the migration
    // has run, and the legacy quantity before that (src/lib/sightings.ts).
    const { data: rawStock, error } = await supabase
      .from('latest_stock')
      .select('*')
      .eq('store_id', id)
    const stockData = (rawStock ?? []).map((r: any) => ({ ...r, sighting: sightingOf(r), amount: amountOf(r) }))
    if (error) { setStockError(true); setLoading(false); return reportersP }

    const drinkIds = [...new Set((stockData ?? []).map((d: any) => d.drink_id).filter(Boolean))]

    if (drinkIds.length > 0) {
      const { data: drinksData } = await supabase
        .from('drinks')
        .select('id, name, brand, flavor, caffeine_mg')
        .in('id', drinkIds)
      const drinksMap: Record<string, any> = {}
      drinksData?.forEach((d) => { drinksMap[d.id] = d })
      setStock((stockData ?? []).map((s: any) => ({ ...s, drink: drinksMap[s.drink_id] ?? null })))
      const next = new Map((stockData ?? []).map((r: any) => [r.drink_id, `${r.sighting}|${r.amount}|${r.reported_at}`]))
      if (prevLevels.current) {
        const changed = new Set([...next].filter(([id, v]) => prevLevels.current!.get(id) !== v).map(([id]) => id))
        if (changed.size) {
          setChangedIds(changed)
          clearTimeout(changedTimer.current)
          changedTimer.current = setTimeout(() => setChangedIds(new Set()), 2000)
        }
      }
      prevLevels.current = next
    } else {
      setStock([])
    }

    setLoading(false)
    return reportersP
  }

  function toggleBrand(brand: string) {
    setExpandedBrands((prev) => {
      const next = new Set(prev)
      next.has(brand) ? next.delete(brand) : next.add(brand)
      return next
    })
  }

  function updateEntry(id: string, field: 'brand' | 'flavor' | 'caffeine_mg', value: string) {
    setDrinkEntries((prev) => prev.map((e) => e.id === id ? { ...e, [field]: value, duplicate: false } : e))
  }

  function normalizeEntryBrand(id: string) {
    setDrinkEntries((prev) => prev.map((e) => e.id === id ? { ...e, brand: normalizeBrand(e.brand) } : e))
  }

  function addEntry() {
    setDrinkEntries((prev) => [...prev, { id: String(Date.now()), brand: '', flavor: '', caffeine_mg: '', duplicate: false }])
  }

  function removeEntry(id: string) {
    setDrinkEntries((prev) => prev.length > 1 ? prev.filter((e) => e.id !== id) : prev)
  }

  async function isDuplicate(brand: string, flavor: string): Promise<boolean> {
    const aliasVariants = Object.entries(BRAND_ALIASES)
      .filter(([, canonical]) => canonical.toLowerCase() === brand.toLowerCase())
      .map(([alias]) => alias)
    const brandsToCheck = [...new Set([brand, ...aliasVariants])]
    const { data } = await supabase
      .from('drinks')
      .select('id')
      .in('brand', brandsToCheck.flatMap((b) => [b, b.toLowerCase(), b.toUpperCase(), b.charAt(0).toUpperCase() + b.slice(1).toLowerCase()]))
      .ilike('flavor', flavor)
      .maybeSingle()
    return !!data
  }

  async function submitAddDrink() {
    const filled = drinkEntries.filter((e) => e.brand.trim() && e.flavor.trim())
    if (filled.length === 0) return
    setDrinkSubmitting(true)

    // Daily limit for free tier
    if (!isTracker && user) {
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
      const { count } = await supabase
        .from('drinks')
        .select('id', { count: 'exact', head: true })
        .eq('submitted_by', user.id)
        .gte('created_at', todayStart.toISOString())
      if ((count ?? 0) >= 25) {
        showToast('Daily limit of 25 new drinks reached')
        setDrinkSubmitting(false)
        return
      }
    }

    const duplicateFlags = await Promise.all(
      filled.map((e) => isDuplicate(normalizeBrand(e.brand), e.flavor.trim()))
    )

    const updatedEntries = drinkEntries.map((e) => {
      const idx = filled.findIndex((f) => f.id === e.id)
      if (idx === -1) return e
      return { ...e, duplicate: duplicateFlags[idx] }
    })
    setDrinkEntries(updatedEntries)

    const toInsert = filled.filter((_, i) => !duplicateFlags[i])
    const dupeNames = filled
      .filter((_, i) => duplicateFlags[i])
      .map((e) => `${normalizeBrand(e.brand)} ${e.flavor.trim()}`)

    if (toInsert.length === 0) {
      setDrinkDuplicatePopup(dupeNames)
      setDrinkSubmitting(false)
      return
    }

    await supabase.from('drinks').insert(
      toInsert.map((e) => {
        const brand = normalizeBrand(e.brand)
        const flavor = e.flavor.trim()
        const caffeine_mg = e.caffeine_mg.trim() ? parseInt(e.caffeine_mg.trim()) : null
        return { brand, name: `${brand} ${flavor}`, flavor, caffeine_mg, submitted_by: user?.id ?? null }
      })
    )

    const addedNames = toInsert.map((e) => `${normalizeBrand(e.brand)} ${e.flavor.trim()}`)
    setDrinkResults({ added: toInsert.length, skipped: dupeNames.length, names: addedNames })
    setDrinkSubmitting(false)
  }

  async function submitFlag() {
    if (!flagReason) return
    setFlagSubmitting(true)
    await supabase.from('store_flags').insert({
      store_id: id,
      user_id: user?.id ?? null,
      reason: flagReason,
      notes: flagNotes.trim() || null,
    })
    setFlagSubmitting(false)
    setFlagDone(true)
    showToast('Flag submitted — thanks!')
  }

  function closeFlag() {
    setShowFlag(false)
    setFlagReason('')
    setFlagNotes('')
    setFlagSubmitting(false)
    setFlagDone(false)
  }

  function closeAddDrink() {
    setShowAddDrink(false)
    setDrinkEntries([{ id: '1', brand: '', flavor: '', caffeine_mg: '', duplicate: false }])
    setDrinkSubmitting(false)
    setDrinkResults(null)
    setDrinkDuplicatePopup(null)
  }

  const latestReport = stock.reduce<any>((latest, item) => {
    if (!latest) return item
    return new Date(item.reported_at) > new Date(latest.reported_at) ? item : latest
  }, null)

  const isSearching = search.trim().length > 0
  const filteredStock = isSearching
    ? stock.filter((item) => {
        const q = search.toLowerCase()
        return (
          item.drink?.brand?.toLowerCase().includes(q) ||
          item.drink?.name?.toLowerCase().includes(q) ||
          item.drink?.flavor?.toLowerCase().includes(q)
        )
      })
    : stock

  // Freshest reports first: brands appear in order of their most recent
  // report (object insertion order), so the most current info is on top.
  const byBrand = [...filteredStock]
    // Favorite brands (from the welcome flow) first, then most recently reported.
    .sort((a, b) => {
      const fa = prefs.brands.includes(a.drink?.brand) ? 0 : 1
      const fb = prefs.brands.includes(b.drink?.brand) ? 0 : 1
      return (fa - fb) || (new Date(b.reported_at).getTime() - new Date(a.reported_at).getTime())
    })
    .reduce<Record<string, any[]>>((acc, item) => {
    const brand = item.drink?.brand ?? 'Other'
    if (!acc[brand]) acc[brand] = []
    acc[brand].push(item)
    return acc
  }, {})

  const staleColor = latestReport ? stalenessColor(latestReport.reported_at) : null
  const inStockTotal = stock.filter((i) => i.sighting === 'spotted').length

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg)', position: 'relative', overflowX: 'hidden' }}>
      <style>{`@keyframes fadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }`}</style>

      {/* ── Sticky header — consolidates the old separate compact bar +
          large hero into one compact icon-in-circle header, matching
          Report Stock's store-head treatment. ────────────────────── */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          backgroundColor: 'var(--header-bg)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid var(--fg-06)',
          paddingTop: 'env(safe-area-inset-top)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px' }}>
          <button onClick={() => router.back()} aria-label="Back" className={ui.iconBtn} style={{ width: 38, height: 38, flexShrink: 0 }}>
            <ChevronLeftIcon size={18} color="var(--text)" />
          </button>
          <span style={{ width: 42, height: 42, borderRadius: 12, flexShrink: 0, background: 'var(--fg-06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <StoreTypeIcon type={store?.type} size={21} color="var(--text-muted)" />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 17, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</p>
            {store?.address && (
              <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{store.address}</p>
            )}
          </div>
          <button
            onClick={toggleFavorite}
            disabled={favoritingLoading}
            aria-label={isFavorited ? 'Remove from saved stores' : 'Save this store'}
            title={isFavorited ? 'Remove from saved stores' : 'Save this store'}
            className={ui.iconBtn}
            style={{ position: 'relative', width: 38, height: 38, flexShrink: 0, background: isFavorited ? 'rgba(255,69,69,0.12)' : undefined, borderColor: isFavorited ? 'rgba(255,69,69,0.4)' : undefined }}
          >
            <Burst trigger={isFavorited ? heartAnim : 0} colors={['#FF4545', '#FF8A3D', '#F472B6', '#FF4545']} />
            <span key={heartAnim} className={heartAnim > 0 && isFavorited ? 'anim-pop' : ''} style={{ display: 'flex' }}>
              <HeartIcon size={16} color={isFavorited ? '#FF4545' : 'var(--text-muted)'} filled={isFavorited} />
            </span>
          </button>
          <button onClick={shareStore} aria-label="Share this store" title="Share this store" className={ui.iconBtn} style={{ width: 38, height: 38, flexShrink: 0 }}>
            <ShareIcon size={16} color="var(--text-muted)" />
          </button>
          <button onClick={() => setShowFlag(true)} aria-label="Report a problem with this store" title="Report a problem with this store" className={ui.iconBtn} style={{ width: 38, height: 38, flexShrink: 0 }}>
            <FlagIcon size={15} color="var(--text-muted)" />
          </button>
        </div>
      </div>

      <Toast message={toastMessage} visible={toastVisible} />
      {justReported && (
        <div key={justReported.key} className="toast-drop" role="status"
          style={{ position: 'fixed', left: '50%', top: 'calc(env(safe-area-inset-top) + 12px)', zIndex: 70, maxWidth: 'calc(100% - 32px)', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px 8px 8px', borderRadius: 999, background: 'var(--surface)', border: '1px solid rgba(201,244,0,0.35)', boxShadow: '0 8px 24px rgba(0,0,0,0.35)', fontSize: 14, color: 'var(--text-muted)' }}>
          {justReported.name
            ? <Avatar name={justReported.name} url={reporterAvatars[justReported.name]} size={24} />
            : <span className="live-dot" style={{ width: 10, height: 10, margin: '0 7px', borderRadius: '50%', background: '#C9F400', flexShrink: 0 }} />}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <strong style={{ color: 'var(--text)', fontWeight: 600 }}>{justReported.name ? `@${justReported.name}` : 'Someone'}</strong> {justReported.sighting === 'spotted' ? 'just spotted' : 'couldn’t find'}{' '}
            <span style={{ color: justReported.sighting === 'spotted' ? SPOTTED_TEXT : NOT_THERE_HEX, fontWeight: 600 }}>{justReported.drink}</span>
          </span>
        </div>
      )}

      <div style={{ position: 'relative', zIndex: 1 }}>

        {/* ── Sightings overview ── */}
        {!storeError && !stockError && !loading && stock.length > 0 && (() => {
          const notThere = stock.filter((s) => s.sighting === 'not_there').length
          return (
            <div className={`${ui.card} anim-rise`} style={{ margin: '16px 16px 0' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 28, fontWeight: 700, color: 'var(--text)', lineHeight: 1 }}><CountUp value={inStockTotal} duration={600} /></span>
                <span style={{ fontSize: 16, color: 'var(--text-muted)' }}>flavor{inStockTotal === 1 ? '' : 's'} spotted here</span>
              </div>
              {latestReport && (
                <p style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '8px 0 0', fontSize: 14, color: 'var(--text-muted)' }}>
                  <span className={Date.now() - new Date(latestReport.reported_at).getTime() < 2 * 3600000 ? 'live-dot' : ''} style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: staleColor ?? 'var(--fg-25)', flexShrink: 0 }} />
                  {`Last checked ${agoText(latestReport.reported_at)}`}
                  {todayTotal > 0 && <span>· {todayTotal} sighting{todayTotal === 1 ? '' : 's'} today</span>}
                </p>
              )}
              {notThere > 0 && (
                <p style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '6px 0 0', fontSize: 13, color: 'var(--text-dim)' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: NOT_THERE_HEX }} />
                  {notThere} flavor{notThere === 1 ? '' : 's'} not found last time someone checked
                </p>
              )}
            </div>
          )
        })()}

        {/* ── Actions ── */}
        {!storeError && (
          <div style={{ display: 'flex', gap: 10, margin: '14px 16px 0' }}>
            <button className={ui.btnPrimary} style={{ flex: 1 }} onClick={() => router.push(`/submit/drinks?storeId=${id}&storeName=${encodeURIComponent(name)}`)}>
              Log a sighting
            </button>
            {store?.lat != null && store?.lng != null && (
              <button className={ui.btnSecondary} style={{ flex: 1 }} onClick={() => openDirections(store.lat, store.lng)}>
                <DirectionsIcon size={16} color="var(--text)" /> Directions
              </button>
            )}
          </div>
        )}

        {/* ── Restock patterns (Tracker; free accounts see a teaser) ── */}
        {!storeError && !stockError && !loading && stock.length > 0 && user && (
          <RestockPatterns storeId={id} isTracker={!!isTracker} />
        )}

        {/* ── Content ───────────────────────────────────────────────── */}
        {storeError ? (
          <div className={ui.emptyState}>
            <GroceryIcon size={36} color="var(--text-dim)" />
            <p className={ui.emptyTitle}>Store not found</p>
            <p className={ui.emptyBody}>This store may have been removed.</p>
            <button onClick={() => router.back()} className={ui.btnSecondary} style={{ marginTop: 6 }}>Go back</button>
          </div>
        ) : stockError ? (
          <div className={ui.emptyState}>
            <GroceryIcon size={36} color="var(--text-dim)" />
            <p className={ui.emptyTitle}>Couldn&apos;t load stock</p>
            <p className={ui.emptyBody}>Check your connection and try again.</p>
            <button onClick={() => { setStockError(false); setLoading(true); fetchStock() }} className={ui.btnSecondary} style={{ marginTop: 6 }}>Try again</button>
          </div>
        ) : loading ? (
          <div style={{ padding: '16px 16px 0' }}><SkeletonList count={4} /></div>
        ) : stock.length === 0 ? (
          <div className={ui.emptyState}>
            <DrinkIcon size={36} color="var(--text-dim)" />
            <p className={ui.emptyTitle}>No reports yet</p>
            <p className={ui.emptyBody}>Be the first to log a sighting here.</p>
            <button onClick={() => setShowAddDrink(true)} style={addLinkStyle}>Flavor not in our list? Add it</button>
          </div>
        ) : (
          <div style={{ padding: '18px 16px 96px' }}>
            {/* Search + filters */}
            <div style={{ position: 'relative', marginBottom: 10 }}>
              <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', display: 'flex' }}><SearchIcon size={16} color="var(--text-dim)" /></span>
              <input
                type="text"
                placeholder="Search flavors or brands"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={`${ui.input} ${ui.inputWithIcon}`}
                style={{ paddingRight: 36, fontSize: 15 }}
              />
              {search.length > 0 && (
                <button onClick={() => setSearch('')} aria-label="Clear search" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', display: 'flex', cursor: 'pointer' }}>
                  <CloseIcon size={12} color="var(--text-dim)" />
                </button>
              )}
            </div>
            <div className={ui.chipRow} style={{ marginBottom: 16 }}>
              {([['all', 'All'], ['spotted', 'Spotted'], ['not_there', 'Not found']] as const).map(([key, label]) => (
                <button key={key} className={`${ui.chip} ${stockFilter === key ? ui.chipActive : ''}`} onClick={() => setStockFilter(key)}>{label}</button>
              ))}
            </div>

            {(() => {
              const brands = Object.entries(byBrand)
                .map(([brand, items]) => [brand, items.filter((i) => stockFilter === 'all' || i.sighting === stockFilter)] as const)
                .filter(([, items]) => items.length > 0)

              if (brands.length === 0) {
                return (
                  <div className={ui.emptyState} style={{ paddingTop: 24 }}>
                    <SearchIcon size={32} color="var(--text-dim)" />
                    <p className={ui.emptyTitle}>No matching flavors</p>
                    <p className={ui.emptyBody}>{isSearching ? 'Try a different brand or flavor name.' : stockFilter === 'not_there' ? 'Nothing marked not found.' : 'Nothing spotted here yet.'}</p>
                  </div>
                )
              }

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {brands.map(([brand, items]) => {
                    const all = byBrand[brand]
                    const inStock = all.filter((i) => i.sighting === 'spotted').length
                    const pct = all.length > 0 ? inStock / all.length : 0
                    const barColor = pct === 0 ? '#FF4545' : pct >= 0.75 ? '#C9F400' : '#FFB300'
                    const isExpanded = isSearching || stockFilter !== 'all' || brands.length <= 2 || expandedBrands.has(brand)
                    // Spotted first (most spotted today, then newest), Not found after.
                    const sorted = [...items].sort((a, b) => ((a.sighting === 'spotted' ? 0 : 1) - (b.sighting === 'spotted' ? 0 : 1)) || ((todayCounts[b.drink_id] ?? 0) - (todayCounts[a.drink_id] ?? 0)) || (new Date(b.reported_at).getTime() - new Date(a.reported_at).getTime()))
                    return (
                      <div key={brand} className={`${ui.card} reveal`} style={{ padding: 0, overflow: 'hidden' }}>
                        <button
                          onClick={() => toggleBrand(brand)}
                          aria-expanded={isExpanded}
                          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}
                        >
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: 'block', fontSize: 17, fontWeight: 600, color: 'var(--text)' }}>{brand}</span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                              <span style={{ flex: 1, height: 5, borderRadius: 999, overflow: 'hidden', background: 'var(--fg-08)' }}>
                                <span className="anim-fill" style={{ display: 'block', height: '100%', width: `${pct * 100}%`, borderRadius: 999, background: barColor }} />
                              </span>
                              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-muted)', flexShrink: 0 }}>{inStock} of {all.length} spotted</span>
                            </span>
                          </span>
                          <span style={{ display: 'flex', transition: 'transform 0.2s ease', transform: isExpanded ? 'rotate(180deg)' : 'none' }}>
                            <ChevronDownIcon size={18} color="var(--text-dim)" />
                          </span>
                        </button>

                        {isExpanded && (
                          <div className="anim-fade" style={{ borderTop: '1px solid var(--fg-06)' }}>
                            {sorted.map((item, idx) => {
                              const isOut = item.sighting === 'not_there'
                              // Older than a day reads as less reliable (muted).
                              const reliable = isReliable(item.reported_at)
                              const lineColor = !reliable ? 'var(--text-dim)' : isOut ? NOT_THERE_HEX : SPOTTED_TEXT
                              const times = todayCounts[item.drink_id] ?? 0
                              const following = drinkAlerts.has(item.drink_id)
                              return (
                                <div
                                  key={item.drink_id}
                                  className={changedIds.has(item.drink_id) ? 'anim-new' : undefined}
                                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderTop: idx === 0 ? 'none' : '1px solid var(--fg-06)', opacity: reliable ? 1 : 0.62 }}
                                >
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{ fontSize: 15, fontWeight: 500, color: isOut || !reliable ? 'var(--text-muted)' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {item.drink?.flavor ?? item.drink?.name}
                                    </p>
                                    <p style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, fontSize: 13, color: 'var(--text-dim)', flexWrap: 'wrap' }}>
                                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: lineColor, fontWeight: 500 }}>
                                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: !reliable ? 'var(--fg-25)' : isOut ? NOT_THERE_HEX : '#C9F400' }} />
                                        {isOut ? 'Not found' : 'Spotted'} {agoText(item.reported_at)}
                                      </span>
                                      {!isOut && times >= 2 && <span style={{ color: 'var(--text-muted)' }}>· {timesToday(times).replace('Spotted ', '')}</span>}
                                      {reporters[item.drink_id] && (
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>· by <Link href={`/u/${reporters[item.drink_id]}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)', fontWeight: 600, textDecoration: 'none' }}><Avatar name={reporters[item.drink_id]} url={reporterAvatars[reporters[item.drink_id]]} size={16} />@{reporters[item.drink_id]}</Link></span>
                                      )}
                                      {item.drink?.caffeine_mg ? <span>· {item.drink.caffeine_mg} mg caffeine</span> : null}
                                    </p>
                                  </div>
                                  {(isOut || item.amount) && (
                                    <span key={`${item.sighting}${item.amount}`} className={changedIds.has(item.drink_id) ? 'anim-pop' : undefined} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '4px 10px', borderRadius: 999, background: isOut ? 'rgba(255,69,69,0.1)' : 'var(--fg-06)', color: isOut ? NOT_THERE_HEX : 'var(--text)', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
                                      {isOut ? 'Not there' : AMOUNT_LABEL[item.amount as 'few' | 'plenty']}
                                    </span>
                                  )}
                                  <button
                                    onClick={(e) => { e.stopPropagation(); toggleDrinkAlert(item.drink_id) }}
                                    aria-label={following ? 'Stop watching this flavor' : 'Get notified when this restocks'}
                                    title={following ? 'Stop watching this flavor' : 'Get notified when this restocks'}
                                    style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: following ? 'rgba(201,244,0,0.14)' : 'transparent', border: `1px solid ${following ? 'rgba(201,244,0,0.5)' : 'var(--fg-10)'}` }}
                                  >
                                    <span key={bellAnim && bellAnim.id === item.drink_id ? bellAnim.n : 0} className={bellAnim?.id === item.drink_id && following ? 'anim-wiggle' : ''} style={{ display: 'flex' }}>
                                      <BellIcon size={14} color={following ? 'var(--accent-text)' : 'var(--text-dim)'} filled={following} />
                                    </span>
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })()}

            <div style={{ textAlign: 'center', marginTop: 22 }}>
              <button onClick={() => setShowAddDrink(true)} style={addLinkStyle}>Don&apos;t see a flavor? Add it</button>
            </div>
          </div>
        )}

        {/* ── Add Drink modal ───────────────────────────────────────── */}
        {showAddDrink && createPortal(
          <div
            className="anim-fade fixed inset-0 flex flex-col justify-end z-50"
            style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
            onClick={(e) => { if (e.target === e.currentTarget) closeAddDrink() }}
          >
            <div
              className="anim-sheet rounded-t-3xl p-5"
              style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--fg-08)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-9 h-1 rounded-sm mx-auto mb-4" style={{ backgroundColor: 'var(--fg-20)' }} />

              {drinkResults ? (
                <div className="flex flex-col items-center text-center gap-3 py-4">
                  <DrinkIcon size={48} color="var(--text-dim)" />
                  <p className="text-xl font-semibold text-white">
                    {drinkResults.added > 0 ? `${drinkResults.added} Drink${drinkResults.added !== 1 ? 's' : ''} Added!` : 'Nothing Added'}
                  </p>
                  {drinkResults.names.length > 0 && (
                    <div className="w-full flex flex-col gap-1.5">
                      {drinkResults.names.map((name) => (
                        <div key={name} className="rounded-xl px-3.5 py-2.5 text-sm font-semibold text-white/80 text-left flex items-center gap-2"
                          style={{ backgroundColor: 'rgba(201,244,0,0.08)', border: '1px solid var(--border)' }}>
                          <CheckIcon size={13} color="var(--accent-text)" /> {name}
                        </div>
                      ))}
                    </div>
                  )}
                  {drinkResults.skipped > 0 && (
                    <p className="text-xs text-[var(--text-dim)]">{drinkResults.skipped} skipped — already in the system.</p>
                  )}
                  {drinkResults.added > 0 && (
                    <button
                      className="mt-1 w-full rounded-2xl p-3.5 font-bold flex items-center justify-center gap-2"
                      style={{ backgroundColor: '#C9F400', color: '#0D1210' }}
                      onClick={() => router.push(`/submit/drinks?storeId=${id}&storeName=${encodeURIComponent(name)}`)}
                    >
                      <LightningIcon size={14} color="#0D1210" /> Report Stock
                    </button>
                  )}
                  <button
                    className="w-full rounded-2xl p-3.5 font-bold"
                    style={{ backgroundColor: drinkResults.added > 0 ? 'var(--fg-06)' : '#C9F400', color: drinkResults.added > 0 ? 'var(--fg-70)' : '#0D1210' }}
                    onClick={closeAddDrink}
                  >
                    Done
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-lg font-semibold text-white mb-1">Add Drinks</p>
                  <p className="text-xs text-[var(--text-dim)] mb-4">Add one or more new flavors below.</p>

                  <div className="flex flex-col gap-3 max-h-[55vh] overflow-y-auto pr-0.5 mb-4">
                    {drinkEntries.map((entry, idx) => (
                      <div
                        key={entry.id}
                        className="rounded-2xl p-3.5"
                        style={{ backgroundColor: 'var(--bg)', border: `1px solid ${entry.duplicate ? 'rgba(245,158,11,0.4)' : 'var(--fg-07)'}` }}
                      >
                        <div className="flex items-center justify-between mb-2.5">
                          <p className="text-sm font-semibold text-[var(--text-muted)]">Flavor {idx + 1}</p>
                          {drinkEntries.length > 1 && (
                            <button onClick={() => removeEntry(entry.id)} className="text-[var(--text-dim)]" style={{ display: 'flex' }}><CloseIcon size={11} color="rgba(255,255,255,0.25)" /></button>
                          )}
                        </div>
                        {(() => {
                          // Catalog-aware suggestions: existing brands as you type,
                          // the flavors that brand already has, and a live warning
                          // when this exact flavor already exists.
                          const brandMatches = entry.brand.trim()
                            ? catalogBrands.filter((b) => norm(b).includes(norm(entry.brand)) && norm(b) !== norm(entry.brand)).slice(0, 5)
                            : []
                          const knownBrand = catalogBrands.find((b) => norm(b) === norm(entry.brand))
                          const brandFlavors = knownBrand ? catalog.filter((d) => d.brand === knownBrand) : []
                          const flavorMatches = brandFlavors
                            .filter((d) => !entry.flavor.trim() || norm(d.flavor ?? d.name).includes(norm(entry.flavor)))
                            .slice(0, 5)
                          const exists = knownBrand && entry.flavor.trim() ? brandFlavors.find((d) => norm(d.flavor ?? d.name) === norm(entry.flavor)) : undefined
                          return (
                            <>
                              <input
                                type="text"
                                placeholder="Brand (e.g. Monster)"
                                value={entry.brand}
                                onChange={(e) => updateEntry(entry.id, 'brand', e.target.value)}
                                onFocus={() => setSuggestFor({ id: entry.id, field: 'brand' })}
                                onBlur={() => { normalizeEntryBrand(entry.id); setTimeout(() => setSuggestFor(null), 150) }}
                                className={ui.input}
                                style={{ marginBottom: 8 }}
                              />
                              {suggestFor?.id === entry.id && suggestFor.field === 'brand' && brandMatches.length > 0 && (
                                <div className="anim-rise" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '-2px 0 10px' }}>
                                  {brandMatches.map((b) => (
                                    <button key={b} className={ui.chip} style={{ fontSize: 13 }} onMouseDown={(e) => e.preventDefault()} onClick={() => updateEntry(entry.id, 'brand', b)}>{b}</button>
                                  ))}
                                </div>
                              )}
                              <input
                                type="text"
                                placeholder="Flavor (e.g. Ultra White)"
                                value={entry.flavor}
                                onChange={(e) => updateEntry(entry.id, 'flavor', e.target.value)}
                                onFocus={() => setSuggestFor({ id: entry.id, field: 'flavor' })}
                                onBlur={() => setTimeout(() => setSuggestFor(null), 150)}
                                className={ui.input}
                                style={{ marginBottom: 8, borderColor: exists ? 'rgba(255,179,0,0.6)' : undefined }}
                              />
                              {exists ? (
                                <div className="anim-rise" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '-2px 0 10px', padding: '8px 10px', borderRadius: 10, background: 'rgba(255,179,0,0.1)' }}>
                                  <p style={{ flex: 1, fontSize: 13, color: 'var(--text-muted)' }}><strong style={{ color: 'var(--text)', fontWeight: 600 }}>{knownBrand} {exists.flavor ?? exists.name}</strong> is already in the catalog.</p>
                                  <button className={ui.linkQuiet} style={{ color: 'var(--accent-text)', fontWeight: 600, textDecoration: 'none', flexShrink: 0 }} onClick={() => router.push(`/submit/drinks?storeId=${id}&storeName=${encodeURIComponent(name)}`)}>Report it</button>
                                </div>
                              ) : suggestFor?.id === entry.id && suggestFor.field === 'flavor' && flavorMatches.length > 0 && (
                                <div className="anim-rise" style={{ margin: '-2px 0 10px' }}>
                                  <p style={{ fontSize: 12, color: 'var(--text-dim)', margin: '0 2px 6px' }}>Already in the catalog for {knownBrand}{brandFlavors.length > 5 ? ` (${brandFlavors.length} flavors)` : ''}:</p>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                    {flavorMatches.map((d) => (
                                      <span key={d.id} className={ui.chip} style={{ fontSize: 13, cursor: 'default', opacity: 0.85 }}>{d.flavor ?? d.name}</span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </>
                          )
                        })()}
                        <input
                          type="number"
                          placeholder="Caffeine mg (optional, e.g. 200)"
                          value={entry.caffeine_mg}
                          onChange={(e) => updateEntry(entry.id, 'caffeine_mg', e.target.value)}
                          className={ui.input}
                        />
                        {entry.duplicate && (
                          <div className="flex items-center gap-2 mt-2.5">
                            <span style={{ fontSize: 13 }}>⚠️</span>
                            <p className="text-xs font-semibold" style={{ color: '#FFB300' }}>
                              Already in the system — skipped.
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <button
                    className="w-full rounded-xl py-2.5 text-sm font-semibold mb-4 flex items-center justify-center gap-1.5"
                    style={{ backgroundColor: 'var(--fg-05)', border: '1px solid var(--fg-10)', color: 'var(--fg-55)' }}
                    onClick={addEntry}
                  >
                    <span>+</span> Add Another
                  </button>

                  <div className="flex gap-2.5">
                    <button
                      className="flex-1 rounded-xl p-3.5 font-semibold text-sm"
                      style={{ backgroundColor: 'var(--fg-06)', color: 'var(--text-muted)' }}
                      onClick={closeAddDrink}
                    >
                      Cancel
                    </button>
                    <button
                      className="flex-1 rounded-xl p-3.5 font-bold text-sm flex items-center justify-center"
                      style={{
                        color: '#0D1210',
                        backgroundColor: drinkSubmitting || drinkEntries.every((e) => !e.brand.trim() || !e.flavor.trim())
                          ? 'rgba(201,244,0,0.4)' : '#C9F400'
                      }}
                      disabled={drinkSubmitting || drinkEntries.every((e) => !e.brand.trim() || !e.flavor.trim())}
                      onClick={submitAddDrink}
                    >
                      {drinkSubmitting
                        ? <div className="w-4 h-4 border-2 border-black/40 border-t-black rounded-full animate-spin" />
                        : `Submit ${drinkEntries.filter((e) => e.brand.trim() && e.flavor.trim()).length > 1 ? `${drinkEntries.filter((e) => e.brand.trim() && e.flavor.trim()).length} Drinks` : 'Drink'}`}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>,
          document.body
        )}

        {/* ── Duplicate drink popup ─────────────────────────────────── */}
        {drinkDuplicatePopup && createPortal(
          <div
            className="anim-fade fixed inset-0 z-[60] flex items-end justify-center"
            style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
            onClick={() => setDrinkDuplicatePopup(null)}
          >
            <div
              className="anim-sheet w-full max-w-md rounded-t-3xl p-6 pb-10"
              style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--fg-08)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-9 h-1 rounded-sm mx-auto mb-5" style={{ backgroundColor: 'var(--fg-20)' }} />
              <div className="flex items-center gap-3 mb-3">
                <DrinkIcon size={32} color="var(--text-dim)" />
                <p className="text-lg font-semibold text-white">
                  {drinkDuplicatePopup.length === 1 ? 'Already in the System' : 'Drinks Already Exist'}
                </p>
              </div>
              <p className="text-sm text-[var(--text-muted)] leading-relaxed mb-4">
                {drinkDuplicatePopup.length === 1
                  ? `"${drinkDuplicatePopup[0]}" is already in our drinks database. If it's at this store, use Report Stock to update its status.`
                  : 'These drinks are already in our database. Use Report Stock to update their status instead.'}
              </p>
              {drinkDuplicatePopup.length > 1 && (
                <div className="flex flex-col gap-1.5 mb-4">
                  {drinkDuplicatePopup.map((d) => (
                    <div key={d} className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ backgroundColor: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                      <span style={{ fontSize: 12 }}>⚠️</span>
                      <p className="text-sm font-semibold text-white/70">{d}</p>
                    </div>
                  ))}
                </div>
              )}
              <button
                className={`${ui.btnPrimary} ${ui.btnBlock} ${ui.btnLarge}`}
                onClick={() => setDrinkDuplicatePopup(null)}
              >
                Got it
              </button>
            </div>
          </div>,
          document.body
        )}

        {/* ── Flag location modal ──────────────────────────────────── */}
        {showFlag && createPortal(
          <div
            className="anim-fade fixed inset-0 flex flex-col justify-end z-50"
            style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
            onClick={(e) => { if (e.target === e.currentTarget) closeFlag() }}
          >
            <div
              className="anim-sheet rounded-t-3xl p-5"
              style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--fg-08)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-9 h-1 rounded-sm mx-auto mb-4" style={{ backgroundColor: 'var(--fg-20)' }} />

              {flagDone ? (
                <div className="flex flex-col items-center text-center gap-3 py-4">
                  <CheckIcon size={40} color="var(--accent-text)" />
                  <p className="text-xl font-semibold text-white">Thanks for the report!</p>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>We'll review this location and correct any issues.</p>
                  <button
                    className={`${ui.btnPrimary} ${ui.btnBlock} ${ui.btnLarge}`}
                    style={{ marginTop: 8 }}
                    onClick={closeFlag}
                  >
                    Done
                  </button>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <FlagIcon size={18} color="var(--text-dim)" />
                    <p style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>Report a problem</p>
                  </div>
                  <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 16 }}>What&apos;s wrong with {name || 'this store'}? An admin will take a look.</p>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                    {FLAG_REASONS.map((r) => (
                      <button key={r.label} className={`${ui.chip} ${flagReason === r.label ? ui.chipActive : ''}`} onClick={() => setFlagReason(r.label)}>
                        {r.label}
                      </button>
                    ))}
                  </div>

                  {flagReason && (
                    <div className="anim-rise" style={{ marginBottom: 16 }}>
                      <p className={ui.sectionLabel} style={{ margin: '0 2px 8px' }}>Details (optional)</p>
                      <textarea
                        placeholder={FLAG_REASONS.find((r) => r.label === flagReason)?.hint}
                        value={flagNotes}
                        onChange={(e) => setFlagNotes(e.target.value.slice(0, 300))}
                        rows={3}
                        className={ui.input}
                        style={{ resize: 'none' }}
                      />
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className={ui.btnSecondary} style={{ flex: 1 }} onClick={closeFlag}>Cancel</button>
                    <button className={`${ui.btnPrimary} ${ui.btnLarge}`} style={{ flex: 1 }} disabled={!flagReason || flagSubmitting} onClick={submitFlag}>
                      {flagSubmitting ? 'Sending…' : 'Send report'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>,
          document.body
        )}

        {alertSheetDrinkId && createPortal(
          <div
            className="anim-fade fixed inset-0 flex flex-col justify-end z-50"
            style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
            onClick={(e) => { if (e.target === e.currentTarget) setAlertSheetDrinkId(null) }}
          >
            <div
              className="anim-sheet rounded-t-3xl p-5"
              style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--fg-08)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-9 h-1 rounded-sm mx-auto mb-4" style={{ backgroundColor: 'var(--fg-20)' }} />

              <div className="flex items-center gap-2.5 mb-1">
                <BellIcon size={18} color="var(--accent-text)" filled />
                <p className="text-lg font-semibold text-white">
                  Alert me for {(() => {
                    const d = stock.find((i) => i.drink_id === alertSheetDrinkId)?.drink
                    return d?.flavor ?? d?.name ?? 'this drink'
                  })()}
                </p>
              </div>
              <p className="text-xs mb-5" style={{ color: 'var(--text-dim)' }}>Choose where we watch for it</p>

              <div className="flex flex-col gap-2 mb-4">
                {([
                  { value: 'store' as const, label: 'This store only', sub: store?.name ?? '' },
                  { value: 'radius' as const, label: `Within ${alertRadius} miles`, sub: 'Any store in range' },
                  { value: 'anywhere' as const, label: 'Anywhere', sub: 'Any store you\'ve added' },
                ]).map((opt) => (
                  <button
                    key={opt.value}
                    className="flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-left"
                    style={{
                      backgroundColor: alertScope === opt.value ? 'rgba(201,244,0,0.08)' : 'var(--fg-04)',
                      border: `1.5px solid ${alertScope === opt.value ? 'rgba(201,244,0,0.4)' : 'var(--fg-07)'}`,
                    }}
                    onClick={() => setAlertScope(opt.value)}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: alertScope === opt.value ? '#fff' : 'var(--fg-60)' }}>{opt.label}</p>
                      <p className="text-xs truncate" style={{ color: 'var(--text-dim)' }}>{opt.sub}</p>
                    </div>
                    <div
                      className="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0"
                      style={{ borderColor: alertScope === opt.value ? '#C9F400' : 'var(--fg-20)' }}
                    >
                      {alertScope === opt.value && <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#C9F400' }} />}
                    </div>
                  </button>
                ))}
              </div>

              {alertScope === 'radius' && (
                <div className="flex gap-2 mb-4">
                  {[5, 10, 25].map((r) => (
                    <button
                      key={r}
                      onClick={() => setAlertRadius(r)}
                      className="flex-1 rounded-xl py-2 text-sm font-bold"
                      style={{
                        backgroundColor: alertRadius === r ? '#C9F400' : 'var(--fg-04)',
                        color: alertRadius === r ? '#0D1210' : 'var(--text-muted)',
                        border: `1px solid ${alertRadius === r ? '#C9F400' : 'var(--fg-08)'}`,
                      }}
                    >
                      {r} mi
                    </button>
                  ))}
                </div>
              )}

              <div className="flex gap-2.5">
                <button
                  className="flex-1 rounded-xl p-3.5 font-semibold text-sm"
                  style={{ backgroundColor: 'var(--fg-06)', color: 'var(--text-muted)' }}
                  onClick={() => setAlertSheetDrinkId(null)}
                >
                  Cancel
                </button>
                <button
                  className="flex-1 rounded-xl p-3.5 font-bold text-sm flex items-center justify-center"
                  style={{ backgroundColor: alertSubmitting ? 'rgba(201,244,0,0.4)' : '#C9F400', color: '#0D1210' }}
                  disabled={alertSubmitting}
                  onClick={saveDrinkAlert}
                >
                  {alertSubmitting
                    ? <div className="w-4 h-4 border-2 border-black/40 border-t-black rounded-full animate-spin" />
                    : 'Save Alert'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      </div>
      {alertLimitOpen && <UpgradeSheet {...ALERT_LIMIT_COPY(FREE_ALERT_LIMIT)} onClose={() => setAlertLimitOpen(false)} />}
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
