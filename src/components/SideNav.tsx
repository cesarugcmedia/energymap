'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { useUnreadNotifications } from '@/hooks/useUnreadNotifications'
import { MapIcon, CommunityIcon, AlertsIcon, AccountIcon } from '@/components/NavIcons'

const ALL_TABS = [
  { href: '/', label: 'Map', Icon: MapIcon, adminOnly: false, trackerOnly: false },
  { href: '/community', label: 'Community', Icon: CommunityIcon, adminOnly: false, trackerOnly: false },
  { href: '/notifications', label: 'Alerts', Icon: AlertsIcon, adminOnly: false, trackerOnly: false },
  { href: '/account', label: 'Account', Icon: AccountIcon, adminOnly: false, trackerOnly: false },
]

const TAB_PATHS = ['/', '/community', '/notifications', '/account', '/admin', '/admin/login']

export default function SideNav() {
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

  const tierLabel = profile?.is_admin ? 'Admin' : profile?.tier === 'tracker' ? 'Tracker' : 'Free'
  const tierColor = profile?.is_admin ? '#f59e0b' : profile?.tier === 'tracker' ? '#C9F400' : 'var(--text-dim)'

  return (
    <aside
      className="hidden md:flex flex-col shrink-0"
      style={{
        width: 220,
        height: '100dvh',
        backgroundColor: 'var(--surface)',
        borderRight: '1px solid var(--border)',
        position: 'fixed',
        top: 0,
        left: 0,
        zIndex: 50,
      }}
    >
      {/* Logo */}
      <div style={{ padding: '28px 20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 30, height: 30, borderRadius: 8, background: '#C9F400', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 2 4.5 13.5h6.2L9.8 22l9-11.6h-6.3L13.5 2z" fill="#0D1210" /></svg>
          </span>
          <span style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>AmpedMap</span>
        </div>
      </div>

      {/* Nav links */}
      <nav className="flex flex-col gap-1 px-3 flex-1">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href || (tab.href === '/account' && pathname.startsWith('/admin'))
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="flex items-center gap-3 rounded-xl px-3 py-3 no-underline transition-colors"
              style={{
                backgroundColor: isActive ? 'rgba(201,244,0,0.08)' : 'transparent',
                color: isActive ? '#C9F400' : 'var(--text-muted)',
              }}
            >
              <div style={{ position: 'relative', filter: 'none' }}>
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
              <span style={{ fontSize: 14, fontWeight: isActive ? 700 : 500 }}>{tab.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* User footer */}
      <div style={{ padding: '16px 20px', borderTop: '1px solid var(--fg-07)' }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {profile?.username ?? user.email?.split('@')[0] ?? 'User'}
        </p>
        <p style={{ fontSize: 13, color: tierColor, fontWeight: 600, marginTop: 2 }}>{tierLabel}</p>
      </div>
    </aside>
  )
}
