'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

type Mode = 'signin' | 'signup'
type TierId = 'free' | 'hunter' | 'tracker'

const BADGE_DEFS = [
  { id: 'early_adopter', icon: '🌟', name: 'Early Adopter',   desc: 'Joined in the founding era',          color: '#f59e0b', glow: 'rgba(245,158,11,0.25)' },
  { id: 'first_report',  icon: '⚡', name: 'First Report',    desc: 'Submitted your first stock report',   color: '#22c55e', glow: 'rgba(34,197,94,0.25)'  },
  { id: 'reporter_10',   icon: '📊', name: 'Reporter',        desc: '10 stock reports submitted',          color: '#22c55e', glow: 'rgba(34,197,94,0.25)'  },
  { id: 'reporter_50',   icon: '🏆', name: 'Veteran',         desc: '50 stock reports submitted',          color: '#f97316', glow: 'rgba(249,115,22,0.25)' },
  { id: 'reporter_100',  icon: '💎', name: 'Elite',           desc: '100 stock reports submitted',         color: '#a855f7', glow: 'rgba(168,85,247,0.25)' },
  { id: 'scout',         icon: '📍', name: 'Scout',           desc: 'Added your first approved store',     color: '#3b82f6', glow: 'rgba(59,130,246,0.25)' },
  { id: 'pathfinder',    icon: '🗺️', name: 'Pathfinder',      desc: 'Added 5 approved stores',             color: '#06b6d4', glow: 'rgba(6,182,212,0.25)'  },
  { id: 'flavor_hunter', icon: '🎯', name: 'Flavor Hunter',   desc: 'Reported 5 different drinks',         color: '#ec4899', glow: 'rgba(236,72,153,0.25)' },
  { id: 'verified',         icon: '✅', name: 'Verified',          desc: 'Trusted community reporter',      color: '#60a5fa', glow: 'rgba(96,165,250,0.25)'  },
  { id: 'weekly_champion',  icon: '👑', name: 'Weekly Champion',   desc: 'Top reporter of the week',        color: '#ffd700', glow: 'rgba(255,215,0,0.25)'   },
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

function SetupProfile({ userId, email }: { userId: string; email: string }) {
  const [username, setUsername] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (username.length < 3) { setError('Username must be at least 3 characters.'); return }
    setSubmitting(true)
    const { data: existing } = await supabase.from('profiles').select('id').eq('username', username).maybeSingle()
    if (existing) { setError('That username is already taken.'); setSubmitting(false); return }
    await supabase.from('profiles').insert({ id: userId, username })
    window.location.reload()
  }

  return (
    <div className="h-full bg-[#070710] px-5 flex flex-col justify-center" style={{ paddingBottom: 'calc(70px + env(safe-area-inset-bottom))' }}>
      <p className="text-2xl font-black text-white mb-1">One more step</p>
      <p className="text-xs text-white/40 mb-6">Pick a username for your account ({email})</p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <p className="text-[10px] font-bold text-white/35 mb-2" style={{ letterSpacing: '1.5px' }}>USERNAME</p>
          <input
            type="text"
            className="w-full rounded-xl p-3.5 text-sm text-white outline-none"
            style={{ backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.07)' }}
            placeholder="yourname"
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
            autoFocus
          />
          <p className="text-[10px] text-white/25 mt-1.5">Lowercase letters, numbers, underscores only</p>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-2xl p-4 font-bold text-white flex items-center justify-center"
          style={{ backgroundColor: submitting ? 'rgba(34,197,94,0.5)' : '#22c55e' }}
        >
          {submitting
            ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            : 'Save Username →'}
        </button>
      </form>
    </div>
  )
}

const TIERS = [
  {
    id: 'free' as TierId,
    name: 'Free',
    price: '$0',
    period: '',
    color: '#6b7280',
    glow: 'rgba(107,114,128,0.3)',
    border: 'rgba(107,114,128,0.3)',
    icon: '🗺️',
    tag: null as string | null,
    comingSoon: false,
    description: null as string | null,
    inherits: null as string | null,
    features: [
      'Map with nearby stores',
      'View stock reports',
      'Submit stock reports',
      'Add missing stores',
      '10 mile radius',
    ],
  },
  {
    id: 'hunter' as TierId,
    name: 'Hunter',
    price: '$5',
    period: '/month',
    color: '#22c55e',
    glow: 'rgba(34,197,94,0.25)',
    border: 'rgba(34,197,94,0.5)',
    icon: '⚡',
    tag: null as string | null,
    comingSoon: false,
    description: null as string | null,
    inherits: 'Free' as string | null,
    features: [
      'Extended 25 mile radius',
      'No staleness warning banners',
      'Early stock alerts',
    ],
  },
  {
    id: 'tracker' as TierId,
    name: 'Tracker',
    price: '$10',
    period: '/month',
    color: '#f97316',
    glow: 'rgba(249,115,22,0.25)',
    border: 'rgba(249,115,22,0.4)',
    icon: '🔥',
    tag: 'EARLY ACCESS' as string | null,
    comingSoon: false,
    description: null as string | null,
    inherits: 'Hunter' as string | null,
    features: [
      'Community chat access',
      'Custom store lists',
      'Leaderboard placement + badge',
      'Verified reporter badge',
      'Photo proof uploads',
    ],
  },
]

const QUANTITY_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  out:    { label: 'OUT',  color: '#ef4444', bg: 'rgba(239,68,68,0.1)',  border: 'rgba(239,68,68,0.25)'  },
  low:    { label: 'LOW',  color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.25)' },
  medium: { label: 'MED',  color: '#f97316', bg: 'rgba(249,115,22,0.1)', border: 'rgba(249,115,22,0.25)' },
  full:   { label: 'FULL', color: '#22c55e', bg: 'rgba(34,197,94,0.1)',  border: 'rgba(34,197,94,0.25)'  },
}

const ACCOUNT_TABS = [
  { id: 'overview',  label: 'Overview', icon: '📊' },
  { id: 'lists',     label: 'Lists',    icon: '📑' },
  { id: 'reports',   label: 'Reports',  icon: '📋' },
  { id: 'settings',  label: 'Settings', icon: '⚙️' },
]

const HOW_IT_WORKS = [
  { icon: '📍', title: 'Find Nearby Stores', desc: 'See gas stations and convenience stores around you on a live map, sorted by distance.' },
  { icon: '⚡', title: 'Check Stock Instantly', desc: 'Community members report what\'s in stock in real time — Celsius, Ghost, Alani, Red Bull and more.' },
  { icon: '🔔', title: 'Get Notified', desc: 'Set alerts for your favorite flavors and get notified the moment they\'re spotted near you.' },
  { icon: '🤝', title: 'Help the Community', desc: 'Report what you see on shelves. Every report helps thousands of fans find their favorite drinks faster.' },
]

const STATS = [
  { value: '500+', label: 'Stores Tracked' },
  { value: '50+', label: 'Drink Flavors' },
  { value: 'Real-time', label: 'Stock Updates' },
  { value: 'Free', label: 'To Get Started' },
]

function AccountPageInner() {
  const { user, profile, loading, refreshProfile } = useAuth()
  const searchParams = useSearchParams()
  const [mode, setMode] = useState<Mode>('signup')
  const [selectedTier, setSelectedTier] = useState<TierId | null>(null)
  const [step, setStep] = useState(1)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [showPassword, setShowPassword] = useState(false)
const [lists, setLists] = useState<any[]>([])
  const [listsLoading, setListsLoading] = useState(false)
  const [activeList, setActiveList] = useState<any | null>(null)
  const [listStores, setListStores] = useState<any[]>([])
  const [listStoresLoading, setListStoresLoading] = useState(false)
  const [showNewList, setShowNewList] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [creatingList, setCreatingList] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [confirmEmail, setConfirmEmail] = useState(false)
  const [betaCount, setBetaCount] = useState<number>(0)

  // Stats
  const [reportCount, setReportCount] = useState<number>(0)
  const [storeCount, setStoreCount] = useState<number>(0)
  const [uniqueFlavors, setUniqueFlavors] = useState<number>(0)
  const [recentReports, setRecentReports] = useState<any[]>([])
  const [statsLoading, setStatsLoading] = useState(false)

  // Profile management
  const [editingUsername, setEditingUsername] = useState(false)
  const [newUsername, setNewUsername] = useState('')
  const [usernameError, setUsernameError] = useState<string | null>(null)
  const [savingUsername, setSavingUsername] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [savingPassword, setSavingPassword] = useState(false)
  const [passwordSuccess, setPasswordSuccess] = useState(false)

  // Tabs
  const [activeTab, setActiveTab] = useState<'overview' | 'lists' | 'reports' | 'settings'>('overview')

  // All reports (Reports tab, paginated)
  const [allReports, setAllReports] = useState<any[]>([])
  const [allReportsPage, setAllReportsPage] = useState(0)
  const [allReportsLoading, setAllReportsLoading] = useState(false)
  const [allReportsHasMore, setAllReportsHasMore] = useState(true)

  // Notification preferences (persisted to localStorage)
  const [notifFlavors, setNotifFlavors] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem('notif_flavors') !== 'false' : true
  )
  const [notifLocation, setNotifLocation] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem('notif_location') !== 'false' : true
  )
  const [notifEmail, setNotifEmail] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem('notif_email') === 'true' : false
  )

  useEffect(() => {
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('tier', 'tracker')
      .then(({ count }) => setBetaCount(count ?? 0))
  }, [])

  // Refresh profile after successful Stripe payment
  useEffect(() => {
    if (searchParams.get('payment') === 'success') {
      refreshProfile()
    }
  }, [searchParams])

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError) setError('Invalid email or password.')
    setSubmitting(false)
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!username.trim()) { setError('Username is required.'); return }
    if (username.length < 3) { setError('Username must be at least 3 characters.'); return }
    setSubmitting(true)
    const { data: existing } = await supabase.from('profiles').select('id').eq('username', username.trim()).maybeSingle()
    if (existing) { setError('That username is already taken.'); setSubmitting(false); return }
    const { data, error: authError } = await supabase.auth.signUp({ email, password })
    if (authError) { setError(authError.message); setSubmitting(false); return }
    if (data.user) {
      const isPaidTier = selectedTier === 'hunter' || selectedTier === 'tracker'

      // For tracker: check if beta spots still available
      let isFreeBetaTracker = false
      if (selectedTier === 'tracker') {
        const { count } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('tier', 'tracker')
        isFreeBetaTracker = (count ?? 0) < 50
      }

      // Always create as free — Stripe webhook upgrades tier after payment
      await supabase.from('profiles').insert({ id: data.user.id, username: username.trim(), tier: 'free' })

      // Send welcome email (fire and forget)
      fetch('/api/email/welcome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, username: username.trim(), tier: selectedTier }),
      }).catch(() => {})

      // Redirect paid tiers (non-beta) to Stripe BEFORE email confirmation check
      if (isPaidTier && !isFreeBetaTracker) {
        try {
          const res = await fetch('/api/stripe/checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tier: selectedTier, userId: data.user.id, email }),
          })
          const json = await res.json()
          if (json.url) { window.location.href = json.url; return }
          setError('Could not start checkout. Please try again.')
        } catch {
          setError('Could not connect to payment provider. Please try again.')
        }
        setSubmitting(false)
        return
      }

      // Free tier or beta tracker — proceed normally
      if (!data.session) { setSubmitting(false); setConfirmEmail(true); return }
      if (isFreeBetaTracker) {
        await supabase.from('profiles').update({ tier: 'tracker' }).eq('id', data.user.id)
      }
      await refreshProfile()
    }
    setSubmitting(false)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  useEffect(() => {
    if (user) { fetchLists(user.id); fetchStats(user.id) }
  }, [user])

  async function fetchLists(userId: string) {
    setListsLoading(true)
    const { data } = await supabase
      .from('custom_lists')
      .select('id, name, created_at, list_stores(count)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    if (data) setLists(data)
    setListsLoading(false)
  }

  async function fetchStats(userId: string) {
    setStatsLoading(true)
    const [{ count: rCount }, { count: sCount }, { data: recent }, { data: flavors }] = await Promise.all([
      supabase.from('stock_reports').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('stores').select('id', { count: 'exact', head: true }).eq('submitted_by', userId).eq('status', 'approved'),
      supabase.from('stock_reports')
        .select('id, reported_at, quantity, drink:drinks(name, flavor, brand), store:stores(name)')
        .eq('user_id', userId)
        .order('reported_at', { ascending: false })
        .limit(5),
      supabase.from('stock_reports').select('drink_id').eq('user_id', userId),
    ])
    setReportCount(rCount ?? 0)
    setStoreCount(sCount ?? 0)
    if (recent) setRecentReports(recent)
    if (flavors) setUniqueFlavors(new Set(flavors.map((r: any) => r.drink_id)).size)
    setStatsLoading(false)
  }

  async function saveUsername() {
    if (!newUsername.trim() || !user) return
    setUsernameError(null)
    if (newUsername.trim().length < 3) { setUsernameError('Must be at least 3 characters.'); return }
    setSavingUsername(true)
    const { data: existing } = await supabase.from('profiles').select('id').eq('username', newUsername.trim()).neq('id', user.id).maybeSingle()
    if (existing) { setUsernameError('That username is already taken.'); setSavingUsername(false); return }
    const { error: upErr } = await supabase.from('profiles').update({ username: newUsername.trim() }).eq('id', user.id)
    if (upErr) { setUsernameError('Could not save. Try again.'); setSavingUsername(false); return }
    await refreshProfile()
    setSavingUsername(false)
    setEditingUsername(false)
    setNewUsername('')
  }

  async function savePassword() {
    setPasswordError(null)
    setPasswordSuccess(false)
    if (newPassword.length < 6) { setPasswordError('Password must be at least 6 characters.'); return }
    if (newPassword !== confirmPassword) { setPasswordError('Passwords do not match.'); return }
    setSavingPassword(true)
    const { error: pwErr } = await supabase.auth.updateUser({ password: newPassword })
    if (pwErr) { setPasswordError(pwErr.message); setSavingPassword(false); return }
    setSavingPassword(false)
    setPasswordSuccess(true)
    setNewPassword('')
    setConfirmPassword('')
    setTimeout(() => { setChangingPassword(false); setPasswordSuccess(false) }, 1500)
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

  async function createList() {
    if (!newListName.trim() || !user) return
    setCreatingList(true)
    const { data } = await supabase
      .from('custom_lists')
      .insert({ user_id: user.id, name: newListName.trim() })
      .select()
      .single()
    if (data) setLists((prev) => [{ ...data, list_stores: [{ count: 0 }] }, ...prev])
    setNewListName('')
    setShowNewList(false)
    setCreatingList(false)
  }

  const [deletingListId, setDeletingListId] = useState<string | null>(null)
  const [removingStoreId, setRemovingStoreId] = useState<string | null>(null)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const [cancelLoading, setCancelLoading] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [resetSent, setResetSent] = useState(false)

  async function cancelSubscription() {
    if (cancelLoading || !user) return
    const confirmed = window.confirm('Are you sure you want to cancel your subscription? You will be moved to the free tier immediately.')
    if (!confirmed) return
    setCancelLoading(true)
    setCancelError(null)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setCancelLoading(false); return }
    try {
      const res = await fetch('/api/stripe/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ userId: user.id }),
      })
      const json = await res.json()
      if (json.success) {
        await refreshProfile()
      } else {
        setCancelError(json.error ?? 'Failed to cancel subscription.')
      }
    } catch (err: any) {
      setCancelError(err?.message ?? 'Could not connect. Please try again.')
    }
    setCancelLoading(false)
  }

  async function handleForgotPassword() {
    if (!email) { setError('Enter your email above first.'); return }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/account`,
    })
    if (error) { setError(error.message); return }
    setResetSent(true)
  }

  async function startCheckout(tier: 'hunter' | 'tracker') {
    if (checkoutLoading || !user) return
    setCheckoutLoading(true)
    setCheckoutError(null)
    try {
      // Check beta spots for tracker upgrades
      if (tier === 'tracker') {
        const { count } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('tier', 'tracker')
        const isFreeBeta = (count ?? 0) < 50
        if (isFreeBeta) {
          await supabase.from('profiles').update({ tier: 'tracker' }).eq('id', user.id)
          await refreshProfile()
          setCheckoutLoading(false)
          return
        }
      }

      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier, userId: user.id, email: user.email }),
      })
      const json = await res.json()
      if (json.url) {
        window.location.href = json.url
      } else {
        setCheckoutError(json.error ?? 'Could not start checkout. Please try again.')
        setCheckoutLoading(false)
      }
    } catch (err: any) {
      setCheckoutError(err?.message ?? 'Could not connect to payment provider. Please try again.')
      setCheckoutLoading(false)
    }
  }

  async function deleteAccount() {
    if (!user) return
    const confirmed = window.confirm('Are you sure you want to delete your account? This cannot be undone.')
    if (!confirmed) return

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const res = await fetch('/api/account/delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ userId: user.id }),
    })

    const json = await res.json()
    if (json.success) {
      await supabase.auth.signOut()
      window.location.href = '/'
    } else {
      alert(json.error ?? 'Failed to delete account. Please try again.')
    }
  }

  async function deleteList(listId: string) {
    if (deletingListId) return
    setDeletingListId(listId)
    await supabase.from('custom_lists').delete().eq('id', listId)
    setLists((prev) => prev.filter((l) => l.id !== listId))
    if (activeList?.id === listId) setActiveList(null)
    setDeletingListId(null)
  }

  async function removeFromList(listStoreId: string) {
    if (removingStoreId) return
    setRemovingStoreId(listStoreId)
    await supabase.from('list_stores').delete().eq('id', listStoreId)
    setListStores((prev) => prev.filter((ls) => ls.id !== listStoreId))
    setRemovingStoreId(null)
  }

  async function fetchAllReports(page = 0) {
    if (!user) return
    setAllReportsLoading(true)
    const PAGE_SIZE = 20
    const { data } = await supabase
      .from('stock_reports')
      .select('id, reported_at, quantity, drink:drinks(name, flavor, brand), store:stores(name)')
      .eq('user_id', user.id)
      .order('reported_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
    if (data) {
      if (page === 0) setAllReports(data)
      else setAllReports((prev) => [...prev, ...data])
      setAllReportsHasMore(data.length === PAGE_SIZE)
      setAllReportsPage(page)
    }
    setAllReportsLoading(false)
  }

  // Persist notification prefs
  useEffect(() => { if (typeof window !== 'undefined') localStorage.setItem('notif_flavors', String(notifFlavors)) }, [notifFlavors])
  useEffect(() => { if (typeof window !== 'undefined') localStorage.setItem('notif_location', String(notifLocation)) }, [notifLocation])
  useEffect(() => { if (typeof window !== 'undefined') localStorage.setItem('notif_email', String(notifEmail)) }, [notifEmail])

  // Fetch reports when tab opens
  useEffect(() => {
    if (activeTab === 'reports' && user && allReports.length === 0) fetchAllReports(0)
  }, [activeTab, user])

function selectAndContinue(tierId: TierId) {
    setSelectedTier(tierId)
    setStep(2)
  }

  function switchMode(m: Mode) {
    setMode(m)
    setStep(1)
    setSelectedTier(null)
    setError(null)
    setConfirmEmail(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#070710]">
        <div className="w-8 h-8 border-2 border-[#22c55e] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (user && !profile && !loading) return <SetupProfile userId={user.id} email={user.email ?? ''} />
  if (user && !profile) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#070710]">
        <div className="w-8 h-8 border-2 border-[#22c55e] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const TYPE_ICON: Record<string, string> = { gas_station: '⛽', convenience: '🏪', grocery: '🛒', other: '📍' }

  // ── LOGGED IN ──────────────────────────────────────────────
  if (user && profile) {
    // Compute earned badges
    const earned = new Set<string>()
    const memberDays = Math.floor((Date.now() - new Date(user.created_at).getTime()) / 86400000)
    if (memberDays >= 30)            earned.add('early_adopter')
    if (reportCount >= 1)            earned.add('first_report')
    if (reportCount >= 10)           earned.add('reporter_10')
    if (reportCount >= 50)           earned.add('reporter_50')
    if (reportCount >= 100)          earned.add('reporter_100')
    if (storeCount >= 1)             earned.add('scout')
    if (storeCount >= 5)             earned.add('pathfinder')
    if (uniqueFlavors >= 5)          earned.add('flavor_hunter')
    if (profile.is_verified_reporter) earned.add('verified')

    function progressHint(id: string): string | null {
      if (id === 'reporter_10'   && reportCount < 10)   return `${reportCount}/10 reports`
      if (id === 'reporter_50'   && reportCount < 50)   return `${reportCount}/50 reports`
      if (id === 'reporter_100'  && reportCount < 100)  return `${reportCount}/100 reports`
      if (id === 'pathfinder'    && storeCount < 5)     return `${storeCount}/5 stores`
      if (id === 'flavor_hunter' && uniqueFlavors < 5)  return `${uniqueFlavors}/5 drinks`
      return null
    }

    const TIER_LABEL: Record<string, { label: string; color: string; icon: string }> = {
      free:    { label: 'Free',    color: '#6b7280', icon: '🗺️' },
      hunter:  { label: 'Hunter',  color: '#22c55e', icon: '⚡' },
      tracker: { label: 'Tracker', color: '#f97316', icon: '🔥' },
    }
    const tierInfo = TIER_LABEL[profile.tier ?? 'free']
    return (
      <div className="bg-[#070710]" style={{ paddingTop: 'calc(56px + env(safe-area-inset-top))', paddingBottom: 'calc(70px + env(safe-area-inset-bottom))' }}>

        {/* ── Profile card (always visible) ── */}
        <div className="px-5 pt-4 pb-3">
          <div className="rounded-2xl p-5" style={{ backgroundColor: '#1a1a24', border: '1px solid rgba(34,197,94,0.2)', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, #22c55e, #4ade80)' }} />
            <div className="flex items-center gap-4 mb-4">
              <div className="w-14 h-14 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: 'rgba(34,197,94,0.15)', border: '2px solid rgba(34,197,94,0.3)', boxShadow: '0 4px 16px rgba(34,197,94,0.2)' }}>
                <span className="text-2xl font-black" style={{ color: '#22c55e' }}>{profile.username[0].toUpperCase()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-lg font-black text-white truncate">@{profile.username}</p>
                <p className="text-xs text-white/40 mt-0.5 truncate">{user.email}</p>
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  {profile.is_admin && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}>ADMIN</span>}
                  {profile.is_verified_reporter && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.3)' }}>✓ VERIFIED</span>}
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: `${tierInfo.color}18`, color: tierInfo.color, border: `1px solid ${tierInfo.color}40` }}>{tierInfo.icon} {tierInfo.label.toUpperCase()}</span>
                </div>
              </div>
            </div>
            {/* Stat row */}
            <div className="flex" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 14 }}>
              {[
                { value: reportCount, label: 'Reports', color: '#22c55e' },
                { value: storeCount,  label: 'Stores Added', color: '#f97316' },
                { value: `${memberDays}d`, label: 'Member For', color: '#a78bfa' },
              ].map((s, i) => (
                <div key={s.label} className="flex-1 text-center" style={{ borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                  <p className="text-xl font-black" style={{ color: s.color }}>{statsLoading ? '–' : s.value}</p>
                  <p className="text-[10px] font-semibold text-white/35 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Tab bar ── */}
        <div className="px-5 mb-4">
          <div className="flex gap-1 rounded-2xl p-1" style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
            {ACCOUNT_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className="flex-1 flex flex-col items-center gap-0.5 py-2 rounded-xl font-bold text-[11px] transition-all"
                style={{
                  backgroundColor: activeTab === tab.id ? '#22c55e' : 'transparent',
                  color: activeTab === tab.id ? '#fff' : 'rgba(255,255,255,0.4)',
                }}
              >
                <span style={{ fontSize: 15 }}>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── OVERVIEW TAB ── */}
        {activeTab === 'overview' && (
          <div className="px-5 flex flex-col gap-4">

            {/* Plan card */}
            <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: '#1a1a24', border: `1px solid ${tierInfo.color}30` }}>
              <div style={{ height: 3, background: `linear-gradient(90deg, ${tierInfo.color}, ${tierInfo.color}66)` }} />
              <div className="p-4">
                <p className="text-[10px] font-bold mb-3" style={{ color: 'rgba(255,255,255,0.35)', letterSpacing: '1.5px' }}>YOUR PLAN</p>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${tierInfo.color}18`, border: `1px solid ${tierInfo.color}35` }}>
                    <span style={{ fontSize: 20 }}>{tierInfo.icon}</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-base font-black" style={{ color: tierInfo.color }}>{tierInfo.label}</p>
                    <p className="text-xs text-white/40">{profile.tier === 'free' ? 'Free forever' : profile.tier === 'hunter' ? '$5 / month' : '$10 / month'}</p>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 mb-3">
                  {(profile.tier === 'free'
                    ? ['Real-time stock reports', 'Community leaderboard', 'Basic drink search']
                    : profile.tier === 'hunter'
                    ? ['Everything in Free', 'Extended 25 mile radius', 'Early stock alerts']
                    : ['Everything in Hunter', 'Community chat', 'Custom store lists', 'Verified reporter badge']
                  ).map((f) => (
                    <div key={f} className="flex items-center gap-2">
                      <span style={{ fontSize: 10, color: tierInfo.color }}>✓</span>
                      <span className="text-xs text-white/50">{f}</span>
                    </div>
                  ))}
                </div>
                {checkoutError && (
                  <p className="text-xs text-red-400 mb-2">{checkoutError}</p>
                )}
                {profile.tier === 'free' && (
                  <button onClick={() => startCheckout('hunter')} disabled={checkoutLoading} className="w-full rounded-xl py-2.5 text-sm font-black" style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#fff', boxShadow: '0 4px 12px rgba(34,197,94,0.25)', opacity: checkoutLoading ? 0.6 : 1 }}>
                    {checkoutLoading ? '...' : 'Upgrade to Hunter ⚡'}
                  </button>
                )}
                {profile.tier === 'hunter' && (
                  <div className="flex flex-col gap-2">
                    <button onClick={() => startCheckout('tracker')} disabled={checkoutLoading} className="w-full rounded-xl py-2.5 text-sm font-black" style={{ background: 'linear-gradient(135deg, #f97316, #ea6c0a)', color: '#fff', boxShadow: '0 4px 12px rgba(249,115,22,0.25)', opacity: checkoutLoading ? 0.6 : 1 }}>
                      {checkoutLoading ? '...' : 'Upgrade to Tracker 🔥'}
                    </button>
                    {cancelError && <p className="text-xs text-red-400">{cancelError}</p>}
                    <button onClick={cancelSubscription} disabled={cancelLoading} className="w-full rounded-xl py-2.5 text-sm font-bold" style={{ backgroundColor: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)', color: '#ef4444', opacity: cancelLoading ? 0.6 : 1 }}>
                      {cancelLoading ? 'Cancelling...' : 'Cancel Subscription'}
                    </button>
                  </div>
                )}
                {profile.tier === 'tracker' && (
                  <div className="flex flex-col gap-2">
                    {cancelError && <p className="text-xs text-red-400">{cancelError}</p>}
                    <button onClick={cancelSubscription} disabled={cancelLoading} className="w-full rounded-xl py-2.5 text-sm font-bold" style={{ backgroundColor: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)', color: '#ef4444', opacity: cancelLoading ? 0.6 : 1 }}>
                      {cancelLoading ? 'Cancelling...' : 'Cancel Subscription'}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Badges */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-bold" style={{ color: 'rgba(255,255,255,0.35)', letterSpacing: '1.5px' }}>BADGES</p>
                <p className="text-[10px] font-bold" style={{ color: 'rgba(255,255,255,0.25)' }}>{earned.size}/{BADGE_DEFS.length} earned</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {BADGE_DEFS.map((b) => {
                  const isEarned = earned.has(b.id)
                  const hint = progressHint(b.id)
                  return (
                    <div key={b.id} className="rounded-2xl p-3 flex flex-col items-center gap-1.5 text-center"
                      style={{ backgroundColor: isEarned ? 'rgba(255,255,255,0.05)' : '#1a1a24', border: isEarned ? `1px solid ${b.color}40` : '1px solid rgba(255,255,255,0.06)', boxShadow: isEarned ? `0 0 16px ${b.glow}` : 'none', opacity: isEarned ? 1 : 0.45 }}>
                      <span style={{ fontSize: 22, filter: isEarned ? 'none' : 'grayscale(1)' }}>{b.icon}</span>
                      <p className="text-[11px] font-black leading-tight" style={{ color: isEarned ? b.color : 'rgba(255,255,255,0.5)' }}>{b.name}</p>
                      <p className="text-[9px] leading-tight" style={{ color: 'rgba(255,255,255,0.3)' }}>{hint ?? b.desc}</p>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Recent reports preview */}
            {recentReports.length > 0 && (
              <div className="rounded-2xl p-4" style={{ backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] font-bold" style={{ color: 'rgba(255,255,255,0.35)', letterSpacing: '1.5px' }}>RECENT REPORTS</p>
                  <button onClick={() => setActiveTab('reports')} className="text-xs font-bold" style={{ color: '#22c55e' }}>See all →</button>
                </div>
                <div className="flex flex-col gap-2">
                  {recentReports.slice(0, 3).map((r) => {
                    const drink = r.drink as any
                    const store = r.store as any
                    const drinkLabel = [drink?.brand, drink?.flavor ?? drink?.name].filter(Boolean).join(' ')
                    const q = QUANTITY_CONFIG[r.quantity as string] ?? QUANTITY_CONFIG.full
                    return (
                      <div key={r.id} className="flex items-center gap-3 px-1 py-1.5 rounded-xl">
                        <div className="px-2 py-0.5 rounded-full shrink-0" style={{ backgroundColor: q.bg, border: `1px solid ${q.border}` }}>
                          <span className="text-[10px] font-black" style={{ color: q.color }}>{q.label}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-white truncate">{drinkLabel || 'Unknown drink'}</p>
                          <p className="text-xs text-white/40 truncate">{store?.name ?? 'Unknown store'}</p>
                        </div>
                        <p className="text-[10px] text-white/30 shrink-0">{timeAgo(r.reported_at)}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── LISTS TAB ── */}
        {activeTab === 'lists' && (
          <div>
            <div className="flex items-center justify-between px-5 mb-3">
              <p className="text-[10px] font-bold" style={{ color: 'rgba(255,255,255,0.35)', letterSpacing: '1.5px' }}>MY LISTS</p>
              <button onClick={() => activeList ? setActiveList(null) : setShowNewList((v) => !v)} className="text-xs font-bold px-3 py-1 rounded-full"
                style={{ backgroundColor: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.3)', color: '#a78bfa' }}>
                {activeList ? '← Back' : '+ New'}
              </button>
            </div>
            {showNewList && !activeList && (
              <div className="mx-5 mb-3 rounded-2xl p-4" style={{ backgroundColor: '#1a1a24', border: '1px solid rgba(139,92,246,0.3)' }}>
                <input type="text" className="w-full rounded-xl px-3.5 py-2.5 text-sm text-white outline-none mb-3"
                  style={{ backgroundColor: '#070710', border: '1px solid rgba(255,255,255,0.07)' }}
                  placeholder="List name (e.g. Celsius Spots)" value={newListName}
                  onChange={(e) => setNewListName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') createList() }} autoFocus />
                <div className="flex gap-2">
                  <button onClick={() => { setShowNewList(false); setNewListName('') }} className="flex-1 rounded-xl py-2 text-sm font-semibold" style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}>Cancel</button>
                  <button onClick={createList} disabled={!newListName.trim() || creatingList} className="flex-1 rounded-xl py-2 text-sm font-bold text-black" style={{ backgroundColor: !newListName.trim() || creatingList ? 'rgba(139,92,246,0.4)' : '#a78bfa' }}>
                    {creatingList ? '...' : 'Create'}
                  </button>
                </div>
              </div>
            )}
            {listsLoading ? (
              <div className="flex justify-center py-4"><div className="w-6 h-6 border-2 border-[#a78bfa] border-t-transparent rounded-full animate-spin" /></div>
            ) : activeList ? (
              listStoresLoading ? (
                <div className="flex justify-center py-4"><div className="w-6 h-6 border-2 border-[#a78bfa] border-t-transparent rounded-full animate-spin" /></div>
              ) : listStores.length === 0 ? (
                <div className="mx-5 rounded-2xl p-5 flex flex-col items-center gap-2" style={{ backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <span style={{ fontSize: 28 }}>📭</span>
                  <p className="text-sm font-bold text-white">No stores in this list</p>
                  <p className="text-xs text-white/40 text-center">Go to a store and tap 📑 to add it.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2 px-5">
                  {listStores.map((ls: any) => {
                    const store = ls.store
                    return (
                      <div key={ls.id} className="rounded-2xl p-3.5 flex items-center gap-3" style={{ backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.07)' }}>
                        <span style={{ fontSize: 20 }}>{TYPE_ICON[store?.type] ?? '📍'}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-white truncate">{store?.name}</p>
                          <p className="text-xs text-white/40 truncate">{store?.address}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <a href={`/store/${store.id}?name=${encodeURIComponent(store.name)}`} className="text-xs font-bold px-2.5 py-1.5 rounded-xl" style={{ backgroundColor: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)', color: '#22c55e' }}>View</a>
                          <button onClick={() => removeFromList(ls.id)} disabled={!!removingStoreId} className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', opacity: removingStoreId === ls.id ? 0.4 : 1 }}>
                            {removingStoreId === ls.id ? <div className="w-3 h-3 border border-red-400 border-t-transparent rounded-full animate-spin" /> : <span className="text-[10px]" style={{ color: '#ef4444' }}>✕</span>}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            ) : lists.length === 0 ? (
              <div className="mx-5 rounded-2xl p-5 flex flex-col items-center gap-2" style={{ backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.07)' }}>
                <span style={{ fontSize: 28 }}>📑</span>
                <p className="text-sm font-bold text-white">No lists yet</p>
                <p className="text-xs text-white/40 text-center">Create a list to organize your store spots.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2 px-5">
                {lists.map((list) => {
                  const count = list.list_stores?.[0]?.count ?? 0
                  return (
                    <div key={list.id} className="rounded-2xl p-3.5 flex items-center gap-3 cursor-pointer" style={{ backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.07)' }} onClick={() => openList(list)}>
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.25)' }}>
                        <span style={{ fontSize: 16 }}>📑</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white truncate">{list.name}</p>
                        <p className="text-xs text-white/40">{count} store{count !== 1 ? 's' : ''}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-white/30 text-sm">›</span>
                        <button onClick={(e) => { e.stopPropagation(); deleteList(list.id) }} disabled={!!deletingListId} className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', opacity: deletingListId === list.id ? 0.4 : 1 }}>
                          {deletingListId === list.id ? <div className="w-3 h-3 border border-red-400 border-t-transparent rounded-full animate-spin" /> : <span className="text-[10px]" style={{ color: '#ef4444' }}>✕</span>}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── REPORTS TAB ── */}
        {activeTab === 'reports' && (
          <div className="px-5">
            <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="flex items-center justify-between p-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div>
                  <p className="text-sm font-black text-white">My Reports</p>
                  <p className="text-xs text-white/40 mt-0.5">{reportCount} total submissions</p>
                </div>
                {profile.is_verified_reporter && (
                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-full" style={{ backgroundColor: 'rgba(59,130,246,0.1)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.25)' }}>✓ VERIFIED</span>
                )}
              </div>
              {allReportsLoading && allReports.length === 0 ? (
                <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 border-[#22c55e] border-t-transparent rounded-full animate-spin" /></div>
              ) : allReports.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10">
                  <span style={{ fontSize: 32 }}>📋</span>
                  <p className="text-sm text-white/40">No reports yet</p>
                </div>
              ) : (
                <div>
                  {allReports.map((r) => {
                    const drink = r.drink as any
                    const store = r.store as any
                    const drinkLabel = [drink?.brand, drink?.flavor ?? drink?.name].filter(Boolean).join(' ')
                    const q = QUANTITY_CONFIG[r.quantity as string] ?? QUANTITY_CONFIG.full
                    return (
                      <div key={r.id} className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: q.bg, border: `1px solid ${q.border}` }}>
                          <span className="text-[10px] font-black" style={{ color: q.color }}>{q.label}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-white truncate">{drinkLabel || 'Unknown drink'}</p>
                          <p className="text-xs text-white/40 truncate">{store?.name ?? 'Unknown store'}</p>
                        </div>
                        <p className="text-[10px] text-white/30 shrink-0">{timeAgo(r.reported_at)}</p>
                      </div>
                    )
                  })}
                  {allReportsHasMore && (
                    <button
                      onClick={() => fetchAllReports(allReportsPage + 1)}
                      disabled={allReportsLoading}
                      className="w-full py-3 text-sm font-bold"
                      style={{ color: allReportsLoading ? 'rgba(255,255,255,0.2)' : '#22c55e' }}
                    >
                      {allReportsLoading ? 'Loading…' : 'Load more'}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── SETTINGS TAB ── */}
        {activeTab === 'settings' && (
          <div className="px-5 flex flex-col gap-4">

            {/* Profile */}
            <div className="rounded-2xl p-4" style={{ backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-[10px] font-bold mb-4" style={{ color: 'rgba(255,255,255,0.35)', letterSpacing: '1.5px' }}>PROFILE</p>

              {editingUsername ? (
                <div className="mb-4">
                  <p className="text-[10px] font-bold text-white/35 mb-2" style={{ letterSpacing: '1.5px' }}>NEW USERNAME</p>
                  <input type="text" className="w-full rounded-xl px-3.5 py-2.5 text-sm text-white outline-none mb-2"
                    style={{ backgroundColor: '#070710', border: '1px solid rgba(255,255,255,0.1)' }}
                    placeholder={profile.username} value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} autoFocus />
                  {usernameError && <p className="text-xs text-red-400 mb-2">{usernameError}</p>}
                  <div className="flex gap-2">
                    <button onClick={() => { setEditingUsername(false); setNewUsername(''); setUsernameError(null) }} className="flex-1 rounded-xl py-2.5 text-sm font-bold" style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}>Cancel</button>
                    <button onClick={saveUsername} disabled={savingUsername || !newUsername.trim()} className="flex-1 rounded-xl py-2.5 text-sm font-bold text-black" style={{ backgroundColor: savingUsername || !newUsername.trim() ? 'rgba(34,197,94,0.4)' : '#22c55e' }}>
                      {savingUsername ? '...' : 'Save Username'}
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => { setEditingUsername(true); setNewUsername('') }} className="w-full rounded-xl py-3 text-sm font-bold text-left px-4 mb-3"
                  style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)' }}>
                  ✏️ Change Username
                  <span className="float-right text-white/25">@{profile.username}</span>
                </button>
              )}

              {changingPassword ? (
                <div>
                  <p className="text-[10px] font-bold text-white/35 mb-2" style={{ letterSpacing: '1.5px' }}>NEW PASSWORD</p>
                  <input type="password" className="w-full rounded-xl px-3.5 py-2.5 text-sm text-white outline-none mb-2"
                    style={{ backgroundColor: '#070710', border: '1px solid rgba(255,255,255,0.1)' }}
                    placeholder="New password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoFocus />
                  <input type="password" className="w-full rounded-xl px-3.5 py-2.5 text-sm text-white outline-none mb-2"
                    style={{ backgroundColor: '#070710', border: '1px solid rgba(255,255,255,0.1)' }}
                    placeholder="Confirm password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                  {passwordError && <p className="text-xs text-red-400 mb-2">{passwordError}</p>}
                  {passwordSuccess && <p className="text-xs mb-2" style={{ color: '#22c55e' }}>Password updated!</p>}
                  <div className="flex gap-2">
                    <button onClick={() => { setChangingPassword(false); setNewPassword(''); setConfirmPassword(''); setPasswordError(null) }} className="flex-1 rounded-xl py-2.5 text-sm font-bold" style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}>Cancel</button>
                    <button onClick={savePassword} disabled={savingPassword} className="flex-1 rounded-xl py-2.5 text-sm font-bold text-black" style={{ backgroundColor: savingPassword ? 'rgba(34,197,94,0.4)' : '#22c55e' }}>
                      {savingPassword ? '...' : 'Save Password'}
                    </button>
                  </div>
                </div>
              ) : !editingUsername && (
                <button onClick={() => setChangingPassword(true)} className="w-full rounded-xl py-3 text-sm font-bold text-left px-4"
                  style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)' }}>
                  🔑 Change Password
                </button>
              )}
            </div>

            {/* Notifications */}
            <div className="rounded-2xl p-4" style={{ backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-[10px] font-bold mb-4" style={{ color: 'rgba(255,255,255,0.35)', letterSpacing: '1.5px' }}>NOTIFICATIONS</p>
              {[
                { label: 'Flavor alerts', desc: 'Notify when a saved drink is spotted nearby', value: notifFlavors, set: setNotifFlavors },
                { label: 'Location alerts', desc: 'Alerts based on your current location', value: notifLocation, set: setNotifLocation },
                { label: 'Weekly email digest', desc: 'Summary of stock reports in your area', value: notifEmail, set: setNotifEmail },
              ].map((item, i) => (
                <div key={item.label} className="flex items-center justify-between py-3" style={{ borderBottom: i < 2 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                  <div className="flex-1 min-w-0 pr-4">
                    <p className="text-sm font-bold text-white">{item.label}</p>
                    <p className="text-xs text-white/35 mt-0.5">{item.desc}</p>
                  </div>
                  <button
                    onClick={() => item.set(!item.value)}
                    className="shrink-0 rounded-full"
                    style={{ width: 44, height: 24, backgroundColor: item.value ? '#22c55e' : 'rgba(255,255,255,0.1)', position: 'relative', transition: 'background 0.2s' }}
                  >
                    <div style={{ position: 'absolute', top: 2, left: item.value ? 22 : 2, width: 20, height: 20, borderRadius: '50%', backgroundColor: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }} />
                  </button>
                </div>
              ))}
            </div>

            {/* Sign out */}
            <button onClick={handleSignOut} className="w-full rounded-2xl py-3.5 text-sm font-bold" style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
              Sign Out
            </button>

            {/* Danger zone */}
            <div className="rounded-2xl p-4" style={{ backgroundColor: '#1a1a24', border: '1px solid rgba(239,68,68,0.12)' }}>
              <p className="text-[10px] font-bold mb-3" style={{ color: 'rgba(239,68,68,0.5)', letterSpacing: '1.5px' }}>DANGER ZONE</p>
              <button onClick={deleteAccount} className="w-full rounded-xl py-3 text-sm font-bold" style={{ backgroundColor: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)', color: '#ef4444' }}>
                Delete Account
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── LOGGED OUT ─────────────────────────────────────────────
  const tier = TIERS.find((t) => t.id === selectedTier) ?? TIERS[0]

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#070710', color: '#fff', overflowX: 'hidden', paddingTop: 'calc(56px + env(safe-area-inset-top))' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&family=Bebas+Neue&display=swap');
        * { box-sizing: border-box; }
        .em-input { outline: none; transition: border-color 0.2s ease; font-family: 'DM Sans', system-ui, sans-serif; }
        .em-input:focus { border-color: #22c55e !important; }
        .em-input::placeholder { color: rgba(255,255,255,0.2); }
        .tier-card { transition: transform 0.2s ease, box-shadow 0.2s ease; cursor: pointer; }
        .tier-card:hover { transform: translateY(-4px); }
        .tier-coming { cursor: default !important; }
        .tier-coming:hover { transform: none !important; }
        .cta-btn { transition: opacity 0.15s ease, transform 0.15s ease; }
        .cta-btn:hover { opacity: 0.88; transform: translateY(-1px); }
        .cta-btn:active { transform: translateY(0); }
        .how-card { transition: border-color 0.2s ease, transform 0.2s ease; }
        .how-card:hover { border-color: rgba(34,197,94,0.25) !important; transform: translateY(-2px); }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-8px); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* Background */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, background: 'radial-gradient(ellipse 60% 40% at 20% 20%, rgba(34,197,94,0.06) 0%, transparent 60%), radial-gradient(ellipse 50% 40% at 80% 80%, rgba(249,115,22,0.05) 0%, transparent 60%)', pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)', backgroundSize: '40px 40px', pointerEvents: 'none' }} />

      <div style={{ position: 'relative', zIndex: 1, fontFamily: "'DM Sans', system-ui, sans-serif" }}>

        {/* ── HERO ── */}
        <div style={{ textAlign: 'center', padding: '48px 24px 40px', animation: 'fadeUp 0.6s ease' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <span style={{ fontSize: 40, display: 'inline-block', animation: 'float 3s ease-in-out infinite' }}>⚡</span>
            <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 48, letterSpacing: 3, background: 'linear-gradient(135deg, #22c55e, #4ade80)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Amped Map</span>
          </div>
          <h1 style={{ fontSize: 'clamp(26px, 5vw, 44px)', fontWeight: 900, lineHeight: 1.15, marginBottom: 16, letterSpacing: '-0.5px' }}>
            Never Hunt for Your<br />
            <span style={{ background: 'linear-gradient(135deg, #22c55e, #4ade80)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Favorite Energy Drink</span> Again
          </h1>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.5)', maxWidth: 480, margin: '0 auto 28px', lineHeight: 1.7 }}>
            The crowdsourced platform that tracks real-time energy drink stock at stores near you. Find Celsius, Ghost, Alani Nu, Red Bull and more — before you leave the house.
          </p>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, backgroundColor: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 20, padding: '6px 16px', marginBottom: 36 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: '#22c55e', animation: 'pulse 2s ease-in-out infinite' }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: '#22c55e', letterSpacing: 0.5 }}>LIVE STOCK UPDATES</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 10, maxWidth: 560, margin: '0 auto' }}>
            {STATS.map((s, i) => (
              <div key={i} style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '12px 20px', animation: `fadeUp 0.5s ease ${i * 0.1}s both` }}>
                <div style={{ fontSize: 20, fontWeight: 900, color: '#fff' }}>{s.value}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2, fontWeight: 600, letterSpacing: 0.5 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── HOW IT WORKS ── */}
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 24px 56px', animation: 'fadeUp 0.6s ease 0.2s both' }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{ display: 'inline-block', backgroundColor: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 20, padding: '4px 14px', marginBottom: 12 }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: '#22c55e', letterSpacing: 1.5 }}>HOW IT WORKS</span>
            </div>
            <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, letterSpacing: 2, marginBottom: 8 }}>Built by Energy Drink Fans, for Energy Drink Fans</h2>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', maxWidth: 460, margin: '0 auto', lineHeight: 1.7 }}>
              We know the frustration of driving to three stores for one flavor. Amped Map solves that — powered by a community just like you.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 40 }}>
            {HOW_IT_WORKS.map((item, i) => (
              <div key={i} className="how-card" style={{ backgroundColor: '#0f0f1a', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '18px 16px', animation: `fadeUp 0.5s ease ${i * 0.1}s both` }}>
                <div style={{ fontSize: 26, marginBottom: 10 }}>{item.icon}</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', marginBottom: 6 }}>{item.title}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6 }}>{item.desc}</div>
              </div>
            ))}
          </div>
          <div style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.06) 0%, rgba(168,85,247,0.06) 100%)', border: '1px solid rgba(34,197,94,0.15)', borderRadius: 20, padding: '28px 32px', textAlign: 'center' }}>
            <span style={{ fontSize: 28, marginBottom: 12, display: 'block' }}>🎯</span>
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 10, color: '#fff' }}>Our Mission</h3>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', maxWidth: 520, margin: '0 auto', lineHeight: 1.8 }}>
              Energy drink culture is exploding — new flavors drop constantly, stores sell out fast, and fans are left empty-handed. Amped Map gives the community a single place to share, discover, and track stock so no one misses out.
            </p>
          </div>
        </div>

        {/* ── BRANDS ── */}
        <div style={{ textAlign: 'center', padding: '0 24px 48px', animation: 'fadeUp 0.6s ease 0.3s both' }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.25)', letterSpacing: 2, marginBottom: 16 }}>TRACKING YOUR FAVORITE BRANDS</p>
          <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 10 }}>
            {[
              { name: 'Celsius', color: '#7c3aed' },
              { name: 'Ghost Energy', color: '#06b6d4' },
              { name: 'Alani Nu', color: '#ec4899' },
              { name: 'Red Bull', color: '#e63946' },
              { name: 'Monster', color: '#00cc44' },
              { name: 'Rockstar', color: '#facc15' },
            ].map((brand, i) => (
              <div key={i} style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: `1px solid ${brand.color}33`, borderRadius: 20, padding: '7px 18px', fontSize: 12, fontWeight: 700, color: brand.color }}>
                {brand.name}
              </div>
            ))}
          </div>
        </div>

        {/* ── DIVIDER ── */}
        <div style={{ maxWidth: 900, margin: '0 auto 40px', padding: '0 24px' }}>
          <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)' }} />
        </div>

        {/* ── MODE TABS ── */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
          <div style={{ display: 'flex', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 14, padding: 4, border: '1px solid rgba(255,255,255,0.08)' }}>
            {(['signup', 'signin'] as Mode[]).map((m) => (
              <button key={m} onClick={() => switchMode(m)}
                style={{ padding: '10px 28px', borderRadius: 10, border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", backgroundColor: mode === m ? '#22c55e' : 'transparent', color: mode === m ? '#fff' : 'rgba(255,255,255,0.4)', transition: 'all 0.2s ease' }}>
                {m === 'signup' ? 'Sign Up' : 'Sign In'}
              </button>
            ))}
          </div>
        </div>

        {/* ── SIGN IN ── */}
        {mode === 'signin' && (
          <div style={{ maxWidth: 400, margin: '0 auto', padding: '0 24px 60px', animation: 'fadeUp 0.5s ease' }}>
            <div style={{ backgroundColor: '#0f0f1a', borderRadius: 20, padding: 28, border: '1px solid rgba(255,255,255,0.08)' }}>
              <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>Welcome back</h2>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 24 }}>Sign in to your Amped Map account</p>
              <form onSubmit={handleSignIn} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: 1.2, display: 'block', marginBottom: 8 }}>EMAIL</label>
                  <input className="em-input" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required
                    style={{ width: '100%', padding: '13px 16px', backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, color: '#fff', fontSize: 15 }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: 1.2, display: 'block', marginBottom: 8 }}>PASSWORD</label>
                  <div style={{ position: 'relative' }}>
                    <input className="em-input" type={showPassword ? 'text' : 'password'} placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required
                      style={{ width: '100%', padding: '13px 48px 13px 16px', backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, color: '#fff', fontSize: 15 }} />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: 16 }}>
                      {showPassword ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>
                <div style={{ textAlign: 'right', marginTop: -6 }}>
                  <button type="button" onClick={handleForgotPassword} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', cursor: 'pointer', fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>
                    Forgot password?
                  </button>
                </div>
                {resetSent && <p style={{ fontSize: 13, color: '#22c55e', textAlign: 'center' }}>Reset link sent — check your email.</p>}
                {error && <p style={{ fontSize: 13, color: '#f87171' }}>{error}</p>}
                <button type="submit" className="cta-btn" disabled={submitting}
                  style={{ width: '100%', padding: 15, background: 'linear-gradient(135deg, #22c55e, #16a34a)', border: 'none', borderRadius: 14, color: '#fff', fontSize: 16, fontWeight: 800, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", boxShadow: '0 8px 24px rgba(34,197,94,0.25)' }}>
                  {submitting ? <div style={{ width: 20, height: 20, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} /> : 'Sign In →'}
                </button>
              </form>
              <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>
                Don't have an account?{' '}
                <button onClick={() => switchMode('signup')} style={{ background: 'none', border: 'none', color: '#22c55e', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13 }}>Sign up free</button>
              </p>
            </div>
          </div>
        )}

        {/* ── SIGN UP STEP 1 — choose plan ── */}
        {mode === 'signup' && step === 1 && (
          <div style={{ maxWidth: 760, margin: '0 auto', padding: '0 24px 60px', animation: 'fadeUp 0.5s ease' }}>
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 30, letterSpacing: 2, marginBottom: 6 }}>Choose Your Plan</h2>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>Start free, upgrade anytime</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14 }}>
              {TIERS.map((t, i) => (
                <div key={t.id}
                  className={t.comingSoon ? 'tier-card tier-coming' : 'tier-card'}
                  style={{ backgroundColor: '#0f0f1a', borderRadius: 20, border: `1.5px solid ${t.comingSoon ? 'rgba(249,115,22,0.2)' : 'rgba(255,255,255,0.07)'}`, position: 'relative', animation: `fadeUp 0.5s ease ${i * 0.08}s both`, opacity: t.comingSoon ? 0.82 : 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
                >
                  <div style={{ height: 4, background: `linear-gradient(90deg, ${t.color}, ${t.color}88)` }} />
                  {t.tag && (
                    <div style={{ position: 'absolute', top: 16, right: 14, backgroundColor: t.comingSoon ? 'rgba(249,115,22,0.85)' : t.color, borderRadius: 20, padding: '3px 10px', fontSize: 9, fontWeight: 800, letterSpacing: 1.2, color: '#fff', whiteSpace: 'nowrap' }}>{t.tag}</div>
                  )}
                  <div style={{ padding: '18px 18px 16px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: 24, marginBottom: 6, display: 'block' }}>{t.icon}</span>
                    <span style={{ fontSize: 16, fontWeight: 800, color: t.color, display: 'block', marginBottom: 2 }}>{t.name}</span>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 2, marginBottom: 14 }}>
                      <span style={{ fontSize: 28, fontWeight: 900, color: '#fff' }}>{t.price}</span>
                      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>{t.period}</span>
                    </div>
                    {t.id === 'tracker' && (() => {
                      const BETA_LIMIT = 50
                      const remaining = Math.max(0, BETA_LIMIT - betaCount)
                      const spotsLeft = remaining > 0
                      return (
                        <div style={{ backgroundColor: 'rgba(249,115,22,0.07)', border: '1px dashed rgba(249,115,22,0.35)', borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>
                          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, marginBottom: 8 }}>
                            {spotsLeft
                              ? `🔥 First 50 beta users get Tracker free. Only ${remaining} spot${remaining !== 1 ? 's' : ''} left!`
                              : '🔒 Beta is full. Tracker is $10/mo.'}
                          </p>
                          <div style={{ height: 4, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${Math.min((betaCount / BETA_LIMIT) * 100, 100)}%`, background: 'linear-gradient(90deg, #f97316, #fb923c)', borderRadius: 4, transition: 'width 0.5s ease' }} />
                          </div>
                          <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 5 }}>{betaCount} / {BETA_LIMIT} beta spots claimed</p>
                        </div>
                      )
                    })()}
                    {t.comingSoon && t.description && (
                      <div style={{ backgroundColor: 'rgba(249,115,22,0.07)', border: '1px dashed rgba(249,115,22,0.35)', borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>
                        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>{t.description}</p>
                      </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7, opacity: t.comingSoon ? 0.35 : 1, flex: 1 }}>
                      {/* Inheritance banner */}
                      {t.inherits && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '6px 10px', marginBottom: 4 }}>
                          <span style={{ fontSize: 10 }}>⬆️</span>
                          <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: 0.3 }}>
                            Includes everything in <span style={{ color: '#fff' }}>{t.inherits}</span>, plus:
                          </span>
                        </div>
                      )}
                      {t.features.map((f, fi) => (
                        <div key={fi} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                          <span style={{ color: t.color, fontSize: 11, marginTop: 2, flexShrink: 0 }}>✓</span>
                          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', lineHeight: 1.4 }}>{f}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: 18 }}>
                      {t.comingSoon ? (
                        <div style={{ width: '100%', padding: 12, background: 'rgba(249,115,22,0.08)', border: '1px dashed rgba(249,115,22,0.3)', borderRadius: 12, textAlign: 'center', fontSize: 12, fontWeight: 700, color: 'rgba(249,115,22,0.6)' }}>
                          Notify Me When Available
                        </div>
                      ) : t.id === 'tracker' && betaCount >= 50 ? (
                        <button className="cta-btn" onClick={() => selectAndContinue(t.id)}
                          style={{ width: '100%', padding: 12, background: 'linear-gradient(135deg, #a855f7, #7c3aed)', border: 'none', borderRadius: 12, color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", boxShadow: '0 4px 16px rgba(168,85,247,0.3)' }}>
                          Buy Tracker — $10/mo →
                        </button>
                      ) : (
                        <button className="cta-btn" onClick={() => selectAndContinue(t.id)}
                          style={{ width: '100%', padding: 12, background: `linear-gradient(135deg, ${t.color}, ${t.color}bb)`, border: 'none', borderRadius: 12, color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", boxShadow: `0 4px 16px ${t.glow}` }}>
                          {t.id === 'tracker' ? 'Claim Beta Spot →' : 'Get Started →'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p style={{ textAlign: 'center', marginTop: 20, fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>
              All paid plans can be cancelled anytime · No hidden fees
            </p>
          </div>
        )}

        {/* ── SIGN UP STEP 2 — create account ── */}
        {mode === 'signup' && step === 2 && (
          <div style={{ maxWidth: 420, margin: '0 auto', padding: '0 24px 60px', animation: 'fadeUp 0.5s ease' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 24 }}>
              <button onClick={() => setStep(1)} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '4px 10px', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>← Back</button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.05)', border: `1px solid ${tier.border}`, borderRadius: 20, padding: '6px 16px' }}>
                <span style={{ fontSize: 14 }}>{tier.icon}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: tier.color }}>{tier.name}</span>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>{tier.price}{tier.period}</span>
              </div>
            </div>
            <div style={{ backgroundColor: '#0f0f1a', borderRadius: 20, padding: 28, border: '1px solid rgba(255,255,255,0.08)' }}>
              <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>Create your account</h2>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 24 }}>Join the Amped Map community</p>
              <form onSubmit={handleSignUp} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: 1.2, display: 'block', marginBottom: 8 }}>USERNAME</label>
                  <input className="em-input" type="text" placeholder="yourname" value={username} onChange={(e) => { setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '')); setError(null) }} required
                    style={{ width: '100%', padding: '13px 16px', backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, color: '#fff', fontSize: 15 }} />
                  <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', marginTop: 6 }}>Letters, numbers, underscores only</p>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: 1.2, display: 'block', marginBottom: 8 }}>EMAIL</label>
                  <input className="em-input" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required
                    style={{ width: '100%', padding: '13px 16px', backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, color: '#fff', fontSize: 15 }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: 1.2, display: 'block', marginBottom: 8 }}>PASSWORD</label>
                  <div style={{ position: 'relative' }}>
                    <input className="em-input" type={showPassword ? 'text' : 'password'} placeholder="Min. 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} required
                      style={{ width: '100%', padding: '13px 48px 13px 16px', backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, color: '#fff', fontSize: 15 }} />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: 16 }}>
                      {showPassword ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>
                {error && <p style={{ fontSize: 13, color: '#f87171' }}>{error}</p>}
                {confirmEmail && (
                  <div style={{ backgroundColor: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 12, padding: 14 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#22c55e' }}>Check your email to confirm your account, then sign in.</p>
                  </div>
                )}
                <button type="submit" className="cta-btn" disabled={submitting || confirmEmail}
                  style={{ width: '100%', padding: 15, background: `linear-gradient(135deg, ${tier.color}, ${tier.color}cc)`, border: 'none', borderRadius: 14, color: '#fff', fontSize: 16, fontWeight: 800, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", boxShadow: `0 8px 24px ${tier.glow}`, marginTop: 4 }}>
                  {submitting
                    ? <div style={{ width: 20, height: 20, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
                    : selectedTier === 'free' ? 'Create Free Account →' : selectedTier === 'tracker' ? (betaCount < 50 ? 'Claim Beta Spot →' : 'Buy Tracker →') : 'Get Started →'}
                </button>
                <p style={{ textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.2)', lineHeight: 1.6 }}>
                  By signing up you agree to our Terms of Service and Privacy Policy.
                </p>
              </form>
              <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>
                Already have an account?{' '}
                <button onClick={() => switchMode('signin')} style={{ background: 'none', border: 'none', color: '#22c55e', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13 }}>Sign in</button>
              </p>
            </div>
          </div>
        )}

        {/* ── FOOTER ── */}
        <div style={{ textAlign: 'center', padding: '28px 24px 48px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 16 }}>⚡</span>
            <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, letterSpacing: 2, color: 'rgba(255,255,255,0.3)' }}>Amped Map</span>
          </div>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>Built for the community · Powered by real-time reports</p>
        </div>
      </div>
    </div>
  )
}

export default function AccountPage() {
  return <Suspense><AccountPageInner /></Suspense>
}
