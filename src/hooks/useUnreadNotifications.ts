'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

// Shared by BottomNav and SideNav so the Alerts tab's badge count works
// identically on mobile and desktop without duplicating the fetch/subscribe
// logic. Replaces the old NotificationBell component now that alerts live
// in their own nav tab instead of a header bell icon.
//
// Re-fetches the exact unread count on any INSERT or UPDATE to this user's
// notifications, rather than incrementing locally or zeroing on visiting
// /notifications — reading is now an explicit action (tap a card, or Mark
// All Read) instead of an automatic side effect of opening the page, so the
// badge has to track real read state, not just "did they open the tab."
export function useUnreadNotifications() {
  const { user } = useAuth()
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    if (!user) { setUnread(0); return }

    const fetchCount = () => {
      supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('read', false)
        .then(({ count }) => setUnread(count ?? 0))
    }

    fetchCount()

    const channel = supabase
      .channel(`unread-notifications-${user.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, fetchCount)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user])

  return unread
}
