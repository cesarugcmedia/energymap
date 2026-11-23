'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { isMissingSchema } from '@/lib/community'

// Account → Notifications: which kinds of alerts a user wants to see.
// Muting hides those types from the Alerts tab and its unread badge —
// several notification types are created by database triggers/RPCs that
// live in the Supabase dashboard, so filtering happens on read, not insert.
// Saved to profiles.muted_notification_types (scripts/profile-extras.sql),
// mirrored to localStorage so it works per device before that runs.

export const NOTIFICATION_GROUPS: { key: string; label: string; hint: string; types: string[] }[] = [
  { key: 'restocks', label: 'Flavor restocks', hint: 'When a flavor you follow is spotted again', types: ['drink_alert'] },
  { key: 'stock', label: 'Sightings nearby', hint: 'When someone spots a flavor at a store near you', types: ['stock_update'] },
  { key: 'community', label: 'Community', hint: 'Replies, comments, mentions and new followers', types: ['comment', 'reply', 'mention', 'follow'] },
  { key: 'stores', label: 'Stores & drinks', hint: 'Store approvals and new stores or drinks', types: ['store_approved', 'store_rejected', 'new_store', 'new_drink'] },
  { key: 'badges', label: 'Badges', hint: 'When you unlock a badge or win the week', types: ['badge'] },
]

const MUTED_EVENT = 'muted-notifications-changed'
const KEY = (uid: string) => `ampedmap_muted_notifications:${uid}`

export function readMutedLocal(uid: string): string[] {
  try { return JSON.parse(localStorage.getItem(KEY(uid)) ?? '[]') } catch { return [] }
}

// PostgREST filter value for `.not('type', 'in', ...)`.
export const mutedFilter = (types: string[]) => `(${types.map((t) => `"${t}"`).join(',')})`

export function useMutedNotifications() {
  const { user, profile } = useAuth()
  const [muted, setMuted] = useState<string[]>([])

  useEffect(() => {
    if (!user) { setMuted([]); return }
    // This device's copy wins when present (it's written on every save, while
    // the profile in memory isn't refreshed — refreshing would flash the app's
    // loading state). Otherwise use the profile, e.g. on a new device.
    let local: string[] | null = null
    try { const raw = localStorage.getItem(KEY(user.id)); local = raw ? JSON.parse(raw) : null } catch { /* ignore */ }
    const fromDb = Array.isArray(profile?.muted_notification_types) ? (profile.muted_notification_types as string[]) : null
    setMuted(local ?? fromDb ?? [])
    // Other screens (e.g. the tab badge) pick up changes made in Settings.
    const onChange = () => setMuted(readMutedLocal(user.id))
    window.addEventListener(MUTED_EVENT, onChange)
    return () => window.removeEventListener(MUTED_EVENT, onChange)
  }, [user, profile])

  const save = useCallback(async (next: string[]) => {
    if (!user) return
    setMuted(next)
    try { localStorage.setItem(KEY(user.id), JSON.stringify(next)) } catch { /* ignore */ }
    window.dispatchEvent(new Event(MUTED_EVENT))
    const { error } = await supabase.from('profiles').update({ muted_notification_types: next }).eq('id', user.id)
    if (error && !isMissingSchema(error)) console.error('Saving notification preferences failed:', error.message)
  }, [user])

  return { muted, save }
}
