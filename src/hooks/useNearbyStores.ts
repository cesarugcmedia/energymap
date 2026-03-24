import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Store } from '@/lib/types'

export function useNearbyStores(lat: number, lng: number, radiusKm = 20) {
  const [stores, setStores] = useState<Store[]>([])
  const [loading, setLoading] = useState(true)

  const fetchStores = useCallback(async () => {
    if (!lat || !lng) return
    setLoading(true)
    const delta = radiusKm / 111
    const { data, error } = await supabase
      .from('stores')
      .select('*')
      .eq('status', 'approved')
      .gte('lat', lat - delta)
      .lte('lat', lat + delta)
      .gte('lng', lng - delta)
      .lte('lng', lng + delta)
    if (!error && data) setStores(data)
    setLoading(false)
  }, [lat, lng, radiusKm])

  useEffect(() => {
    fetchStores()
  }, [fetchStores])

  return { stores, loading, refetch: fetchStores }
}
