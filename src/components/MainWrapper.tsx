'use client'

import { useAuth } from '@/contexts/AuthContext'

export default function MainWrapper({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()

  return (
    <main className={`flex-1 overflow-y-auto${user ? ' mobile-nav-pb' : ''}`}>
      {children}
    </main>
  )
}
