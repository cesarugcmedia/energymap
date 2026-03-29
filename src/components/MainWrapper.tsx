'use client'

import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'

// Pages that manage their own full-screen layout — skip the nav padding
const SELF_MANAGED = ['/community']

export default function MainWrapper({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const pathname = usePathname()
  const selfManaged = SELF_MANAGED.includes(pathname)

  return (
    <main
      className={`flex-1 overflow-y-auto${user && !selfManaged ? ' mobile-nav-pb' : ''}`}
    >
      {children}
    </main>
  )
}
