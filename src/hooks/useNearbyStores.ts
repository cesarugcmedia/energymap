import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Store } from '@/lib/types'

export function useNearbyStores(lat: number, lng: number, radiusKm = 20) {
  const [stores, setStores] = useState<Store[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!lat || !lng) return
    const delta = radiusKm / 111
    supabase
      .from('stores')
      .select('*')
      .eq('status', 'approved')
      .gte('lat', lat - delta)
      .lte('lat', lat + delta)
      .gte('lng', lng - delta)
      .lte('lng', lng + delta)
      .then(({ data, error }) => {
        if (!error && data) setStores(data)
        setLoading(false)
      })
  }, [lat, lng])

  return { stores, loading }
}
