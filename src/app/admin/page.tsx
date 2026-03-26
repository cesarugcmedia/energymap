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
  const [tab, setTab] = useState<'stores' | 'users' | 'locations'>('stores')
  const [stores, setStores] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<any[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [locations, setLocations] = useState<any[]>([])
  const [locationsLoading, setLocationsLoading] = useState(false)
  const [locationSearch, setLocationSearch] = useState('')
  const [editStore, setEditStore] = useState<any | null>(null)
  const [editName, setEditName] = useState('')
  const [editAddress, setEditAddress] = useState('')
  const [editType, setEditType] = useState('')
  const [editLat, setEditLat] = useState('')
  const [editLng, setEditLng] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        router.replace('/account')
        return
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', session.user.id)
        .single()
      if (!profile?.is_admin) {
        router.replace('/')  // logged in but not admin — send home
        return
      }
      setAuthed(true)
      setAuthLoading(false)
      fetchPending()
    })
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.replace('/account')
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

  async function fetchUsers() {
    setUsersLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('id, username, is_verified_reporter, is_admin, created_at')
      .order('created_at', { ascending: false })
    if (data) setUsers(data)
    setUsersLoading(false)
  }

  async function fetchLocations() {
    setLocationsLoading(true)
    const { data } = await supabase
      .from('stores')
      .select('*')
      .eq('status', 'approved')
      .order('name', { ascending: true })
    if (data) setLocations(data)
    setLocationsLoading(false)
  }

  async function toggleVerified(userId: string, current: boolean) {
    const { data, error } = await supabase
      .from('profiles')
      .update({ is_verified_reporter: !current })
      .eq('id', userId)
      .select('id')

    if (error || !data || data.length === 0) {
      window.alert(
        `Could not update verified status — RLS is blocking this.\n\n` +
        `Run this in Supabase SQL Editor:\n\n` +
        `CREATE POLICY "Admins can update any profile"\n` +
        `ON profiles FOR UPDATE TO authenticated\n` +
        `USING (\n` +
        `  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)\n` +
        `);\n\n` +
        `Error: ${error?.message ?? 'No rows updated (RLS silent block)'}`
      )
      return
    }

    setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, is_verified_reporter: !current } : u))
  }

  async function approveStore(id: string) {
    const { data, error } = await supabase
      .from('stores')
      .update({ status: 'approved' })
      .eq('id', id)
      .select('id')
    if (error || !data || data.length === 0) {
      window.alert(
        `Could not approve store — Supabase RLS is blocking this action.\n\n` +
        `Go to: Supabase Dashboard → Authentication → Policies → stores\n` +
        `Make sure there is an UPDATE policy allowing authenticated users.`
      )
      return
    }
    setStores((prev) => prev.filter((s) => s.id !== id))
  }

  async function rejectStore(id: string) {
    if (!window.confirm('Reject this store submission?')) return

    // Try update first; use .select() so we can detect silent RLS blocks (0 rows returned = blocked)
    const { data: updated, error: updateError } = await supabase
      .from('stores')
      .update({ status: 'rejected' })
      .eq('id', id)
      .select('id')

    if (!updateError && updated && updated.length > 0) {
      setStores((prev) => prev.filter((s) => s.id !== id))
      return
    }

    // Update was silently blocked or errored — try delete
    const { data: deleted, error: deleteError } = await supabase
      .from('stores')
      .delete()
      .eq('id', id)
      .select('id')

    if (!deleteError && deleted && deleted.length > 0) {
      setStores((prev) => prev.filter((s) => s.id !== id))
      return
    }

    window.alert(
      `Could not reject store — Supabase RLS is blocking this action.\n\n` +
      `Go to: Supabase Dashboard → Table Editor → stores → RLS Policies\n` +
      `Add an UPDATE and DELETE policy that allows authenticated users.`
    )
  }

  function openEdit(store: any) {
    setEditStore(store)
    setEditName(store.name)
    setEditAddress(store.address ?? '')
    setEditType(store.type)
    setEditLat(store.lat?.toString() ?? '')
    setEditLng(store.lng?.toString() ?? '')
  }

  async function deleteLocation(id: string) {
    if (!window.confirm('Permanently delete this location? This cannot be undone.')) return
    const { error } = await supabase.from('stores').delete().eq('id', id)
    if (error) {
      window.alert('Could not delete location. Check RLS policies in Supabase.')
      return
    }
    setLocations((prev) => prev.filter((s) => s.id !== id))
    setEditStore(null)
  }

  async function saveEdit() {
    if (!editName.trim()) {
      window.alert('Store name is required.')
      return
    }
    const lat = parseFloat(editLat)
    const lng = parseFloat(editLng)
    if (isNaN(lat) || isNaN(lng)) {
      window.alert('Latitude and longitude must be valid numbers.')
      return
    }
    setSaving(true)

    const updates = { name: editName.trim(), address: editAddress.trim(), type: editType, lat, lng }
    const { data, error } = await supabase
      .from('stores')
      .update(updates)
      .eq('id', editStore.id)
      .select('id')

    setSaving(false)

    if (error || !data || data.length === 0) {
      window.alert('Could not save changes — RLS may be blocking this.\n\nGo to Supabase → Authentication → Policies → stores and ensure there is an UPDATE policy for authenticated users.')
      return
    }

    // Update both pending and approved lists in state
    const patch = (list: any[]) => list.map((s) => s.id === editStore.id ? { ...s, ...updates } : s)
    setStores(patch)
    setLocations(patch)
    setEditStore(null)
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      {/* Header */}
      <div className="px-5 pb-4" style={{ paddingTop: "calc(56px + env(safe-area-inset-top))" }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-2xl font-black text-white">🔧 Admin</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { tab === 'stores' ? fetchPending() : tab === 'locations' ? fetchLocations() : fetchUsers() }}
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

        {/* Tab switcher */}
        <div className="flex rounded-xl p-1" style={{ backgroundColor: '#1a1a24' }}>
          {(['stores', 'locations', 'users'] as const).map((t) => (
            <button
              key={t}
              className="flex-1 rounded-lg py-2.5 text-xs font-bold"
              style={{
                backgroundColor: tab === t ? '#22c55e' : 'transparent',
                color: tab === t ? '#000' : 'rgba(255,255,255,0.4)',
              }}
              onClick={() => {
                setTab(t)
                if (t === 'users' && users.length === 0) fetchUsers()
                if (t === 'locations' && locations.length === 0) fetchLocations()
              }}
            >
              {t === 'stores' ? `🕐 Pending${!loading ? ` (${stores.length})` : ''}` : t === 'locations' ? '📍 Locations' : '👤 Users'}
            </button>
          ))}
        </div>
      </div>

      {tab === 'locations' ? (
        locationsLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-2 border-[#22c55e] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="px-4 pb-6">
            <input
              type="text"
              placeholder="Search locations..."
              value={locationSearch}
              onChange={(e) => setLocationSearch(e.target.value)}
              className="w-full rounded-xl p-3 text-sm text-white outline-none mb-4"
              style={{ backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.07)' }}
            />
            <div className="flex flex-col gap-2.5">
              {locations
                .filter((s) => s.name.toLowerCase().includes(locationSearch.toLowerCase()) || s.address?.toLowerCase().includes(locationSearch.toLowerCase()))
                .map((store) => (
                  <div
                    key={store.id}
                    className="rounded-2xl p-4 flex items-center gap-3"
                    style={{ backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.07)' }}
                  >
                    <span style={{ fontSize: 24 }}>{TYPE_ICON[store.type] ?? '📍'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white truncate">{store.name}</p>
                      <p className="text-xs text-white/40 mt-0.5 truncate">{store.address}</p>
                      <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.25)' }}>
                        {store.lat?.toFixed(4)}, {store.lng?.toFixed(4)}
                      </p>
                    </div>
                    <div className="flex flex-col gap-1.5 shrink-0">
                      <button
                        onClick={() => openEdit(store)}
                        className="text-xs font-bold px-3 py-1.5 rounded-full"
                        style={{ backgroundColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.1)' }}
                      >
                        ✏️ Edit
                      </button>
                      <button
                        onClick={() => deleteLocation(store.id)}
                        className="text-xs font-bold px-3 py-1.5 rounded-full"
                        style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}
                      >
                        🗑️ Delete
                      </button>
                    </div>
                  </div>
                ))}
              {locations.filter((s) => s.name.toLowerCase().includes(locationSearch.toLowerCase()) || s.address?.toLowerCase().includes(locationSearch.toLowerCase())).length === 0 && (
                <div className="flex flex-col items-center gap-2 mt-10">
                  <span style={{ fontSize: 36 }}>🔍</span>
                  <p className="text-sm font-bold text-white">No locations found</p>
                </div>
              )}
            </div>
          </div>
        )
      ) : tab === 'users' ? (
        usersLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-2 border-[#22c55e] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 px-4 pb-6">
            {users.map((u) => (
              <div
                key={u.id}
                className="rounded-2xl px-4 py-3.5 flex items-center gap-3"
                style={{ backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.07)' }}
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                  style={{ backgroundColor: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.2)' }}
                >
                  <span className="text-sm font-black" style={{ color: '#22c55e' }}>
                    {u.username?.[0]?.toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-sm font-bold text-white">@{u.username}</p>
                    {u.is_admin && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}>ADMIN</span>
                    )}
                    {u.is_verified_reporter && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.3)' }}>✓ VERIFIED</span>
                    )}
                  </div>
                  <p className="text-xs text-white/30 mt-0.5">Joined {timeAgo(u.created_at)}</p>
                </div>
                <button
                  onClick={() => toggleVerified(u.id, u.is_verified_reporter)}
                  className="text-xs font-bold px-3 py-1.5 rounded-full shrink-0"
                  style={u.is_verified_reporter
                    ? { backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444' }
                    : { backgroundColor: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.25)', color: '#60a5fa' }
                  }
                >
                  {u.is_verified_reporter ? 'Revoke' : '✓ Verify'}
                </button>
              </div>
            ))}
          </div>
        )
      ) : loading ? (
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
            onClick={(e) => e.stopPropagation()}
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

            <p className="text-[10px] font-bold text-white/35 mb-2" style={{ letterSpacing: '1.5px' }}>COORDINATES</p>
            <div className="flex gap-2 mb-4">
              <div className="flex-1">
                <p className="text-[10px] text-white/25 mb-1">Latitude</p>
                <input
                  type="number"
                  step="any"
                  className="w-full rounded-xl p-3.5 text-sm text-white outline-none"
                  style={{ backgroundColor: '#0a0a0f', border: '1px solid rgba(255,255,255,0.07)' }}
                  value={editLat}
                  onChange={(e) => setEditLat(e.target.value)}
                />
              </div>
              <div className="flex-1">
                <p className="text-[10px] text-white/25 mb-1">Longitude</p>
                <input
                  type="number"
                  step="any"
                  className="w-full rounded-xl p-3.5 text-sm text-white outline-none"
                  style={{ backgroundColor: '#0a0a0f', border: '1px solid rgba(255,255,255,0.07)' }}
                  value={editLng}
                  onChange={(e) => setEditLng(e.target.value)}
                />
              </div>
            </div>

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

            {editStore?.status === 'pending' && (
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
            )}

            {editStore?.status === 'approved' && (
              <button
                className="w-full rounded-xl p-3.5 font-bold text-sm mt-0"
                style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444' }}
                onClick={() => deleteLocation(editStore.id)}
              >
                🗑️ Delete Location
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
