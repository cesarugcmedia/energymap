'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

const ALL_TABS = [
  { href: '/', label: 'Map', icon: '🗺️', adminOnly: false },
  { href: '/stores', label: 'Stores', icon: '📋', adminOnly: false },
  { href: '/community', label: 'Community', icon: '💬', adminOnly: false },
  { href: '/leaderboard', label: 'Ranks', icon: '🏆', adminOnly: false },
  { href: '/account', label: 'Account', icon: '👤', adminOnly: false },
  { href: '/admin', label: 'Admin', icon: '🔧', adminOnly: true },
]

const TAB_PATHS = ['/', '/stores', '/community', '/leaderboard', '/notifications', '/account', '/admin', '/admin/login']

export default function SideNav() {
  const pathname = usePathname()
  const { user, profile } = useAuth()
  const [unread, setUnread] = useState(0)
  const pathnameRef = useRef(pathname)
  useEffect(() => { pathnameRef.current = pathname }, [pathname])

  useEffect(() => {
    if (pathname === '/community') setUnread(0)
  }, [pathname])

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
      .channel('sidenav-unread')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const msg = payload.new as any
        if (msg.user_id !== user.id && pathnameRef.current !== '/community') {
          setUnread((c) => c + 1)
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user])

  if (!user) return null
  if (!TAB_PATHS.includes(pathname)) return null

  const tabs = ALL_TABS.filter((t) => {
    if (t.adminOnly && !profile?.is_admin) return false
    return true
  })

  const tierLabel = profile?.is_admin ? 'Admin' : profile?.tier === 'tracker' ? 'Tracker' : profile?.tier === 'hunter' ? 'Hunter' : 'Free'
  const tierColor = profile?.is_admin ? '#f59e0b' : profile?.tier === 'tracker' ? '#a855f7' : profile?.tier === 'hunter' ? '#22c55e' : 'rgba(255,255,255,0.35)'

  return (
    <aside
      className="hidden md:flex flex-col shrink-0"
      style={{
        width: 220,
        height: '100dvh',
        backgroundColor: '#070710',
        borderRight: '1px solid rgba(255,255,255,0.07)',
        position: 'fixed',
        top: 0,
        left: 0,
        zIndex: 50,
      }}
    >
      {/* Logo */}
      <div style={{ padding: '28px 20px 24px' }}>
        <p style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, letterSpacing: 3, color: '#22c55e', lineHeight: 1 }}>
          EnergyMap
        </p>
        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>Find drinks near you</p>
      </div>

      {/* Nav links */}
      <nav className="flex flex-col gap-1 px-3 flex-1">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href || (tab.href === '/admin' && pathname === '/admin/login')
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="flex items-center gap-3 rounded-xl px-3 py-3 no-underline transition-colors"
              style={{
                backgroundColor: isActive ? 'rgba(34,197,94,0.1)' : 'transparent',
                color: isActive ? '#22c55e' : 'rgba(255,255,255,0.5)',
              }}
            >
              <span style={{ fontSize: 18, position: 'relative', display: 'inline-block' }}>
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
              <span style={{ fontSize: 14, fontWeight: isActive ? 700 : 500 }}>{tab.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* User footer */}
      <div
        style={{
          padding: '16px 20px',
          borderTop: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        <p style={{ fontSize: 12, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {profile?.username ?? user.email?.split('@')[0] ?? 'User'}
        </p>
        <p style={{ fontSize: 11, color: tierColor, fontWeight: 600, marginTop: 2 }}>{tierLabel}</p>
      </div>
    </aside>
  )
}
