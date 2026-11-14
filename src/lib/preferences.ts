'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { isMissingSchema } from '@/lib/community'

// User preferences from the first-time welcome flow (Onboarding.tsx).
// Stored on the profile when scripts/onboarding-preferences.sql has run,
// and always mirrored to localStorage so the app works before the migration
// (and offline). Profile values win when present.

export type Preferences = {
  brands: string[]
  storeTypes: string[]
  homeZip: string | null
  homeLat: number | null
  homeLng: number | null
  wantsToReport: boolean | null
  done: boolean
}

const EMPTY: Preferences = { brands: [], storeTypes: [], homeZip: null, homeLat: null, homeLng: null, wantsToReport: null, done: false }
const KEY = (userId: string) => `ampedmap_prefs_v1:${userId}`

function readLocal(userId: string): Preferences | null {
  try {
    const raw = localStorage.getItem(KEY(userId))
    return raw ? { ...EMPTY, ...JSON.parse(raw) } : null
  } catch { return null }
}

function fromProfile(p: any): Preferences | null {
  if (!p || (p.onboarded_at == null && p.favorite_brands == null)) return null
  return {
    brands: Array.isArray(p.favorite_brands) ? p.favorite_brands : [],
    storeTypes: Array.isArray(p.store_types) ? p.store_types : [],
    homeZip: p.home_zip ?? null,
    homeLat: typeof p.home_lat === 'number' ? p.home_lat : null,
    homeLng: typeof p.home_lng === 'number' ? p.home_lng : null,
    wantsToReport: typeof p.wants_to_report === 'boolean' ? p.wants_to_report : null,
    done: p.onboarded_at != null,
  }
}

export function usePreferences() {
  const { user, profile, loading: authLoading, refreshProfile } = useAuth()
  const [prefs, setPrefs] = useState<Preferences>(EMPTY)
  const [ready, setReady] = useState(false)

  // Not "ready" until the profile has loaded — deciding from localStorage
  // alone while the profile was still in flight showed the welcome flow for
  // a moment to people who had already finished it (new device, cleared
  // storage, installed app vs. browser). Finished on either side counts as
  // finished, and the local mirror is refreshed from the profile.
  useEffect(() => {
    if (!user) { setReady(false); return }
    if (authLoading || !profile) return
    const fromDb = fromProfile(profile)
    const local = readLocal(user.id)
    const merged = { ...(fromDb ?? local ?? EMPTY), done: !!(fromDb?.done || local?.done) }
    setPrefs(merged)
    if (fromDb) { try { localStorage.setItem(KEY(user.id), JSON.stringify(merged)) } catch { /* ignore */ } }
    setReady(true)
  }, [user, profile, authLoading])

  const save = useCallback(async (next: Preferences) => {
    if (!user) return
    setPrefs(next)
    try { localStorage.setItem(KEY(user.id), JSON.stringify(next)) } catch { /* ignore */ }
    const { error } = await supabase.from('profiles').update({
      favorite_brands: next.brands,
      store_types: next.storeTypes,
      home_zip: next.homeZip,
      home_lat: next.homeLat,
      home_lng: next.homeLng,
      wants_to_report: next.wantsToReport,
      onboarded_at: next.done ? new Date().toISOString() : null,
    }).eq('id', user.id)
    if (!error) refreshProfile?.()
    else if (!isMissingSchema(error)) console.error('Saving preferences failed:', error.message)
  }, [user, refreshProfile])

  return { prefs, ready, save }
}
