import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Store } from '@/lib/types'

const CACHE_TTL = 60_000 // 60 seconds

let cachedStores: Store[] | null = null
let cacheTime = 0

export function useNearbyStores(lat: number, lng: number) {
  const [stores, setStores] = useState<Store[]>(cachedStores ?? [])
  const [loading, setLoading] = useState(cachedStores === null)

  const fetchStores = useCallback(async (force = false) => {
    const now = Date.now()
    if (!force && cachedStores && now - cacheTime < CACHE_TTL) {
      setStores(cachedStores)
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error } = await supabase
      .from('stores')
      .select('id, name, type, address, lat, lng')
      .eq('status', 'approved')
    if (!error && data) {
      cachedStores = data
      cacheTime = Date.now()
      setStores(data)
    } else if (error) {
      console.error('Failed to load stores:', error.message)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchStores()
  }, [fetchStores])

  return { stores, loading, refetch: () => fetchStores(true) }
}
