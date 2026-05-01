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

export default function BottomNav() {
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

  return (
    <div
      className="fixed bottom-0 z-50 w-full md:hidden"
      style={{
        backgroundColor: 'var(--surface)',
        borderTop: '1px solid var(--border)',
        height: 'calc(70px + env(safe-area-inset-bottom))',
      }}
    >
      <div className="flex items-stretch" style={{ height: '70px' }}>
        {tabs.map((tab) => {
          const isActive = pathname === tab.href || (tab.href === '/admin' && pathname === '/admin/login')
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="flex flex-col items-center justify-center flex-1 gap-1 no-underline"
              style={{ color: isActive ? 'var(--accent)' : 'var(--text-dim)' }}
            >
              <span style={{ fontSize: 20, filter: isActive ? 'drop-shadow(0 0 6px rgba(201,244,0,0.6))' : 'none' }}>{tab.icon}</span>
              <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.08em', textTransform: 'uppercase' }}>{tab.label}</span>
            </Link>
          )
        })}
        {/* Theme toggle */}
        <button
          onClick={toggle}
          className="flex flex-col items-center justify-center gap-1"
          style={{ width: 56, flexShrink: 0, color: 'var(--text-dim)', background: 'none', border: 'none', cursor: 'pointer' }}
          aria-label="Toggle theme"
        >
          <span style={{ fontSize: 18 }}>{theme === 'dark' ? '☀️' : '🌙'}</span>
          <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {theme === 'dark' ? 'Light' : 'Dark'}
          </span>
        </button>
      </div>
    </div>
  )
}
