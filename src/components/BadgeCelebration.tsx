'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { BADGE_DEFS } from '@/lib/badges'
import ui from '@/components/ui/ui.module.css'
import { haptic } from '@/lib/haptics'

// Full-screen "Badge unlocked" moment with confetti. Checks the user's badges
// (computed server-side by /api/community/profile) once per app session and
// whenever something dispatches a `check-badges` event (the report success
// screen does), compares them with the ones this device has already
// celebrated, and shows each new one. The very first check only records a
// baseline, so existing members aren't greeted with a pile of old badges.

const SEEN_KEY = (uid: string) => `badges_seen_v1:${uid}`
const SESSION_KEY = 'badges_checked_session'
const COLORS = ['#C9F400', '#FFB300', '#FF8A3D', '#60a5fa', '#F472B6', '#a855f7']

export default function BadgeCelebration() {
  const router = useRouter()
  const { user, profile } = useAuth()
  const [queue, setQueue] = useState<string[]>([])
  const checking = useRef(false)

  const check = useCallback(async () => {
    if (!user || !profile?.username || checking.current) return
    checking.current = true
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const res = await fetch(`/api/community/profile?username=${encodeURIComponent(profile.username)}&tz=${new Date().getTimezoneOffset()}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!res.ok) return
      const { badges } = await res.json() as { badges?: string[] }
      if (!Array.isArray(badges)) return
      let seen: string[] | null = null
      try { seen = JSON.parse(localStorage.getItem(SEEN_KEY(user.id)) ?? 'null') } catch { /* ignore */ }
      try { localStorage.setItem(SEEN_KEY(user.id), JSON.stringify([...new Set([...(seen ?? []), ...badges])])) } catch { /* ignore */ }
      if (!seen) return // first run on this device: baseline only
      const fresh = BADGE_DEFS.map((b) => b.id).filter((id) => badges.includes(id) && !seen!.includes(id))
      if (fresh.length) { setQueue((q) => [...q, ...fresh.filter((id) => !q.includes(id))]); haptic([20, 60, 20, 60, 30]) }
    } catch {
      // celebration is best-effort
    } finally {
      checking.current = false
    }
  }, [user, profile?.username])

  // Once per app session, a moment after opening.
  useEffect(() => {
    if (!user || !profile?.username) return
    try { if (sessionStorage.getItem(SESSION_KEY)) return } catch { /* ignore */ }
    // The flag is set only when the check actually runs, so leaving within
    // the delay doesn't skip it for the rest of the session.
    const t = setTimeout(() => {
      try { sessionStorage.setItem(SESSION_KEY, '1') } catch { /* ignore */ }
      check()
    }, 2500)
    return () => clearTimeout(t)
  }, [user, profile?.username, check])

  // And on demand (after a report).
  useEffect(() => {
    const onCheck = () => { check() }
    window.addEventListener('check-badges', onCheck)
    return () => window.removeEventListener('check-badges', onCheck)
  }, [check])

  const current = queue[0] ? BADGE_DEFS.find((b) => b.id === queue[0]) : null

  // Fresh confetti layout per badge.
  const confetti = useMemo(() => Array.from({ length: 44 }, (_, i) => ({
    left: `${(i * 37 + (current?.id.length ?? 0) * 11) % 100}%`,
    dx: `${((i * 53) % 120) - 60}px`,
    rot: `${360 + ((i * 97) % 540)}deg`,
    dur: `${1.8 + ((i * 13) % 12) / 10}s`,
    delay: `${((i * 7) % 10) / 20}s`,
    color: COLORS[i % COLORS.length],
    round: i % 3 === 0,
  })), [current?.id])

  if (!current) return null
  const next = () => setQueue((q) => q.slice(1))

  return (
    <div className="anim-fade" role="dialog" aria-modal="true" aria-label={`Badge unlocked: ${current.name}`} onClick={next}
      style={{ position: 'fixed', inset: 0, zIndex: 130, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div className="confetti" aria-hidden="true">
        {confetti.map((c, i) => (
          <span key={`${current.id}-${i}`} style={{ left: c.left, background: c.color, borderRadius: c.round ? '50%' : 2, ['--dx' as string]: c.dx, ['--rot' as string]: c.rot, ['--dur' as string]: c.dur, ['--delay' as string]: c.delay } as React.CSSProperties} />
        ))}
      </div>
      <div key={current.id} className="anim-pop" onClick={(e) => e.stopPropagation()}
        style={{ position: 'relative', width: '100%', maxWidth: 340, background: 'var(--surface)', border: `1px solid color-mix(in srgb, ${current.color} 45%, transparent)`, borderRadius: 24, padding: '28px 22px 20px', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 14 }}>Badge unlocked</p>
        <div className="shine" style={{ ['--shine-delay' as string]: '0.35s', width: 104, height: 104, margin: '0 auto 16px', borderRadius: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 56, background: `color-mix(in srgb, ${current.color} 14%, transparent)`, border: `1px solid color-mix(in srgb, ${current.color} 40%, transparent)` }}>
          {current.icon}
        </div>
        <h2 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>{current.name}</h2>
        <p style={{ fontSize: 15, color: 'var(--text-muted)', lineHeight: 1.45, marginBottom: 20 }}>{current.desc}</p>
        <button className={`${ui.btnPrimary} ${ui.btnBlock} ${ui.btnLarge}`} onClick={next}>
          {queue.length > 1 ? `Nice! (${queue.length - 1} more)` : 'Nice!'}
        </button>
        <button className={ui.btnGhost} style={{ marginTop: 6 }} onClick={() => { setQueue([]); router.push('/account?page=badges') }}>
          See all badges
        </button>
      </div>
    </div>
  )
}
