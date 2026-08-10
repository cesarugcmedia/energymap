'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { notificationIcon } from '@/components/NotificationIcons'

type FilterMode = 'all' | 'reports' | 'stores' | 'drinks'

const FILTERS: { mode: FilterMode; label: string }[] = [
  { mode: 'all', label: 'All' },
  { mode: 'reports', label: '⚡ Reports' },
  { mode: 'stores', label: '🏪 Stores' },
  { mode: 'drinks', label: '🥤 New Drinks' },
]

function matchesFilter(type: string, mode: FilterMode) {
  if (mode === 'all') return true
  if (mode === 'reports') return type === 'stock_update'
  if (mode === 'stores') return type === 'new_store' || type === 'store_approved' || type === 'store_rejected'
  if (mode === 'drinks') return type === 'new_drink'
  return true
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function dateLabel(dateStr: string) {
  const d = new Date(dateStr)
  const now = new Date()
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86400000)
  if (diffDays === 0) return 'TODAY'
  if (diffDays === 1) return 'YESTERDAY'
  if (diffDays < 7) return d.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase()
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()
}

function sameDay(a: string, b: string) {
  return new Date(a).toDateString() === new Date(b).toDateString()
}

type Item = { kind: 'single'; n: any } | { kind: 'group'; ns: any[] }

// Collapses consecutive same-store, same-day stock_update notifications
// into one card instead of repeating the store name/link over and over.
// Uses each notification's own message text as-is for the bullet list
// rather than re-parsing drink names out of it — notify_stock_update's
// exact message format isn't defined anywhere in this repo (it's an RPC
// that must have been created directly in Supabase), so this doesn't
// assume a wording it can't verify.
function buildItems(list: any[]): Item[] {
  const result: Item[] = []
  for (const n of list) {
    const last = result[result.length - 1]
    const canJoin =
      n.type === 'stock_update' && n.store_id && last &&
      (last.kind === 'group'
        ? last.ns[0].type === 'stock_update' && last.ns[0].store_id === n.store_id && sameDay(last.ns[0].created_at, n.created_at)
        : last.n.type === 'stock_update' && last.n.store_id === n.store_id && sameDay(last.n.created_at, n.created_at))
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
  const [confirmClear, setConfirmClear] = useState(false)
  const [filterMode, setFilterMode] = useState<FilterMode>('all')

  useEffect(() => {
    if (!authLoading && !user) router.replace('/account')
  }, [user, authLoading])

  useEffect(() => {
    if (!user) return
    fetchNotifications()
  }, [user])

  async function fetchNotifications() {
    setLoading(true)
    const { data } = await supabase
      .from('notifications')
      .select('*, store:stores(id, name)')
      .eq('user_id', user!.id)
      .lte('visible_after', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(50)
    if (data) setNotifications(data)
    setLoading(false)
  }

  // Read state is explicit now — visiting this page no longer silently
  // marks everything read. Tapping a card (or Mark All Read) does.
  async function markRead(ids: string[]) {
    const unreadIds = ids.filter((id) => notifications.find((n) => n.id === id && !n.read))
    if (unreadIds.length === 0) return
    setNotifications((prev) => prev.map((n) => (unreadIds.includes(n.id) ? { ...n, read: true } : n)))
    await supabase.from('notifications').update({ read: true }).in('id', unreadIds)
  }

  async function markAllRead() {
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id)
    if (unreadIds.length === 0) return
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    await supabase.from('notifications').update({ read: true }).in('id', unreadIds)
  }

  async function clearAll() {
    const { error } = await supabase.from('notifications').delete().eq('user_id', user!.id)
    if (error) { setConfirmClear(false); return }
    setNotifications([])
    setConfirmClear(false)
  }

  const unreadCount = notifications.filter((n) => !n.read).length
  const filtered = useMemo(
    () => notifications.filter((n) => matchesFilter(n.type, filterMode)),
    [notifications, filterMode]
  )
  const items = useMemo(() => buildItems(filtered), [filtered])

  if (authLoading || !user) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh', backgroundColor: 'var(--bg)' }}>
        <div style={{ width: 32, height: 32, border: '2px solid #C9F400', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg)', position: 'relative', overflowX: 'hidden', color: 'var(--text)' }}>
      <style>{`@keyframes fadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      <div className="mobile-nav-pb" style={{ position: 'relative', zIndex: 1, paddingTop: 'calc(56px + env(safe-area-inset-top))' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '12px 20px 16px', gap: 10 }}>
          <div>
            <h1 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 32, fontWeight: 800, letterSpacing: '0.02em', textTransform: 'uppercase', color: 'var(--text)', lineHeight: 1 }}>
              🔔 Notifi<span style={{ color: 'var(--accent)' }}>cations</span>
            </h1>
            <p style={{ fontSize: 12, color: '#7A8F80', marginTop: 4 }}>
              {unreadCount > 0 ? `${unreadCount} unread` : 'Updates on your stores and reports'}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {confirmClear ? (
              <>
                <button
                  onClick={() => setConfirmClear(false)}
                  style={{ fontSize: 11.5, fontWeight: 700, padding: '6px 12px', borderRadius: 99, color: '#7A8F80', backgroundColor: 'var(--surface)', border: '1px solid rgba(201,244,0,0.12)', cursor: 'pointer', fontFamily: "'Barlow Condensed', sans-serif", whiteSpace: 'nowrap' }}
                >
                  Cancel
                </button>
                <button
                  onClick={clearAll}
                  style={{ fontSize: 11.5, fontWeight: 700, padding: '6px 12px', borderRadius: 99, color: '#FF4545', backgroundColor: 'rgba(255,69,69,0.1)', border: '1px solid rgba(255,69,69,0.2)', cursor: 'pointer', fontFamily: "'Barlow Condensed', sans-serif", whiteSpace: 'nowrap' }}
                >
                  Clear All
                </button>
              </>
            ) : (
              <>
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    style={{ fontSize: 11.5, fontWeight: 700, padding: '6px 12px', borderRadius: 99, color: 'var(--accent)', backgroundColor: 'rgba(201,244,0,0.08)', border: '1px solid rgba(201,244,0,0.25)', cursor: 'pointer', fontFamily: "'Barlow Condensed', sans-serif", whiteSpace: 'nowrap' }}
                  >
                    Mark all read
                  </button>
                )}
                {notifications.length > 0 && (
                  <button
                    onClick={() => setConfirmClear(true)}
                    style={{ fontSize: 11.5, fontWeight: 700, padding: '6px 12px', borderRadius: 99, color: '#7A8F80', backgroundColor: 'var(--surface)', border: '1px solid rgba(201,244,0,0.12)', cursor: 'pointer', fontFamily: "'Barlow Condensed', sans-serif", whiteSpace: 'nowrap' }}
                  >
                    Clear All
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Filter chips */}
        {notifications.length > 0 && (
          <div style={{ display: 'flex', gap: 8, padding: '0 16px 14px', overflowX: 'auto' }} className="no-scrollbar">
            {FILTERS.map(({ mode, label }) => {
              const active = filterMode === mode
              return (
                <button key={mode}
                  onClick={() => setFilterMode(mode)}
                  style={{ flexShrink: 0, padding: '7px 14px', borderRadius: 99, border: '1px solid', borderColor: active ? '#C9F400' : 'rgba(201,244,0,0.12)', backgroundColor: active ? '#C9F400' : 'var(--surface)', color: active ? '#0D1210' : '#7A8F80', fontSize: 12, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.05em', textTransform: 'uppercase', cursor: 'pointer' }}>
                  {label}
                </button>
              )
            })}
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 64 }}>
            <div style={{ width: 32, height: 32, border: '2px solid #C9F400', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : notifications.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginTop: 80, padding: '0 20px' }}>
            <span style={{ fontSize: 48 }}>🔔</span>
            <p style={{ fontSize: 18, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", textTransform: 'uppercase', letterSpacing: '0.02em' }}>No notifications yet</p>
            <p style={{ fontSize: 13, color: '#7A8F80', textAlign: 'center' }}>You'll be notified about stock updates, new stores, and new drinks.</p>
          </div>
        ) : items.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginTop: 80, padding: '0 20px' }}>
            <span style={{ fontSize: 40 }}>🔍</span>
            <p style={{ fontSize: 16, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", textTransform: 'uppercase' }}>Nothing here</p>
            <p style={{ fontSize: 13, color: '#7A8F80', textAlign: 'center' }}>No notifications match this filter.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 16px 32px' }}>
            {items.map((item, i) => {
              const firstN = item.kind === 'single' ? item.n : item.ns[0]
              const prevItem = i > 0 ? items[i - 1] : null
              const prevFirstN = prevItem ? (prevItem.kind === 'single' ? prevItem.n : prevItem.ns[0]) : null
              const showDate = !prevFirstN || dateLabel(prevFirstN.created_at) !== dateLabel(firstN.created_at)

              return (
                <div key={item.kind === 'single' ? item.n.id : item.ns[0].id}>
                  {showDate && (
                    <p style={{ fontSize: 10.5, color: '#4A5F50', letterSpacing: '0.1em', fontWeight: 800, padding: '2px 2px', marginTop: i === 0 ? 0 : 6, marginBottom: 2 }}>
                      {dateLabel(firstN.created_at)}
                    </p>
                  )}

                  {item.kind === 'single' ? (
                    <div
                      onClick={() => markRead([item.n.id])}
                      style={{
                        borderRadius: 16, padding: 16, display: 'flex', alignItems: 'flex-start', gap: 12, cursor: item.n.read ? 'default' : 'pointer',
                        backgroundColor: item.n.read ? 'var(--surface)' : 'rgba(201,244,0,0.06)',
                        border: `1px solid ${item.n.read ? 'rgba(201,244,0,0.12)' : 'rgba(201,244,0,0.3)'}`,
                      }}
                    >
                      {!item.n.read && <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#C9F400', flexShrink: 0, marginTop: 7 }} />}
                      <div
                        style={{ width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, backgroundColor: '#191B16', border: '1px solid rgba(201,244,0,0.12)' }}
                      >
                        {notificationIcon(item.n.type)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', lineHeight: 1.4 }}>{item.n.message}</p>
                        {item.n.store && (
                          <a
                            href={`/store/${item.n.store.id}?name=${encodeURIComponent(item.n.store.name)}`}
                            onClick={(e) => e.stopPropagation()}
                            style={{ fontSize: 12, fontWeight: 700, marginTop: 4, display: 'inline-block', color: 'var(--accent)', textDecoration: 'none', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.04em' }}
                          >
                            {item.n.store.name} → View Stock
                          </a>
                        )}
                        <p style={{ fontSize: 11, color: '#4A5F50', marginTop: 4 }}>{timeAgo(item.n.created_at)}</p>
                      </div>
                    </div>
                  ) : (
                    <div
                      onClick={() => markRead(item.ns.map((n) => n.id))}
                      style={{ borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 8, backgroundColor: 'var(--surface)', border: '1px solid rgba(201,244,0,0.3)', cursor: 'pointer' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                        {item.ns.some((n) => !n.read) && <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#C9F400', flexShrink: 0, marginTop: 7 }} />}
                        <div style={{ width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, backgroundColor: 'rgba(201,244,0,0.1)', border: '1px solid rgba(201,244,0,0.3)' }}>
                          {notificationIcon('stock_update')}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{item.ns.length} stock updates</p>
                          {item.ns[0].store && (
                            <p style={{ fontSize: 12, fontWeight: 700, marginTop: 3, color: 'var(--accent)' }}>📍 {item.ns[0].store.name}</p>
                          )}
                          <p style={{ fontSize: 11, color: '#4A5F50', marginTop: 4 }}>{timeAgo(item.ns[0].created_at)}</p>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, paddingLeft: 48 }}>
                        {item.ns.map((n) => (
                          <p key={n.id} style={{ fontSize: 11.5, color: '#9AA69A', display: 'flex', alignItems: 'baseline', gap: 5 }}>
                            <span style={{ color: 'var(--accent)' }}>•</span> {n.message}
                          </p>
                        ))}
                      </div>
                      {item.ns[0].store && (
                        <a
                          href={`/store/${item.ns[0].store.id}?name=${encodeURIComponent(item.ns[0].store.name)}`}
                          onClick={(e) => e.stopPropagation()}
                          style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--accent)', textDecoration: 'none', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.04em', paddingLeft: 48 }}
                        >
                          View Stock →
                        </a>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
