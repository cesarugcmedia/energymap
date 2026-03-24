import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Store } from '@/lib/types'

export function useNearbyStores(lat: number, lng: number) {
  const [stores, setStores] = useState<Store[]>([])
  const [loading, setLoading] = useState(true)

  const fetchStores = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('stores')
      .select('*')
      .eq('status', 'approved')
    if (!error && data) setStores(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchStores()
  }, [fetchStores])

  return { stores, loading, refetch: fetchStores }
}
