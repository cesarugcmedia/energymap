'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { BRAND_COLORS } from '@/components/BrandLogo'
import Toast from '@/components/Toast'

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

// Full name → USPS abbreviation, for grouping the Locations tab by state.
// Derived from the free-text address field (there's no structured state
// column on stores) — best-effort, not authoritative.
const STATE_NAME_TO_ABBR: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO',
  montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH',
  oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
  virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY',
  'district of columbia': 'DC',
}
const KNOWN_ABBRS = new Set(Object.values(STATE_NAME_TO_ABBR))

function extractStateAbbr(address: string | null | undefined): string {
  if (!address) return 'Unknown'
  // "..., NC 27601" or "..., NC, 27601" — abbreviation right before a zip
  const abbrMatch = address.match(/\b([A-Z]{2})\b,?\s*\d{5}/)
  if (abbrMatch && KNOWN_ABBRS.has(abbrMatch[1])) return abbrMatch[1]
  // Full state name anywhere in the string (Nominatim-geocoded addresses)
  const lower = address.toLowerCase()
  for (const [name, abbr] of Object.entries(STATE_NAME_TO_ABBR)) {
    if (lower.includes(name)) return abbr
  }
  return 'Unknown'
}

function toggleInSet<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}

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
  const [tab, setTab] = useState<null | 'stores' | 'locations' | 'drinks' | 'users' | 'waitlist' | 'flags' | 'kroger'>(null)
  const [pendingCount, setPendingCount] = useState(0)
  const [flagsCount, setFlagsCount] = useState(0)
  const [stores, setStores] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [users, setUsers] = useState<any[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [locations, setLocations] = useState<any[]>([])
  const [locationsLoading, setLocationsLoading] = useState(false)
  const [locationSearch, setLocationSearch] = useState('')
  const [expandedLocationStates, setExpandedLocationStates] = useState<Set<string>>(new Set())
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
  const [drinkDuplicateMsg, setDrinkDuplicateMsg] = useState<string | null>(null)

  // Flags state
  const [flags, setFlags] = useState<any[]>([])
  const [flagsLoading, setFlagsLoading] = useState(false)
  const [resolvingFlag, setResolvingFlag] = useState<Set<string>>(new Set())

  // Toast
  const [toastMessage, setToastMessage] = useState('')
  const [toastVisible, setToastVisible] = useState(false)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  function showToast(message: string) {
    clearTimeout(toastTimer.current)
    setToastMessage(message)
    setToastVisible(true)
    toastTimer.current = setTimeout(() => setToastVisible(false), 2500)
  }

  // Waitlist state
  const [waitlist, setWaitlist] = useState<any[]>([])
  const [waitlistLoading, setWaitlistLoading] = useState(false)
  const [inviting, setInviting] = useState<Set<string>>(new Set())
  const [deletingWaitlist, setDeletingWaitlist] = useState<Set<string>>(new Set())
  const [userSearch, setUserSearch] = useState('')
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null)

  // Kroger integration state
  const [krogerSyncing, setKrogerSyncing] = useState(false)
  const [krogerSyncResult, setKrogerSyncResult] = useState<string | null>(null)
  const [krogerStoreSearch, setKrogerStoreSearch] = useState('')
  const [expandedKrogerStoreStates, setExpandedKrogerStoreStates] = useState<Set<string>>(new Set())
  const [expandedKrogerDrinkBrands, setExpandedKrogerDrinkBrands] = useState<Set<string>>(new Set())
  const [krogerLocationCandidates, setKrogerLocationCandidates] = useState<Record<string, { locationId: string; name: string; address: string }[]>>({})
  const [krogerLocationSearching, setKrogerLocationSearching] = useState<Set<string>>(new Set())
  const [krogerDrinkSearch, setKrogerDrinkSearch] = useState('')
  const [krogerSearchLocationId, setKrogerSearchLocationId] = useState('')
  const [krogerProductCandidates, setKrogerProductCandidates] = useState<Record<string, { upc: string; description: string; brand: string | null; size: string | null; inStock: boolean | null }[]>>({})
  const [krogerProductSearching, setKrogerProductSearching] = useState<Set<string>>(new Set())
  const [krogerBulkStoreProgress, setKrogerBulkStoreProgress] = useState<{ done: number; total: number } | null>(null)
  const [krogerBulkDrinkProgress, setKrogerBulkDrinkProgress] = useState<{ done: number; total: number } | null>(null)
  const [krogerImportZip, setKrogerImportZip] = useState('')
  const [krogerImportRadius, setKrogerImportRadius] = useState('10')
  const [krogerImporting, setKrogerImporting] = useState(false)
  const [krogerImportResult, setKrogerImportResult] = useState<string | null>(null)

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
      fetchCounts()
    })
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.replace('/account')
  }

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-screen ">
        <div className="w-8 h-8 border-2 border-[#C9F400] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!authed) return null

  async function fetchCounts() {
    const [{ count: pc }, { count: fc }] = await Promise.all([
      supabase.from('stores').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('store_flags').select('id', { count: 'exact', head: true }).eq('resolved', false),
    ])
    setPendingCount(pc ?? 0)
    setFlagsCount(fc ?? 0)
  }

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

  async function deleteUser(userId: string, username: string) {
    if (!window.confirm(`Delete @${username}? This is permanent and cannot be undone.`)) return
    if (deletingUserId) return
    setDeletingUserId(userId)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { window.alert('Session expired. Please sign in again.'); return }
    const res = await fetch('/api/admin/delete-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify({ userId }),
    })
    if (res.ok) {
      setUsers((prev) => prev.filter((u) => u.id !== userId))
    } else {
      const { error } = await res.json()
      window.alert(`Failed to delete user: ${error}`)
    }
    setDeletingUserId(null)
  }

  async function approveStore(id: string) {
    const { data, error } = await supabase
      .from('stores')
      .update({ status: 'approved' })
      .eq('id', id)
      .select('id')
    if (error || !data || data.length === 0) {
      showToast('Could not approve store — check permissions')
      return
    }
    setStores((prev) => prev.filter((s) => s.id !== id))
    setPendingCount((c) => Math.max(0, c - 1))
    showToast('Store approved')
  }

  async function rejectStore(id: string) {
    if (!window.confirm('Reject this store submission?')) return

    // Only reject while it's still pending — guards against a race where
    // someone else already approved/rejected it since this list loaded.
    const { data: updated, error } = await supabase
      .from('stores')
      .update({ status: 'rejected' })
      .eq('id', id)
      .eq('status', 'pending')
      .select('id')

    if (error) {
      showToast('Could not reject store — check permissions')
      return
    }

    if (!updated || updated.length === 0) {
      showToast('This store was already handled elsewhere')
      setStores((prev) => prev.filter((s) => s.id !== id))
      fetchCounts()
      return
    }

    setStores((prev) => prev.filter((s) => s.id !== id))
    setPendingCount((c) => Math.max(0, c - 1))
    showToast('Store rejected')
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

    // Duplicate check
    const { data: existing } = await supabase
      .from('drinks')
      .select('id')
      .ilike('brand', newBrand.trim())
      .ilike('name', newName.trim())
      .maybeSingle()
    if (existing) {
      setDrinkDuplicateMsg(`"${newBrand.trim()} ${newName.trim()}" already exists in the drinks database.`)
      setAddingDrink(false)
      return
    }

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

  async function krogerAuthHeader() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { showToast('Session expired. Please sign in again.'); return null }
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }
  }

  async function runKrogerSync() {
    if (krogerSyncing) return
    setKrogerSyncing(true)
    setKrogerSyncResult(null)
    const headers = await krogerAuthHeader()
    if (!headers) { setKrogerSyncing(false); return }
    const res = await fetch('/api/admin/kroger-sync', { method: 'POST', headers })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      setKrogerSyncResult(`Error: ${json.error ?? 'sync failed'}`)
    } else if (json.message) {
      setKrogerSyncResult(json.message)
    } else {
      setKrogerSyncResult(`Synced ${json.synced} · Failed ${json.failed} (${json.storeCount} store × ${json.drinkCount} drink pairs checked)`)
    }
    setKrogerSyncing(false)
  }

  async function importKrogerLocations() {
    if (krogerImporting || !krogerImportZip.trim()) return
    setKrogerImporting(true)
    setKrogerImportResult(null)
    const headers = await krogerAuthHeader()
    if (!headers) { setKrogerImporting(false); return }
    const res = await fetch('/api/admin/kroger-import-locations', {
      method: 'POST',
      headers,
      body: JSON.stringify({ zipCode: krogerImportZip.trim(), radiusMiles: parseFloat(krogerImportRadius) || 10 }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      setKrogerImportResult(`Error: ${json.error ?? 'import failed'}`)
    } else {
      setKrogerImportResult(`Found ${json.candidatesFound} · Created ${json.created} · Matched to existing ${json.matched} · Already linked ${json.alreadyLinked} · Failed ${json.failed}`)
      fetchLocations()
    }
    setKrogerImporting(false)
  }

  async function findKrogerLocationMatches(storeId: string) {
    setKrogerLocationSearching((prev) => new Set(prev).add(storeId))
    const headers = await krogerAuthHeader()
    if (!headers) { setKrogerLocationSearching((prev) => { const n = new Set(prev); n.delete(storeId); return n }); return }
    const res = await fetch(`/api/admin/kroger-search-locations?storeId=${storeId}`, { headers })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      showToast(json.error ?? 'Kroger location search failed')
    } else {
      setKrogerLocationCandidates((prev) => ({ ...prev, [storeId]: json.candidates ?? [] }))
    }
    setKrogerLocationSearching((prev) => { const n = new Set(prev); n.delete(storeId); return n })
  }

  async function matchStoreToKroger(storeId: string, krogerLocationId: string | null) {
    const headers = await krogerAuthHeader()
    if (!headers) return
    const res = await fetch('/api/admin/kroger-match-store', { method: 'POST', headers, body: JSON.stringify({ storeId, krogerLocationId }) })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) { showToast(json.error ?? 'Could not update match'); return }
    setLocations((prev) => prev.map((s) => s.id === storeId ? { ...s, kroger_location_id: krogerLocationId } : s))
    setKrogerLocationCandidates((prev) => { const n = { ...prev }; delete n[storeId]; return n })
    showToast(krogerLocationId ? 'Matched to Kroger' : 'Unmatched')
  }

  async function findAllKrogerLocationMatches() {
    const unmatched = locations.filter((s) => !s.kroger_location_id)
    if (unmatched.length === 0) { showToast('Every store is already matched'); return }
    setKrogerBulkStoreProgress({ done: 0, total: unmatched.length })
    for (let i = 0; i < unmatched.length; i++) {
      await findKrogerLocationMatches(unmatched[i].id)
      setKrogerBulkStoreProgress({ done: i + 1, total: unmatched.length })
      await new Promise((r) => setTimeout(r, 150))
    }
    setKrogerBulkStoreProgress(null)
  }

  async function findKrogerProductMatches(drinkId: string, term: string) {
    if (!krogerSearchLocationId) { showToast('Pick a matched store to search against first'); return }
    setKrogerProductSearching((prev) => new Set(prev).add(drinkId))
    const headers = await krogerAuthHeader()
    if (!headers) { setKrogerProductSearching((prev) => { const n = new Set(prev); n.delete(drinkId); return n }); return }
    const res = await fetch(`/api/admin/kroger-search-products?term=${encodeURIComponent(term)}&locationId=${encodeURIComponent(krogerSearchLocationId)}`, { headers })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      showToast(json.error ?? 'Kroger product search failed')
    } else {
      setKrogerProductCandidates((prev) => ({ ...prev, [drinkId]: json.candidates ?? [] }))
    }
    setKrogerProductSearching((prev) => { const n = new Set(prev); n.delete(drinkId); return n })
  }

  async function matchDrinkToKroger(drinkId: string, upc: string | null) {
    const headers = await krogerAuthHeader()
    if (!headers) return
    const res = await fetch('/api/admin/kroger-match-drink', { method: 'POST', headers, body: JSON.stringify({ drinkId, upc }) })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) { showToast(json.error ?? 'Could not update match'); return }
    setDrinks((prev) => prev.map((d) => d.id === drinkId ? { ...d, kroger_upc: upc } : d))
    setKrogerProductCandidates((prev) => { const n = { ...prev }; delete n[drinkId]; return n })
    showToast(upc ? 'Matched to Kroger' : 'Unmatched')
  }

  async function findAllKrogerProductMatches() {
    if (!krogerSearchLocationId) { showToast('Pick a matched store to search against first'); return }
    const unmatched = drinks.filter((d) => !d.kroger_upc)
    if (unmatched.length === 0) { showToast('Every drink is already matched'); return }
    setKrogerBulkDrinkProgress({ done: 0, total: unmatched.length })
    for (let i = 0; i < unmatched.length; i++) {
      const d = unmatched[i]
      await findKrogerProductMatches(d.id, `${d.brand} ${d.flavor ?? d.name}`)
      setKrogerBulkDrinkProgress({ done: i + 1, total: unmatched.length })
      await new Promise((r) => setTimeout(r, 150))
    }
    setKrogerBulkDrinkProgress(null)
  }

  async function fetchFlags() {
    setFlagsLoading(true)
    const { data, error } = await supabase
      .from('store_flags')
      .select('id, reason, notes, created_at, resolved, store_id, user_id')
      .eq('resolved', false)
      .order('created_at', { ascending: false })
    if (error || !data) { setFlagsLoading(false); return }

    const storeIds = [...new Set(data.map((f: any) => f.store_id).filter(Boolean))]
    const userIds  = [...new Set(data.map((f: any) => f.user_id).filter(Boolean))]

    const [storesRes, profilesRes] = await Promise.all([
      storeIds.length > 0 ? supabase.from('stores').select('id, name, address, type').in('id', storeIds) : Promise.resolve({ data: [] }),
      userIds.length  > 0 ? supabase.from('profiles').select('id, username').in('id', userIds)           : Promise.resolve({ data: [] }),
    ])

    const storesMap: Record<string, any>   = Object.fromEntries((storesRes.data   ?? []).map((s: any) => [s.id, s]))
    const profilesMap: Record<string, any> = Object.fromEntries((profilesRes.data ?? []).map((p: any) => [p.id, p]))

    setFlags(data.map((f: any) => ({ ...f, store: storesMap[f.store_id] ?? null, reporter: profilesMap[f.user_id] ?? null })))
    setFlagsLoading(false)
  }

  async function resolveFlag(flagId: string) {
    setResolvingFlag((prev) => new Set(prev).add(flagId))
    const { error } = await supabase.from('store_flags').update({ resolved: true }).eq('id', flagId)
    if (!error) {
      setFlags((prev) => prev.filter((f) => f.id !== flagId))
      setFlagsCount((c) => Math.max(0, c - 1))
      showToast('Flag resolved')
    }
    setResolvingFlag((prev) => { const next = new Set(prev); next.delete(flagId); return next })
  }

  async function fetchWaitlist() {
    setWaitlistLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/admin/waitlist', {
      headers: { Authorization: `Bearer ${session!.access_token}` },
    })
    if (res.ok) setWaitlist(await res.json())
    setWaitlistLoading(false)
  }

  async function deleteWaitlistEntry(email: string) {
    if (!window.confirm(`Remove ${email} from the waitlist?`)) return
    setDeletingWaitlist((prev) => new Set(prev).add(email))
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/admin/waitlist', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session!.access_token}` },
      body: JSON.stringify({ email }),
    })
    if (res.ok) {
      setWaitlist((prev) => prev.filter((w) => w.email !== email))
    } else {
      window.alert('Failed to remove entry.')
    }
    setDeletingWaitlist((prev) => { const next = new Set(prev); next.delete(email); return next })
  }

  async function inviteUser(email: string) {
    setInviting((prev) => new Set(prev).add(email))
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/admin/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session!.access_token}` },
      body: JSON.stringify({ email }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      window.alert(`Failed to send invite: ${body.error ?? res.status}`)
    } else {
      setWaitlist((prev) =>
        prev.map((w) => w.email === email ? { ...w, invited_at: new Date().toISOString() } : w)
      )
    }
    setInviting((prev) => { const next = new Set(prev); next.delete(email); return next })
  }

  const SECTION_LABELS: Record<string, string> = {
    stores: 'Pending Stores',
    locations: 'Locations',
    drinks: 'Drinks',
    users: 'Users',
    waitlist: 'Waitlist',
    flags: 'Location Flags',
    kroger: 'Kroger Integration',
  }

  function navigate(section: typeof tab) {
    setTab(section)
    if (section === 'stores') fetchPending()
    else if (section === 'locations' && locations.length === 0) fetchLocations()
    else if (section === 'drinks' && drinks.length === 0) fetchDrinks()
    else if (section === 'users' && users.length === 0) fetchUsers()
    else if (section === 'waitlist' && waitlist.length === 0) fetchWaitlist()
    else if (section === 'flags') fetchFlags()
    else if (section === 'kroger') {
      if (locations.length === 0) fetchLocations()
      if (drinks.length === 0) fetchDrinks()
    }
  }

  function refreshCurrentTab() {
    if (tab === 'stores') fetchPending()
    else if (tab === 'locations') fetchLocations()
    else if (tab === 'drinks') fetchDrinks()
    else if (tab === 'users') fetchUsers()
    else if (tab === 'waitlist') fetchWaitlist()
    else if (tab === 'flags') fetchFlags()
    else if (tab === 'kroger') { fetchLocations(); fetchDrinks() }
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg)', position: 'relative' }}>
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, background: 'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(201,244,0,0.07) 0%, transparent 60%)', pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, backgroundImage: 'linear-gradient(rgba(201,244,0,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(201,244,0,0.03) 1px, transparent 1px)', backgroundSize: '32px 32px', pointerEvents: 'none' }} />
      <Toast message={toastMessage} visible={toastVisible} />
      {/* Sticky header */}
      <div
        style={{
          position: 'sticky', top: 0, zIndex: 20,
          backgroundColor: 'var(--header-bg)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid var(--fg-06)',
          paddingTop: 'env(safe-area-inset-top)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px' }}>
          {tab !== null && (
            <button
              onClick={() => setTab(null)}
              style={{
                width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                backgroundColor: 'var(--fg-07)',
                border: '1px solid var(--fg-10)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M10 12L6 8l4-4" stroke="var(--fg-75)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          <p style={{ flex: 1, margin: 0, fontSize: tab === null ? 20 : 16, fontWeight: 900, color: 'var(--text)' }}>
            {tab === null ? '🔧 Admin' : SECTION_LABELS[tab]}
          </p>
          {tab !== null && (
            <button
              onClick={refreshCurrentTab}
              style={{ fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 999, cursor: 'pointer', color: 'var(--fg-50)', backgroundColor: 'var(--fg-06)', border: 'none' }}
            >
              ↻ Refresh
            </button>
          )}
          <button
            onClick={handleLogout}
            style={{ fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 999, cursor: 'pointer', color: '#FF4545', backgroundColor: 'rgba(255,69,69,0.1)', border: '1px solid rgba(255,69,69,0.2)' }}
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Dashboard home */}
      {tab === null && (
        <div style={{ padding: '24px 16px 32px' }}>
          <p style={{ margin: '0 0 16px', fontSize: 11, fontWeight: 700, color: 'var(--fg-35)', letterSpacing: '1.5px' }}>NEEDS ATTENTION</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
            {[
              { key: 'stores', icon: '🕐', label: 'Pending Stores', count: pendingCount, badgeColor: '#FFB300', desc: 'Review submissions' },
              { key: 'flags',  icon: '🚩', label: 'Location Flags',  count: flagsCount,   badgeColor: '#FF4545', desc: 'Fix reported issues' },
            ].map(({ key, icon, label, count, badgeColor, desc }) => (
              <button
                key={key}
                onClick={() => navigate(key as any)}
                style={{
                  borderRadius: 18, padding: '18px 16px', textAlign: 'left', cursor: 'pointer',
                  backgroundColor: 'var(--surface)',
                  border: `1.5px solid ${count > 0 ? `${badgeColor}44` : 'var(--fg-07)'}`,
                  boxShadow: count > 0 ? `0 0 20px ${badgeColor}18` : 'none',
                  position: 'relative',
                }}
              >
                {count > 0 && (
                  <div style={{
                    position: 'absolute', top: 12, right: 12,
                    minWidth: 22, height: 22, borderRadius: 11, padding: '0 6px',
                    backgroundColor: badgeColor,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 900, color: 'var(--text)',
                  }}>{count}</div>
                )}
                <span style={{ fontSize: 28, display: 'block', marginBottom: 10 }}>{icon}</span>
                <p style={{ margin: '0 0 3px', fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>{label}</p>
                <p style={{ margin: 0, fontSize: 11, color: 'var(--fg-40)' }}>{desc}</p>
              </button>
            ))}
          </div>

          <p style={{ margin: '0 0 16px', fontSize: 11, fontWeight: 700, color: 'var(--fg-35)', letterSpacing: '1.5px' }}>MANAGE</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              { key: 'locations', icon: '📍', label: 'Locations',  desc: 'Edit & delete stores' },
              { key: 'drinks',    icon: '🥤', label: 'Drinks',     desc: 'Add & remove drinks' },
              { key: 'users',     icon: '👤', label: 'Users',      desc: 'Verify & manage users' },
              { key: 'waitlist',  icon: '📋', label: 'Waitlist',   desc: 'Invite signups' },
              { key: 'kroger',    icon: '🛒', label: 'Kroger',     desc: 'Match stores & sync stock' },
            ].map(({ key, icon, label, desc }) => (
              <button
                key={key}
                onClick={() => navigate(key as any)}
                style={{
                  borderRadius: 18, padding: '18px 16px', textAlign: 'left', cursor: 'pointer',
                  backgroundColor: 'var(--surface)',
                  border: '1.5px solid var(--fg-07)',
                }}
              >
                <span style={{ fontSize: 28, display: 'block', marginBottom: 10 }}>{icon}</span>
                <p style={{ margin: '0 0 3px', fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>{label}</p>
                <p style={{ margin: 0, fontSize: 11, color: 'var(--fg-40)' }}>{desc}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {tab !== null && (tab === 'flags' ? (
        flagsLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-2 border-[#C9F400] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : flags.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <span style={{ fontSize: 40 }}>🚩</span>
            <p className="text-lg font-bold text-white">No open flags</p>
            <p className="text-sm text-white/40">All location reports have been resolved.</p>
          </div>
        ) : (
          <div className="px-4 pb-6">
            <p className="text-[10px] font-bold mb-3" style={{ color: 'var(--fg-35)', letterSpacing: '1.5px' }}>
              {flags.length} OPEN FLAG{flags.length !== 1 ? 'S' : ''}
            </p>
            <div className="flex flex-col gap-3">
              {flags.map((flag) => {
                const store = flag.store as any
                const reporter = flag.reporter as any
                return (
                  <div
                    key={flag.id}
                    className="rounded-2xl p-4"
                    style={{ backgroundColor: 'var(--surface)', border: '1px solid rgba(255,69,69,0.2)' }}
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <span style={{ fontSize: 22 }}>{TYPE_ICON[store?.type] ?? '📍'}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white truncate">{store?.name ?? 'Unknown store'}</p>
                        {store?.address && <p className="text-xs text-white/40 mt-0.5 truncate">{store.address}</p>}
                      </div>
                      <span className="text-[10px] font-semibold shrink-0" style={{ color: 'var(--fg-35)' }}>{timeAgo(flag.created_at)}</span>
                    </div>
                    <div
                      className="rounded-xl px-3.5 py-2.5 mb-3"
                      style={{ backgroundColor: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.18)' }}
                    >
                      <p className="text-sm font-semibold" style={{ color: '#fca5a5' }}>{flag.reason}</p>
                      {flag.notes && <p className="text-xs mt-1 text-white/45 leading-relaxed">{flag.notes}</p>}
                    </div>
                    {reporter?.username && (
                      <p className="text-xs text-white/30 mb-3">Reported by @{reporter.username}</p>
                    )}
                    <div className="flex gap-2">
                      <button
                        className="flex-1 rounded-xl p-2.5 text-xs font-bold"
                        style={{ backgroundColor: 'var(--fg-06)', border: '1px solid var(--fg-10)', color: 'var(--fg-60)' }}
                        onClick={() => store && openEdit(store)}
                      >
                        ✏️ Edit Location
                      </button>
                      <button
                        className="flex-1 rounded-xl p-2.5 text-xs font-bold flex items-center justify-center"
                        style={{ backgroundColor: 'rgba(201,244,0,0.1)', border: '1px solid rgba(201,244,0,0.3)', color: 'var(--accent)', opacity: resolvingFlag.has(flag.id) ? 0.5 : 1 }}
                        disabled={resolvingFlag.has(flag.id)}
                        onClick={() => resolveFlag(flag.id)}
                      >
                        {resolvingFlag.has(flag.id) ? <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" /> : '✓ Resolve'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      ) : tab === 'kroger' ? (
        <div className="px-4 pb-6 flex flex-col gap-5">
          {/* Sync */}
          <div className="rounded-2xl p-4" style={{ backgroundColor: 'var(--surface)', border: '1px solid rgba(201,244,0,0.12)' }}>
            <p className="text-sm font-bold text-white mb-1">Sync Availability</p>
            <p className="text-xs text-white/40 mb-3">Pulls fresh stock for every matched store × matched drink pair.</p>
            <button
              onClick={runKrogerSync}
              disabled={krogerSyncing}
              className="rounded-xl px-4 py-2.5 text-sm font-bold flex items-center justify-center gap-2"
              style={{ backgroundColor: krogerSyncing ? 'rgba(201,244,0,0.4)' : '#C9F400', color: '#0D1210' }}
            >
              {krogerSyncing ? <div className="w-4 h-4 border-2 border-black/40 border-t-black rounded-full animate-spin" /> : '⚡ Sync Now'}
            </button>
            {krogerSyncResult && (
              <p className="text-xs mt-3" style={{ color: 'var(--fg-50)' }}>{krogerSyncResult}</p>
            )}
          </div>

          {/* Import locations */}
          <div className="rounded-2xl p-4" style={{ backgroundColor: 'var(--surface)', border: '1px solid rgba(201,244,0,0.12)' }}>
            <p className="text-sm font-bold text-white mb-1">Import Kroger Locations</p>
            <p className="text-xs text-white/40 mb-3">
              Pulls Kroger's own store locations near a zip code. A location within ~150m of an existing store links to it automatically; otherwise it's added as a new store. Repeat for each metro area — Kroger's API is zip+radius based, there's no single "whole state" query.
            </p>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                placeholder="Zip code"
                value={krogerImportZip}
                onChange={(e) => setKrogerImportZip(e.target.value)}
                className="flex-1 rounded-xl p-2.5 text-sm text-white outline-none"
                style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--fg-07)' }}
              />
              <input
                type="number"
                placeholder="Radius (mi)"
                value={krogerImportRadius}
                onChange={(e) => setKrogerImportRadius(e.target.value)}
                className="w-28 rounded-xl p-2.5 text-sm text-white outline-none"
                style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--fg-07)' }}
              />
            </div>
            <button
              onClick={importKrogerLocations}
              disabled={krogerImporting || !krogerImportZip.trim()}
              className="rounded-xl px-4 py-2.5 text-sm font-bold flex items-center justify-center gap-2"
              style={{ backgroundColor: krogerImporting || !krogerImportZip.trim() ? 'rgba(201,244,0,0.4)' : '#C9F400', color: '#0D1210' }}
            >
              {krogerImporting ? <div className="w-4 h-4 border-2 border-black/40 border-t-black rounded-full animate-spin" /> : '📍 Search & Import'}
            </button>
            {krogerImportResult && (
              <p className="text-xs mt-3" style={{ color: 'var(--fg-50)' }}>{krogerImportResult}</p>
            )}
          </div>

          {/* Match stores */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-bold" style={{ color: 'var(--fg-35)', letterSpacing: '1.5px' }}>MATCH STORES</p>
              <button
                onClick={findAllKrogerLocationMatches}
                disabled={!!krogerBulkStoreProgress}
                className="text-[10px] font-bold px-2.5 py-1.5 rounded-full"
                style={{ backgroundColor: 'rgba(201,244,0,0.1)', color: 'var(--accent)', border: '1px solid rgba(201,244,0,0.3)' }}
              >
                {krogerBulkStoreProgress ? `Searching ${krogerBulkStoreProgress.done}/${krogerBulkStoreProgress.total}…` : 'Find Matches for All'}
              </button>
            </div>
            <input
              type="text"
              placeholder="Search locations..."
              value={krogerStoreSearch}
              onChange={(e) => setKrogerStoreSearch(e.target.value)}
              className="w-full rounded-xl p-3 text-sm text-white outline-none mb-3"
              style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--fg-07)' }}
            />
            {locationsLoading ? (
              <div className="flex items-center justify-center h-24">
                <div className="w-6 h-6 border-2 border-[#C9F400] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              (() => {
                const filtered = locations.filter((s) =>
                  s.name.toLowerCase().includes(krogerStoreSearch.toLowerCase()) || s.address?.toLowerCase().includes(krogerStoreSearch.toLowerCase())
                )
                const grouped = filtered.reduce<Record<string, any[]>>((acc, s) => {
                  const abbr = extractStateAbbr(s.address)
                  if (!acc[abbr]) acc[abbr] = []
                  acc[abbr].push(s)
                  return acc
                }, {})
                const sortedStates = Object.keys(grouped).sort((a, b) =>
                  a === 'Unknown' ? 1 : b === 'Unknown' ? -1 : a.localeCompare(b)
                )

                return sortedStates.map((abbr) => {
                  const isOpen = expandedKrogerStoreStates.has(abbr)
                  const matchedCount = grouped[abbr].filter((s) => s.kroger_location_id).length
                  return (
                    <div
                      key={abbr}
                      className="rounded-2xl mb-2.5 overflow-hidden"
                      style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--fg-07)' }}
                    >
                      <button
                        onClick={() => setExpandedKrogerStoreStates((prev) => toggleInSet(prev, abbr))}
                        className="w-full flex items-center justify-between px-4 py-3.5"
                      >
                        <span className="text-sm font-bold text-white" style={{ letterSpacing: '0.5px' }}>
                          {abbr} <span style={{ color: 'var(--fg-35)', fontWeight: 600 }}>· {matchedCount}/{grouped[abbr].length} matched</span>
                        </span>
                        <span style={{ color: 'var(--accent)', fontSize: 12, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▼</span>
                      </button>
                      {isOpen && (
                        <div className="flex flex-col gap-2.5 px-4 pb-4">
                          {grouped[abbr].map((store) => (
                            <div key={store.id} className="rounded-2xl p-3.5" style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--fg-07)' }}>
                              <div className="flex items-center justify-between gap-3 mb-1">
                                <div className="min-w-0">
                                  <p className="text-sm font-bold text-white truncate">{store.name}</p>
                                  <p className="text-xs text-white/40 truncate">{store.address}</p>
                                </div>
                                {store.kroger_location_id ? (
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <span className="text-[10px] font-bold px-2 py-1 rounded-full" style={{ backgroundColor: 'rgba(59,130,246,0.12)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.3)' }}>✅ Matched</span>
                                    <button onClick={() => matchStoreToKroger(store.id, null)} className="text-[10px] font-bold px-2 py-1 rounded-full" style={{ backgroundColor: 'rgba(255,69,69,0.08)', color: '#FF4545', border: '1px solid rgba(255,69,69,0.2)' }}>Unmatch</button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => findKrogerLocationMatches(store.id)}
                                    disabled={krogerLocationSearching.has(store.id)}
                                    className="text-[10px] font-bold px-2.5 py-1.5 rounded-full shrink-0"
                                    style={{ backgroundColor: 'rgba(201,244,0,0.1)', color: 'var(--accent)', border: '1px solid rgba(201,244,0,0.3)' }}
                                  >
                                    {krogerLocationSearching.has(store.id) ? '...' : 'Find Kroger Match'}
                                  </button>
                                )}
                              </div>
                              {krogerLocationCandidates[store.id] && (
                                <div className="flex flex-col gap-1.5 mt-2.5 pt-2.5" style={{ borderTop: '1px solid var(--fg-06)' }}>
                                  {krogerLocationCandidates[store.id].length === 0 ? (
                                    <p className="text-xs text-white/30">No candidates found near this store's zip code.</p>
                                  ) : krogerLocationCandidates[store.id].map((c) => (
                                    <button
                                      key={c.locationId}
                                      onClick={() => matchStoreToKroger(store.id, c.locationId)}
                                      className="flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-left"
                                      style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--fg-07)' }}
                                    >
                                      <div className="min-w-0">
                                        <p className="text-xs font-semibold text-white truncate">{c.name}</p>
                                        <p className="text-[10px] text-white/35 truncate">{c.address}</p>
                                      </div>
                                      <span className="text-[10px] font-bold shrink-0" style={{ color: 'var(--accent)' }}>Use this →</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })
              })()
            )}
          </div>

          {/* Match drinks */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-bold" style={{ color: 'var(--fg-35)', letterSpacing: '1.5px' }}>MATCH DRINKS</p>
              {locations.filter((s) => s.kroger_location_id).length > 0 && (
                <button
                  onClick={findAllKrogerProductMatches}
                  disabled={!!krogerBulkDrinkProgress || !krogerSearchLocationId}
                  className="text-[10px] font-bold px-2.5 py-1.5 rounded-full"
                  style={{ backgroundColor: 'rgba(201,244,0,0.1)', color: 'var(--accent)', border: '1px solid rgba(201,244,0,0.3)' }}
                >
                  {krogerBulkDrinkProgress ? `Searching ${krogerBulkDrinkProgress.done}/${krogerBulkDrinkProgress.total}…` : 'Find Matches for All'}
                </button>
              )}
            </div>
            {locations.filter((s) => s.kroger_location_id).length === 0 ? (
              <p className="text-xs text-white/35 mb-3">Match at least one store above first — Kroger's product search needs a store location to search against.</p>
            ) : (
              <select
                value={krogerSearchLocationId}
                onChange={(e) => setKrogerSearchLocationId(e.target.value)}
                className="w-full rounded-xl p-3 text-sm text-white outline-none mb-3"
                style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--fg-07)' }}
              >
                <option value="">Search against which store's location?</option>
                {locations.filter((s) => s.kroger_location_id).map((s) => (
                  <option key={s.id} value={s.kroger_location_id}>{s.name}</option>
                ))}
              </select>
            )}
            <input
              type="text"
              placeholder="Search drinks..."
              value={krogerDrinkSearch}
              onChange={(e) => setKrogerDrinkSearch(e.target.value)}
              className="w-full rounded-xl p-3 text-sm text-white outline-none mb-3"
              style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--fg-07)' }}
            />
            {drinksLoading ? (
              <div className="flex items-center justify-center h-24">
                <div className="w-6 h-6 border-2 border-[#C9F400] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              (() => {
                const filtered = drinks.filter((d) => {
                  const q = krogerDrinkSearch.toLowerCase()
                  return !q || d.brand.toLowerCase().includes(q) || d.name.toLowerCase().includes(q) || (d.flavor ?? '').toLowerCase().includes(q)
                })
                const grouped = filtered.reduce<Record<string, any[]>>((acc, d) => {
                  if (!acc[d.brand]) acc[d.brand] = []
                  acc[d.brand].push(d)
                  return acc
                }, {})
                const sortedBrands = Object.keys(grouped).sort((a, b) => a.localeCompare(b))

                if (filtered.length === 0) return (
                  <div className="flex flex-col items-center gap-2 mt-8">
                    <span style={{ fontSize: 36 }}>🥤</span>
                    <p className="text-sm font-bold text-white">No drinks found</p>
                  </div>
                )

                return sortedBrands.map((brand) => {
                  const isOpen = expandedKrogerDrinkBrands.has(brand)
                  const matchedCount = grouped[brand].filter((d) => d.kroger_upc).length
                  const brandColor = BRAND_COLORS[brand] ?? 'var(--fg-40)'
                  return (
                    <div
                      key={brand}
                      className="rounded-2xl mb-2.5 overflow-hidden"
                      style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--fg-07)' }}
                    >
                      <button
                        onClick={() => setExpandedKrogerDrinkBrands((prev) => toggleInSet(prev, brand))}
                        className="w-full flex items-center justify-between px-4 py-3.5"
                      >
                        <span className="text-sm font-bold" style={{ color: brandColor, letterSpacing: '0.5px' }}>
                          {brand.toUpperCase()} <span style={{ color: 'var(--fg-35)', fontWeight: 600 }}>· {matchedCount}/{grouped[brand].length} matched</span>
                        </span>
                        <span style={{ color: 'var(--accent)', fontSize: 12, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▼</span>
                      </button>
                      {isOpen && (
                        <div className="flex flex-col gap-2.5 px-4 pb-4">
                          {grouped[brand].map((drink) => (
                            <div key={drink.id} className="rounded-2xl p-3.5" style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--fg-07)' }}>
                              <div className="flex items-center justify-between gap-3 mb-1">
                                <div className="min-w-0">
                                  <p className="text-sm font-bold text-white truncate">{drink.brand} {drink.flavor ?? drink.name}</p>
                                </div>
                                {drink.kroger_upc ? (
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <span className="text-[10px] font-bold px-2 py-1 rounded-full" style={{ backgroundColor: 'rgba(59,130,246,0.12)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.3)' }}>✅ {drink.kroger_upc}</span>
                                    <button onClick={() => matchDrinkToKroger(drink.id, null)} className="text-[10px] font-bold px-2 py-1 rounded-full" style={{ backgroundColor: 'rgba(255,69,69,0.08)', color: '#FF4545', border: '1px solid rgba(255,69,69,0.2)' }}>Unmatch</button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => findKrogerProductMatches(drink.id, `${drink.brand} ${drink.flavor ?? drink.name}`)}
                                    disabled={krogerProductSearching.has(drink.id)}
                                    className="text-[10px] font-bold px-2.5 py-1.5 rounded-full shrink-0"
                                    style={{ backgroundColor: 'rgba(201,244,0,0.1)', color: 'var(--accent)', border: '1px solid rgba(201,244,0,0.3)' }}
                                  >
                                    {krogerProductSearching.has(drink.id) ? '...' : 'Find Kroger Match'}
                                  </button>
                                )}
                              </div>
                              {krogerProductCandidates[drink.id] && (
                                <div className="flex flex-col gap-1.5 mt-2.5 pt-2.5" style={{ borderTop: '1px solid var(--fg-06)' }}>
                                  {krogerProductCandidates[drink.id].length === 0 ? (
                                    <p className="text-xs text-white/30">No candidates found for that search term.</p>
                                  ) : krogerProductCandidates[drink.id].map((c) => (
                                    <button
                                      key={c.upc}
                                      onClick={() => matchDrinkToKroger(drink.id, c.upc)}
                                      className="flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-left"
                                      style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--fg-07)' }}
                                    >
                                      <div className="min-w-0">
                                        <p className="text-xs font-semibold text-white truncate">{c.description}</p>
                                        <p className="text-[10px] text-white/35 truncate">{c.brand ?? ''} {c.size ?? ''} · UPC {c.upc}</p>
                                      </div>
                                      <span className="text-[10px] font-bold shrink-0" style={{ color: 'var(--accent)' }}>Use this →</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })
              })()
            )}
          </div>
        </div>
      ) : tab === 'locations' ? (
        locationsLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-2 border-[#C9F400] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="px-4 pb-6">
            <input
              type="text"
              placeholder="Search locations..."
              value={locationSearch}
              onChange={(e) => setLocationSearch(e.target.value)}
              className="w-full rounded-xl p-3 text-sm text-white outline-none mb-4"
              style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--fg-07)' }}
            />
            {(() => {
              const filtered = locations.filter((s) =>
                s.name.toLowerCase().includes(locationSearch.toLowerCase()) || s.address?.toLowerCase().includes(locationSearch.toLowerCase())
              )
              if (filtered.length === 0) return (
                <div className="flex flex-col items-center gap-2 mt-10">
                  <span style={{ fontSize: 36 }}>🔍</span>
                  <p className="text-sm font-bold text-white">No locations found</p>
                </div>
              )

              const grouped = filtered.reduce<Record<string, any[]>>((acc, s) => {
                const abbr = extractStateAbbr(s.address)
                if (!acc[abbr]) acc[abbr] = []
                acc[abbr].push(s)
                return acc
              }, {})
              const sortedStates = Object.keys(grouped).sort((a, b) =>
                a === 'Unknown' ? 1 : b === 'Unknown' ? -1 : a.localeCompare(b)
              )

              return sortedStates.map((abbr) => {
                const isOpen = expandedLocationStates.has(abbr)
                return (
                  <div
                    key={abbr}
                    className="rounded-2xl mb-3 overflow-hidden"
                    style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--fg-07)' }}
                  >
                    <button
                      onClick={() => setExpandedLocationStates((prev) => toggleInSet(prev, abbr))}
                      className="w-full flex items-center justify-between px-4 py-3.5"
                    >
                      <span className="text-sm font-bold text-white" style={{ letterSpacing: '0.5px' }}>
                        {abbr} <span style={{ color: 'var(--fg-35)', fontWeight: 600 }}>· {grouped[abbr].length}</span>
                      </span>
                      <span style={{ color: 'var(--accent)', fontSize: 12, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▼</span>
                    </button>
                    {isOpen && (
                      <div className="flex flex-col gap-2.5 px-4 pb-4">
                        {grouped[abbr].map((store) => (
                          <div
                            key={store.id}
                            className="rounded-2xl p-4 flex items-center gap-3"
                            style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--fg-07)' }}
                          >
                            <span style={{ fontSize: 24 }}>{TYPE_ICON[store.type] ?? '📍'}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-white truncate">{store.name}</p>
                              <p className="text-xs text-white/40 mt-0.5 truncate">{store.address}</p>
                              <p className="text-xs mt-0.5" style={{ color: 'var(--fg-25)' }}>
                                {store.lat?.toFixed(4)}, {store.lng?.toFixed(4)}
                              </p>
                            </div>
                            <div className="flex flex-col gap-1.5 shrink-0">
                              <button
                                onClick={() => openEdit(store)}
                                className="text-xs font-bold px-3 py-1.5 rounded-full"
                                style={{ backgroundColor: 'var(--fg-08)', color: 'var(--fg-60)', border: '1px solid var(--fg-10)' }}
                              >
                                ✏️ Edit
                              </button>
                              <button
                                onClick={() => deleteLocation(store.id)}
                                className="text-xs font-bold px-3 py-1.5 rounded-full"
                                style={{ backgroundColor: 'rgba(255,69,69,0.1)', color: '#FF4545', border: '1px solid rgba(255,69,69,0.2)' }}
                              >
                                🗑️ Delete
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })
            })()}
          </div>
        )
      ) : tab === 'drinks' ? (
        drinksLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-2 border-[#C9F400] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="px-4 pb-6">
            {/* Search + Add */}
            <div className="flex gap-2 mb-4">
              <div
                className="flex-1 flex items-center gap-2 rounded-xl px-3.5 py-2.5"
                style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--fg-07)' }}
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
                style={{ backgroundColor: showAddForm ? 'var(--fg-06)' : '#C9F400', color: showAddForm ? 'var(--fg-50)' : '#0D1210' }}
              >
                {showAddForm ? '✕' : '+ Add'}
              </button>
            </div>

            {/* Add drink form */}
            {showAddForm && (
              <div
                className="rounded-2xl p-4 mb-4 flex flex-col gap-3"
                style={{ backgroundColor: 'var(--surface)', border: '1px solid rgba(201,244,0,0.25)' }}
              >
                <p className="text-xs font-bold text-white/40" style={{ letterSpacing: '1.5px' }}>NEW DRINK</p>
                <input
                  type="text"
                  placeholder="Brand (e.g. Monster)"
                  value={newBrand}
                  onChange={(e) => setNewBrand(e.target.value)}
                  className="w-full rounded-xl p-3 text-sm text-white outline-none"
                  style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--fg-07)' }}
                />
                <input
                  type="text"
                  placeholder="Name (e.g. Monster Energy)"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full rounded-xl p-3 text-sm text-white outline-none"
                  style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--fg-07)' }}
                />
                <input
                  type="text"
                  placeholder="Flavor (e.g. Ultra White) — optional"
                  value={newFlavor}
                  onChange={(e) => setNewFlavor(e.target.value)}
                  className="w-full rounded-xl p-3 text-sm text-white outline-none"
                  style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--fg-07)' }}
                />
                <button
                  onClick={addDrink}
                  disabled={addingDrink}
                  className="w-full rounded-xl p-3 font-bold text-white text-sm flex items-center justify-center"
                  style={{ backgroundColor: addingDrink ? 'rgba(201,244,0,0.4)' : '#C9F400', color: '#0D1210' }}
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
                const brandColor = BRAND_COLORS[brand] ?? 'var(--fg-40)'
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
                          backgroundColor: 'var(--surface)',
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
                          style={{ backgroundColor: 'rgba(255,69,69,0.1)', color: '#FF4545', border: '1px solid rgba(255,69,69,0.2)' }}
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
      ) : tab === 'users' ? (
        usersLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-2 border-[#C9F400] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 px-4 pb-6">
            <div className="flex items-center gap-2 rounded-xl px-3.5 py-2.5 mb-1" style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--fg-07)' }}>
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
                style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--fg-07)' }}
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                  style={{ backgroundColor: 'rgba(201,244,0,0.12)', border: '1px solid rgba(201,244,0,0.2)' }}
                >
                  <span className="text-sm font-black" style={{ color: 'var(--accent)' }}>
                    {u.username?.[0]?.toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-sm font-bold text-white">@{u.username}</p>
                    {u.is_admin && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(201,244,0,0.15)', color: 'var(--accent)', border: '1px solid rgba(201,244,0,0.3)' }}>ADMIN</span>
                    )}
                    {u.is_verified_reporter && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.3)' }}>✓ VERIFIED</span>
                    )}
                    {u.tier === 'tracker' && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(201,244,0,0.12)', color: 'var(--accent)', border: '1px solid rgba(201,244,0,0.3)' }}>⚡ TRACKER</span>
                    )}
                  </div>
                  <p className="text-xs text-white/30 mt-0.5">Joined {timeAgo(u.created_at)}</p>
                </div>
                <button
                  onClick={() => deleteUser(u.id, u.username)}
                  disabled={deletingUserId === u.id}
                  className="text-xs font-bold px-3 py-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: 'rgba(255,69,69,0.08)', border: '1px solid rgba(255,69,69,0.2)', color: '#FF4545', opacity: deletingUserId === u.id ? 0.5 : 1 }}
                >
                  {deletingUserId === u.id ? '...' : '🗑 Delete'}
                </button>
                <button
                  onClick={() => toggleVerified(u.id, u.is_verified_reporter)}
                  className="text-xs font-bold px-3 py-1.5 rounded-full shrink-0"
                  style={u.is_verified_reporter
                    ? { backgroundColor: 'rgba(255,69,69,0.1)', border: '1px solid rgba(255,69,69,0.25)', color: '#FF4545' }
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
      ) : tab === 'waitlist' ? (
        waitlistLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-2 border-[#C9F400] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : waitlist.length === 0 ? (
          <div className="flex flex-col items-center gap-3 mt-20 px-8 text-center">
            <span style={{ fontSize: 40 }}>📋</span>
            <p className="text-lg font-black text-white">No signups yet</p>
            <p className="text-sm text-white/40">People who join the waitlist will appear here.</p>
          </div>
        ) : (
          <div className="px-4 pb-6">
            <p className="text-[10px] font-bold mb-3" style={{ color: 'var(--fg-35)', letterSpacing: '1.5px' }}>
              {waitlist.length} {waitlist.length === 1 ? 'SIGNUP' : 'SIGNUPS'} · {waitlist.filter((w) => w.invited_at).length} INVITED
            </p>
            <div className="flex flex-col gap-2.5">
              {waitlist.map((w, i) => (
                <div
                  key={w.email}
                  className="rounded-2xl p-4 flex items-center justify-between gap-3"
                  style={{ backgroundColor: 'var(--surface)', border: `1px solid ${i < 60 ? 'rgba(201,244,0,0.15)' : 'var(--fg-07)'}` }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black"
                      style={{
                        backgroundColor: i < 60 ? 'rgba(201,244,0,0.12)' : 'var(--fg-06)',
                        color: i < 60 ? '#C9F400' : 'var(--fg-30)',
                      }}
                    >
                      {i + 1}
                    </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{w.email}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--fg-35)' }}>
                      Joined {new Date(w.created_at).toLocaleDateString()}
                      {w.invited_at && (
                        <span style={{ color: 'var(--accent)' }}> · Invited {new Date(w.invited_at).toLocaleDateString()}</span>
                      )}
                    </p>
                  </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => inviteUser(w.email)}
                      disabled={inviting.has(w.email)}
                      className="rounded-xl px-3 py-2 text-xs font-bold flex items-center gap-1.5"
                      style={{
                        backgroundColor: w.invited_at ? 'rgba(201,244,0,0.1)' : '#C9F400',
                        color: w.invited_at ? '#C9F400' : '#0D1210',
                        border: w.invited_at ? '1px solid rgba(201,244,0,0.3)' : 'none',
                        opacity: inviting.has(w.email) ? 0.5 : 1,
                      }}
                    >
                      {inviting.has(w.email)
                        ? <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        : w.invited_at ? '✓ Resend' : '✉ Invite'}
                    </button>
                    <button
                      onClick={() => deleteWaitlistEntry(w.email)}
                      disabled={deletingWaitlist.has(w.email)}
                      className="rounded-xl px-2.5 py-2 text-xs font-bold"
                      style={{ backgroundColor: 'rgba(255,69,69,0.08)', border: '1px solid rgba(255,69,69,0.2)', color: '#FF4545', opacity: deletingWaitlist.has(w.email) ? 0.5 : 1 }}
                    >
                      {deletingWaitlist.has(w.email) ? '...' : '🗑'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      ) : loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-[#C9F400] border-t-transparent rounded-full animate-spin" />
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
              style={{ backgroundColor: 'var(--surface)', border: '1px solid rgba(255,200,0,0.2)' }}
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
                    backgroundColor: 'var(--fg-06)',
                    border: '1px solid var(--fg-08)',
                    color: 'var(--fg-60)',
                  }}
                  onClick={() => openEdit(store)}
                >
                  ✏️ Edit
                </button>
                <button
                  className="flex-1 rounded-xl p-2.5 text-sm font-bold"
                  style={{
                    backgroundColor: 'rgba(255,69,69,0.1)',
                    border: '1px solid rgba(255,69,69,0.25)',
                    color: '#FF4545',
                  }}
                  onClick={() => rejectStore(store.id)}
                >
                  ✕ Reject
                </button>
                <button
                  className="flex-1 rounded-xl p-2.5 text-sm font-bold"
                  style={{
                    backgroundColor: 'rgba(201,244,0,0.12)',
                    border: '1px solid rgba(201,244,0,0.3)',
                    color: 'var(--accent)',
                  }}
                  onClick={() => approveStore(store.id)}
                >
                  ✓ Approve
                </button>
              </div>
            </div>
          ))}
        </div>
      ))}

      {/* Edit Modal — rendered via portal into document.body so it sits outside
           the MainWrapper scroll container and iOS touch events can't leak through */}
      {drinkDuplicateMsg && createPortal(
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={() => setDrinkDuplicateMsg(null)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl p-6 pb-10"
            style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--fg-08)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-9 h-1 rounded-sm mx-auto mb-5" style={{ backgroundColor: 'var(--fg-20)' }} />
            <div className="flex items-center gap-3 mb-3">
              <span style={{ fontSize: 32 }}>🥤</span>
              <p className="text-lg font-black text-white">Already in the System</p>
            </div>
            <p className="text-sm text-white/50 leading-relaxed mb-6">{drinkDuplicateMsg}</p>
            <button
              className="w-full rounded-2xl p-4 font-bold"
              style={{ backgroundColor: '#C9F400', color: '#0D1210' }}
              onClick={() => setDrinkDuplicateMsg(null)}
            >
              Got it
            </button>
          </div>
        </div>,
        document.body
      )}

      {editStore && createPortal(
        <div
          className="fixed inset-0 flex flex-col justify-end z-50"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setEditStore(null) }}
        >
          <div
            className="rounded-t-3xl p-5 max-h-[85vh] overflow-y-auto"
            style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--fg-08)', paddingBottom: 40 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-9 h-1 rounded-sm mx-auto mb-4" style={{ backgroundColor: 'var(--fg-20)' }} />
            <p className="text-lg font-black text-white mb-5">Edit Store</p>

            <p className="text-[10px] font-bold text-white/35 mb-2" style={{ letterSpacing: '1.5px' }}>STORE NAME</p>
            <input
              type="text"
              className="w-full rounded-xl p-3.5 text-sm text-white outline-none mb-4"
              style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--fg-07)' }}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
            />

            <p className="text-[10px] font-bold text-white/35 mb-2" style={{ letterSpacing: '1.5px' }}>ADDRESS</p>
            <input
              type="text"
              className="w-full rounded-xl p-3.5 text-sm text-white outline-none mb-4"
              style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--fg-07)' }}
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
                  style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--fg-07)' }}
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
                  style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--fg-07)' }}
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
                    backgroundColor: editType === t.value ? 'rgba(201,244,0,0.08)' : 'var(--bg)',
                    border: `1.5px solid ${editType === t.value ? '#C9F400' : 'transparent'}`,
                    minWidth: '47%',
                  }}
                  onClick={() => setEditType(t.value)}
                >
                  <span style={{ fontSize: 16 }}>{t.icon}</span>
                  <span
                    className="text-sm font-semibold"
                    style={{ color: editType === t.value ? '#fff' : 'var(--fg-40)' }}
                  >
                    {t.label}
                  </span>
                </button>
              ))}
            </div>

            <div className="flex gap-2.5 mb-2.5">
              <button
                className="flex-1 rounded-xl p-3.5 font-semibold text-sm"
                style={{ backgroundColor: 'var(--fg-06)', color: 'var(--fg-50)' }}
                onClick={() => setEditStore(null)}
              >
                Cancel
              </button>
              <button
                className="flex-1 rounded-xl p-3.5 font-bold text-sm flex items-center justify-center"
                style={{ backgroundColor: '#C9F400', color: '#0D1210' }}
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
                  style={{ backgroundColor: 'rgba(255,69,69,0.1)', border: '1px solid rgba(255,69,69,0.25)', color: '#FF4545' }}
                  onClick={() => {
                    setEditStore(null)
                    rejectStore(editStore?.id)
                  }}
                >
                  ✕ Reject Store
                </button>
                <button
                  className="flex-1 rounded-xl p-3.5 font-bold text-sm"
                  style={{ backgroundColor: 'rgba(201,244,0,0.1)', border: '1px solid rgba(201,244,0,0.3)', color: 'var(--accent)' }}
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
                style={{ backgroundColor: 'rgba(255,69,69,0.1)', border: '1px solid rgba(255,69,69,0.25)', color: '#FF4545' }}
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
