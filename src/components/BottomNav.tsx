'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'

const ALL_TABS = [
  { href: '/', label: 'Map', icon: '🗺️', adminOnly: false, trackerOnly: false },
  { href: '/stores', label: 'Stores', icon: '📋', adminOnly: false, trackerOnly: false },
  { href: '/lists', label: 'Lists', icon: '📑', adminOnly: false, trackerOnly: true },
  { href: '/leaderboard', label: 'Ranks', icon: '🏆', adminOnly: false, trackerOnly: false },
  { href: '/account', label: 'Account', icon: '👤', adminOnly: false, trackerOnly: false },
  { href: '/admin', label: 'Admin', icon: '🔧', adminOnly: true, trackerOnly: false },
]

const TAB_PATHS = ['/', '/stores', '/lists', '/leaderboard', '/notifications', '/account', '/admin', '/admin/login']

export default function BottomNav() {
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
              <span style={{ fontSize: 20 }}>{tab.icon}</span>
              <span style={{ fontSize: 11, fontWeight: 600 }}>{tab.label}</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
