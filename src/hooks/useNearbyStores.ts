import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Store } from '@/lib/types'

const CACHE_TTL = 60_000 // 60 seconds

interface CacheEntry {
  stores: Store[]
  nearbyCount: number
  time: number
}

const cache = new Map<string, CacheEntry>()

function cacheKey(lat: number, lng: number, tierKey: string): string {
  return `${lat.toFixed(2)},${lng.toFixed(2)}:${tierKey}`
}

// `tierKey` should be derived by the caller from `profile` (e.g. 'anon' |
// 'free' | 'tracker') so the cache and refetch correctly react to
// login/logout/tier changes — the hook itself has no reactive way to know
// when a signed-in user's tier changes without this being passed in.
export function useNearbyStores(lat: number, lng: number, tierKey: string) {
  const key = cacheKey(lat, lng, tierKey)
  const [stores, setStores] = useState<Store[]>(cache.get(key)?.stores ?? [])
  const [nearbyCount, setNearbyCount] = useState<number>(cache.get(key)?.nearbyCount ?? 0)
  const [loading, setLoading] = useState(!cache.has(key))

  const fetchStores = useCallback(async (force = false) => {
    const now = Date.now()
    const cached = cache.get(key)
    if (!force && cached && now - cached.time < CACHE_TTL) {
      setStores(cached.stores)
      setNearbyCount(cached.nearbyCount)
      setLoading(false)
      return
    }
    setLoading(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/api/stores/nearby?lat=${lat}&lng=${lng}`, {
        headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
      })
      if (!res.ok) throw new Error('Failed to load stores')
      const body = await res.json()
      const loadedStores: Store[] = body.stores ?? []
      const loadedCount: number = body.nearbyCount ?? 0

      cache.set(key, { stores: loadedStores, nearbyCount: loadedCount, time: Date.now() })
      setStores(loadedStores)
      setNearbyCount(loadedCount)
    } catch (err) {
      console.error('Failed to load stores:', err)
    }
    setLoading(false)
  }, [lat, lng, key])

  useEffect(() => {
    fetchStores()
  }, [fetchStores])

  return { stores, nearbyCount, loading, refetch: () => fetchStores(true) }
}
