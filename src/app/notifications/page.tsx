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
    if (!window.confirm('Clear all notifications?')) return
    await supabase.from('notifications').delete().eq('user_id', user!.id)
    setNotifications([])
  }

  if (authLoading || !user) {
    return (
      <div className="flex items-center justify-center h-screen ">
        <div className="w-8 h-8 border-2 border-[#22c55e] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="" style={{ paddingTop: 'calc(56px + env(safe-area-inset-top))' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 pb-4">
        <div>
          <p className="text-2xl font-black text-white">🔔 Notifications</p>
          <p className="text-xs text-white/40 mt-0.5">Updates on your stores and reports</p>
        </div>
        {notifications.length > 0 && (
          <button
            onClick={clearAll}
            className="text-xs font-bold px-3 py-1.5 rounded-full"
            style={{ color: 'rgba(255,255,255,0.4)', backgroundColor: 'rgba(255,255,255,0.06)' }}
          >
            Clear All
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center mt-16">
          <div className="w-8 h-8 border-2 border-[#22c55e] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : notifications.length === 0 ? (
        <div className="flex flex-col items-center gap-3 mt-20 px-5">
          <span style={{ fontSize: 48 }}>🔔</span>
          <p className="text-lg font-bold text-white">No notifications yet</p>
          <p className="text-sm text-white/40 text-center">You'll be notified about stock updates, new stores, and new drinks.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5 px-4 pb-8">
          {notifications.map((n) => (
            <div
              key={n.id}
              className="rounded-2xl p-4 flex items-start gap-3"
              style={{
                backgroundColor: n.read ? '#1a1a24' : 'rgba(34,197,94,0.06)',
                border: `1px solid ${n.read ? 'rgba(255,255,255,0.07)' : 'rgba(34,197,94,0.2)'}`,
              }}
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
              >
                <span style={{ fontSize: 18 }}>{TYPE_ICON[n.type] ?? '🔔'}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white leading-snug">{n.message}</p>
                {n.store && (
                  <a
                    href={`/store/${n.store.id}?name=${encodeURIComponent(n.store.name)}`}
                    className="text-xs font-bold mt-1 inline-block"
                    style={{ color: '#22c55e' }}
                  >
                    {n.store.name} → View Stock
                  </a>
                )}
                <p className="text-xs text-white/30 mt-1">{timeAgo(n.created_at)}</p>
              </div>
              {!n.read && (
                <div className="w-2 h-2 rounded-full shrink-0 mt-1.5" style={{ backgroundColor: '#22c55e' }} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
