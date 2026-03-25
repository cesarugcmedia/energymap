'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'

const ALL_TABS = [
  { href: '/', label: 'Map', icon: '🗺️', adminOnly: false },
  { href: '/stores', label: 'Stores', icon: '📋', adminOnly: false },
  { href: '/leaderboard', label: 'Ranks', icon: '🏆', adminOnly: false },
  { href: '/account', label: 'Account', icon: '👤', adminOnly: false },
  { href: '/admin', label: 'Admin', icon: '🔧', adminOnly: true },
]

const TAB_PATHS = ['/', '/stores', '/leaderboard', '/notifications', '/account', '/admin', '/admin/login']

export default function BottomNav() {
  const pathname = usePathname()
  const { user, profile } = useAuth()

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
