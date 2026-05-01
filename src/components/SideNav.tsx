'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'

const ALL_TABS = [
  { href: '/', label: 'Map', icon: '🗺️', adminOnly: false, trackerOnly: false },
  { href: '/stores', label: 'Stores', icon: '🏪', adminOnly: false, trackerOnly: false },
  { href: '/leaderboard', label: 'Ranks', icon: '🏆', adminOnly: false, trackerOnly: false },
  { href: '/account', label: 'Account', icon: '👤', adminOnly: false, trackerOnly: false },
  { href: '/admin', label: 'Admin', icon: '🔧', adminOnly: true, trackerOnly: false },
]

const TAB_PATHS = ['/', '/stores', '/leaderboard', '/notifications', '/account', '/admin', '/admin/login']

export default function SideNav() {
  const pathname = usePathname()
  const { user, profile } = useAuth()
  const { theme, toggle } = useTheme()

  if (!user) return null
  if (!TAB_PATHS.includes(pathname)) return null

  const isTracker = profile?.is_admin || profile?.tier === 'tracker'
  const tabs = ALL_TABS.filter((t) => {
    if (t.adminOnly && !profile?.is_admin) return false
    if (t.trackerOnly && !isTracker) return false
    return true
  })

  const tierLabel = profile?.is_admin ? 'Admin' : profile?.tier === 'tracker' ? 'Tracker' : 'Free'
  const tierColor = profile?.is_admin ? '#f59e0b' : profile?.tier === 'tracker' ? '#C9F400' : '#4A5F50'

  return (
    <aside
      className="hidden md:flex flex-col shrink-0"
      style={{
        width: 220,
        height: '100dvh',
        backgroundColor: 'var(--surface)',
        borderRight: '1px solid rgba(201,244,0,0.12)',
        position: 'fixed',
        top: 0,
        left: 0,
        zIndex: 50,
      }}
    >
      {/* Logo */}
      <div style={{ padding: '28px 20px 24px' }}>
        <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 26, fontWeight: 800, letterSpacing: 2, color: 'var(--accent)', lineHeight: 1, textTransform: 'uppercase' }}>
          Amped Map
        </p>
        <p style={{ fontSize: 11, color: '#4A5F50', marginTop: 2, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.06em', textTransform: 'uppercase' }}>Find drinks near you</p>
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
                backgroundColor: isActive ? 'rgba(201,244,0,0.08)' : 'transparent',
                color: isActive ? '#C9F400' : '#7A8F80',
              }}
            >
              <span style={{ fontSize: 18, filter: isActive ? 'drop-shadow(0 0 5px rgba(201,244,0,0.5))' : 'none' }}>{tab.icon}</span>
              <span style={{ fontSize: 14, fontWeight: isActive ? 700 : 500, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.04em', textTransform: 'uppercase' }}>{tab.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* Theme toggle */}
      <button
        onClick={toggle}
        style={{
          margin: '0 12px 8px',
          padding: '10px 14px',
          borderRadius: 12,
          backgroundColor: 'var(--fg-06)',
          border: '1px solid var(--fg-07)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          color: 'var(--text-muted)',
        }}
      >
        <span style={{ fontSize: 16 }}>{theme === 'dark' ? '☀️' : '🌙'}</span>
        <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
        </span>
      </button>

      {/* User footer */}
      <div style={{ padding: '16px 20px', borderTop: '1px solid var(--fg-07)' }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: '#F0F4E8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.04em' }}>
          {profile?.username ?? user.email?.split('@')[0] ?? 'User'}
        </p>
        <p style={{ fontSize: 11, color: tierColor, fontWeight: 700, marginTop: 2, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.08em', textTransform: 'uppercase' }}>{tierLabel}</p>
      </div>
    </aside>
  )
}
