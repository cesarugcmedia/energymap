'use client'

import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'

export default function MainWrapper({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const pathname = usePathname()

  // Keyed on the path so each page fades in on navigation (opacity only —
  // see .page-enter in globals.css) and starts scrolled to the top. Query
  // changes on the same page (e.g. /?view=list) don't replay it.
  return (
    <main key={pathname} className={`flex-1 overflow-y-auto page-enter${user ? ' mobile-nav-pb' : ''}`}>
      {children}
    </main>
  )
}
