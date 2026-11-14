'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { notificationIcon } from '@/components/NotificationIcons'
import { BellIcon, ChevronRightIcon } from '@/components/Icons'
import SkeletonList from '@/components/ui/SkeletonList'
import ui from '@/components/ui/ui.module.css'

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

// Where tapping a notification takes you.
function hrefFor(n: any): string | null {
  if (n.store?.id) return `/store/${n.store.id}?name=${encodeURIComponent(n.store.name)}`
  if (n.post_id) return `/community?post=${n.post_id}`
  if (n.type === 'badge') return '/account?page=badges'
  if (n.type === 'drink_alert') return '/account?page=alerts'
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

export default function NotificationsPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [notifications, setNotifications] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [filterMode, setFilterMode] = useState<FilterMode>('all')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

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
    const { data } = await q
    return data ?? []
  }, [user])

  const refresh = useCallback(async () => {
    const data = await fetchPage()
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
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    await saveRead({ all: true })
  }

  async function clearAll() {
    const { error } = await supabase.from('notifications').delete().eq('user_id', user!.id)
    setConfirmClear(false)
    if (error) return
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh', backgroundColor: 'var(--bg)' }}>
        <div style={{ width: 32, height: 32, border: '2px solid #C9F400', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    )
  }

  const iconTile = (type: string, unread: boolean) => (
    <span style={{ width: 38, height: 38, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: unread ? 'rgba(201,244,0,0.12)' : 'var(--fg-06)' }}>
      {notificationIcon(type)}
    </span>
  )

  const rowShell = (key: string, unread: boolean, onClick: () => void, href: string | null, children: React.ReactNode, i: number) => (
    <button
      key={key}
      onClick={onClick}
      style={{
        width: '100%', display: 'flex', alignItems: 'flex-start', gap: 12, padding: '13px 14px 13px 12px', textAlign: 'left',
        background: unread ? 'rgba(201,244,0,0.035)' : 'none', border: 'none', borderTop: i ? '1px solid var(--fg-06)' : 'none',
        cursor: 'pointer', fontFamily: 'inherit', color: 'inherit',
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: unread ? '#C9F400' : 'transparent', flexShrink: 0, marginTop: 16 }} />
      {children}
      {href && <span style={{ alignSelf: 'center', display: 'flex', flexShrink: 0 }}><ChevronRightIcon size={16} color="var(--text-dim)" /></span>}
    </button>
  )

  const singleRow = (n: any, i: number) => {
    const href = hrefFor(n)
    return rowShell(n.id, !n.read, () => open([n.id], href), href, (
      <>
        {iconTile(n.type, !n.read)}
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 15, lineHeight: 1.4, fontWeight: n.read ? 400 : 600, color: n.read ? 'var(--text-muted)' : 'var(--text)' }}>
            {cleanMessage(n.message)}
          </span>
          <span style={{ display: 'block', fontSize: 13, color: 'var(--text-dim)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {n.store?.name ? `${n.store.name} · ` : ''}{timeAgo(n.created_at)}
          </span>
        </span>
      </>
    ), i)
  }

  const groupRow = (ns: any[], i: number) => {
    const first = ns[0]
    const unread = ns.some((n) => !n.read)
    const href = hrefFor(first)
    const expanded = expandedGroups.has(first.id)
    const shown = expanded ? ns : ns.slice(0, 3)
    return rowShell(first.id, unread, () => open(ns.map((n) => n.id), href), href, (
      <>
        {iconTile('stock_update', unread)}
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 15, lineHeight: 1.4, fontWeight: unread ? 600 : 400, color: unread ? 'var(--text)' : 'var(--text-muted)' }}>
            {ns.length} stock updates{first.store?.name ? ` at ${first.store.name}` : ''}
          </span>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 5 }}>
            {shown.map((n) => (
              <span key={n.id} style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.35, display: 'flex', gap: 6 }}>
                <span style={{ color: 'var(--text-dim)' }}>•</span>{cleanMessage(n.message)}
              </span>
            ))}
            {ns.length > 3 && (
              <span
                role="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setExpandedGroups((prev) => { const next = new Set(prev); if (next.has(first.id)) next.delete(first.id); else next.add(first.id); return next })
                }}
                style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)', marginTop: 2, alignSelf: 'flex-start' }}
              >
                {expanded ? 'Show less' : `+${ns.length - 3} more`}
              </span>
            )}
          </span>
          <span style={{ display: 'block', fontSize: 13, color: 'var(--text-dim)', marginTop: 4 }}>{timeAgo(first.created_at)}</span>
        </span>
      </>
    ), i)
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
          {unreadCount > 0 && (
            <button className={ui.btnGhost} onClick={markAllRead} style={{ color: 'var(--accent)', fontSize: 14, fontWeight: 600, minHeight: 36 }}>
              Mark all read
            </button>
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
                  <div className={`${ui.card} reveal`} style={{ padding: 0, overflow: 'hidden' }}>
                    {sec.items.map((it, i) => (it.kind === 'single' ? singleRow(it.n, i) : groupRow(it.ns, i)))}
                  </div>
                </div>
              ))}

              {hasMore && (
                <button className={`${ui.btnSecondary} ${ui.btnBlock}`} onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? 'Loading…' : 'Load older notifications'}
                </button>
              )}

              <div style={{ textAlign: 'center', marginTop: 18 }}>
                <button className={ui.linkQuiet} onClick={() => setConfirmClear(true)}>Clear all notifications</button>
              </div>
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
              <button className={ui.btnSecondary} style={{ flex: 1, color: '#FF6B6B', borderColor: 'rgba(255,107,107,0.35)' }} onClick={clearAll}>Clear all</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
