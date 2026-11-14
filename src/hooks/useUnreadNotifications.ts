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
        // Same visibility rule as the /notifications list, so the badge never
        // counts something the page doesn't show yet.
        .lte('visible_after', new Date().toISOString())
        .then(({ count }) => setUnread(count ?? 0))
    }

    fetchCount()

    // Realtime UPDATE events aren't guaranteed (depends on the table's
    // publication settings), so also recount when the notifications page
    // says it changed something, and when the app comes back into view.
    const onVisible = () => { if (document.visibilityState === 'visible') fetchCount() }
    window.addEventListener('notifications-changed', fetchCount)
    document.addEventListener('visibilitychange', onVisible)

    const channel = supabase
      .channel(`unread-notifications-${user.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, fetchCount)
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      window.removeEventListener('notifications-changed', fetchCount)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [user])

  return unread
}
