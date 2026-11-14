'use client'

import { useAuth } from '@/contexts/AuthContext'

// Main content column. On desktop it's offset to make room for SideNav — but
// SideNav only renders for signed-in users, so logged-out pages (the landing
// page, sign-in) use the full width instead of leaving an empty 220px strip.
export default function ContentShell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  return (
    <div className={`relative flex flex-col h-[100dvh] overflow-hidden${user ? ' md:ml-[220px]' : ''}`} style={{ zIndex: 1 }}>
      {children}
    </div>
  )
}
