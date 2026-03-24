'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const TYPE_ICON: Record<string, string> = {
  gas_station: '⛽',
  convenience: '🏪',
  grocery: '🛒',
  other: '📍',
}

const TYPE_OPTIONS = [
  { value: 'gas_station', label: 'Gas Station', icon: '⛽' },
  { value: 'convenience', label: 'Convenience Store', icon: '🏪' },
  { value: 'grocery', label: 'Grocery Store', icon: '🛒' },
  { value: 'other', label: 'Other', icon: '📍' },
]

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function AdminPage() {
  const router = useRouter()
  const [authed, setAuthed] = useState(false)
  const [authLoading, setAuthLoading] = useState(true)
  const [stores, setStores] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editStore, setEditStore] = useState<any | null>(null)
  const [editName, setEditName] = useState('')
  const [editAddress, setEditAddress] = useState('')
  const [editType, setEditType] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace('/admin/login')
      } else {
        setAuthed(true)
        setAuthLoading(false)
        fetchPending()
      }
    })
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.replace('/admin/login')
  }

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0a0a0f]">
        <div className="w-8 h-8 border-2 border-[#22c55e] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!authed) return null

  async function fetchPending() {
    setLoading(true)
    const { data } = await supabase
      .from('stores')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    if (data) setStores(data)
    setLoading(false)
  }

  async function approveStore(id: string) {
    await supabase.from('stores').update({ status: 'approved' }).eq('id', id)
    setStores((prev) => prev.filter((s) => s.id !== id))
  }

  async function rejectStore(id: string) {
    if (!window.confirm('This will permanently delete the store submission. Continue?')) return
    await supabase.from('stores').delete().eq('id', id)
    setStores((prev) => prev.filter((s) => s.id !== id))
  }

  function openEdit(store: any) {
    setEditStore(store)
    setEditName(store.name)
    setEditAddress(store.address ?? '')
    setEditType(store.type)
  }

  async function saveEdit() {
    if (!editName.trim()) {
      window.alert('Store name is required.')
      return
    }
    setSaving(true)
    await supabase
      .from('stores')
      .update({ name: editName.trim(), address: editAddress.trim(), type: editType })
      .eq('id', editStore.id)

    setStores((prev) =>
      prev.map((s) =>
        s.id === editStore.id
          ? { ...s, name: editName.trim(), address: editAddress.trim(), type: editType }
          : s
      )
    )
    setSaving(false)
    setEditStore(null)
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pb-4" style={{ paddingTop: "calc(56px + env(safe-area-inset-top))" }}>
        <div>
          <p className="text-2xl font-black text-white">🔧 Admin</p>
          <p className="text-xs text-white/40 mt-0.5">
            {loading ? 'Loading…' : `${stores.length} pending store${stores.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchPending}
            className="text-xs font-bold px-3 py-1.5 rounded-full"
            style={{ color: 'rgba(255,255,255,0.5)', backgroundColor: 'rgba(255,255,255,0.06)' }}
          >
            ↻ Refresh
          </button>
          <button
            onClick={handleLogout}
            className="text-xs font-bold px-3 py-1.5 rounded-full"
            style={{ color: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}
          >
            Sign Out
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-[#22c55e] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : stores.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 gap-3">
          <span style={{ fontSize: 40 }}>✅</span>
          <p className="text-lg font-bold text-white">All caught up!</p>
          <p className="text-sm text-white/40">No pending stores to review.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3 px-4 pb-6">
          {stores.map((store) => (
            <div
              key={store.id}
              className="rounded-2xl overflow-hidden"
              style={{ backgroundColor: '#1a1a24', border: '1px solid rgba(255,200,0,0.2)' }}
            >
              {/* Store info */}
              <div className="flex gap-3 p-3.5">
                <span style={{ fontSize: 28 }}>{TYPE_ICON[store.type]}</span>
                <div className="flex-1">
                  <p className="text-sm font-bold text-white">{store.name}</p>
                  <p className="text-xs text-white/40 mt-0.5">{store.address}</p>
                  <p className="text-xs mt-1" style={{ color: 'rgba(255,200,0,0.6)' }}>
                    {store.type.replace('_', ' ')} · Submitted {timeAgo(store.created_at)}
                  </p>
                </div>
              </div>

              {/* Coords */}
              <div className="px-3.5 pb-2">
                <p className="text-xs text-white/30">
                  📍 {store.lat?.toFixed(4)}, {store.lng?.toFixed(4)}
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-2 p-3">
                <button
                  className="flex-1 rounded-xl p-2.5 text-sm font-semibold"
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: 'rgba(255,255,255,0.6)',
                  }}
                  onClick={() => openEdit(store)}
                >
                  ✏️ Edit
                </button>
                <button
                  className="flex-1 rounded-xl p-2.5 text-sm font-bold"
                  style={{
                    backgroundColor: 'rgba(239,68,68,0.1)',
                    border: '1px solid rgba(239,68,68,0.25)',
                    color: '#ef4444',
                  }}
                  onClick={() => rejectStore(store.id)}
                >
                  ✕ Reject
                </button>
                <button
                  className="flex-1 rounded-xl p-2.5 text-sm font-bold"
                  style={{
                    backgroundColor: 'rgba(34,197,94,0.12)',
                    border: '1px solid rgba(34,197,94,0.3)',
                    color: '#22c55e',
                  }}
                  onClick={() => approveStore(store.id)}
                >
                  ✓ Approve
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit Modal */}
      {editStore && (
        <div
          className="fixed inset-0 flex flex-col justify-end z-50"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setEditStore(null) }}
        >
          <div
            className="rounded-t-3xl p-5 max-h-[85vh] overflow-y-auto"
            style={{ backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.08)', paddingBottom: 40 }}
          >
            <div className="w-9 h-1 rounded-sm mx-auto mb-4" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }} />
            <p className="text-lg font-black text-white mb-5">Edit Store</p>

            <p className="text-[10px] font-bold text-white/35 mb-2" style={{ letterSpacing: '1.5px' }}>STORE NAME</p>
            <input
              type="text"
              className="w-full rounded-xl p-3.5 text-sm text-white outline-none mb-4"
              style={{ backgroundColor: '#0a0a0f', border: '1px solid rgba(255,255,255,0.07)' }}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
            />

            <p className="text-[10px] font-bold text-white/35 mb-2" style={{ letterSpacing: '1.5px' }}>ADDRESS</p>
            <input
              type="text"
              className="w-full rounded-xl p-3.5 text-sm text-white outline-none mb-4"
              style={{ backgroundColor: '#0a0a0f', border: '1px solid rgba(255,255,255,0.07)' }}
              value={editAddress}
              onChange={(e) => setEditAddress(e.target.value)}
            />

            <p className="text-[10px] font-bold text-white/35 mb-2" style={{ letterSpacing: '1.5px' }}>STORE TYPE</p>
            <div className="flex flex-wrap gap-2 mb-5">
              {TYPE_OPTIONS.map((t) => (
                <button
                  key={t.value}
                  className="flex items-center gap-1.5 rounded-xl px-3 py-2.5"
                  style={{
                    backgroundColor: editType === t.value ? 'rgba(34,197,94,0.08)' : '#0a0a0f',
                    border: `1.5px solid ${editType === t.value ? '#22c55e' : 'transparent'}`,
                    minWidth: '47%',
                  }}
                  onClick={() => setEditType(t.value)}
                >
                  <span style={{ fontSize: 16 }}>{t.icon}</span>
                  <span
                    className="text-sm font-semibold"
                    style={{ color: editType === t.value ? '#fff' : 'rgba(255,255,255,0.4)' }}
                  >
                    {t.label}
                  </span>
                </button>
              ))}
            </div>

            <div className="flex gap-2.5 mb-2.5">
              <button
                className="flex-1 rounded-xl p-3.5 font-semibold text-sm"
                style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}
                onClick={() => setEditStore(null)}
              >
                Cancel
              </button>
              <button
                className="flex-1 rounded-xl p-3.5 font-bold text-white text-sm flex items-center justify-center"
                style={{ backgroundColor: '#22c55e' }}
                onClick={saveEdit}
                disabled={saving}
              >
                {saving ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  'Save Changes'
                )}
              </button>
            </div>

            <div className="flex gap-2.5">
              <button
                className="flex-1 rounded-xl p-3.5 font-bold text-sm"
                style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444' }}
                onClick={() => {
                  setEditStore(null)
                  rejectStore(editStore?.id)
                }}
              >
                ✕ Reject Store
              </button>
              <button
                className="flex-1 rounded-xl p-3.5 font-bold text-sm"
                style={{ backgroundColor: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e' }}
                onClick={() => {
                  approveStore(editStore?.id)
                  setEditStore(null)
                }}
              >
                ✓ Approve Store
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
