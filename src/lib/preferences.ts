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
  const { user, profile, refreshProfile } = useAuth()
  const [prefs, setPrefs] = useState<Preferences>(EMPTY)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!user) { setReady(false); return }
    setPrefs(fromProfile(profile) ?? readLocal(user.id) ?? EMPTY)
    setReady(true)
  }, [user, profile])

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
