'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { ClockIcon, LightningIcon } from '@/components/Icons'
import ui from '@/components/ui/ui.module.css'

// Store page: when this store usually restocks (Tracker). Free accounts see a
// faded sample with an upgrade link instead — the real numbers are only
// computed server-side for Tracker (/api/stores/patterns).

type Patterns = {
  basis: 'restocks' | 'full' | 'none'
  days: number[]
  parts: Record<string, number>
  signals: number
  reports: number
  since: string | null
  sellsOut: { name: string; times: number }[]
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DAY_NAMES = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays']
const PART_LABEL: Record<string, string> = { morning: 'mornings', afternoon: 'afternoons', evening: 'evenings', night: 'overnight' }
const SAMPLE = [2, 5, 3, 2, 6, 3, 1]

function Bars({ days, highlight, dim }: { days: number[]; highlight: number; dim?: boolean }) {
  const max = Math.max(1, ...days)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 76, marginTop: 14, opacity: dim ? 0.35 : 1, filter: dim ? 'blur(1.5px)' : undefined }} aria-hidden={dim}>
      {days.map((v, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, height: '100%', justifyContent: 'flex-end' }}>
          <div title={`${DAYS[i]}: ${v}`} style={{ width: '100%', maxWidth: 28, height: `${Math.max(6, (v / max) * 56)}px`, borderRadius: 6, background: i === highlight ? '#C9F400' : 'var(--fg-15)', transition: 'height 0.5s cubic-bezier(0.2, 0.8, 0.2, 1)' }} />
          <span style={{ fontSize: 11, color: i === highlight ? 'var(--accent-text)' : 'var(--text-dim)', fontWeight: i === highlight ? 700 : 400 }}>{DAYS[i]}</span>
        </div>
      ))}
    </div>
  )
}

export default function RestockPatterns({ storeId, isTracker }: { storeId: string; isTracker: boolean }) {
  const router = useRouter()
  const [data, setData] = useState<Patterns | null>(null)
  // Why loading failed (shown small so it can be reported), or null.
  const [failed, setFailed] = useState<string | null>(null)
  // The server decides who's Tracker; if it says no, show the free teaser.
  const [serverSaysFree, setServerSaysFree] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!isTracker) return
    let alive = true
    setFailed(null)
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!alive) return
      if (!session) { setFailed('no session'); return }
      const res = await fetch(`/api/stores/patterns?store_id=${encodeURIComponent(storeId)}&tz=${new Date().getTimezoneOffset()}`, { headers: { Authorization: `Bearer ${session.access_token}` } }).catch(() => null)
      if (!alive) return
      if (res?.ok) { setData(await res.json()); return }
      if (res?.status === 403) { setServerSaysFree(true); return }
      const body = res ? await res.json().catch(() => null) : null
      setFailed(res ? `${res.status}${body?.error ? ` · ${body.error}` : ''}` : 'network')
    })()
    return () => { alive = false }
  }, [storeId, isTracker, attempt])

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <ClockIcon size={16} color="var(--accent-text)" />
      <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', flex: 1 }}>Sighting patterns</span>
      {!isTracker && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'rgba(201,244,0,0.14)', color: 'var(--accent-text)' }}>Tracker</span>}
    </div>
  )

  if (!isTracker || serverSaysFree) {
    return (
      <div className={`${ui.card} reveal`} style={{ margin: '14px 16px 0' }}>
        {header}
        <p style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>See which days and times flavors get spotted here, and which ones are most often missing.</p>
        <Bars days={SAMPLE} highlight={4} dim />
        <button className={`${ui.btnSecondary} ${ui.btnBlock}`} style={{ marginTop: 14 }} onClick={() => router.push('/account?page=plan')}>
          <LightningIcon size={15} color="var(--accent-text)" /> Unlock with Tracker
        </button>
      </div>
    )
  }

  if (failed) {
    return (
      <div className={ui.card} style={{ margin: '14px 16px 0' }}>
        {header}
        <p style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 6 }}>Couldn&apos;t load sighting patterns right now.</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
          <button className={ui.btnSecondary} onClick={() => setAttempt((a) => a + 1)}>Try again</button>
          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Error {failed}</span>
        </div>
      </div>
    )
  }
  if (!data) {
    return (
      <div className={ui.card} style={{ margin: '14px 16px 0' }}>
        {header}
        <div className="skeleton" style={{ height: 90, borderRadius: 10, marginTop: 12, background: 'var(--fg-06)' }} />
      </div>
    )
  }

  if (data.basis === 'none') {
    return (
      <div className={`${ui.card} reveal`} style={{ margin: '14px 16px 0' }}>
        {header}
        <p style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>
          Not enough history here yet. Patterns show up after a few sightings, so every one helps.
        </p>
      </div>
    )
  }

  const top = data.days.indexOf(Math.max(...data.days))
  const topPart = Object.entries(data.parts).sort((a, b) => b[1] - a[1])[0]?.[0]
  const sinceText = data.since ? new Date(data.since).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null
  return (
    <div className={`${ui.card} reveal`} style={{ margin: '14px 16px 0' }}>
      {header}
      <p style={{ fontSize: 16, color: 'var(--text)', marginTop: 8, lineHeight: 1.45 }}>
        Most sightings on <strong style={{ fontWeight: 700 }}>{DAY_NAMES[top]}{topPart ? `, ${PART_LABEL[topPart]}` : ''}</strong>
      </p>
      {data.sellsOut.length > 0 && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>
          Most often not found: {data.sellsOut.map((s) => s.name).join(', ')}
        </p>
      )}
      <p style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 6 }}>
        Based on {data.signals} sighting{data.signals === 1 ? '' : 's'}{sinceText ? ` since ${sinceText}` : ''}.
      </p>
    </div>
  )
}
