'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Store } from '@/lib/types'

const TYPE_ICON: Record<string, string> = {
  gas_station: '⛽',
  convenience: '🏪',
  grocery: '🛒',
  other: '📍',
}

export default function SubmitPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [store, setStore] = useState<Store | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    detectNearestStore()
  }, [])

  async function detectNearestStore() {
    setLoading(true)
    setError(null)

    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.')
      setLoading(false)
      return
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords
        const delta = 0.09
        const { data, error: dbError } = await supabase
          .from('stores')
          .select('*')
          .eq('status', 'approved')
          .gte('lat', latitude - delta)
          .lte('lat', latitude + delta)
          .gte('lng', longitude - delta)
          .lte('lng', longitude + delta)

        if (dbError || !data || data.length === 0) {
          setError('No stores found nearby. You might be outside our coverage area.')
          setLoading(false)
          return
        }

        const nearest = data.reduce((closest: any, s: any) => {
          const d = Math.hypot(s.lat - latitude, s.lng - longitude)
          const cd = Math.hypot(closest.lat - latitude, closest.lng - longitude)
          return d < cd ? s : closest
        })

        setStore(nearest)
        setLoading(false)
      },
      () => {
        setError('Location permission is needed to detect your store.')
        setLoading(false)
      }
    )
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4 bg-[#0a0a0f] px-8">
        <div className="w-8 h-8 border-2 border-[#22c55e] border-t-transparent rounded-full animate-spin" />
        <p className="text-white/40 text-sm">Detecting your store…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4 bg-[#0a0a0f] px-8 text-center">
        <span style={{ fontSize: 40 }}>📍</span>
        <p className="text-lg font-bold text-white">Can&apos;t find a store</p>
        <p className="text-sm text-white/45">{error}</p>
        <button
          onClick={detectNearestStore}
          className="px-7 py-3 rounded-xl font-bold text-white"
          style={{ backgroundColor: '#22c55e' }}
        >
          Try Again
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] px-6" style={{ paddingTop: "calc(64px + env(safe-area-inset-top))" }}>
      <p
        className="text-xs font-bold mb-3"
        style={{ color: 'rgba(255,255,255,0.35)', letterSpacing: '1.5px' }}
      >
        YOU&apos;RE AT
      </p>

      <div
        className="flex items-center rounded-2xl p-4 mb-4"
        style={{ backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        <span style={{ fontSize: 28, marginRight: 12 }}>{TYPE_ICON[store!.type]}</span>
        <div className="flex-1">
          <p className="text-lg font-bold text-white">{store!.name}</p>
          <p className="text-sm text-white/40 mt-0.5">{store!.address}</p>
        </div>
        <button onClick={detectNearestStore} className="p-2">
          <span style={{ fontSize: 20, color: 'rgba(255,255,255,0.4)' }}>↻</span>
        </button>
      </div>

      <p className="text-center text-sm text-white/30 mb-8">Wrong store? Tap ↻ to refresh</p>

      <button
        className="w-full rounded-2xl p-4 font-bold text-white text-base"
        style={{ backgroundColor: '#22c55e' }}
        onClick={() =>
          router.push(
            `/submit/drinks?storeId=${store!.id}&storeName=${encodeURIComponent(store!.name)}`
          )
        }
      >
        Select a Drink →
      </button>
    </div>
  )
}
