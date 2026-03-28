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

export default function ListsPage() {
  const router = useRouter()
  const { user, profile, loading: authLoading } = useAuth()
  const isTracker = profile?.is_admin || profile?.tier === 'tracker'

  const [lists, setLists] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeList, setActiveList] = useState<any | null>(null)
  const [listStores, setListStores] = useState<any[]>([])
  const [listStoresLoading, setListStoresLoading] = useState(false)
  const [showNewList, setShowNewList] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (!authLoading && !user) router.replace('/account')
    if (!authLoading && user && !isTracker) router.replace('/')
  }, [user, authLoading, isTracker])

  useEffect(() => {
    if (user && isTracker) fetchLists()
  }, [user, isTracker])

  async function fetchLists() {
    setLoading(true)
    const { data } = await supabase
      .from('custom_lists')
      .select('id, name, created_at, list_stores(count)')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false })
    if (data) setLists(data)
    setLoading(false)
  }

  async function createList() {
    if (!newListName.trim() || !user) return
    setCreating(true)
    const { data } = await supabase
      .from('custom_lists')
      .insert({ user_id: user.id, name: newListName.trim() })
      .select()
      .single()
    if (data) setLists((prev) => [data, ...prev])
    setNewListName('')
    setShowNewList(false)
    setCreating(false)
  }

  async function deleteList(listId: string) {
    await supabase.from('custom_lists').delete().eq('id', listId)
    setLists((prev) => prev.filter((l) => l.id !== listId))
    if (activeList?.id === listId) setActiveList(null)
  }

  async function openList(list: any) {
    setActiveList(list)
    setListStoresLoading(true)
    const { data } = await supabase
      .from('list_stores')
      .select('id, store:stores(id, name, address, type)')
      .eq('list_id', list.id)
      .order('added_at', { ascending: false })
    if (data) setListStores(data)
    setListStoresLoading(false)
  }

  async function removeFromList(listStoreId: string) {
    await supabase.from('list_stores').delete().eq('id', listStoreId)
    setListStores((prev) => prev.filter((ls) => ls.id !== listStoreId))
    setLists((prev) => prev.map((l) =>
      l.id === activeList?.id
        ? { ...l, list_stores: [{ count: Math.max(0, (l.list_stores?.[0]?.count ?? 1) - 1) }] }
        : l
    ))
  }

  if (authLoading || !user) {
    return (
      <div className="flex items-center justify-center h-screen ">
        <div className="w-8 h-8 border-2 border-[#22c55e] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // List detail view
  if (activeList) {
    return (
      <div className=" min-h-screen" style={{ paddingTop: 'calc(56px + env(safe-area-inset-top))' }}>
        <div className="px-5 pb-4">
          <div className="flex items-center gap-3 mb-1">
            <button
              onClick={() => setActiveList(null)}
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: 'rgba(255,255,255,0.07)' }}
            >
              <span className="text-white text-lg">←</span>
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-xl font-black text-white truncate">{activeList.name}</p>
              <p className="text-xs text-white/40 mt-0.5">{listStores.length} store{listStores.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
        </div>

        {listStoresLoading ? (
          <div className="flex justify-center mt-16">
            <div className="w-8 h-8 border-2 border-[#22c55e] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : listStores.length === 0 ? (
          <div className="flex flex-col items-center gap-3 mt-20 px-5 text-center">
            <span style={{ fontSize: 40 }}>📭</span>
            <p className="text-lg font-bold text-white">No stores yet</p>
            <p className="text-sm text-white/40">Go to a store page and tap "Add to List" to save it here.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 px-5 pb-32">
            {listStores.map((ls: any) => {
              const store = ls.store
              return (
                <div
                  key={ls.id}
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
                      <p className="text-xs text-white/40 mt-0.5 truncate">{store?.address}</p>
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
                        onClick={() => removeFromList(ls.id)}
                        className="w-7 h-7 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}
                      >
                        <span className="text-xs" style={{ color: '#ef4444' }}>✕</span>
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // Lists overview
  return (
    <div className=" min-h-screen" style={{ paddingTop: 'calc(56px + env(safe-area-inset-top))' }}>
      <div className="flex items-center justify-between px-5 pb-4">
        <div>
          <p className="text-2xl font-black text-white">📑 My Lists</p>
          <p className="text-xs text-white/40 mt-0.5">Custom store collections</p>
        </div>
        <button
          onClick={() => setShowNewList(true)}
          className="px-4 py-2 rounded-xl text-sm font-bold"
          style={{ backgroundColor: '#22c55e', color: '#000' }}
        >
          + New
        </button>
      </div>

      {/* New list form */}
      {showNewList && (
        <div className="mx-5 mb-4 rounded-2xl p-4" style={{ backgroundColor: '#1a1a24', border: '1px solid rgba(34,197,94,0.3)' }}>
          <p className="text-sm font-bold text-white mb-3">New List</p>
          <input
            type="text"
            className="w-full rounded-xl px-3.5 py-2.5 text-sm text-white outline-none mb-3"
            style={{ backgroundColor: '#070710', border: '1px solid rgba(255,255,255,0.07)' }}
            placeholder="List name (e.g. Celsius Spots)"
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') createList() }}
            autoFocus
          />
          <div className="flex gap-2">
            <button
              onClick={() => { setShowNewList(false); setNewListName('') }}
              className="flex-1 rounded-xl py-2.5 text-sm font-semibold"
              style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}
            >
              Cancel
            </button>
            <button
              onClick={createList}
              disabled={!newListName.trim() || creating}
              className="flex-1 rounded-xl py-2.5 text-sm font-bold text-black"
              style={{ backgroundColor: !newListName.trim() || creating ? 'rgba(34,197,94,0.4)' : '#22c55e' }}
            >
              {creating ? '...' : 'Create'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center mt-16">
          <div className="w-8 h-8 border-2 border-[#22c55e] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : lists.length === 0 ? (
        <div className="flex flex-col items-center gap-3 mt-20 px-5 text-center">
          <span style={{ fontSize: 48 }}>📑</span>
          <p className="text-lg font-bold text-white">No lists yet</p>
          <p className="text-sm text-white/40">Create a list to organize your favorite store spots.</p>
          <button
            onClick={() => setShowNewList(true)}
            className="mt-2 px-6 py-3 rounded-2xl text-sm font-bold text-black"
            style={{ backgroundColor: '#22c55e' }}
          >
            Create First List
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5 px-5 pb-32">
          {lists.map((list) => {
            const count = list.list_stores?.[0]?.count ?? 0
            return (
              <div
                key={list.id}
                className="rounded-2xl p-4 flex items-center gap-3 cursor-pointer"
                style={{ backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.07)' }}
                onClick={() => openList(list)}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)' }}
                >
                  <span style={{ fontSize: 18 }}>📑</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-white truncate">{list.name}</p>
                  <p className="text-xs text-white/40 mt-0.5">{count} store{count !== 1 ? 's' : ''}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-white/30 text-sm">›</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteList(list.id) }}
                    className="w-7 h-7 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}
                  >
                    <span className="text-xs" style={{ color: '#ef4444' }}>✕</span>
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
