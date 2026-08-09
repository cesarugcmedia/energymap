'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

const TYPE_ICON: Record<string, string> = {
  stock_update: '⚡',
  store_approved: '✅',
  store_rejected: '❌',
  new_store: '🏪',
  new_drink: '🥤',
  mention: '💬',
  comment: '💬',
  badge: '🏅',
  drink_alert: '🔔',
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

export default function NotificationsPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [notifications, setNotifications] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmClear, setConfirmClear] = useState(false)

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

    // Mark all as read
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', user!.id)
      .eq('read', false)

    setLoading(false)
  }

  async function clearAll() {
    const { error } = await supabase.from('notifications').delete().eq('user_id', user!.id)
    if (error) { setConfirmClear(false); return }
    setNotifications([])
    setConfirmClear(false)
  }

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
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '12px 20px 16px' }}>
        <div>
          <h1 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 32, fontWeight: 800, letterSpacing: '0.02em', textTransform: 'uppercase', color: 'var(--text)', lineHeight: 1 }}>
            🔔 Notifi<span style={{ color: 'var(--accent)' }}>cations</span>
          </h1>
          <p style={{ fontSize: 12, color: '#7A8F80', marginTop: 4 }}>Updates on your stores and reports</p>
        </div>
        {notifications.length > 0 && (
          confirmClear ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={() => setConfirmClear(false)}
                style={{ fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 99, color: '#7A8F80', backgroundColor: 'var(--surface)', border: '1px solid rgba(201,244,0,0.12)', cursor: 'pointer', fontFamily: "'Barlow Condensed', sans-serif" }}
              >
                Cancel
              </button>
              <button
                onClick={clearAll}
                style={{ fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 99, color: '#FF4545', backgroundColor: 'rgba(255,69,69,0.1)', border: '1px solid rgba(255,69,69,0.2)', cursor: 'pointer', fontFamily: "'Barlow Condensed', sans-serif" }}
              >
                Clear All
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmClear(true)}
              style={{ fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 99, color: '#7A8F80', backgroundColor: 'var(--surface)', border: '1px solid rgba(201,244,0,0.12)', cursor: 'pointer', fontFamily: "'Barlow Condensed', sans-serif" }}
            >
              Clear All
            </button>
          )
        )}
      </div>

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
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 16px 32px' }}>
          {notifications.map((n) => (
            <div
              key={n.id}
              style={{
                borderRadius: 16,
                padding: 16,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
                backgroundColor: n.read ? 'var(--surface)' : 'rgba(201,244,0,0.06)',
                border: `1px solid ${n.read ? 'rgba(201,244,0,0.12)' : 'rgba(201,244,0,0.25)'}`,
              }}
            >
              <div
                style={{ width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2, backgroundColor: '#283038', border: '1px solid rgba(201,244,0,0.12)' }}
              >
                <span style={{ fontSize: 18 }}>{TYPE_ICON[n.type] ?? '🔔'}</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', lineHeight: 1.4 }}>{n.message}</p>
                {n.store && (
                  <a
                    href={`/store/${n.store.id}?name=${encodeURIComponent(n.store.name)}`}
                    style={{ fontSize: 12, fontWeight: 700, marginTop: 4, display: 'inline-block', color: 'var(--accent)', textDecoration: 'none', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.04em' }}
                  >
                    {n.store.name} → View Stock
                  </a>
                )}
                <p style={{ fontSize: 11, color: '#4A5F50', marginTop: 4 }}>{timeAgo(n.created_at)}</p>
              </div>
              {!n.read && (
                <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginTop: 6, backgroundColor: '#C9F400' }} />
              )}
            </div>
          ))}
        </div>
      )}
      </div>
    </div>
  )
}
