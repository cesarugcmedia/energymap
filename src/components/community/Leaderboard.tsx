'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import CountUp from '@/components/ui/CountUp'
import ui from '@/components/ui/ui.module.css'
import SkeletonList from '@/components/ui/SkeletonList'
import { CheckIcon, LightningIcon, GroceryIcon, DrinkIcon, TrophyIcon, UsersIcon, PinIcon } from '@/components/Icons'
import { Avatar } from './RichText'
import SlideHighlight from '@/components/ui/SlideHighlight'
import { TRACKER_PITCH } from '@/lib/plans'
import { fetchProfileLites } from '@/lib/avatar'

type Scope = 'everyone' | 'following' | 'near'
type Metric = 'points' | 'stores' | 'flavors'
type Timeframe = 'All Time' | 'This Month' | 'This Week'
type Entry = { id: string; username: string; value: number; is_verified_reporter: boolean; tier: string | null; badges: string[] }

const UNIT: Record<string, { one: string; many: string }> = {
  points: { one: 'pt', many: 'pts' },
  stores: { one: 'store', many: 'stores' },
  flavors: { one: 'flavor', many: 'flavors' },
  reports: { one: 'sighting', many: 'sightings' },
}
const MEDAL = ['🥇', '🥈', '🥉']
const PODIUM_COLOR = ['#ffd700', '#c0c0c0', '#cd7f32']

/** Next Monday 00:00 UTC — when the weekly champion cron runs. */
function nextWeeklyReset(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const daysUntilMonday = (8 - d.getUTCDay()) % 7 || 7
  d.setUTCDate(d.getUTCDate() + daysUntilMonday)
  return d
}
function untilText(target: Date) {
  const ms = target.getTime() - Date.now()
  const days = Math.floor(ms / 86400000)
  const hrs = Math.floor((ms % 86400000) / 3600000)
  return days > 0 ? `${days}d ${hrs}h` : `${hrs}h ${Math.max(1, Math.floor((ms % 3600000) / 60000))}m`
}

export default function Leaderboard({ me }: {
  me: { id: string; username: string; lat: number | null; lng: number | null; isTrackerOrAdmin: boolean }
}) {
  const router = useRouter()
  const [scope, setScope] = useState<Scope>('everyone')
  const [metric, setMetric] = useState<Metric>('points')
  const [timeframe, setTimeframe] = useState<Timeframe>('All Time')
  const [entries, setEntries] = useState<Entry[] | null>(null)
  // Profile photos for whoever is on the board (profile-v2; letters until then).
  const [photos, setPhotos] = useState<Record<string, string>>({})
  useEffect(() => {
    const ids = (entries ?? []).map((e) => e.id).filter((id) => !(id in photos)).slice(0, 100)
    if (!ids.length) return
    let live = true
    fetchProfileLites(ids).then((m) => {
      if (!live) return
      setPhotos((p) => { const n = { ...p }; for (const id of ids) n[id] = m.get(id)?.avatar ?? ''; return n })
    })
    return () => { live = false }
  }, [entries]) // eslint-disable-line react-hooks/exhaustive-deps
  const [serverMe, setServerMe] = useState<{ rank: number; value: number } | null>(null)
  const [error, setError] = useState(false)
  const [followingIds, setFollowingIds] = useState<Set<string> | null>(null)
  const [, tick] = useState(0)
  const [reloadKey, setReloadKey] = useState(0)

  // Near me counts reports; flavors and near are weekly-only boards.
  const weeklyOnly = scope === 'near' || metric === 'flavors'
  const effectiveTimeframe: Timeframe = weeklyOnly ? 'This Week' : timeframe
  const unitKey = scope === 'near' && metric === 'points' ? 'reports' : metric

  useEffect(() => {
    supabase.from('follows').select('followed_id').eq('follower_id', me.id).then(({ data }) => setFollowingIds(new Set((data ?? []).map((f: any) => f.followed_id))))
  }, [me.id])

  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 60000); return () => clearInterval(t) }, [])

  useEffect(() => {
    let cancelled = false
    setEntries(null)
    setError(false)
    ;(async () => {
      if (scope === 'near' && (me.lat == null || me.lng == null)) { if (!cancelled) setEntries([]); return }
      if (metric === 'points' && scope !== 'near') {
        const { data, error: e } = await supabase.rpc('get_leaderboard', { p_timeframe: effectiveTimeframe })
        if (cancelled) return
        if (e) { setError(true); setEntries([]); return }
        setServerMe(null)
        setEntries((data ?? []).map((r: any) => ({ id: r.id, username: r.username, value: r.points ?? 0, is_verified_reporter: !!r.is_verified_reporter, tier: r.tier ?? null, badges: r.badges ?? [] })))
        return
      }
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const board = scope === 'near' ? 'near' : metric
      const qs = new URLSearchParams({ board, timeframe: effectiveTimeframe })
      if (scope === 'near') { qs.set('lat', String(me.lat)); qs.set('lng', String(me.lng)) }
      const res = await fetch(`/api/community/leaderboard?${qs}`, { headers: { Authorization: `Bearer ${session.access_token}` } })
      if (cancelled) return
      if (!res.ok) { setError(true); setEntries([]); return }
      const json = await res.json()
      setServerMe(json.me ?? null)
      setEntries(json.entries ?? [])
    })()
    return () => { cancelled = true }
  }, [scope, metric, effectiveTimeframe, me.lat, me.lng, reloadKey])

  // Following: just you + people you follow.
  const list = useMemo(() => {
    if (!entries) return null
    if (scope !== 'following') return entries
    if (!followingIds) return null
    return entries.filter((e) => e.id === me.id || followingIds.has(e.id))
  }, [entries, scope, followingIds, me.id])

  const myIndex = list ? list.findIndex((e) => e.id === me.id) : -1

  // Places climbed on this exact board since this device last looked.
  const [climb, setClimb] = useState<{ board: string; n: number } | null>(null)
  const boardKey = `${scope}:${metric}:${effectiveTimeframe}`
  useEffect(() => {
    if (!list || myIndex < 0) return
    const key = `lb_rank_v1:${me.id}:${boardKey}`
    try {
      const prev = Number(localStorage.getItem(key) ?? '0')
      const rank = myIndex + 1
      setClimb(prev > rank ? { board: boardKey, n: prev - rank } : null)
      localStorage.setItem(key, String(rank))
    } catch { /* ignore */ }
  }, [list, myIndex, me.id, boardKey])
  const climbed = climb && climb.board === boardKey ? climb.n : 0
  const climbChip = climbed > 0 && (
    <span className="anim-pop" style={{ animationDelay: '0.55s', fontSize: 11, fontWeight: 700, color: '#0D1210', background: '#C9F400', borderRadius: 6, padding: '1px 6px', flexShrink: 0 }}>▲ {climbed}</span>
  )
  const myEntry = myIndex >= 0 ? list![myIndex] : null
  const unit = (n: number) => (n === 1 ? UNIT[unitKey].one : UNIT[unitKey].many)

  // "You vs next" target
  let target: { text: string; progress: number } | null = null
  if (list && list.length > 0) {
    if (myEntry && myIndex === 0) {
      target = { text: list.length > 1 ? `You're #1. ${myEntry.value - list[1].value} ${unit(myEntry.value - list[1].value)} ahead of @${list[1].username}.` : "You're #1. Keep it up.", progress: 1 }
    } else if (myEntry) {
      const next = list[myIndex - 1]
      const gap = next.value - myEntry.value + 1
      const action = unitKey === 'points' ? `Log ${Math.ceil(gap / 2)} sighting${Math.ceil(gap / 2) === 1 ? '' : 's'} to pass them.`
        : unitKey === 'stores' ? `Add ${gap} more store${gap === 1 ? '' : 's'} to pass them.`
        : unitKey === 'flavors' ? `Find ${gap} more flavor${gap === 1 ? '' : 's'} to pass them.`
        : `${gap} more sighting${gap === 1 ? '' : 's'} to pass them.`
      target = { text: `#${myIndex + 1} · ${gap} ${unit(gap)} behind @${next.username}. ${action}`, progress: next.value > 0 ? Math.min(1, myEntry.value / next.value) : 0 }
    } else if (serverMe && scope !== 'following') {
      target = { text: `You're #${serverMe.rank} with ${serverMe.value} ${unit(serverMe.value)}. Climb into the top ${list.length} to show up here.`, progress: 0 }
    } else {
      target = { text: unitKey === 'stores' ? 'Add a store to get on this board.' : 'Report a drink to get on this board.', progress: 0 }
    }
  }

  const podium = list ? list.slice(0, 3) : []
  const rest = list ? list.slice(3) : []

  const chip = (active: boolean) => `${ui.chip} ${active ? ui.chipActive : ''}`

  return (
    <div>
      {/* Who */}
      <div className={ui.chipRow} style={{ marginBottom: 10 }}>
        {([['everyone', 'Everyone', TrophyIcon], ['following', 'Following', UsersIcon], ['near', 'Near me', PinIcon]] as const).map(([key, label, Icon]) => (
          <button key={key} className={chip(scope === key)} onClick={() => setScope(key)}>
            <Icon size={13} color={scope === key ? '#0D1210' : 'var(--text-muted)'} />{label}
          </button>
        ))}
      </div>

      {/* What */}
      <div className={`${ui.segmented} ${ui.segSlide}`} style={{ display: 'flex', marginBottom: 10 }}>
        <SlideHighlight activeKey={metric} />
        {([['points', scope === 'near' ? 'Sightings' : 'Points'], ['stores', 'Stores added'], ['flavors', 'Flavors found']] as const).map(([key, label]) => (
          <button key={key} data-active={metric === key} className={`${ui.segment} ${metric === key ? ui.segmentActive : ''}`} style={{ flex: 1, padding: '8px 6px', fontSize: 13 }} onClick={() => setMetric(key)}>{label}</button>
        ))}
      </div>

      {/* When */}
      {weeklyOnly ? (
        <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: '0 2px 12px' }}>This board counts the current week.</p>
      ) : (
        <div className={ui.chipRow} style={{ marginBottom: 12 }}>
          {(['All Time', 'This Month', 'This Week'] as Timeframe[]).map((tf) => (
            <button key={tf} className={chip(timeframe === tf)} onClick={() => setTimeframe(tf)}>{tf === 'All Time' ? 'All time' : tf === 'This Month' ? 'This month' : 'This week'}</button>
          ))}
        </div>
      )}

      {/* Weekly reset countdown */}
      {effectiveTimeframe === 'This Week' && (
        <div className={ui.card} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', marginBottom: 12 }}>
          <span style={{ fontSize: 18 }}>👑</span>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.4 }}>
            Resets in <strong style={{ color: 'var(--text)', fontWeight: 600 }}>{untilText(nextWeeklyReset())}</strong>. The week&apos;s top reporter earns the Weekly Champion badge.
          </p>
        </div>
      )}

      {list === null ? (
        <SkeletonList count={5} />
      ) : error ? (
        <div className={ui.emptyState}>
          <TrophyIcon size={36} color="var(--text-dim)" />
          <p className={ui.emptyTitle}>Couldn&apos;t load the leaderboard</p>
          <button className={ui.btnSecondary} onClick={() => setReloadKey((k) => k + 1)}>Try again</button>
        </div>
      ) : list.length === 0 ? (
        <div className={ui.emptyState}>
          {scope === 'near' ? <PinIcon size={36} color="var(--text-dim)" /> : scope === 'following' ? <UsersIcon size={36} color="var(--text-dim)" /> : <TrophyIcon size={36} color="var(--text-dim)" />}
          <p className={ui.emptyTitle}>
            {scope === 'near' && (me.lat == null || me.lng == null) ? 'Location needed' : scope === 'following' ? 'No one to compare yet' : 'No one on this board yet'}
          </p>
          <p className={ui.emptyBody}>
            {scope === 'near' && (me.lat == null || me.lng == null) ? 'Open the map once so we know where “near you” is.'
              : scope === 'following' ? 'Follow people from the feed or their profiles to compete with them here.'
              : 'Be the first. Log what you spot this week.'}
          </p>
        </div>
      ) : (
        <>
          {/* You vs next */}
          {target && (
            <div className={`${ui.card} anim-rise`} style={{ marginBottom: 14, borderColor: myEntry ? 'rgba(201,244,0,0.35)' : undefined }}>
              <p style={{ fontSize: 15, color: 'var(--text)', lineHeight: 1.45 }}>{target.text}</p>
              {myEntry && myIndex > 0 && (
                <div style={{ height: 6, borderRadius: 999, background: 'var(--fg-08)', overflow: 'hidden', marginTop: 10 }}>
                  <div className="anim-fill" style={{ height: '100%', width: `${Math.max(4, target.progress * 100)}%`, borderRadius: 999, background: '#C9F400', transition: 'width 0.5s ease' }} />
                </div>
              )}
            </div>
          )}

          {/* Podium */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', alignItems: 'end', gap: 8, marginBottom: 14 }}>
            {[1, 0, 2].map((pos) => {
              const e = podium[pos]
              if (!e) return <div key={pos} />
              const isMe = e.id === me.id
              const height = pos === 0 ? 96 : pos === 1 ? 72 : 58
              return (
                <Link key={e.id} href={`/u/${e.username}`} className="reveal" style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <div style={{ position: 'relative' }}>
                    <Avatar name={e.username} url={photos[e.id] || null} userId={e.id} size={pos === 0 ? 60 : 50} />
                    <span style={{ position: 'absolute', bottom: -6, right: -6, fontSize: pos === 0 ? 22 : 18 }}>{MEDAL[pos]}</span>
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 600, color: isMe ? 'var(--accent-text)' : 'var(--text)', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{e.username}</span>
                  {isMe && climbChip}
                  <div className="anim-grow" style={{ animationDelay: `${pos === 2 ? 0.1 : pos === 1 ? 0.25 : 0.4}s`, width: '100%', height, borderRadius: '12px 12px 4px 4px', background: `linear-gradient(180deg, ${PODIUM_COLOR[pos]}2e, ${PODIUM_COLOR[pos]}0d)`, border: `1px solid ${PODIUM_COLOR[pos]}40`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 18, fontWeight: 700, color: PODIUM_COLOR[pos] }}><CountUp value={e.value} /></span>
                    <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{unit(e.value)}</span>
                  </div>
                </Link>
              )
            })}
          </div>

          {/* Rest of the list */}
          {rest.length > 0 && (
            <div className={ui.card} style={{ padding: 0, overflow: 'hidden' }}>
              {rest.map((e, i) => {
                const rank = i + 4
                const isMe = e.id === me.id
                return (
                  <Link
                    key={e.id}
                    href={`/u/${e.username}`}
                    className={isMe && climbed > 0 ? 'rank-climb' : 'reveal'}
                    style={{ ['--climb' as string]: `${Math.min(climbed, 6) * 57}px`, position: 'relative', zIndex: isMe ? 1 : undefined, display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', textDecoration: 'none', borderTop: i === 0 ? 'none' : '1px solid var(--fg-06)', background: isMe ? 'rgba(201,244,0,0.06)' : 'transparent', boxShadow: isMe ? 'inset 3px 0 0 #C9F400' : 'none' }}
                  >
                    <span style={{ width: 26, fontSize: 14, fontWeight: 600, color: 'var(--text-dim)', textAlign: 'center', flexShrink: 0 }}>{rank}</span>
                    <Avatar name={e.username} url={photos[e.id] || null} userId={e.id} size={34} />
                    <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 15, fontWeight: 500, color: isMe ? 'var(--accent-text)' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{e.username}</span>
                      {isMe && <span style={{ fontSize: 11, fontWeight: 700, color: '#0D1210', background: '#C9F400', borderRadius: 6, padding: '1px 6px' }}>You</span>}
                      {isMe && climbChip}
                      {e.is_verified_reporter && <span title="Verified reporter" style={{ display: 'flex' }}><CheckIcon size={13} color="#60a5fa" /></span>}
                      {e.tier === 'tracker' && <span title="Tracker" style={{ display: 'flex' }}><LightningIcon size={13} color="var(--accent-text)" /></span>}
                      {e.badges.includes('weekly_champion') && <span title="Weekly champion" style={{ fontSize: 13 }}>👑</span>}
                    </span>
                    <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', flexShrink: 0 }}>{e.value} <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-dim)' }}>{unit(e.value)}</span></span>
                  </Link>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* How points work */}
      {metric === 'points' && scope !== 'near' && (
        <div className={ui.card} style={{ marginTop: 16 }}>
          <p className={ui.sectionLabel}>How points work</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { Icon: LightningIcon, label: 'Log a sighting', desc: 'Each Spotted or Not there you log', pts: '+2', color: 'var(--accent-text)' },
              { Icon: GroceryIcon, label: 'Add a store', desc: 'Once an admin approves it', pts: '+5', color: '#FFB300' },
              { Icon: DrinkIcon, label: 'Add a drink', desc: 'Each new flavor you add', pts: '+3', color: '#22d3ee' },
            ].map(({ Icon, label, desc, pts, color }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 34, height: 34, borderRadius: 10, background: `color-mix(in srgb, ${color} 10%, transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon size={16} color={color} /></span>
                <span style={{ flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 15, fontWeight: 500, color: 'var(--text)' }}>{label}</span>
                  <span style={{ display: 'block', fontSize: 13, color: 'var(--text-dim)' }}>{desc}</span>
                </span>
                <span style={{ fontSize: 15, fontWeight: 700, color }}>{pts}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upgrade */}
      {!me.isTrackerOrAdmin && (
        <div className={ui.card} style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
          <div>
            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>See the whole map with Tracker</p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{TRACKER_PITCH}</p>
          </div>
          <button className={ui.btnPrimary} onClick={() => router.push('/account')}>Upgrade</button>
        </div>
      )}
    </div>
  )
}
