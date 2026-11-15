'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

// "Live" status: who has AmpedMap open right now, via a Supabase Realtime
// Presence channel (no database table). A signed-in user is announced while
// the app is visible on their screen and drops off when they switch away or
// close it. Everyone signed in can see who's live; anyone can stop being
// shown from Account → Privacy ("Show when I'm live"), saved per device.
//
// One shared channel suits the current user base. Past a few thousand
// concurrent users this should move to per-area channels.

const SHOW_KEY = 'ampedmap_show_presence'
const EVENT = 'presence-pref-changed'

type PresenceValue = { online: Set<string>; showMe: boolean; setShowMe: (v: boolean) => void }
const PresenceContext = createContext<PresenceValue>({ online: new Set(), showMe: true, setShowMe: () => {} })

function readShowMe(): boolean {
  try { return localStorage.getItem(SHOW_KEY) !== '0' } catch { return true }
}

export function PresenceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const userId: string | null = user?.id ?? null
  const [online, setOnline] = useState<Set<string>>(new Set())
  const [showMe, setShowMeState] = useState(true)

  useEffect(() => {
    setShowMeState(readShowMe())
    const sync = () => setShowMeState(readShowMe())
    window.addEventListener(EVENT, sync)
    window.addEventListener('storage', sync)
    return () => { window.removeEventListener(EVENT, sync); window.removeEventListener('storage', sync) }
  }, [])

  const setShowMe = useCallback((v: boolean) => {
    try { localStorage.setItem(SHOW_KEY, v ? '1' : '0') } catch { /* ignore */ }
    setShowMeState(v)
    window.dispatchEvent(new Event(EVENT))
  }, [])

  useEffect(() => {
    if (!userId) { setOnline(new Set()); return }
    const channel = supabase.channel('online-users', { config: { presence: { key: userId } } })
    let joined = false
    const announce = async () => {
      if (!joined) return
      if (showMe && document.visibilityState === 'visible') await channel.track({ at: Date.now() })
      else await channel.untrack()
    }
    channel
      .on('presence', { event: 'sync' }, () => setOnline(new Set(Object.keys(channel.presenceState()))))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') { joined = true; announce() }
      })
    document.addEventListener('visibilitychange', announce)
    return () => {
      document.removeEventListener('visibilitychange', announce)
      supabase.removeChannel(channel)
      setOnline(new Set())
    }
  }, [userId, showMe])

  return <PresenceContext.Provider value={{ online, showMe, setShowMe }}>{children}</PresenceContext.Provider>
}

export function usePresence() {
  return useContext(PresenceContext)
}

/** True while that user has the app open (and shares that they're live). */
export function useIsLive(userId: string | null | undefined): boolean {
  const { online } = useContext(PresenceContext)
  return !!userId && online.has(userId)
}
