'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { useUnreadNotifications } from '@/hooks/useUnreadNotifications'
import { MapIcon, CommunityIcon, AlertsIcon, AccountIcon, AdminIcon } from '@/components/NavIcons'

const ALL_TABS = [
  { href: '/', label: 'Map', Icon: MapIcon, adminOnly: false, trackerOnly: false },
  { href: '/community', label: 'Community', Icon: CommunityIcon, adminOnly: false, trackerOnly: false },
  { href: '/notifications', label: 'Alerts', Icon: AlertsIcon, adminOnly: false, trackerOnly: false },
  { href: '/account', label: 'Account', Icon: AccountIcon, adminOnly: false, trackerOnly: false },
  { href: '/admin', label: 'Admin', Icon: AdminIcon, adminOnly: true, trackerOnly: false },
]

const TAB_PATHS = ['/', '/community', '/notifications', '/account', '/admin', '/admin/login']

export default function BottomNav() {
  const pathname = usePathname()
  const { user, profile } = useAuth()
  const unread = useUnreadNotifications()
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
              style={{ color: isActive ? 'var(--accent)' : 'var(--text-dim)', position: 'relative' }}
            >
              <div style={{ position: 'relative', filter: isActive ? 'drop-shadow(0 0 6px rgba(201,244,0,0.6))' : 'none' }}>
                <tab.Icon active={isActive} />
                {tab.href === '/notifications' && unread > 0 && (
                  <div
                    className="absolute flex items-center justify-center"
                    style={{
                      top: -4, right: -6, minWidth: 14, height: 14, borderRadius: 999, padding: '0 3px',
                      backgroundColor: '#ff5c5c', border: '2px solid var(--surface)',
                      fontSize: 8, fontWeight: 800, color: '#fff',
                    }}
                  >
                    {unread > 9 ? '9+' : unread}
                  </div>
                )}
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.08em', textTransform: 'uppercase' }}>{tab.label}</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
