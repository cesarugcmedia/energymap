'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

// Shared by BottomNav and SideNav so the Alerts tab's badge count works
// identically on mobile and desktop without duplicating the fetch/subscribe
// logic. Replaces the old NotificationBell component now that alerts live
// in their own nav tab instead of a header bell icon.
export function useUnreadNotifications() {
  const { user } = useAuth()
  const pathname = usePathname()
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    if (!user) { setUnread(0); return }

    supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('read', false)
      .then(({ count }) => setUnread(count ?? 0))

    const channel = supabase
      .channel(`unread-notifications-${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, () => setUnread((n) => n + 1))
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user])

  useEffect(() => {
    if (pathname === '/notifications') setUnread(0)
  }, [pathname])

  return unread
}
