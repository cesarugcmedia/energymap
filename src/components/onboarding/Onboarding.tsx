'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase'
import { CloseIcon, DrinkIcon, PinIcon, LightningIcon, SearchIcon, StoreTypeIcon, BellIcon } from '@/components/Icons'
import ui from '@/components/ui/ui.module.css'
import { useAuth } from '@/contexts/AuthContext'
import { FREE_ALERT_LIMIT, isTrackerProfile } from '@/lib/plans'
import type { Preferences } from '@/lib/preferences'

type DrinkLite = { id: string; brand: string; flavor: string }

const STORE_TYPES = [
  { value: 'gas_station', label: 'Gas stations' },
  { value: 'convenience', label: 'Convenience stores' },
  { value: 'grocery', label: 'Grocery stores' },
  { value: 'other', label: 'Other' },
]

export type OnboardingSummary = { text: string; reportStore: { id: string; name: string } | null }

// First-time welcome flow (also reopened from Account → Your preferences).
// Four skippable steps — brands, flavors to follow, where you hunt, whether
// you'll report — then (first time only) a personalized finish screen.
export default function Onboarding({ userId, initial, mode, getSummary, onSave, onClose, onReport }: {
  userId: string
  initial: Preferences
  mode: 'first' | 'edit'
  getSummary?: (brands: string[]) => OnboardingSummary
  onSave: (prefs: Preferences) => Promise<void> | void
  onClose: () => void
  onReport?: (store: { id: string; name: string }) => void
}) {
  const [step, setStep] = useState(0)
  const prevStepRef = useRef(0)
  useEffect(() => { prevStepRef.current = step }, [step])
  const [brands, setBrands] = useState<string[]>(initial.brands)
  const [storeTypes, setStoreTypes] = useState<string[]>(initial.storeTypes)
  const [homeZip, setHomeZip] = useState(initial.homeZip ?? '')
  const [home, setHome] = useState<{ lat: number; lng: number } | null>(initial.homeLat != null && initial.homeLng != null ? { lat: initial.homeLat, lng: initial.homeLng } : null)
  const [wantsToReport, setWantsToReport] = useState<boolean | null>(initial.wantsToReport)
  const [catalog, setCatalog] = useState<DrinkLite[]>([])
  const [followed, setFollowed] = useState<Map<string, DrinkLite>>(new Map())
  const [alreadyFollowed, setAlreadyFollowed] = useState<Set<string>>(new Set())
  // Free accounts can follow FREE_ALERT_LIMIT flavors in all.
  const { profile } = useAuth()
  const room = isTrackerProfile(profile) ? Infinity : Math.max(0, FREE_ALERT_LIMIT - alreadyFollowed.size)
  const atLimit = followed.size >= room
  const [q, setQ] = useState('')
  const [zipState, setZipState] = useState<'idle' | 'checking' | 'ok' | 'error'>(initial.homeZip ? 'ok' : 'idle')
  const [saving, setSaving] = useState(false)
  const [summary, setSummary] = useState<OnboardingSummary | null>(null)

  useEffect(() => {
    supabase.from('drinks').select('id, brand, name, flavor').then(({ data }) => {
      setCatalog((data ?? []).map((d: any) => ({ id: d.id, brand: d.brand, flavor: d.flavor || d.name })))
    })
    supabase.from('drink_alerts').select('drink_id').eq('user_id', userId).then(({ data, error }) => {
      if (!error && data) setAlreadyFollowed(new Set(data.map((a: any) => a.drink_id)))
    })
  }, [userId])

  // Brands ranked by how many flavors we track for them.
  const brandOptions = useMemo(() => {
    const counts = new Map<string, number>()
    catalog.forEach((d) => counts.set(d.brand, (counts.get(d.brand) ?? 0) + 1))
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([b]) => b)
  }, [catalog])

  const flavorResults = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (term.length >= 2) return catalog.filter((d) => `${d.brand} ${d.flavor}`.toLowerCase().includes(term)).slice(0, 8)
    // Suggestions from the brands they picked.
    return brands.length ? catalog.filter((d) => brands.includes(d.brand)).slice(0, 10) : catalog.slice(0, 10)
  }, [q, catalog, brands])

  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  async function lookupZip() {
    if (!/^\d{5}$/.test(homeZip)) { setZipState('error'); return }
    setZipState('checking')
    try {
      const res = await fetch(`/api/geocode?q=${homeZip}`)
      if (!res.ok) { setZipState('error'); return }
      const { lat, lng } = await res.json()
      setHome({ lat, lng })
      setZipState('ok')
    } catch { setZipState('error') }
  }

  function useCurrentLocation() {
    navigator.geolocation?.getCurrentPosition(
      (p) => { setHome({ lat: p.coords.latitude, lng: p.coords.longitude }); setHomeZip(''); setZipState('ok') },
      () => setZipState('error'),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    )
  }

  async function finish() {
    setSaving(true)
    // Follow picked flavors (restock alerts, anywhere) — same table and
    // upsert as the store-page bell and Account's "Follow a flavor" search.
    const toFollow = [...followed.keys()].filter((id) => !alreadyFollowed.has(id))
    if (toFollow.length) {
      await supabase.from('drink_alerts').upsert(toFollow.map((drink_id) => ({ user_id: userId, drink_id, scope: 'anywhere' })), { onConflict: 'user_id,drink_id' })
    }
    const prefs: Preferences = {
      brands, storeTypes,
      homeZip: homeZip || null,
      homeLat: home?.lat ?? null,
      homeLng: home?.lng ?? null,
      wantsToReport,
      done: true,
    }
    await onSave(prefs)
    setSaving(false)
    if (mode === 'first' && getSummary) { setSummary(getSummary(brands)); setStep(steps.length) }
    else onClose()
  }

  async function skipAll() {
    await onSave({ ...initial, done: true })
    onClose()
  }

  const coreSteps = [
    {
      title: 'What do you drink?',
      sub: 'Pick your brands. We’ll show them first everywhere.',
      body: (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {brandOptions.length === 0 && <p style={{ color: 'var(--text-dim)', fontSize: 15 }}>Loading brands…</p>}
          {brandOptions.map((b) => (
            <button key={b} className={`${ui.chip} ${brands.includes(b) ? ui.chipActive : ''}`} style={{ padding: '10px 16px', fontSize: 15 }} onClick={() => setBrands(toggle(brands, b))}>{b}</button>
          ))}
        </div>
      ),
    },
    {
      title: 'Any flavor you’re hunting?',
      sub: 'Follow a few. We’ll tell you when they restock, even rare or discontinued ones.',
      body: (
        <>
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', display: 'flex' }}><SearchIcon size={16} color="var(--text-dim)" /></span>
            <input className={`${ui.input} ${ui.inputWithIcon}`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search flavors or brands" />
          </div>
          {followed.size > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {[...followed.values()].map((d) => (
                <span key={d.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 999, background: 'rgba(201,244,0,0.12)', color: 'var(--text)', fontSize: 14 }}>
                  <BellIcon size={12} color="var(--accent-text)" filled />{d.brand} {d.flavor}
                  <button aria-label="Remove" onClick={() => { const m = new Map(followed); m.delete(d.id); setFollowed(m) }} style={{ background: 'none', border: 'none', display: 'flex', padding: 0, cursor: 'pointer' }}><CloseIcon size={10} color="var(--text-dim)" /></button>
                </span>
              ))}
            </div>
          )}
          {atLimit && room !== Infinity && (
            <p style={{ fontSize: 14, color: 'var(--text-dim)', marginBottom: 10 }}>Free accounts can follow {FREE_ALERT_LIMIT} flavors. Tracker follows as many as you like.</p>
          )}
          <div className={ui.card} style={{ padding: 0, overflow: 'hidden' }}>
            {flavorResults.map((d, i) => {
              const on = followed.has(d.id) || alreadyFollowed.has(d.id)
              return (
                <button key={d.id} disabled={alreadyFollowed.has(d.id) || (atLimit && !followed.has(d.id))} onClick={() => { const m = new Map(followed); if (m.has(d.id)) m.delete(d.id); else if (!atLimit) m.set(d.id, d); setFollowed(m) }}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: 'none', border: 'none', borderTop: i ? '1px solid var(--fg-06)' : 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
                  <DrinkIcon size={16} color="var(--text-muted)" />
                  <span style={{ flex: 1, fontSize: 15, color: 'var(--text)' }}>{d.brand} {d.flavor}</span>
                  <BellIcon size={15} color={on ? 'var(--accent-text)' : 'var(--text-dim)'} filled={on} />
                </button>
              )
            })}
            {flavorResults.length === 0 && <p style={{ padding: 14, fontSize: 15, color: 'var(--text-dim)' }}>No matches.</p>}
          </div>
        </>
      ),
    },
    {
      title: 'Where do you usually look?',
      sub: 'We’ll start your map with these. Your home ZIP powers “Near me” when location is off.',
      body: (
        <>
          <p className={ui.sectionLabel}>Stores you shop at</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 22 }}>
            {STORE_TYPES.map((t) => {
              const on = storeTypes.includes(t.value)
              return (
                <button key={t.value} onClick={() => setStoreTypes(toggle(storeTypes, t.value))} className={ui.card}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', borderColor: on ? 'rgba(201,244,0,0.5)' : undefined, background: on ? 'rgba(201,244,0,0.06)' : undefined }}>
                  <StoreTypeIcon type={t.value} size={18} color={on ? 'var(--accent-text)' : 'var(--text-muted)'} />
                  <span style={{ flex: 1, fontSize: 15, color: 'var(--text)' }}>{t.label}</span>
                  <span style={{ width: 20, height: 20, borderRadius: 6, border: `1.5px solid ${on ? '#C9F400' : 'var(--fg-20)'}`, background: on ? '#C9F400' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {on && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0D1210" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
                  </span>
                </button>
              )
            })}
          </div>
          <p className={ui.sectionLabel}>Home area (optional)</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className={ui.input} inputMode="numeric" maxLength={5} autoComplete="postal-code" placeholder="ZIP code" value={homeZip}
              onChange={(e) => { setHomeZip(e.target.value.replace(/\D/g, '').slice(0, 5)); setZipState('idle') }} style={{ flex: 1 }} />
            <button className={ui.btnSecondary} onClick={lookupZip} disabled={zipState === 'checking'}>{zipState === 'checking' ? 'Checking…' : 'Set'}</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, fontSize: 14 }}>
            <span style={{ color: zipState === 'error' ? '#FF6B6B' : zipState === 'ok' ? 'var(--accent-text)' : 'var(--text-dim)' }}>
              {zipState === 'error' ? 'Couldn’t find that. Check the ZIP.' : zipState === 'ok' ? (homeZip ? `Home set to ${homeZip}` : 'Home set to your current location') : ' '}
            </span>
            <button onClick={useCurrentLocation} style={{ background: 'none', border: 'none', color: 'var(--accent-text)', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <PinIcon size={13} color="var(--accent)" /> Use my location
            </button>
          </div>
        </>
      ),
    },
    {
      title: 'Want to help others find drinks?',
      sub: 'AmpedMap runs on people logging what they see. Even one sighting helps.',
      body: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {([
            [true, 'Yes, show me how', 'We’ll walk you through your first sighting at the nearest store. It takes about 10 seconds.'],
            [false, 'Just browsing for now', 'No problem. You can log a sighting anytime from a store page.'],
          ] as const).map(([value, title, body]) => {
            const on = wantsToReport === value
            return (
              <button key={String(value)} onClick={() => setWantsToReport(value)} className={ui.card}
                style={{ display: 'flex', gap: 12, padding: 16, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', borderColor: on ? 'rgba(201,244,0,0.5)' : undefined, background: on ? 'rgba(201,244,0,0.06)' : undefined }}>
                <span style={{ width: 36, height: 36, borderRadius: 10, background: on ? 'rgba(201,244,0,0.16)' : 'var(--fg-06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {value ? <LightningIcon size={17} color={on ? 'var(--accent-text)' : 'var(--text-muted)'} /> : <SearchIcon size={16} color={on ? 'var(--accent-text)' : 'var(--text-muted)'} />}
                </span>
                <span>
                  <span style={{ display: 'block', fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>{title}</span>
                  <span style={{ display: 'block', fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.45 }}>{body}</span>
                </span>
              </button>
            )
          })}
        </div>
      ),
    },
  ]

  // First sign-in only: a short intro to what AmpedMap is before any questions.
  const welcomeStep = {
    key: 'welcome',
    title: 'Welcome to AmpedMap',
    sub: 'The live map of what’s in the cooler, built by energy drink hunters.',
    body: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[
          { icon: <PinIcon size={18} color="var(--accent-text)" />, title: 'Every store near you', body: 'Gas stations, convenience and grocery stores on one map.' },
          {
            icon: <span style={{ display: 'flex', gap: 3 }}>{['#C9F400', '#FFB300', 'var(--text-dim)'].map((c) => <span key={c} style={{ width: 6, height: 6, borderRadius: '50%', background: c }} />)}</span>,
            title: 'See what’s been spotted',
            body: 'Pins turn lime when someone spotted something in the last day. Tap one to see which flavors and when.',
          },
          { icon: <BellIcon size={18} color="var(--accent-text)" />, title: 'Never miss a restock', body: 'Follow a flavor and we’ll tell you when it’s back.' },
          { icon: <LightningIcon size={18} color="var(--accent-text)" />, title: 'Powered by hunters like you', body: 'Log what you see in one tap, earn badges and climb the leaderboard.' },
        ].map((f) => (
          <div key={f.title} className={ui.card} style={{ display: 'flex', gap: 14, alignItems: 'flex-start', padding: 16 }}>
            <span style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(201,244,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{f.icon}</span>
            <span>
              <span style={{ display: 'block', fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>{f.title}</span>
              <span style={{ display: 'block', fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.45 }}>{f.body}</span>
            </span>
          </div>
        ))}
        <p style={{ fontSize: 14, color: 'var(--text-dim)', textAlign: 'center', marginTop: 6 }}>A few quick questions to set things up. About a minute.</p>
      </div>
    ),
  }

  // "Yes, show me how": a three-step walkthrough of reporting, each with a
  // small drawing of the real screen.
  const mock: React.CSSProperties = { borderRadius: 12, background: 'var(--bg)', border: '1px solid var(--fg-08)', padding: 10, marginTop: 10 }
  const tutorialStep = {
    key: 'tutorial',
    title: 'How sightings work',
    sub: 'One tap per flavor at the cooler. Here’s the whole thing.',
    body: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[
          {
            title: 'Open the store you’re at',
            body: 'Tap its pin or card. When you’re standing inside a store, a “You’re at…” banner pops up on the map so you can jump straight in.',
            demo: (
              <div style={{ ...mock, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 30, height: 30, borderRadius: 9, background: 'var(--fg-06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><StoreTypeIcon type="convenience" size={15} color="var(--text-muted)" /></span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>You&apos;re at Quick Stop #12</span>
                  <span style={{ display: 'block', fontSize: 12, color: 'var(--text-dim)' }}>Seen the cooler?</span>
                </span>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#0D1210', background: '#C9F400', borderRadius: 8, padding: '6px 10px' }}>Log a sighting</span>
              </div>
            ),
          },
          {
            title: 'Tap Spotted for what you see',
            body: 'Each tap saves right away. Looked for a flavor and it’s missing? Tap Not there, it saves people a trip. You can add “Just a few” or “Plenty” if you like.',
            demo: (
              <div style={mock}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>Celsius Sparkling Kiwi Guava</span>
                <span style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 6 }}>
                  <span style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, padding: '8px 0', borderRadius: 8, color: '#0D1210', background: '#C9F400' }}>Spotted</span>
                  <span style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, padding: '8px 0', borderRadius: 8, color: 'var(--text-muted)', border: '1px solid var(--fg-10)' }}>Not there</span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 11, color: 'var(--text-dim)' }}>
                  How many?
                  <span style={{ padding: '3px 8px', borderRadius: 999, border: '1px solid var(--fg-10)', color: 'var(--text-muted)' }}>Just a few</span>
                  <span style={{ padding: '3px 8px', borderRadius: 999, background: 'rgba(201,244,0,0.14)', color: 'var(--accent-text)', fontWeight: 600 }}>Plenty</span>
                </span>
              </div>
            ),
          },
          {
            title: 'That’s it',
            body: 'Everyone nearby sees it right away. Every sighting, Spotted or Not there, earns 2 points toward badges and the leaderboard.',
            demo: (
              <div style={{ ...mock, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(201,244,0,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent-text)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                </span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>3 sightings logged</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-text)' }}>+6 pts</span>
              </div>
            ),
          },
        ].map((s, i) => (
          <div key={s.title} className={ui.card} style={{ padding: 16 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span style={{ width: 26, height: 26, borderRadius: '50%', background: '#C9F400', color: '#0D1210', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>
              <span>
                <span style={{ display: 'block', fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>{s.title}</span>
                <span style={{ display: 'block', fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.45 }}>{s.body}</span>
              </span>
            </div>
            {s.demo}
          </div>
        ))}
      </div>
    ),
  }

  const steps = [
    ...(mode === 'first' ? [welcomeStep] : []),
    ...coreSteps,
    ...(wantsToReport ? [tutorialStep] : []),
  ]
  const isFinish = step === steps.length
  const last = step === steps.length - 1
  const isWelcome = mode === 'first' && step === 0
  // Steps slide in from the right going forward, from the left going back.
  const dir = step >= prevStepRef.current ? 'slide-next' : 'slide-back'

  return createPortal(
    <div className="anim-fade" role="dialog" aria-modal="true" aria-label="Welcome to AmpedMap"
      style={{ position: 'fixed', inset: 0, zIndex: 110, background: 'var(--bg)', display: 'flex', flexDirection: 'column', paddingTop: 'env(safe-area-inset-top)' }}>
      {/* Top bar: progress + skip */}
      {!isFinish && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px 6px', maxWidth: 560, width: '100%', margin: '0 auto' }}>
          <div style={{ flex: 1, display: 'flex', gap: 6 }}>
            {steps.map((_, i) => (
              <span key={i} style={{ flex: 1, height: 4, borderRadius: 999, background: 'var(--fg-10)', overflow: 'hidden' }}>
                <span style={{ display: 'block', height: '100%', background: '#C9F400', borderRadius: 999, transformOrigin: 'left center', transform: `scaleX(${i <= step ? 1 : 0})`, transition: 'transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1)' }} />
              </span>
            ))}
          </div>
          <button onClick={mode === 'first' ? skipAll : onClose} className={ui.btnGhost} style={{ minHeight: 36 }}>{mode === 'first' ? 'Skip' : 'Close'}</button>
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div key={step} className={isFinish ? 'anim-rise' : dir} style={{ maxWidth: 560, margin: '0 auto', padding: '18px 20px 24px' }}>
          {isFinish ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', paddingTop: '12vh' }}>
              <span className="anim-pop" style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(201,244,0,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent-text)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path className="anim-draw" d="M5 12.5l4.5 4.5L19 7.5" /></svg>
              </span>
              <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>You&apos;re all set</h1>
              <p style={{ fontSize: 17, color: 'var(--text-muted)', lineHeight: 1.5, maxWidth: 360 }}>{summary?.text}</p>
              {followed.size > 0 && <p style={{ fontSize: 15, color: 'var(--text-dim)', marginTop: 10 }}>Following {followed.size} flavor{followed.size === 1 ? '' : 's'} for restock alerts.</p>}
              {wantsToReport && !summary?.reportStore && (
                <div className={ui.card} style={{ marginTop: 18, maxWidth: 380, textAlign: 'left', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <LightningIcon size={18} color="var(--accent-text)" />
                  <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.45 }}>Next time you&apos;re in a store, a <strong style={{ color: 'var(--text)', fontWeight: 600 }}>“You&apos;re at…”</strong> banner will pop up on the map. Tap <strong style={{ color: 'var(--text)', fontWeight: 600 }}>Log a sighting</strong> and you&apos;re off.</p>
                </div>
              )}
            </div>
          ) : (
            <>
              <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text)', lineHeight: 1.15, marginBottom: 6 }}>{steps[step].title}</h1>
              <p style={{ fontSize: 16, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 22 }}>{steps[step].sub}</p>
              {steps[step].body}
            </>
          )}
        </div>
      </div>

      {/* Bottom actions */}
      <div style={{ borderTop: '1px solid var(--fg-06)', padding: '12px 20px calc(env(safe-area-inset-bottom) + 14px)' }}>
        <div style={{ maxWidth: 560, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {isFinish ? (
            <>
              {wantsToReport && summary?.reportStore && onReport && (
                <button className={`${ui.btnPrimary} ${ui.btnBlock} ${ui.btnLarge}`} onClick={() => { onReport(summary.reportStore!); onClose() }}>
                  Log a sighting at {summary.reportStore.name}
                </button>
              )}
              <button className={`${wantsToReport && summary?.reportStore ? ui.btnSecondary : ui.btnPrimary} ${ui.btnBlock} ${ui.btnLarge}`} onClick={onClose}>
                Show me the map
              </button>
            </>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              {step > 0 && <button className={ui.btnSecondary} style={{ minHeight: 50 }} onClick={() => setStep(step - 1)}>Back</button>}
              <button className={`${ui.btnPrimary} ${ui.btnLarge}`} style={{ flex: 1 }} disabled={saving} onClick={() => (last ? finish() : setStep(step + 1))}>
                {saving ? 'Saving…' : isWelcome ? 'Let’s go' : last ? (mode === 'first' ? 'Finish' : 'Save') : 'Next'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
