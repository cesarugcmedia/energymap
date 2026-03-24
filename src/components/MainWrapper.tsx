'use client'

import { useAuth } from '@/contexts/AuthContext'

export default function MainWrapper({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  return (
    <main
      className="flex-1"
      style={user ? { paddingBottom: 'calc(70px + env(safe-area-inset-bottom))' } : {}}
    >
      {children}
    </main>
  )
}
