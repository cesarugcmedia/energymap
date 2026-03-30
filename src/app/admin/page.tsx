'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { BRAND_COLORS } from '@/components/BrandLogo'

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
  const [tab, setTab] = useState<'stores' | 'locations' | 'drinks' | 'users' | 'waitlist'>('stores')
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

  // Drinks state
  const [drinks, setDrinks] = useState<any[]>([])
  const [drinksLoading, setDrinksLoading] = useState(false)
  const [drinkSearch, setDrinkSearch] = useState('')
  const [newBrand, setNewBrand] = useState('')
  const [newName, setNewName] = useState('')
  const [newFlavor, setNewFlavor] = useState('')
  const [addingDrink, setAddingDrink] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [userSearch, setUserSearch] = useState('')
  const [waitlist, setWaitlist] = useState<any[]>([])
  const [waitlistLoading, setWaitlistLoading] = useState(false)
  const [approvingId, setApprovingId] = useState<string | null>(null)


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
      <div className="flex items-center justify-center h-screen ">
        <div className="w-8 h-8 border-2 border-[#22c55e] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!authed) return null

  async function fetchPending() {
    setLoading(true)
    const { data, error } = await supabase
      .from('stores')
      .select('id, name, address, type, lat, lng, status, submitted_by, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    if (error) console.error('fetchPending error:', error)
    if (data) {
      // Fetch submitter usernames separately to avoid FK join issues
      const submitterIds = [...new Set(data.map((s: any) => s.submitted_by).filter(Boolean))]
      let usernameMap: Record<string, string> = {}
      if (submitterIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username')
          .in('id', submitterIds)
        if (profiles) {
          usernameMap = Object.fromEntries(profiles.map((p: any) => [p.id, p.username]))
        }
      }
      setStores(data.map((s: any) => ({ ...s, submitter: s.submitted_by ? { username: usernameMap[s.submitted_by] ?? 'Unknown' } : null })))
    }
    setLoading(false)
  }

  async function fetchUsers() {
    setUsersLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('id, username, is_verified_reporter, is_admin, tier, created_at')
      .order('created_at', { ascending: false })
    if (data) setUsers(data)
    setUsersLoading(false)
  }

  async function fetchWaitlist() {
    setWaitlistLoading(true)
    const { data } = await supabase
      .from('waitlist')
      .select('id, email, tier, user_id, created_at')
      .order('created_at', { ascending: false })
    if (data) {
      const userIds = data.map((w: any) => w.user_id).filter(Boolean)
      let profileMap: Record<string, { username: string; tier: string | null }> = {}
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username, tier')
          .in('id', userIds)
        if (profiles) profileMap = Object.fromEntries(profiles.map((p: any) => [p.id, { username: p.username, tier: p.tier }]))
      }
      setWaitlist(data.map((w: any) => ({ ...w, profile: profileMap[w.user_id] ?? null })))
    }
    setWaitlistLoading(false)
  }

  async function approveWaitlistUser(waitlistId: string, userId: string) {
    setApprovingId(waitlistId)
    await supabase.from('profiles').update({ tier: 'tracker' }).eq('id', userId)
    await supabase.from('waitlist').delete().eq('id', waitlistId)
    setWaitlist((prev) => prev.filter((w) => w.id !== waitlistId))
    setApprovingId(null)
  }

  async function removeFromWaitlist(waitlistId: string) {
    await supabase.from('waitlist').delete().eq('id', waitlistId)
    setWaitlist((prev) => prev.filter((w) => w.id !== waitlistId))
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

  async function fetchDrinks() {
    setDrinksLoading(true)
    const { data } = await supabase.from('drinks').select('*').order('brand').order('name')
    if (data) setDrinks(data)
    setDrinksLoading(false)
  }

  async function addDrink() {
    if (!newBrand.trim() || !newName.trim()) {
      window.alert('Brand and name are required.')
      return
    }
    setAddingDrink(true)
    const { data, error } = await supabase
      .from('drinks')
      .insert({ brand: newBrand.trim(), name: newName.trim(), flavor: newFlavor.trim() || null })
      .select()
    if (error || !data) {
      window.alert('Could not add drink. Check RLS policies on the drinks table.')
      setAddingDrink(false)
      return
    }
    setDrinks((prev) => [...prev, data[0]].sort((a, b) => a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name)))
    setNewBrand('')
    setNewName('')
    setNewFlavor('')
    setShowAddForm(false)
    setAddingDrink(false)
  }

  async function deleteDrink(id: string) {
    if (!window.confirm('Delete this drink? This will also remove all stock reports for it.')) return
    const { error } = await supabase.from('drinks').delete().eq('id', id)
    if (error) { window.alert('Could not delete drink. Check RLS policies.'); return }
    setDrinks((prev) => prev.filter((d) => d.id !== id))
  }

  return (
    <div className="min-h-screen ">
      {/* Header */}
      <div className="px-5 pb-4" style={{ paddingTop: "calc(56px + env(safe-area-inset-top))" }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-2xl font-black text-white">🔧 Admin</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { tab === 'stores' ? fetchPending() : tab === 'locations' ? fetchLocations() : tab === 'drinks' ? fetchDrinks() : tab === 'users' ? fetchUsers() : fetchWaitlist() }}
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
        <div className="flex rounded-xl p-1 gap-0.5" style={{ backgroundColor: '#1a1a24' }}>
          {(['stores', 'locations', 'drinks', 'users', 'waitlist'] as const).map((t) => (
            <button
              key={t}
              className="flex-1 rounded-lg py-2.5 text-[11px] font-bold"
              style={{
                backgroundColor: tab === t ? '#22c55e' : 'transparent',
                color: tab === t ? '#000' : 'rgba(255,255,255,0.4)',
              }}
              onClick={() => {
                setTab(t)
                if (t === 'users' && users.length === 0) fetchUsers()
                if (t === 'locations' && locations.length === 0) fetchLocations()
                if (t === 'drinks' && drinks.length === 0) fetchDrinks()
                if (t === 'waitlist' && waitlist.length === 0) fetchWaitlist()
              }}
            >
              {t === 'stores' ? '🕐 Pending' : t === 'locations' ? '📍 Locs' : t === 'drinks' ? '🥤 Drinks' : t === 'users' ? '👤 Users' : '📋 Waitlist'}
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
      ) : tab === 'drinks' ? (
        drinksLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-2 border-[#22c55e] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="px-4 pb-6">
            {/* Search + Add */}
            <div className="flex gap-2 mb-4">
              <div
                className="flex-1 flex items-center gap-2 rounded-xl px-3.5 py-2.5"
                style={{ backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.07)' }}
              >
                <span className="text-white/30 text-sm">🔍</span>
                <input
                  type="text"
                  placeholder="Search drinks..."
                  value={drinkSearch}
                  onChange={(e) => setDrinkSearch(e.target.value)}
                  className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/30"
                />
                {drinkSearch && <button onClick={() => setDrinkSearch('')} className="text-white/30 text-xs">✕</button>}
              </div>
              <button
                onClick={() => setShowAddForm((v) => !v)}
                className="px-3.5 rounded-xl text-sm font-bold"
                style={{ backgroundColor: showAddForm ? 'rgba(255,255,255,0.06)' : '#22c55e', color: showAddForm ? 'rgba(255,255,255,0.5)' : '#000' }}
              >
                {showAddForm ? '✕' : '+ Add'}
              </button>
            </div>

            {/* Add drink form */}
            {showAddForm && (
              <div
                className="rounded-2xl p-4 mb-4 flex flex-col gap-3"
                style={{ backgroundColor: '#1a1a24', border: '1px solid rgba(34,197,94,0.25)' }}
              >
                <p className="text-xs font-bold text-white/40" style={{ letterSpacing: '1.5px' }}>NEW DRINK</p>
                <input
                  type="text"
                  placeholder="Brand (e.g. Monster)"
                  value={newBrand}
                  onChange={(e) => setNewBrand(e.target.value)}
                  className="w-full rounded-xl p-3 text-sm text-white outline-none"
                  style={{ backgroundColor: '#070710', border: '1px solid rgba(255,255,255,0.07)' }}
                />
                <input
                  type="text"
                  placeholder="Name (e.g. Monster Energy)"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full rounded-xl p-3 text-sm text-white outline-none"
                  style={{ backgroundColor: '#070710', border: '1px solid rgba(255,255,255,0.07)' }}
                />
                <input
                  type="text"
                  placeholder="Flavor (e.g. Ultra White) — optional"
                  value={newFlavor}
                  onChange={(e) => setNewFlavor(e.target.value)}
                  className="w-full rounded-xl p-3 text-sm text-white outline-none"
                  style={{ backgroundColor: '#070710', border: '1px solid rgba(255,255,255,0.07)' }}
                />
                <button
                  onClick={addDrink}
                  disabled={addingDrink}
                  className="w-full rounded-xl p-3 font-bold text-white text-sm flex items-center justify-center"
                  style={{ backgroundColor: addingDrink ? 'rgba(34,197,94,0.4)' : '#22c55e' }}
                >
                  {addingDrink ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Add Drink'}
                </button>
              </div>
            )}

            {/* Drinks grouped by brand */}
            {(() => {
              const filtered = drinks.filter((d) => {
                const q = drinkSearch.toLowerCase()
                return !q || d.brand.toLowerCase().includes(q) || d.name.toLowerCase().includes(q) || (d.flavor ?? '').toLowerCase().includes(q)
              })
              const grouped = filtered.reduce<Record<string, any[]>>((acc, d) => {
                if (!acc[d.brand]) acc[d.brand] = []
                acc[d.brand].push(d)
                return acc
              }, {})

              if (filtered.length === 0) return (
                <div className="flex flex-col items-center gap-2 mt-8">
                  <span style={{ fontSize: 36 }}>🥤</span>
                  <p className="text-sm font-bold text-white">{drinkSearch ? 'No drinks found' : 'No drinks yet'}</p>
                </div>
              )

              return Object.entries(grouped).map(([brand, brandDrinks]) => {
                const brandColor = BRAND_COLORS[brand] ?? 'rgba(255,255,255,0.4)'
                return (
                <div key={brand} className="mb-4">
                  <p className="text-[10px] font-bold mb-2" style={{ color: brandColor, letterSpacing: '1.5px' }}>
                    {brand.toUpperCase()} · {brandDrinks.length}
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {brandDrinks.map((drink) => (
                      <div
                        key={drink.id}
                        className="flex items-center gap-3 rounded-xl px-3.5 py-3"
                        style={{
                          backgroundColor: '#1a1a24',
                          border: `1.5px solid ${brandColor}55`,
                          boxShadow: `0 0 10px ${brandColor}22, 0 0 20px ${brandColor}0d`,
                        }}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{drink.flavor ?? drink.name}</p>
                          {drink.flavor && <p className="text-xs text-white/35 mt-0.5">{drink.name}</p>}
                        </div>
                        <button
                          onClick={() => deleteDrink(drink.id)}
                          className="text-xs font-bold px-2.5 py-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}
                        >
                          🗑️
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )})
            })()}
          </div>
        )
      ) : tab === 'waitlist' ? (
        waitlistLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-2 border-[#22c55e] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : waitlist.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <span style={{ fontSize: 40 }}>📋</span>
            <p className="text-lg font-bold text-white">No waitlist signups</p>
            <p className="text-sm text-white/40">Tracker waitlist entries will appear here.</p>
          </div>
        ) : (
          <div className="px-4 pb-6">
            <p className="text-xs font-bold text-white/30 mb-3" style={{ letterSpacing: '1.5px' }}>
              {waitlist.length} SIGNUP{waitlist.length !== 1 ? 'S' : ''} — TRACKER BETA
            </p>
            <div className="flex flex-col gap-3">
              {waitlist.map((w: any) => (
                <div key={w.id} className="rounded-2xl p-4" style={{ backgroundColor: '#1a1a24', border: '1px solid rgba(139,92,246,0.2)' }}>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      {w.profile?.username ? (
                        <p className="text-sm font-bold text-white">@{w.profile.username}</p>
                      ) : (
                        <p className="text-sm font-bold text-white/40 italic">No profile yet</p>
                      )}
                      <p className="text-xs text-white/40 mt-0.5 truncate">{w.email}</p>
                      <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.25)' }}>Joined {timeAgo(w.created_at)}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      {w.profile?.tier === 'tracker' ? (
                        <span className="text-[9px] font-bold px-2 py-1 rounded-full" style={{ backgroundColor: 'rgba(139,92,246,0.15)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.35)' }}>
                          🎯 APPROVED
                        </span>
                      ) : (
                        <span className="text-[9px] font-bold px-2 py-1 rounded-full" style={{ backgroundColor: 'rgba(249,115,22,0.12)', color: '#fb923c', border: '1px solid rgba(249,115,22,0.3)' }}>
                          ⏳ PENDING
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {w.profile?.tier !== 'tracker' && w.user_id && (
                      <button
                        onClick={() => approveWaitlistUser(w.id, w.user_id)}
                        disabled={approvingId === w.id}
                        className="flex-1 rounded-xl py-2 text-xs font-bold flex items-center justify-center"
                        style={{ backgroundColor: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.35)', color: '#a78bfa' }}
                      >
                        {approvingId === w.id
                          ? <div className="w-3.5 h-3.5 border-2 border-[#a78bfa] border-t-transparent rounded-full animate-spin" />
                          : '🎯 Approve → Tracker'}
                      </button>
                    )}
                    <button
                      onClick={() => removeFromWaitlist(w.id)}
                      className="rounded-xl py-2 px-3 text-xs font-bold"
                      style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
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
            <div className="flex items-center gap-2 rounded-xl px-3.5 py-2.5 mb-1" style={{ backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.07)' }}>
              <span className="text-white/30 text-sm">🔍</span>
              <input
                type="text"
                placeholder="Search users..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/30"
              />
              {userSearch && <button onClick={() => setUserSearch('')} className="text-white/30 text-xs">✕</button>}
            </div>
            {users.filter((u) => u.username?.toLowerCase().includes(userSearch.toLowerCase())).map((u) => (
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
                    {u.tier === 'hunter' && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.35)' }}>⚡ HUNTER</span>
                    )}
                    {u.tier === 'tracker' && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(139,92,246,0.15)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.35)' }}>🎯 TRACKER</span>
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
            {users.filter((u) => u.username?.toLowerCase().includes(userSearch.toLowerCase())).length === 0 && (
              <div className="flex flex-col items-center gap-2 mt-8">
                <span style={{ fontSize: 36 }}>🔍</span>
                <p className="text-sm font-bold text-white">No users found</p>
              </div>
            )}
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
                    {store.submitter?.username && ` · by @${store.submitter.username}`}
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

      {/* Edit Modal — rendered via portal into document.body so it sits outside
           the MainWrapper scroll container and iOS touch events can't leak through */}
      {editStore && createPortal(
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
              style={{ backgroundColor: '#070710', border: '1px solid rgba(255,255,255,0.07)' }}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
            />

            <p className="text-[10px] font-bold text-white/35 mb-2" style={{ letterSpacing: '1.5px' }}>ADDRESS</p>
            <input
              type="text"
              className="w-full rounded-xl p-3.5 text-sm text-white outline-none mb-4"
              style={{ backgroundColor: '#070710', border: '1px solid rgba(255,255,255,0.07)' }}
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
                  style={{ backgroundColor: '#070710', border: '1px solid rgba(255,255,255,0.07)' }}
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
                  style={{ backgroundColor: '#070710', border: '1px solid rgba(255,255,255,0.07)' }}
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
                    backgroundColor: editType === t.value ? 'rgba(34,197,94,0.08)' : '#070710',
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
        </div>,
        document.body
      )}
    </div>
  )
}
