'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

const TYPE_ICON: Record<string, string> = {
  gas_station: '⛽',
  convenience: '🏪',
  grocery: '🛒',
  other: '📍',
}

export default function FavoritesPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [favorites, setFavorites] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [removing, setRemoving] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!authLoading && !user) router.replace('/account')
  }, [user, authLoading])

  useEffect(() => {
    if (user) fetchFavorites()
  }, [user])

  async function fetchFavorites() {
    setLoading(true)
    const { data } = await supabase
      .from('favorites')
      .select('id, created_at, store:stores(id, name, address, type)')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false })
    if (data) setFavorites(data)
    setLoading(false)
  }

  async function removeFavorite(favoriteId: string) {
    setRemoving((prev) => new Set(prev).add(favoriteId))
    await supabase.from('favorites').delete().eq('id', favoriteId)
    setFavorites((prev) => prev.filter((f) => f.id !== favoriteId))
    setRemoving((prev) => { const next = new Set(prev); next.delete(favoriteId); return next })
  }

  if (authLoading || !user) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-2 border-[#22c55e] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#070710', position: 'relative', paddingTop: 'calc(56px + env(safe-area-inset-top))' }}>
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, background: 'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(34,197,94,0.08) 0%, transparent 60%)', pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)', backgroundSize: '40px 40px', pointerEvents: 'none' }} />

      <div style={{ position: 'relative', zIndex: 1 }}>
        <div className="px-5 pb-4">
          <p className="text-2xl font-black text-white">❤️ Favorites</p>
          <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {loading ? '' : `${favorites.length} saved store${favorites.length !== 1 ? 's' : ''}`}
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center mt-16">
            <div className="w-8 h-8 border-2 border-[#22c55e] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : favorites.length === 0 ? (
          <div className="flex flex-col items-center gap-3 mt-20 px-5 text-center">
            <span style={{ fontSize: 52 }}>❤️</span>
            <p className="text-lg font-bold text-white">No favorites yet</p>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Tap the heart on any store to save it here.
            </p>
            <button
              onClick={() => router.push('/stores')}
              className="mt-2 px-6 py-3 rounded-2xl text-sm font-bold"
              style={{ backgroundColor: '#22c55e', color: '#000' }}
            >
              Browse Stores
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 px-5 pb-32">
            {favorites.map((fav) => {
              const store = fav.store
              return (
                <div
                  key={fav.id}
                  className="rounded-2xl p-4"
                  style={{ backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.07)' }}
                >
                  <div className="flex items-center gap-3">
                    <span style={{ fontSize: 24 }}>{TYPE_ICON[store?.type] ?? '📍'}</span>
                    <div
                      className="flex-1 min-w-0 cursor-pointer"
                      onClick={() => router.push(`/store/${store.id}?name=${encodeURIComponent(store.name)}`)}
                    >
                      <p className="text-sm font-black text-white truncate">{store?.name}</p>
                      <p className="text-xs mt-0.5 truncate" style={{ color: 'rgba(255,255,255,0.4)' }}>{store?.address}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => router.push(`/store/${store.id}?name=${encodeURIComponent(store.name)}`)}
                        className="text-xs font-bold px-3 py-1.5 rounded-full"
                        style={{ backgroundColor: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e' }}
                      >
                        View
                      </button>
                      <button
                        onClick={() => removeFavorite(fav.id)}
                        disabled={removing.has(fav.id)}
                        className="w-8 h-8 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', opacity: removing.has(fav.id) ? 0.5 : 1 }}
                      >
                        {removing.has(fav.id)
                          ? <div className="w-3.5 h-3.5 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                          : <span style={{ fontSize: 13, color: '#ef4444' }}>✕</span>}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
