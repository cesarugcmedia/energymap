'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/', label: 'Map', icon: '🗺️' },
  { href: '/stores', label: 'Stores', icon: '📋' },
  { href: '/submit', label: 'Report', icon: '⚡' },
  { href: '/admin', label: 'Admin', icon: '🔧' },
]

const TAB_PATHS = ['/', '/stores', '/submit', '/admin']

export default function BottomNav() {
  const pathname = usePathname()

  if (!TAB_PATHS.includes(pathname)) return null

  return (
    <div
      className="fixed bottom-0 z-50 w-full"
      style={{
        maxWidth: '448px',
        left: '50%',
        transform: 'translateX(-50%)',
        backgroundColor: '#0a0a0f',
        borderTop: '1px solid rgba(255,255,255,0.07)',
        // Total height = 70px tab area + safe area below (for iPhone home indicator)
        height: 'calc(70px + env(safe-area-inset-bottom))',
      }}
    >
      {/* Tab buttons sit in the fixed 70px area, safe area is just empty space below */}
      <div className="flex" style={{ height: '70px' }}>
        {TABS.map((tab) => {
          const isActive = pathname === tab.href
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
