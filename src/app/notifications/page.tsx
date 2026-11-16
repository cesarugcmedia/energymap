'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useMutedNotifications, mutedFilter } from '@/lib/notificationPrefs'
import { notificationIcon } from '@/components/NotificationIcons'
import { BellIcon, ChevronRightIcon } from '@/components/Icons'
import SkeletonList from '@/components/ui/SkeletonList'
import ui from '@/components/ui/ui.module.css'
import BoltLoader from '@/components/ui/BoltLoader'

/* eslint-disable @typescript-eslint/no-explicit-any */

const PAGE = 40

type FilterMode = 'all' | 'unread' | 'stock' | 'community' | 'stores' | 'badges'

// Every notification type the app sends today (DB triggers, RPCs and
// /api/community/*), bucketed into the filter chips.
const CATEGORY: Record<string, Exclude<FilterMode, 'all' | 'unread'>> = {
  stock_update: 'stock',
  drink_alert: 'stock',
  comment: 'community',
  reply: 'community',
  mention: 'community',
  follow: 'community',
  store_approved: 'stores',
  store_rejected: 'stores',
  new_store: 'stores',
  new_drink: 'stores',
  badge: 'badges',
}

const FILTERS: { mode: FilterMode; label: string }[] = [
  { mode: 'all', label: 'All' },
  { mode: 'unread', label: 'Unread' },
  { mode: 'stock', label: 'Stock' },
  { mode: 'community', label: 'Community' },
  { mode: 'stores', label: 'Stores & drinks' },
  { mode: 'badges', label: 'Badges' },
]

function matchesFilter(n: any, mode: FilterMode) {
  if (mode === 'all') return true
  if (mode === 'unread') return !n.read
  return CATEGORY[n.type] === mode
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function dateLabel(dateStr: string) {
  const d = new Date(dateStr)
  const now = new Date()
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return d.toLocaleDateString('en-US', { weekday: 'long' })
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
}

function sameDay(a: string, b: string) {
  return new Date(a).toDateString() === new Date(b).toDateString()
}

// The line icon already says what kind of notification it is, so drop the
// leading emoji some DB triggers prepend ("🏅 Badge Unlocked…", "🔔 …").
function cleanMessage(msg: string) {
  return (msg ?? '').replace(/^(\p{Extended_Pictographic}|️|‍|\s)+/u, '')
}

// Stock levels keep the colors the old Community report cards used:
// Full lime, Medium/Low amber, Out red, "back in stock" lime. Drink names in
// the message (matched against the catalog, since these messages come from
// DB triggers/RPCs as plain text) take the color of the level that follows
// them, with a soft glow (dropped in light mode, see .lvl-glow in globals.css).
const LIME = 'var(--accent-text)'
const LEVEL_COLOR: Record<string, string> = { full: LIME, medium: '#FFB300', med: '#FFB300', low: '#FFB300', out: '#FF4545', 'out of stock': '#FF4545', 'back in stock': LIME, 'in stock': LIME }
const GLOW: Record<string, string> = { [LIME]: 'rgba(201,244,0,0.45)', '#FFB300': 'rgba(255,179,0,0.45)', '#FF4545': 'rgba(255,69,69,0.45)' }
const LEVELS = 'back in stock|out of stock|in stock|full|medium|med|low|out'
const LEVEL_ONLY = new RegExp(`^(${LEVELS})$`, 'i')
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function buildMatcher(names: string[]) {
  const alts = [...new Set(names.map((n) => n.trim()).filter((n) => n.length >= 3 && !LEVEL_ONLY.test(n)))]
    .sort((x, y) => y.length - x.length)
    .map(esc)
  return new RegExp(`(?<!\\w)(${LEVELS}${alts.length ? '|' + alts.join('|') : ''})(?!\\w)`, 'gi')
}

function StockText({ text, matcher }: { text: string; matcher: RegExp }) {
  const tokens: { start: number; end: number; word: string; level: string | null }[] = []
  for (const m of text.matchAll(matcher)) {
    const lc = m[0].toLowerCase()
    const start = m.index ?? 0
    tokens.push({ start, end: start + m[0].length, word: m[0], level: LEVEL_COLOR[lc] ? lc : null })
  }
  // A drink takes the next level after it, else the one before it.
  const colorFor = (i: number) => {
    for (let j = i + 1; j < tokens.length; j++) if (tokens[j].level) return LEVEL_COLOR[tokens[j].level!]
    for (let j = i - 1; j >= 0; j--) if (tokens[j].level) return LEVEL_COLOR[tokens[j].level!]
    return null
  }
  const parts: React.ReactNode[] = []
  let last = 0
  tokens.forEach((t, i) => {
    const color = t.level ? LEVEL_COLOR[t.level] : colorFor(i)
    if (!color) return
    if (t.start > last) parts.push(text.slice(last, t.start))
    parts.push(<span key={t.start} className="lvl-glow" style={{ color, fontWeight: 700, textShadow: `0 0 10px ${GLOW[color]}` }}>{t.word}</span>)
    last = t.end
  })
  parts.push(text.slice(last))
  return <>{parts}</>
}
const isStock = (type: string) => type === 'stock_update' || type === 'drink_alert'

// Where tapping a notification takes you.
function hrefFor(n: any): string | null {
  if (n.store?.id) return `/store/${n.store.id}?name=${encodeURIComponent(n.store.name)}`
  if (n.post_id) return `/community?post=${n.post_id}`
  if (n.type === 'badge') return '/account?page=badges'
  if (n.type === 'drink_alert') return '/account?page=alerts'
  const who = n.type === 'follow' && /@([a-z0-9_]+)/i.exec(n.message ?? '')
  if (who) return `/u/${who[1]}`
  return null
}

type Item = { kind: 'single'; n: any } | { kind: 'group'; ns: any[] }

// Collapses consecutive same-store, same-day stock_update notifications
// into one row instead of repeating the store name over and over. Uses each
// notification's own message text as-is for the sub-lines rather than
// re-parsing drink names out of it — notify_stock_update's exact message
// format isn't defined anywhere in this repo (it's an RPC created directly
// in Supabase), so this doesn't assume a wording it can't verify.
function buildItems(list: any[]): Item[] {
  const result: Item[] = []
  for (const n of list) {
    const last = result[result.length - 1]
    const lastN = last ? (last.kind === 'group' ? last.ns[0] : last.n) : null
    const canJoin = n.type === 'stock_update' && n.store_id && lastN &&
      lastN.type === 'stock_update' && lastN.store_id === n.store_id && sameDay(lastN.created_at, n.created_at)
    if (canJoin && last) {
      if (last.kind === 'group') last.ns.push(n)
      else result[result.length - 1] = { kind: 'group', ns: [last.n, n] }
    } else {
      result.push({ kind: 'single', n })
    }
  }
  return result
}

// Last list shown, kept in memory so reopening the Alerts tab paints it
// instantly while refresh() fetches the latest in the background.
let listCache: { uid: string; muted: string; list: any[]; hasMore: boolean } | null = null

export default function NotificationsPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  // Types muted in Account → Notifications are left out of the list.
  const { muted } = useMutedNotifications()
  const mutedKey = muted.join(',')
  const cached = listCache && listCache.uid === user?.id && listCache.muted === mutedKey ? listCache : null
  const [notifications, setNotifications] = useState<any[]>(cached?.list ?? [])
  const [loading, setLoading] = useState(!cached)
  const [hasMore, setHasMore] = useState(cached?.hasMore ?? false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [filterMode, setFilterMode] = useState<FilterMode>('all')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  // Mark all read: unread dots pop out top to bottom before the rows settle.
  const [sweeping, setSweeping] = useState(false)
  const [clearing, setClearing] = useState(false)
  // Drink names from the catalog, so they can be colored in stock messages.
  const [drinkNames, setDrinkNames] = useState<string[]>([])
  const matcher = useMemo(() => buildMatcher(drinkNames), [drinkNames])
  useEffect(() => {
    supabase.from('drinks').select('name, brand, flavor').then(({ data }) => {
      const names: string[] = []
      for (const d of data ?? []) {
        if (d.name) names.push(d.name)
        if (d.flavor) names.push(d.flavor)
        if (d.brand && d.flavor) names.push(`${d.brand} ${d.flavor}`)
      }
      setDrinkNames(names)
    })
  }, [])
  // Rows that arrived live while the page is open get a brief highlight.
  const knownIds = useRef<Set<string> | null>(cached ? new Set(cached.list.map((n: any) => n.id)) : null)
  const [arrivedIds, setArrivedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!authLoading && !user) router.replace('/account')
  }, [user, authLoading, router])

  const fetchPage = useCallback(async (before?: string) => {
    if (!user) return []
    let q = supabase
      .from('notifications')
      .select('*, store:stores(id, name)')
      .eq('user_id', user.id)
      .lte('visible_after', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(PAGE)
    if (before) q = q.lt('created_at', before)
    if (mutedKey) q = q.not('type', 'in', mutedFilter(mutedKey.split(',')))
    const { data } = await q
    return data ?? []
  }, [user, mutedKey])

  const refresh = useCallback(async () => {
    const data = await fetchPage()
    if (knownIds.current) {
      const fresh = data.filter((n: any) => !knownIds.current!.has(n.id)).map((n: any) => n.id)
      if (fresh.length) setArrivedIds(new Set(fresh))
    }
    knownIds.current = new Set(data.map((n: any) => n.id))
    setNotifications(data)
    setHasMore(data.length === PAGE)
    setLoading(false)
  }, [fetchPage])

  useEffect(() => {
    if (!user) return
    refresh()
    // New notifications appear without a reload.
    const channel = supabase
      .channel(`notifications-page:${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, () => refresh())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user, refresh])

  useEffect(() => {
    if (!loading && user) listCache = { uid: user.id, muted: mutedKey, list: notifications, hasMore }
  }, [loading, user, mutedKey, notifications, hasMore])

  async function loadMore() {
    if (loadingMore || notifications.length === 0) return
    setLoadingMore(true)
    const data = await fetchPage(notifications[notifications.length - 1].created_at)
    setNotifications((prev) => [...prev, ...data.filter((d) => !prev.some((p) => p.id === d.id))])
    setHasMore(data.length === PAGE)
    setLoadingMore(false)
  }

  // Read state is explicit — visiting this page doesn't silently mark
  // everything read. Tapping a row (or Mark all read) does.
  // Saved through /api/notifications/read (service role), then the nav badge
  // is told to recount — it doesn't rely on realtime UPDATE events arriving.
  async function saveRead(payload: { ids: string[] } | { all: true }) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    await fetch('/api/notifications/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(payload),
    }).catch(() => {})
    window.dispatchEvent(new Event('notifications-changed'))
  }

  async function markRead(ids: string[]) {
    const unreadIds = ids.filter((id) => notifications.some((n) => n.id === id && !n.read))
    if (unreadIds.length === 0) return
    setNotifications((prev) => prev.map((n) => (unreadIds.includes(n.id) ? { ...n, read: true } : n)))
    await saveRead({ ids: unreadIds })
  }

  async function markAllRead() {
    if (sweeping) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const unread = Math.min(12, notifications.filter((n) => !n.read).length)
    setSweeping(true)
    setTimeout(() => {
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
      setSweeping(false)
    }, reduce ? 0 : unread * 60 + 320)
    await saveRead({ all: true })
  }

  async function clearAll() {
    setClearing(true)
    const { data: { session } } = await supabase.auth.getSession()
    const ok = session && await fetch('/api/notifications/clear', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    }).then((r) => r.ok).catch(() => false)
    setClearing(false)
    setConfirmClear(false)
    if (!ok) return
    setNotifications([])
    setHasMore(false)
    window.dispatchEvent(new Event('notifications-changed'))
  }

  function open(ids: string[], href: string | null) {
    markRead(ids)
    if (href) router.push(href)
  }

  const unreadCount = notifications.filter((n) => !n.read).length
  const filtered = useMemo(() => notifications.filter((n) => matchesFilter(n, filterMode)), [notifications, filterMode])
  const items = useMemo(() => buildItems(filtered), [filtered])

  // Section the rows by day.
  const sections = useMemo(() => {
    const out: { label: string; items: Item[] }[] = []
    for (const it of items) {
      const first = it.kind === 'single' ? it.n : it.ns[0]
      const label = dateLabel(first.created_at)
      if (out.length && out[out.length - 1].label === label) out[out.length - 1].items.push(it)
      else out.push({ label, items: [it] })
    }
    return out
  }, [items])

  if (authLoading || !user) {
    return (
      <BoltLoader message="Checking your alerts…" />
    )
  }

  // Same compact card as the old Community activity cards: icon tile,
  // message, time, chevron. Unread cards get a lime tint and a dot.
  let sweepOrder = 0
  const iconTile = (type: string, unread: boolean) => (
    <span style={{ position: 'relative', width: 30, height: 30, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: unread ? 'rgba(201,244,0,0.12)' : 'var(--fg-06)' }}>
      {notificationIcon(type)}
      {unread && <span className={sweeping ? 'dot-out' : undefined} style={{ ['--d' as string]: `${Math.min(sweepOrder++, 12) * 60}ms`, position: 'absolute', top: -3, right: -3, width: 9, height: 9, borderRadius: '50%', background: '#C9F400', border: '2px solid var(--bg)' }} />}
    </span>
  )

  const rowShell = (key: string, unread: boolean, onClick: () => void, href: string | null, children: React.ReactNode) => (
    <button
      key={key}
      onClick={onClick}
      className={`reveal ${arrivedIds.has(key) ? 'anim-new' : ''}`}
      style={{
        width: '100%', display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 12px', textAlign: 'left', borderRadius: 14,
        background: unread ? 'rgba(201,244,0,0.05)' : 'var(--fg-03)', border: `1px solid ${unread ? 'rgba(201,244,0,0.22)' : 'var(--fg-06)'}`,
        cursor: 'pointer', fontFamily: 'inherit', color: 'inherit', transition: 'background 0.35s ease, border-color 0.35s ease',
      }}
    >
      {children}
      {href && <span style={{ alignSelf: 'center', display: 'flex', flexShrink: 0 }}><ChevronRightIcon size={14} color="var(--text-dim)" /></span>}
    </button>
  )

  const singleRow = (n: any) => {
    const href = hrefFor(n)
    return rowShell(n.id, !n.read, () => open([n.id], href), href, (
      <>
        {iconTile(n.type, !n.read)}
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 14, lineHeight: 1.45, fontWeight: n.read ? 400 : 600, color: n.read ? 'var(--text-muted)' : 'var(--text)' }}>
            {isStock(n.type) ? <StockText text={cleanMessage(n.message)} matcher={matcher} /> : cleanMessage(n.message)}
          </span>
          <span style={{ display: 'block', fontSize: 12, color: 'var(--text-dim)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {n.store?.name ? `${n.store.name} · ` : ''}{timeAgo(n.created_at)}
          </span>
        </span>
      </>
    ))
  }

  const groupRow = (ns: any[]) => {
    const first = ns[0]
    const unread = ns.some((n) => !n.read)
    const href = hrefFor(first)
    const expanded = expandedGroups.has(first.id)
    const shown = expanded ? ns : ns.slice(0, 3)
    return rowShell(first.id, unread, () => open(ns.map((n) => n.id), href), href, (
      <>
        {iconTile('stock_update', unread)}
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 14, lineHeight: 1.45, fontWeight: unread ? 600 : 400, color: unread ? 'var(--text)' : 'var(--text-muted)' }}>
            {ns.length} stock updates{first.store?.name ? ` at ${first.store.name}` : ''}
          </span>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 5 }}>
            {shown.map((n) => (
              <span key={n.id} style={{ fontSize: 12, padding: '3px 8px', borderRadius: 6, background: 'var(--fg-06)', color: 'var(--text)', lineHeight: 1.35, alignSelf: 'flex-start' }}>
                <StockText text={cleanMessage(n.message)} matcher={matcher} />
              </span>
            ))}
            {ns.length > 3 && (
              <span
                role="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setExpandedGroups((prev) => { const next = new Set(prev); if (next.has(first.id)) next.delete(first.id); else next.add(first.id); return next })
                }}
                style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent-text)', marginTop: 2, alignSelf: 'flex-start' }}
              >
                {expanded ? 'Show less' : `+${ns.length - 3} more`}
              </span>
            )}
          </span>
          <span style={{ display: 'block', fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>{timeAgo(first.created_at)}</span>
        </span>
      </>
    ))
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg)', overflowX: 'hidden', color: 'var(--text)' }}>
      <div className="mobile-nav-pb" style={{ paddingTop: 'calc(56px + env(safe-area-inset-top))' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '12px 20px 14px', gap: 10 }}>
          <div>
            <h1 style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.1 }}>Notifications</h1>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 4 }}>
              {loading ? ' ' : unreadCount > 0 ? `${unreadCount}${hasMore ? '+' : ''} unread` : 'You’re all caught up'}
            </p>
          </div>
          {notifications.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
              {unreadCount > 0 && (
                <button className={ui.btnGhost} onClick={markAllRead} style={{ color: 'var(--accent-text)', fontSize: 14, fontWeight: 600, minHeight: 36 }}>
                  Mark all read
                </button>
              )}
              <button className={ui.btnGhost} onClick={() => setConfirmClear(true)} style={{ color: 'var(--text-muted)', fontSize: 14, fontWeight: 600, minHeight: 36 }}>
                Clear all
              </button>
            </div>
          )}
        </div>

        {/* Filter chips */}
        {notifications.length > 0 && (
          <div className={`${ui.chipRow} no-scrollbar`} style={{ display: 'flex', gap: 8, padding: '0 16px 16px', overflowX: 'auto' }}>
            {FILTERS.map(({ mode, label }) => {
              const count = mode === 'unread' ? unreadCount : 0
              return (
                <button key={mode} className={`${ui.chip} ${filterMode === mode ? ui.chipActive : ''}`} onClick={() => setFilterMode(mode)}>
                  {label}{count > 0 ? ` · ${count}` : ''}
                </button>
              )
            })}
          </div>
        )}

        <div style={{ padding: '0 16px 32px' }}>
          {loading ? (
            <SkeletonList count={6} />
          ) : notifications.length === 0 ? (
            <div className={ui.emptyState} style={{ marginTop: 60 }}>
              <span style={{ width: 64, height: 64, borderRadius: 20, background: 'var(--fg-06)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <BellIcon size={28} color="var(--text-muted)" />
              </span>
              <p className={ui.emptyTitle}>No notifications yet</p>
              <p className={ui.emptyBody}>Follow a flavor to hear when it&apos;s back in stock. Replies, badges and store updates show up here too.</p>
              <button className={ui.btnSecondary} style={{ marginTop: 14 }} onClick={() => router.push('/account?page=alerts')}>Follow a flavor</button>
            </div>
          ) : items.length === 0 ? (
            <div className={ui.emptyState} style={{ marginTop: 40 }}>
              <p className={ui.emptyTitle}>{filterMode === 'unread' ? 'No unread notifications' : 'Nothing here yet'}</p>
              <p className={ui.emptyBody}>{filterMode === 'unread' ? 'You’re all caught up.' : 'Try another filter.'}</p>
            </div>
          ) : (
            <>
              {sections.map((sec) => (
                <div key={sec.label} style={{ marginBottom: 20 }}>
                  <p className={ui.sectionLabel} style={{ margin: '0 4px 8px' }}>{sec.label}</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {sec.items.map((it) => (it.kind === 'single' ? singleRow(it.n) : groupRow(it.ns)))}
                  </div>
                </div>
              ))}

              {hasMore && (
                <button className={`${ui.btnSecondary} ${ui.btnBlock}`} onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? 'Loading…' : 'Load older notifications'}
                </button>
              )}

            </>
          )}
        </div>
      </div>

      {/* Clear-all confirmation */}
      {confirmClear && (
        <div className="anim-fade" onClick={() => setConfirmClear(false)} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div className="anim-sheet" onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, background: 'var(--surface)', borderRadius: '24px 24px 0 0', border: '1px solid var(--fg-08)', padding: '22px 16px calc(env(safe-area-inset-bottom) + 20px)' }}>
            <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>Clear all notifications?</p>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 18 }}>This removes every notification for good. It can&apos;t be undone.</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className={ui.btnSecondary} style={{ flex: 1 }} onClick={() => setConfirmClear(false)}>Cancel</button>
              <button className={ui.btnSecondary} style={{ flex: 1, color: '#FF6B6B', borderColor: 'rgba(255,107,107,0.35)' }} onClick={clearAll} disabled={clearing}>{clearing ? 'Clearing…' : 'Clear all'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
