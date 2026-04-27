'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'

// Redirects authenticated users to the map on a fresh app open.
// Uses sessionStorage so normal in-app navigation is never interrupted.
// The flag clears when the tab is closed or the PWA is killed.
export default function AppStartGuard() {
  const router = useRouter()
  const pathname = usePathname()
  const { user, loading } = useAuth()

  useEffect(() => {
    if (loading || !user) return

    if (!sessionStorage.getItem('app_started') && pathname !== '/') {
      router.replace('/')
    } else {
      sessionStorage.setItem('app_started', '1')
    }
  }, [user, loading, pathname])

  return null
}
