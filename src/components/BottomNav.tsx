'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

const ALL_TABS = [
  { href: '/', label: 'Map', icon: '🗺️', adminOnly: false, trackerOnly: false },
  { href: '/stores', label: 'Stores', icon: '📋', adminOnly: false, trackerOnly: false },
  { href: '/community', label: 'Community', icon: '💬', adminOnly: false, trackerOnly: false },
  { href: '/leaderboard', label: 'Ranks', icon: '🏆', adminOnly: false, trackerOnly: false },
  { href: '/account', label: 'Account', icon: '👤', adminOnly: false, trackerOnly: false },
  { href: '/admin', label: 'Admin', icon: '🔧', adminOnly: true, trackerOnly: false },
]

const TAB_PATHS = ['/', '/stores', '/community', '/leaderboard', '/notifications', '/account', '/admin', '/admin/login']

export default function BottomNav() {
  const pathname = usePathname()
  const { user, profile } = useAuth()
  const [unread, setUnread] = useState(0)

  // Clear badge when on community page
  useEffect(() => {
    if (pathname === '/community') {
      setUnread(0)
      localStorage.setItem('community_last_read', new Date().toISOString())
    }
  }, [pathname])

  // Load initial unread count + subscribe to new messages
  useEffect(() => {
    if (!user) return
    const lastRead = localStorage.getItem('community_last_read') ?? new Date(0).toISOString()

    supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .gt('created_at', lastRead)
      .neq('user_id', user.id)
      .then(({ count }) => setUnread(count ?? 0))

    const channel = supabase
      .channel('nav-unread')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const msg = payload.new as any
        if (msg.user_id !== user.id && pathname !== '/community') {
          setUnread((c) => c + 1)
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user])

  if (!user) return null
  if (!TAB_PATHS.includes(pathname)) return null

  const isTracker = profile?.is_admin || profile?.tier === 'tracker'
  const tabs = ALL_TABS.filter((t) => {
    if (t.adminOnly && !profile?.is_admin) return false
    if (t.trackerOnly && !isTracker) return false
    return true
  })

  return (
    <div
      className="fixed bottom-0 z-50 w-full"
      style={{
        maxWidth: '448px',
        left: '50%',
        transform: 'translateX(-50%)',
        backgroundColor: '#0a0a0f',
        borderTop: '1px solid rgba(255,255,255,0.07)',
        height: 'calc(70px + env(safe-area-inset-bottom))',
      }}
    >
      <div className="flex" style={{ height: '70px' }}>
        {tabs.map((tab) => {
          const isActive = pathname === tab.href || (tab.href === '/admin' && pathname === '/admin/login')
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="flex flex-col items-center justify-center flex-1 gap-1 no-underline"
              style={{ color: isActive ? '#22c55e' : 'rgba(255,255,255,0.35)' }}
            >
              <span style={{ fontSize: 20, position: 'relative', display: 'inline-block' }}>
                {tab.icon}
                {tab.href === '/community' && unread > 0 && (
                  <span
                    style={{
                      position: 'absolute',
                      top: -4,
                      right: -6,
                      backgroundColor: '#ef4444',
                      color: '#fff',
                      fontSize: 9,
                      fontWeight: 800,
                      minWidth: 15,
                      height: 15,
                      borderRadius: 99,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      paddingLeft: 2,
                      paddingRight: 2,
                      lineHeight: 1,
                    }}
                  >
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </span>
              <span style={{ fontSize: 11, fontWeight: 600 }}>{tab.label}</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
