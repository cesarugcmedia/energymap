import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Store } from '@/lib/types'

const CACHE_TTL = 60_000 // 60 seconds
const BATCH = 1000

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

    const allData: Store[] = []
    let from = 0

    while (true) {
      const { data, error } = await supabase
        .from('stores')
        .select('id, name, type, address, lat, lng')
        .eq('status', 'approved')
        .range(from, from + BATCH - 1)

      if (error) {
        console.error('Failed to load stores:', error.message)
        break
      }
      if (!data || data.length === 0) break
      allData.push(...data)
      if (data.length < BATCH) break
      from += BATCH
    }

    if (allData.length > 0) {
      cachedStores = allData
      cacheTime = Date.now()
      setStores(allData)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchStores()
  }, [fetchStores])

  return { stores, loading, refetch: () => fetchStores(true) }
}
