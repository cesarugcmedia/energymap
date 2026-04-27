'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'

const ALL_TABS = [
  { href: '/', label: 'Map', icon: '🗺️', adminOnly: false, trackerOnly: false },
  { href: '/stores', label: 'Stores', icon: '📋', adminOnly: false, trackerOnly: false },
  { href: '/leaderboard', label: 'Ranks', icon: '🏆', adminOnly: false, trackerOnly: false },
  { href: '/account', label: 'Account', icon: '👤', adminOnly: false, trackerOnly: false },
  { href: '/admin', label: 'Admin', icon: '🔧', adminOnly: true, trackerOnly: false },
]

const TAB_PATHS = ['/', '/stores', '/leaderboard', '/notifications', '/account', '/admin', '/admin/login']

export default function SideNav() {
  const pathname = usePathname()
  const { user, profile } = useAuth()

  if (!user) return null
  if (!TAB_PATHS.includes(pathname)) return null

  const isTracker = profile?.is_admin || profile?.tier === 'tracker'
  const tabs = ALL_TABS.filter((t) => {
    if (t.adminOnly && !profile?.is_admin) return false
    if (t.trackerOnly && !isTracker) return false
    return true
  })

  const tierLabel = profile?.is_admin ? 'Admin' : profile?.tier === 'tracker' ? 'Tracker' : 'Free'
  const tierColor = profile?.is_admin ? '#f59e0b' : profile?.tier === 'tracker' ? '#a855f7' : 'rgba(255,255,255,0.35)'

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
          Amped Map
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
              <span style={{ fontSize: 18 }}>{tab.icon}</span>
              <span style={{ fontSize: 14, fontWeight: isActive ? 700 : 500 }}>{tab.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* User footer */}
      <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {profile?.username ?? user.email?.split('@')[0] ?? 'User'}
        </p>
        <p style={{ fontSize: 11, color: tierColor, fontWeight: 600, marginTop: 2 }}>{tierLabel}</p>
      </div>
    </aside>
  )
}
