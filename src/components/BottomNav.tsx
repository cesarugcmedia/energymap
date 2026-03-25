'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

const ALL_TABS = [
  { href: '/', label: 'Map', icon: '🗺️', adminOnly: false },
  { href: '/stores', label: 'Stores', icon: '📋', adminOnly: false },
  { href: '/leaderboard', label: 'Ranks', icon: '🏆', adminOnly: false },
  { href: '/notifications', label: 'Alerts', icon: '🔔', adminOnly: false },
  { href: '/account', label: 'Account', icon: '👤', adminOnly: false },
  { href: '/admin', label: 'Admin', icon: '🔧', adminOnly: true },
]

const TAB_PATHS = ['/', '/stores', '/leaderboard', '/notifications', '/account', '/admin', '/admin/login']

export default function BottomNav() {
  const pathname = usePathname()
  const { user, profile } = useAuth()
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    if (!user) return
    fetchUnread()

    const channel = supabase
      .channel('notifications-count')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => setUnread((n) => n + 1)
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user])

  // Reset badge when visiting notifications page
  useEffect(() => {
    if (pathname === '/notifications') setUnread(0)
  }, [pathname])

  async function fetchUnread() {
    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user!.id)
      .eq('read', false)
    setUnread(count ?? 0)
  }

  if (!user) return null
  if (!TAB_PATHS.includes(pathname)) return null

  const tabs = ALL_TABS.filter((t) => !t.adminOnly || profile?.is_admin)

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
          const showBadge = tab.href === '/notifications' && unread > 0
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="flex flex-col items-center justify-center flex-1 gap-1 no-underline relative"
              style={{ color: isActive ? '#22c55e' : 'rgba(255,255,255,0.35)' }}
            >
              <div className="relative">
                <span style={{ fontSize: 20 }}>{tab.icon}</span>
                {showBadge && (
                  <div
                    className="absolute -top-1 -right-1.5 min-w-[16px] h-4 rounded-full flex items-center justify-center px-1"
                    style={{ backgroundColor: '#ef4444', fontSize: 9, fontWeight: 700, color: '#fff' }}
                  >
                    {unread > 9 ? '9+' : unread}
                  </div>
                )}
              </div>
              <span style={{ fontSize: 11, fontWeight: 600 }}>{tab.label}</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
