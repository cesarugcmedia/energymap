'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import Toast from '@/components/Toast'
import { StoreTypeIcon, CheckIcon, BellIcon, HeartIcon, CloseIcon, MailIcon, TiktokIcon, ChevronLeftIcon, ChevronRightIcon, LightningIcon, TrophyIcon, DrinkIcon, UserIcon, ClipboardIcon } from '@/components/Icons'

type Mode = 'signin' | 'signup'
type TierId = 'free' | 'tracker'

const BADGE_DEFS = [
  { id: 'early_adopter',   icon: '🌟', name: 'Early Adopter',   desc: 'Joined in the founding era',          color: '#f59e0b', glow: 'rgba(245,158,11,0.25)'  },
  { id: 'first_report',    icon: '⚡', name: 'First Report',    desc: 'Submitted your first stock report',   color: '#C9F400', glow: 'rgba(201,244,0,0.25)'   },
  { id: 'reporter_10',     icon: '📊', name: 'Reporter',        desc: '10 stock reports submitted',          color: '#C9F400', glow: 'rgba(201,244,0,0.25)'   },
  { id: 'reporter_50',     icon: '🏆', name: 'Veteran',         desc: '50 stock reports submitted',          color: '#f97316', glow: 'rgba(249,115,22,0.25)'  },
  { id: 'reporter_100',    icon: '💎', name: 'Elite',           desc: '100 stock reports submitted',         color: '#a855f7', glow: 'rgba(168,85,247,0.25)'  },
  { id: 'reporter_200',    icon: '📈', name: 'Dedicated',       desc: '200 stock reports submitted',         color: '#f97316', glow: 'rgba(249,115,22,0.25)'  },
  { id: 'reporter_500',    icon: '🚀', name: 'Legend',          desc: '500 stock reports submitted',         color: '#ec4899', glow: 'rgba(236,72,153,0.25)'  },
  { id: 'scout',           icon: '📍', name: 'Scout',           desc: 'Added your first approved store',     color: '#3b82f6', glow: 'rgba(59,130,246,0.25)'  },
  { id: 'pathfinder',      icon: '🗺️', name: 'Pathfinder',     desc: 'Added 5 approved stores',             color: '#06b6d4', glow: 'rgba(6,182,212,0.25)'   },
  { id: 'store_builder',   icon: '🏗️', name: 'Builder',        desc: 'Added 10 approved stores',            color: '#f59e0b', glow: 'rgba(245,158,11,0.25)'  },
  { id: 'flavor_hunter',   icon: '🎯', name: 'Flavor Hunter',  desc: 'Reported 5 different drinks',         color: '#ec4899', glow: 'rgba(236,72,153,0.25)'  },
  { id: 'flavor_master',   icon: '🧪', name: 'Connoisseur',    desc: 'Reported 20 different drinks',        color: '#a855f7', glow: 'rgba(168,85,247,0.25)'  },
  { id: 'on_fire',         icon: '🔥', name: 'On Fire',        desc: '3-day reporting streak',              color: '#f97316', glow: 'rgba(249,115,22,0.25)'  },
  { id: 'unstoppable',     icon: '💥', name: 'Unstoppable',    desc: '7-day reporting streak',              color: '#ef4444', glow: 'rgba(239,68,68,0.25)'   },
  { id: 'night_owl',       icon: '🦉', name: 'Night Owl',      desc: 'Submitted a report after midnight',   color: '#818cf8', glow: 'rgba(129,140,248,0.25)' },
  { id: 'early_bird',      icon: '🐦', name: 'Early Bird',     desc: 'Submitted a report before 7am',      color: '#fbbf24', glow: 'rgba(251,191,36,0.25)'  },
  { id: 'verified',        icon: '✅', name: 'Verified',        desc: 'Trusted community reporter',         color: '#60a5fa', glow: 'rgba(96,165,250,0.25)'  },
  { id: 'weekly_champion', icon: '👑', name: 'Weekly Champion', desc: 'Top reporter of the week',           color: '#ffd700', glow: 'rgba(255,215,0,0.25)'   },
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
    window.location.href = '/'
  }

  return (
    <div style={{ height: '100%', backgroundColor: 'var(--bg)', paddingLeft: 20, paddingRight: 20, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingBottom: 'calc(70px + env(safe-area-inset-bottom))' }}>
      <p style={{ fontSize: 24, fontWeight: 900, color: 'var(--text)', marginBottom: 4, fontFamily: "'Barlow Condensed', sans-serif", textTransform: 'uppercase', letterSpacing: '0.02em' }}>One more step</p>
      <p style={{ fontSize: 12, color: '#7A8F80', marginBottom: 24 }}>Pick a username for your account ({email})</p>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, color: '#4A5F50', marginBottom: 8, letterSpacing: '0.14em', fontFamily: "'Barlow Condensed', sans-serif", textTransform: 'uppercase' }}>Username</p>
          <input
            type="text"
            style={{ width: '100%', borderRadius: 14, padding: '14px 16px', fontSize: 14, color: 'var(--text)', outline: 'none', backgroundColor: 'var(--surface)', border: '1px solid rgba(201,244,0,0.12)', fontFamily: "'Barlow', sans-serif" }}
            placeholder="yourname"
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
            autoFocus
          />
          <p style={{ fontSize: 10, color: '#4A5F50', marginTop: 6 }}>Lowercase letters, numbers, underscores only</p>
        </div>
        {error && <p style={{ fontSize: 13, color: '#FF4545' }}>{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          style={{ width: '100%', borderRadius: 14, padding: 16, fontWeight: 800, color: '#0D1210', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.08em', textTransform: 'uppercase', backgroundColor: submitting ? 'rgba(201,244,0,0.4)' : '#C9F400', boxShadow: submitting ? 'none' : '0 0 20px rgba(201,244,0,0.35)' }}
        >
          {submitting
            ? <div style={{ width: 20, height: 20, border: '2px solid #0D1210', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
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
      '5 mile map radius',
      'View stock reports',
      'Submit stock reports (25/day)',
      'Add missing stores (10/day)',
      'Add new drinks (25/day)',
      'Community leaderboard',
    ],
  },
  {
    id: 'tracker' as TierId,
    name: 'Tracker',
    price: '$5.00',
    period: '/month',
    color: 'var(--accent)',
    glow: 'rgba(201,244,0,0.25)',
    border: 'rgba(201,244,0,0.4)',
    icon: '⚡',
    tag: 'EARLY ACCESS' as string | null,
    comingSoon: false,
    description: null as string | null,
    inherits: null as string | null,
    features: [
      'Unlimited map radius',
      'Unlimited submissions',
      'Last updated timestamps',
      'Stock notifications & alerts',
      'Favorites & custom store lists',
      'Verified reporter badge',
      'Leaderboard placement + badge',
    ],
  },
]

const QUANTITY_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  out:    { label: 'OUT',  color: '#FF4545', bg: 'rgba(255,69,69,0.08)',   border: 'rgba(255,69,69,0.25)'   },
  low:    { label: 'LOW',  color: '#FFB300', bg: 'rgba(255,179,0,0.08)',   border: 'rgba(255,179,0,0.25)'   },
  medium: { label: 'MED',  color: '#FFB300', bg: 'rgba(255,179,0,0.08)',   border: 'rgba(255,179,0,0.25)'   },
  full:   { label: 'FULL', color: 'var(--accent)', bg: 'rgba(201,244,0,0.08)',   border: 'rgba(201,244,0,0.25)'   },
}

type AccountSubpage = 'root' | 'profile' | 'plan' | 'badges' | 'saved' | 'alerts' | 'username' | 'password' | 'notifications'

// Small line icons used only by the Account settings list (no equivalent in
// the shared Icons set). Same 24×24 / rounded-stroke language as Icons.tsx.
function KeyIcon({ size = 17, color = '#0D1210' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7.5" cy="15.5" r="4.5" /><path d="M10.7 12.3 20 3M16 7l3 3M18 5l2 2" />
    </svg>
  )
}
function LockIcon({ size = 17, color = '#0D1210' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}
function ShieldIcon({ size = 17, color = '#0D1210' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3z" /><path d="m9 12 2 2 4-4" />
    </svg>
  )
}

const HOW_IT_WORKS = [
  { icon: '📍', title: 'Find Nearby Stores', desc: 'See gas stations and convenience stores around you on a live map, sorted by distance.' },
  { icon: '⚡', title: 'Check Stock Instantly', desc: 'Community members report what\'s in stock in real time — Celsius, Ghost, Alani, Red Bull and more.' },
  { icon: '🔔', title: 'Get Notified', desc: 'Set alerts for your favorite flavors and get notified the moment they\'re spotted near you.' },
  { icon: '🤝', title: 'Help the Community', desc: 'Report what you see on shelves. Every report helps thousands of fans find their favorite drinks faster.' },
]

const STATIC_STATS = [
  { value: 'Real-time', label: 'Stock Updates' },
  { value: 'Free', label: 'To Get Started' },
]

function AccountPageInner() {
  const { user, profile, loading, refreshProfile } = useAuth()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('signup')
  const [selectedTier, setSelectedTier] = useState<TierId | null>(null)
  const [step, setStep] = useState(1)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [favorites, setFavorites] = useState<any[]>([])
  const [favoritesLoading, setFavoritesLoading] = useState(false)
  const [drinkAlerts, setDrinkAlerts] = useState<any[]>([])
  const [drinkAlertsLoading, setDrinkAlertsLoading] = useState(false)
  const [removingAlertId, setRemovingAlertId] = useState<string | null>(null)
  const [flavorQuery, setFlavorQuery] = useState('')
  const [flavorResults, setFlavorResults] = useState<any[]>([])
  const [flavorSearching, setFlavorSearching] = useState(false)
  const [followingDrinkId, setFollowingDrinkId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [confirmEmail, setConfirmEmail] = useState(false)
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  const [betaCount, setBetaCount] = useState<number>(0)
  const [waitlistCount, setWaitlistCount] = useState<number | null>(null)

  // Stats
  const [reportCount, setReportCount] = useState<number>(0)
  const [storeCount, setStoreCount] = useState<number>(0)
  const [uniqueFlavors, setUniqueFlavors] = useState<number>(0)
  const [streak, setStreak] = useState<number>(0)
  const [nightOwl, setNightOwl] = useState(false)
  const [earlyBird, setEarlyBird] = useState(false)
  const [rank, setRank] = useState<number | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [platformStores, setPlatformStores] = useState<number>(0)
  const [platformDrinks, setPlatformDrinks] = useState<number>(0)

  // Profile management
  const [newUsername, setNewUsername] = useState('')
  const [usernameError, setUsernameError] = useState<string | null>(null)
  const [savingUsername, setSavingUsername] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const [toastVisible, setToastVisible] = useState(false)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  function showToast(message: string) {
    clearTimeout(toastTimer.current)
    setToastMessage(message)
    setToastVisible(true)
    toastTimer.current = setTimeout(() => setToastVisible(false), 2500)
  }

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [savingPassword, setSavingPassword] = useState(false)
  const [passwordSuccess, setPasswordSuccess] = useState(false)

  // iOS Settings-style navigation: 'root' is the grouped list, everything
  // else is a drill-down page. Each drill-down pushes a history entry so the
  // phone's back gesture/button returns to the list instead of leaving /account.
  const [accountPage, setAccountPage] = useState<AccountSubpage>('root')

  useEffect(() => {
    function onPop(e: PopStateEvent) {
      setAccountPage((e.state?.accountPage as AccountSubpage) ?? 'root')
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  function openAccountPage(p: AccountSubpage) {
    setAccountPage(p)
    window.history.pushState({ accountPage: p }, '')
    window.scrollTo(0, 0)
  }

  function closeAccountPage() {
    if (window.history.state?.accountPage) window.history.back()
    else setAccountPage('root')
    setNewUsername(''); setUsernameError(null)
    setNewPassword(''); setConfirmPassword(''); setPasswordError(null)
  }

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
  useEffect(() => {
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('tier', 'tracker')
      .then(({ count }) => setBetaCount(count ?? 0))
  }, [])

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_WAITLIST_ACTIVE === '1') {
      fetch('/api/waitlist').then((r) => r.json()).then((d) => setWaitlistCount(d.count ?? 0))
    }
  }, [])

  useEffect(() => {
    fetch('/api/stats')
      .then((r) => r.json())
      .then((d) => { setPlatformStores(d.stores ?? 0); setPlatformDrinks(d.drinks ?? 0) })
      .catch(() => {})
  }, [])

  // Refresh profile after successful Stripe payment
  useEffect(() => {
    if (searchParams.get('payment') === 'success') {
      refreshProfile().then(() => router.replace('/'))
    }
    // If user cancelled Stripe and came back, reset to signup form
    if (searchParams.get('payment') === 'cancelled') {
      setSubmitting(false)
      setSelectedTier(null)
      setStep(1)
      setMode('signup')
    }
    // After email confirmation (cross-device fallback), switch to sign-in with a message
    if (searchParams.get('confirmed') === '1') {
      setMode('signin')
      setError(null)
    }
    // Tracker upgrade couldn't be started after email confirmation — account
    // was created on the free tier, let them know to retry from settings
    if (searchParams.get('upgradeError') === '1') {
      showToast("Couldn't start your Tracker upgrade — you're on Free for now, retry anytime from Settings.")
    }
  }, [searchParams])

  // Reset submitting state if page is restored from bfcache (browser back button)
  useEffect(() => {
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        setSubmitting(false)
        setSelectedTier(null)
        setStep(1)
      }
    }
    window.addEventListener('pageshow', handlePageShow)
    return () => window.removeEventListener('pageshow', handlePageShow)
  }, [])

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { data: signInData, error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError) { setError('Invalid email or password.'); setSubmitting(false); return }
    // If profile missing (e.g. confirmed on different device), create it now
    if (signInData.user) {
      const { data: existingProfile } = await supabase.from('profiles').select('id').eq('id', signInData.user.id).maybeSingle()
      if (!existingProfile) {
        const pending = localStorage.getItem('pending_profile')
        const { username: pendingUsername, tier: pendingTier } = pending
          ? JSON.parse(pending)
          : { username: email.split('@')[0], tier: 'free' }

        if (pendingTier === 'tracker') {
          try {
            const res = await fetch('/api/upgrade/tracker', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${signInData.session.access_token}` },
              body: JSON.stringify({ username: pendingUsername }),
            })
            const json = await res.json()
            localStorage.removeItem('pending_profile')
            if (json.upgraded) {
              await refreshProfile()
              router.replace('/')
              return
            }
            if (json.url) {
              window.location.href = json.url
              return
            }
            router.replace('/account?upgradeError=1')
            return
          } catch {
            router.replace('/account?upgradeError=1')
            return
          }
        }

        await supabase.from('profiles').insert({ id: signInData.user.id, username: pendingUsername, tier: 'free' })
        localStorage.removeItem('pending_profile')
      }
    }
    router.replace('/')
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!username.trim()) { setError('Username is required.'); return }
    if (username.length < 3) { setError('Username must be at least 3 characters.'); return }
    if (!agreedToTerms) { setError('You must agree to the Terms of Service and Privacy Policy.'); return }
    setSubmitting(true)
    const { data: existing } = await supabase.from('profiles').select('id').eq('username', username.trim()).maybeSingle()
    if (existing) { setError('That username is already taken.'); setSubmitting(false); return }
    // Persist username so the auth callback can create the profile after email confirmation
    localStorage.setItem('pending_profile', JSON.stringify({ username: username.trim(), tier: selectedTier }))

    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    if (authError) { localStorage.removeItem('pending_profile'); setError('Could not create account. Please try again.'); setSubmitting(false); return }
    if (data.user) {
      // Email confirmation required — profile will be created in /auth/callback
      if (!data.session) { setSubmitting(false); setConfirmEmail(true); return }

      const accessToken = data.session.access_token

      if (selectedTier === 'tracker') {
        // Server-side beta check — authoritative count, can't be bypassed client-side
        try {
          const res = await fetch('/api/upgrade/tracker', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
            body: JSON.stringify({ username: username.trim() }),
          })
          const json = await res.json()
          if (json.upgraded) {
            // Free beta spot — profile already created by the route
            localStorage.removeItem('pending_profile')
            await refreshProfile()
            router.replace('/')
            return
          }
          if (json.url) {
            // Beta full — go to Stripe; webhook creates profile after payment.
            // Keep the session active so the payment=success redirect lands signed in.
            window.location.href = json.url
            return
          }
          setError(json.error ?? 'Could not start checkout. Please try again.')
        } catch (err: any) {
          setError(err?.message ?? 'Could not connect. Please try again.')
        }
        setSubmitting(false)
        return
      }

      // Free tier — create profile immediately
      await supabase.from('profiles').insert({ id: data.user.id, username: username.trim(), tier: 'free' })
      localStorage.removeItem('pending_profile')

      // Send welcome email (fire and forget)
      fetch('/api/email/welcome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
        body: JSON.stringify({ email, username: username.trim(), tier: selectedTier }),
      }).catch(() => {})

      await refreshProfile()
      router.replace('/')
    }
    setSubmitting(false)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  useEffect(() => {
    if (user) { fetchFavorites(user.id); fetchStats(user.id); fetchDrinkAlerts(user.id) }
  }, [user])

  // Searches the full drinks catalog (brand/name/flavor), not just what's
  // currently in stock somewhere — the whole point of this box is finding
  // a flavor precisely because it *isn't* showing up in stock anywhere.
  useEffect(() => {
    const q = flavorQuery.trim()
    if (q.length < 2) { setFlavorResults([]); setFlavorSearching(false); return }
    setFlavorSearching(true)
    let cancelled = false
    const debounce = setTimeout(() => {
      supabase
        .from('drinks')
        .select('id, brand, name, flavor')
        .or(`brand.ilike.%${q}%,name.ilike.%${q}%,flavor.ilike.%${q}%`)
        .limit(8)
        .then(({ data }) => {
          if (cancelled) return
          setFlavorResults(data ?? [])
          setFlavorSearching(false)
        })
    }, 300)
    return () => { cancelled = true; clearTimeout(debounce) }
  }, [flavorQuery])

  async function fetchFavorites(userId: string) {
    setFavoritesLoading(true)
    const { data } = await supabase
      .from('favorites')
      .select('id, created_at, store:stores(id, name, address, type)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    if (data) setFavorites(data)
    setFavoritesLoading(false)
  }

  async function fetchDrinkAlerts(userId: string) {
    setDrinkAlertsLoading(true)
    const { data } = await supabase
      .from('drink_alerts')
      .select('id, drink_id, scope, radius_miles, drink:drinks(name, flavor, brand), store:stores(name)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    if (data) setDrinkAlerts(data)
    setDrinkAlertsLoading(false)
  }

  async function removeDrinkAlert(alertId: string) {
    if (removingAlertId) return
    setRemovingAlertId(alertId)
    await supabase.from('drink_alerts').delete().eq('id', alertId)
    setDrinkAlerts((prev) => prev.filter((a) => a.id !== alertId))
    setRemovingAlertId(null)
  }

  // "Follow a flavor" search — lets someone follow a discontinued/rare drink
  // directly, since the only other way to start a flavor alert (the bell on
  // a store's stock card) requires the drink to already be in stock
  // *somewhere nearby right now*, which a vault/discontinued item usually
  // isn't. Searches the full catalog, not what's currently in stock.
  async function followDrinkById(drinkId: string) {
    if (!user || followingDrinkId) return
    setFollowingDrinkId(drinkId)
    const { error } = await supabase.from('drink_alerts').upsert(
      { user_id: user.id, drink_id: drinkId, scope: 'anywhere', store_id: null, radius_miles: null, anchor_lat: null, anchor_lng: null },
      { onConflict: 'user_id,drink_id' }
    )
    setFollowingDrinkId(null)
    if (!error) {
      showToast("You'll be notified when it's back")
      setFlavorQuery('')
      setFlavorResults([])
      fetchDrinkAlerts(user.id)
    } else {
      showToast('Could not follow — try again.')
    }
  }

  async function fetchStats(userId: string) {
    setStatsLoading(true)
    const [{ count: rCount }, { count: sCount }, { data: flavors }, { data: dates }, { data: lb }] = await Promise.all([
      supabase.from('stock_reports').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('stores').select('id', { count: 'exact', head: true }).eq('submitted_by', userId).eq('status', 'approved'),
      supabase.from('stock_reports').select('drink_id').eq('user_id', userId),
      supabase.from('stock_reports').select('reported_at').eq('user_id', userId).order('reported_at', { ascending: false }),
      supabase.rpc('get_leaderboard', { p_timeframe: 'All Time' }),
    ])
    setReportCount(rCount ?? 0)
    setStoreCount(sCount ?? 0)
    if (flavors) setUniqueFlavors(new Set(flavors.map((r: any) => r.drink_id)).size)

    // Streak: count consecutive days ending today or yesterday
    if (dates && dates.length > 0) {
      const days = [...new Set(dates.map((r: any) => r.reported_at.slice(0, 10)))].sort().reverse()
      const today = new Date().toISOString().slice(0, 10)
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
      let s = 0
      if (days[0] === today || days[0] === yesterday) {
        let cursor = new Date(days[0])
        for (const d of days) {
          if (d === cursor.toISOString().slice(0, 10)) {
            s++
            cursor = new Date(cursor.getTime() - 86400000)
          } else break
        }
      }
      setStreak(s)
    }

    // Night owl / early bird
    if (dates && dates.length > 0) {
      const hours = dates.map((r: any) => new Date(r.reported_at).getHours())
      setNightOwl(hours.some((h: number) => h >= 0 && h < 4))
      setEarlyBird(hours.some((h: number) => h >= 5 && h < 7))
    }

    // Rank
    if (lb) {
      const idx = lb.findIndex((e: any) => e.id === userId)
      setRank(idx >= 0 ? idx + 1 : null)
    }

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
    closeAccountPage()
    showToast('Username saved!')
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
    setNewPassword('')
    setConfirmPassword('')
    closeAccountPage()
    showToast('Password updated!')
  }

  const [removingFavoriteId, setRemovingFavoriteId] = useState<string | null>(null)
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

  async function startCheckout(tier: 'tracker') {
    if (checkoutLoading || !user) return
    setCheckoutLoading(true)
    setCheckoutError(null)
    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession()
      const res = await fetch('/api/upgrade/tracker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentSession?.access_token ?? ''}` },
        body: JSON.stringify({}),
      })
      const json = await res.json()
      if (json.upgraded) {
        await refreshProfile()
        setCheckoutLoading(false)
        return
      }
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
      console.error('deleteAccount failed:', json.error)
      showToast('Failed to delete account. Please try again.')
    }
  }

  async function removeFavorite(favoriteId: string) {
    if (removingFavoriteId) return
    setRemovingFavoriteId(favoriteId)
    await supabase.from('favorites').delete().eq('id', favoriteId)
    setFavorites((prev) => prev.filter((f) => f.id !== favoriteId))
    setRemovingFavoriteId(null)
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: 'var(--bg)' }}>
        <div style={{ width: 32, height: 32, border: '2px solid #C9F400', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    )
  }

  // Full-screen overlay during paid signup redirect to Stripe
  const isPaidSignup = submitting && selectedTier === 'tracker'
  if (isPaidSignup) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: 'var(--bg)', gap: 16 }}>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ width: 32, height: 32, border: '2px solid #C9F400', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <p style={{ fontSize: 15, fontWeight: 700, color: '#7A8F80' }}>Redirecting to payment...</p>
      </div>
    )
  }

  if (user && !profile && !loading) return <SetupProfile userId={user.id} email={user.email ?? ''} />
  if (user && !profile) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: 'var(--bg)' }}>
        <div style={{ width: 32, height: 32, border: '2px solid #C9F400', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    )
  }

  // ── LOGGED IN ──────────────────────────────────────────────
  if (user && profile) {
    const isTracker = profile.is_admin || profile.tier === 'tracker'

    // Compute earned badges
    const earned = new Set<string>()
    const memberDays = Math.floor((Date.now() - new Date(user.created_at).getTime()) / 86400000)
    if (memberDays >= 30)            earned.add('early_adopter')
    if (reportCount >= 1)             earned.add('first_report')
    if (reportCount >= 10)            earned.add('reporter_10')
    if (reportCount >= 50)            earned.add('reporter_50')
    if (reportCount >= 100)           earned.add('reporter_100')
    if (reportCount >= 200)           earned.add('reporter_200')
    if (reportCount >= 500)           earned.add('reporter_500')
    if (storeCount >= 1)              earned.add('scout')
    if (storeCount >= 5)              earned.add('pathfinder')
    if (storeCount >= 10)             earned.add('store_builder')
    if (uniqueFlavors >= 5)           earned.add('flavor_hunter')
    if (uniqueFlavors >= 20)          earned.add('flavor_master')
    if (streak >= 3)                  earned.add('on_fire')
    if (streak >= 7)                  earned.add('unstoppable')
    if (nightOwl)                     earned.add('night_owl')
    if (earlyBird)                    earned.add('early_bird')
    if (profile.is_verified_reporter)                    earned.add('verified')
    if (profile.badges?.includes('weekly_champion'))     earned.add('weekly_champion')

    function progressHint(id: string): string | null {
      if (id === 'reporter_10'    && reportCount < 10)    return `${reportCount}/10 reports`
      if (id === 'reporter_50'    && reportCount < 50)    return `${reportCount}/50 reports`
      if (id === 'reporter_100'   && reportCount < 100)   return `${reportCount}/100 reports`
      if (id === 'reporter_200'   && reportCount < 200)   return `${reportCount}/200 reports`
      if (id === 'reporter_500'   && reportCount < 500)   return `${reportCount}/500 reports`
      if (id === 'pathfinder'     && storeCount < 5)      return `${storeCount}/5 stores`
      if (id === 'store_builder'  && storeCount < 10)     return `${storeCount}/10 stores`
      if (id === 'flavor_hunter'  && uniqueFlavors < 5)   return `${uniqueFlavors}/5 drinks`
      if (id === 'flavor_master'  && uniqueFlavors < 20)  return `${uniqueFlavors}/20 drinks`
      if (id === 'on_fire'        && streak < 3)          return `${streak}/3 days`
      if (id === 'unstoppable'    && streak < 7)          return `${streak}/7 days`
      return null
    }

    const TIER_LABEL: Record<string, { label: string; color: string; icon: string }> = {
      free:    { label: 'Free',    color: '#6b7280', icon: '🗺️' },
      tracker: { label: 'Tracker', color: 'var(--accent)', icon: '⚡' },
    }
    const tierInfo = TIER_LABEL[profile.tier ?? 'free']

    // ── iOS Settings-style layout ──────────────────────────────
    // Plain render helpers (not components) so inputs inside a page never
    // remount and lose focus on re-render.
    const ROW_SEP = <div style={{ height: 1, backgroundColor: 'var(--fg-06)', marginLeft: 58 }} />

    function iconTile(icon: React.ReactNode) {
      return (
        <span style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: '#C9F400', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {icon}
        </span>
      )
    }

    function group(children: React.ReactNode, opts: { header?: string; footer?: string } = {}) {
      return (
        <div style={{ margin: '0 16px 22px' }}>
          {opts.header && (
            <p style={{ fontSize: 12, fontWeight: 600, color: '#6B7F70', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 16px 7px' }}>{opts.header}</p>
          )}
          <div style={{ borderRadius: 12, backgroundColor: 'var(--surface)', overflow: 'hidden' }}>{children}</div>
          {opts.footer && (
            <p style={{ fontSize: 12, color: '#6B7F70', lineHeight: 1.45, margin: '7px 16px 0' }}>{opts.footer}</p>
          )}
        </div>
      )
    }

    function row(opts: { icon?: React.ReactNode; label: string; value?: React.ReactNode; onPress?: () => void; href?: string; chevron?: boolean; danger?: boolean; center?: boolean }) {
      const { icon, label, value, onPress, href, chevron = !!(onPress || href), danger = false, center = false } = opts
      const inner = (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minHeight: 50, padding: '9px 16px' }}>
          {icon && iconTile(icon)}
          <span style={{ flex: 1, minWidth: 0, fontSize: 16, fontWeight: 500, textAlign: center ? 'center' : 'left', color: danger ? '#FF4545' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
          {value !== undefined && <span style={{ fontSize: 15, color: 'var(--fg-45)', flexShrink: 0, maxWidth: '45%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>}
          {chevron && !center && <ChevronRightIcon size={15} color="var(--fg-25)" />}
        </div>
      )
      if (href) return <a href={href} style={{ display: 'block', textDecoration: 'none' }}>{inner}</a>
      if (onPress) return <button onClick={onPress} style={{ display: 'block', width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>{inner}</button>
      return inner
    }

    function toggleRow(label: string, desc: string, value: boolean, set: (v: boolean) => void) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minHeight: 50, padding: '10px 16px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 16, fontWeight: 500, color: 'var(--text)', margin: 0 }}>{label}</p>
            <p style={{ fontSize: 12, color: '#6B7F70', margin: '2px 0 0' }}>{desc}</p>
          </div>
          <button onClick={() => set(!value)} aria-pressed={value} style={{ flexShrink: 0, borderRadius: 99, width: 51, height: 31, backgroundColor: value ? '#C9F400' : 'var(--fg-15)', position: 'relative', transition: 'background 0.2s', border: 'none', cursor: 'pointer' }}>
            <div style={{ position: 'absolute', top: 2, left: value ? 22 : 2, width: 27, height: 27, borderRadius: '50%', backgroundColor: '#fff', transition: 'left 0.2s', boxShadow: '0 2px 5px rgba(0,0,0,0.35)' }} />
          </button>
        </div>
      )
    }

    const inputStyle: React.CSSProperties = { width: '100%', padding: '14px 16px', fontSize: 16, color: 'var(--text)', outline: 'none', backgroundColor: 'transparent', border: 'none', fontFamily: "'Barlow', sans-serif" }
    const ICON = '#0D1210'
    const PAGE_TITLES: Record<AccountSubpage, string> = {
      root: 'Account', profile: 'Profile', plan: 'Plan', badges: 'Badges', saved: 'Saved Stores',
      alerts: 'Flavor Alerts', username: 'Username', password: 'Password', notifications: 'Notifications',
    }

    const avatar = (size: number) => (
      <div style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, rgba(201,244,0,0.3), rgba(201,244,0,0.08))', border: `${size > 70 ? 3 : 2}px solid rgba(201,244,0,0.5)` }}>
        <span style={{ fontSize: size * 0.42, fontWeight: 900, color: '#C9F400', fontFamily: "'Barlow Condensed', sans-serif" }}>{profile.username[0].toUpperCase()}</span>
      </div>
    )

    const spinner = (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
        <div style={{ width: 24, height: 24, border: '2px solid #C9F400', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    )

    function emptyState(icon: React.ReactNode, title: string, body: string, action?: { label: string; onPress: () => void }) {
      return (
        <div style={{ margin: '0 16px 22px', borderRadius: 12, padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center', backgroundColor: 'var(--surface)' }}>
          {icon}
          <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{title}</p>
          <p style={{ fontSize: 13, color: '#6B7F70' }}>{body}</p>
          {action && (
            <button onClick={action.onPress} style={{ marginTop: 6, padding: '10px 20px', borderRadius: 10, backgroundColor: '#C9F400', border: 'none', color: '#0D1210', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              {action.label}
            </button>
          )}
        </div>
      )
    }

    function renderSubpage() {
      switch (accountPage) {
        case 'profile':
          return (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '8px 20px 24px' }}>
                {avatar(90)}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <p style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.02em' }}>@{profile.username}</p>
                  {profile.is_verified_reporter && <CheckIcon size={16} color="#60a5fa" />}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {profile.is_admin && <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 99, backgroundColor: 'rgba(201,244,0,0.15)', color: '#C9F400', border: '1px solid rgba(201,244,0,0.3)' }}>ADMIN</span>}
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 99, backgroundColor: `${tierInfo.color}18`, color: tierInfo.color, border: `1px solid ${tierInfo.color}40` }}>{tierInfo.icon} {tierInfo.label.toUpperCase()}</span>
                  {!statsLoading && rank && <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 99, backgroundColor: 'rgba(255,215,0,0.1)', color: '#ffd700', border: '1px solid rgba(255,215,0,0.25)' }}>#{rank} All-Time</span>}
                </div>
              </div>
              {group(<>
                {row({ label: 'Reports', value: statsLoading ? '–' : reportCount })}
                {ROW_SEP}
                {row({ label: 'Stores Added', value: statsLoading ? '–' : storeCount })}
                {ROW_SEP}
                {row({ label: 'Drinks Reported', value: statsLoading ? '–' : uniqueFlavors })}
                {ROW_SEP}
                {row({ label: 'Reporting Streak', value: statsLoading ? '–' : `${streak} day${streak === 1 ? '' : 's'}${streak > 0 ? ' 🔥' : ''}` })}
              </>, { header: 'Activity' })}
              {group(row({ label: 'Email', value: user!.email }), { header: 'Account' })}
            </>
          )

        case 'plan':
          return (
            <div style={{ padding: '0 16px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {checkoutError && <p style={{ fontSize: 12, color: '#FF4545' }}>{checkoutError}</p>}
              <div style={{ borderRadius: 12, overflow: 'hidden', backgroundColor: 'var(--surface)', border: `1px solid ${tierInfo.color}35` }}>
                <div style={{ height: 3, background: tierInfo.color }} />
                <div style={{ padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <span style={{ fontSize: 22 }}>{tierInfo.icon}</span>
                    <div>
                      <p style={{ fontSize: 17, fontWeight: 800, color: tierInfo.color, fontFamily: "'Barlow Condensed', sans-serif" }}>{tierInfo.label} <span style={{ fontSize: 12, fontWeight: 600, color: '#6B7F70' }}>· Current plan</span></p>
                      <p style={{ fontSize: 12, color: '#6B7F70' }}>{profile.tier === 'free' ? 'Free' : '$5.00/mo'}</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {(profile.tier === 'free'
                      ? ['Live stock map', 'View & submit reports', 'Add missing stores', 'Community leaderboard']
                      : ['Live stock map', 'Unlimited radius', 'Unlimited submissions', 'Stock notifications', 'Custom store lists', 'Verified reporter badge', 'Leaderboard badge']
                    ).map((f) => (
                      <div key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                        <span style={{ fontSize: 10, color: tierInfo.color, marginTop: 3, flexShrink: 0 }}>✓</span>
                        <span style={{ fontSize: 13, color: '#7A8F80', lineHeight: 1.4 }}>{f}</span>
                      </div>
                    ))}
                  </div>
                  {profile.tier === 'tracker' && (
                    <div style={{ marginTop: 14 }}>
                      {cancelError && <p style={{ fontSize: 11, color: '#FF4545', marginBottom: 6 }}>{cancelError}</p>}
                      <button onClick={cancelSubscription} disabled={cancelLoading} style={{ width: '100%', borderRadius: 10, padding: '11px 0', fontSize: 14, fontWeight: 600, backgroundColor: 'rgba(255,69,69,0.06)', border: '1px solid rgba(255,69,69,0.18)', color: '#FF4545', opacity: cancelLoading ? 0.6 : 1, cursor: 'pointer' }}>
                        {cancelLoading ? 'Cancelling...' : 'Cancel Plan'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
              {profile.tier !== 'tracker' && (
                <div style={{ borderRadius: 12, overflow: 'hidden', backgroundColor: 'var(--surface)', border: '1px solid rgba(201,244,0,0.35)' }}>
                  <div style={{ height: 3, background: '#C9F400' }} />
                  <div style={{ padding: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                      <span style={{ fontSize: 22 }}>⚡</span>
                      <div>
                        <p style={{ fontSize: 17, fontWeight: 800, color: '#C9F400', fontFamily: "'Barlow Condensed', sans-serif" }}>Tracker</p>
                        <p style={{ fontSize: 12, color: '#6B7F70' }}>$5.00/mo</p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 14 }}>
                      {['Unlimited map radius', 'Unlimited submissions', 'Timestamps', 'Stock alerts', 'Store lists', 'Verified badge', 'Leaderboard badge'].map((f) => (
                        <div key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                          <span style={{ fontSize: 10, color: '#C9F400', marginTop: 3, flexShrink: 0 }}>✓</span>
                          <span style={{ fontSize: 13, color: '#7A8F80', lineHeight: 1.4 }}>{f}</span>
                        </div>
                      ))}
                    </div>
                    <button onClick={() => startCheckout('tracker')} disabled={checkoutLoading} style={{ width: '100%', borderRadius: 10, padding: '12px 0', fontSize: 14, fontWeight: 800, backgroundColor: '#C9F400', color: '#0D1210', border: 'none', cursor: checkoutLoading ? 'not-allowed' : 'pointer', opacity: checkoutLoading ? 0.6 : 1, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.06em', textTransform: 'uppercase', boxShadow: '0 0 12px rgba(201,244,0,0.3)' }}>
                      {checkoutLoading ? '...' : 'Upgrade ⚡'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )

        case 'badges': {
          const sorted = [...BADGE_DEFS].sort((a, b) => (earned.has(a.id) ? 0 : 1) - (earned.has(b.id) ? 0 : 1))
          return (
            <div style={{ padding: '0 16px 22px' }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: '#6B7F70', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 16px 7px' }}>{earned.size} of {BADGE_DEFS.length} earned</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {sorted.map((b) => {
                  const isEarned = earned.has(b.id)
                  const hint = progressHint(b.id)
                  return (
                    <div key={b.id} style={{ borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center', backgroundColor: isEarned ? 'var(--fg-04)' : 'var(--surface)', border: isEarned ? `1px solid ${b.color}40` : '1px solid transparent', boxShadow: isEarned ? `0 0 16px ${b.glow}` : 'none', opacity: isEarned ? 1 : 0.45 }}>
                      <span style={{ fontSize: 26, filter: isEarned ? 'none' : 'grayscale(1)' }}>{b.icon}</span>
                      <p style={{ fontSize: 12, fontWeight: 800, lineHeight: 1.2, color: isEarned ? b.color : '#6B7F70', fontFamily: "'Barlow Condensed', sans-serif" }}>{b.name}</p>
                      <p style={{ fontSize: 10, lineHeight: 1.3, color: '#6B7F70' }}>{hint ?? b.desc}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        }

        case 'saved':
          if (!isTracker) return emptyState(<HeartIcon size={32} color="#8b9284" />, 'Tracker Feature', 'Save and organize your favorite stores with the Tracker plan.', { label: 'See Plans', onPress: () => openAccountPage('plan') })
          if (favoritesLoading) return spinner
          if (favorites.length === 0) return emptyState(<HeartIcon size={32} color="#8b9284" />, 'No favorites yet', 'Tap the heart on any store page to save it here.')
          return group(favorites.map((fav, i) => {
            const store = fav.store
            return (
              <div key={fav.id}>
                {i > 0 && <div style={{ height: 1, backgroundColor: 'var(--fg-06)', marginLeft: 50 }} />}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px' }}>
                  <StoreTypeIcon type={store?.type} size={22} color="#7A8F80" />
                  <a href={`/store/${store.id}?name=${encodeURIComponent(store.name)}`} style={{ flex: 1, minWidth: 0, textDecoration: 'none' }}>
                    <p style={{ fontSize: 16, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{store?.name}</p>
                    <p style={{ fontSize: 12, color: '#6B7F70', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{store?.address}</p>
                  </a>
                  <button onClick={() => removeFavorite(fav.id)} disabled={removingFavoriteId === fav.id} aria-label="Remove from saved" style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,69,69,0.1)', border: 'none', opacity: removingFavoriteId === fav.id ? 0.4 : 1, cursor: 'pointer', flexShrink: 0 }}>
                    {removingFavoriteId === fav.id ? <div style={{ width: 12, height: 12, border: '1.5px solid #FF4545', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> : <CloseIcon size={11} color="#FF4545" />}
                  </button>
                </div>
              </div>
            )
          }), { footer: 'Tap a store to open it.' })

        case 'alerts':
          return (
            <>
              {/* Search the full catalog, not just what's currently in stock —
                  for following a discontinued/rare flavor that won't show up as
                  a bell on any store's card right now. */}
              <div style={{ position: 'relative', margin: '0 16px 22px' }}>
                <div style={{ borderRadius: 12, backgroundColor: 'var(--surface)' }}>
                  <input
                    type="text"
                    value={flavorQuery}
                    onChange={(e) => setFlavorQuery(e.target.value)}
                    placeholder="Follow a flavor — even discontinued ones"
                    style={{ ...inputStyle, fontSize: 15 }}
                  />
                </div>
                {(flavorResults.length > 0 || flavorSearching) && (
                  <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 5, backgroundColor: 'var(--surface)', border: '1px solid rgba(201,244,0,0.15)', borderRadius: 12, overflow: 'hidden' }}>
                    {flavorSearching ? spinner : flavorResults.map((d) => {
                      const already = drinkAlerts.some((a) => a.drink_id === d.id)
                      return (
                        <button
                          key={d.id}
                          onClick={() => !already && followDrinkById(d.id)}
                          disabled={already || followingDrinkId === d.id}
                          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'none', border: 'none', borderBottom: '1px solid var(--fg-06)', textAlign: 'left', cursor: already ? 'default' : 'pointer' }}
                        >
                          <p style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.brand} {d.flavor || d.name}</p>
                          {followingDrinkId === d.id ? (
                            <div style={{ width: 14, height: 14, flexShrink: 0, border: '2px solid #C9F400', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                          ) : (
                            <BellIcon size={15} color={already ? '#C9F400' : '#8b9284'} filled={already} />
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
              {drinkAlertsLoading ? spinner : drinkAlerts.length === 0
                ? emptyState(<BellIcon size={32} color="#8b9284" />, 'No flavor alerts yet', 'Tap the bell on any drink card to get notified when it restocks.')
                : group(drinkAlerts.map((a, i) => {
                    const scopeLabel = a.scope === 'store' ? (a.store?.name ?? 'This store only')
                      : a.scope === 'radius' ? `Within ${a.radius_miles} miles`
                      : 'Anywhere'
                    return (
                      <div key={a.id}>
                        {i > 0 && <div style={{ height: 1, backgroundColor: 'var(--fg-06)', marginLeft: 50 }} />}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px' }}>
                          <BellIcon size={22} color="#C9F400" filled />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 16, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.drink?.flavor ?? a.drink?.name}</p>
                            <p style={{ fontSize: 12, color: '#6B7F70', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{scopeLabel}</p>
                          </div>
                          <button onClick={() => removeDrinkAlert(a.id)} disabled={removingAlertId === a.id} aria-label="Remove alert" style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,69,69,0.1)', border: 'none', opacity: removingAlertId === a.id ? 0.4 : 1, cursor: 'pointer', flexShrink: 0 }}>
                            {removingAlertId === a.id ? <div style={{ width: 12, height: 12, border: '1.5px solid #FF4545', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> : <CloseIcon size={11} color="#FF4545" />}
                          </button>
                        </div>
                      </div>
                    )
                  }), { header: `Following · ${drinkAlerts.length}`, footer: "You'll get an alert in the Alerts tab the next time one of these restocks." })}
            </>
          )

        case 'username':
          return (
            <>
              {group(
                <div style={{ display: 'flex', alignItems: 'center', paddingLeft: 16 }}>
                  <span style={{ fontSize: 16, color: 'var(--fg-45)' }}>@</span>
                  <input type="text" style={{ ...inputStyle, paddingLeft: 2 }} placeholder={profile.username} value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} autoFocus />
                </div>,
                { header: 'New username', footer: usernameError ?? 'Lowercase letters, numbers and underscores. At least 3 characters.' },
              )}
              <div style={{ padding: '0 16px' }}>
                <button onClick={saveUsername} disabled={savingUsername || !newUsername.trim()} style={{ width: '100%', borderRadius: 12, padding: '14px 0', fontSize: 16, fontWeight: 700, color: '#0D1210', border: 'none', cursor: 'pointer', backgroundColor: savingUsername || !newUsername.trim() ? 'rgba(201,244,0,0.4)' : '#C9F400' }}>
                  {savingUsername ? 'Saving…' : 'Save'}
                </button>
              </div>
            </>
          )

        case 'password':
          return (
            <>
              {group(<>
                <input type="password" style={inputStyle} placeholder="New password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoFocus />
                <div style={{ height: 1, backgroundColor: 'var(--fg-06)', marginLeft: 16 }} />
                <input type="password" style={inputStyle} placeholder="Confirm password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
              </>, { footer: passwordError ?? 'At least 6 characters.' })}
              <div style={{ padding: '0 16px' }}>
                <button onClick={savePassword} disabled={savingPassword || !newPassword} style={{ width: '100%', borderRadius: 12, padding: '14px 0', fontSize: 16, fontWeight: 700, color: '#0D1210', border: 'none', cursor: 'pointer', backgroundColor: savingPassword || !newPassword ? 'rgba(201,244,0,0.4)' : '#C9F400' }}>
                  {savingPassword ? 'Saving…' : 'Update Password'}
                </button>
              </div>
            </>
          )

        case 'notifications':
          return group(<>
            {toggleRow('Flavor alerts', 'Notify when a saved drink is spotted nearby', notifFlavors, setNotifFlavors)}
            <div style={{ height: 1, backgroundColor: 'var(--fg-06)', marginLeft: 16 }} />
            {toggleRow('Location alerts', 'Alerts based on your current location', notifLocation, setNotifLocation)}
          </>)

        default:
          return null
      }
    }

    return (
      <div style={{ backgroundColor: 'var(--bg)', minHeight: '100vh', paddingTop: 'calc(56px + env(safe-area-inset-top))', paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}>
        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes acctSlideIn { from { opacity: 0; transform: translateX(28px); } to { opacity: 1; transform: none; } }
          @keyframes acctFadeIn { from { opacity: 0; } to { opacity: 1; } }
        `}</style>

        <Toast message={toastMessage} visible={toastVisible} />

        {accountPage === 'root' ? (
          /* ── ROOT LIST ── */
          <div key="root" style={{ animation: 'acctFadeIn 0.18s ease' }}>
            <h1 style={{ fontSize: 32, fontWeight: 800, color: 'var(--text)', padding: '4px 20px 14px', letterSpacing: '-0.01em' }}>Account</h1>

            {/* Profile card */}
            <div style={{ margin: '0 16px 22px' }}>
              <button onClick={() => openAccountPage('profile')} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', borderRadius: 12, backgroundColor: 'var(--surface)', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                {avatar(60)}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <p style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{profile.username}</p>
                    {profile.is_verified_reporter && <CheckIcon size={15} color="#60a5fa" />}
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--fg-45)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {tierInfo.label}{!statsLoading && rank ? ` · #${rank} All-Time` : ''}{streak > 0 ? ` · 🔥 ${streak}` : ''}
                  </p>
                </div>
                <ChevronRightIcon size={15} color="var(--fg-25)" />
              </button>
            </div>

            {group(row({ icon: <LightningIcon size={17} color={ICON} />, label: 'Plan', value: tierInfo.label, onPress: () => openAccountPage('plan') }))}

            {group(<>
              {row({ icon: <TrophyIcon size={17} color={ICON} />, label: 'Badges', value: `${earned.size} of ${BADGE_DEFS.length}`, onPress: () => openAccountPage('badges') })}
              {ROW_SEP}
              {row({ icon: <HeartIcon size={17} color={ICON} />, label: 'Saved Stores', value: isTracker ? favorites.length : 'Tracker', onPress: () => openAccountPage('saved') })}
              {ROW_SEP}
              {row({ icon: <DrinkIcon size={17} color={ICON} />, label: 'Flavor Alerts', value: drinkAlerts.length, onPress: () => openAccountPage('alerts') })}
            </>)}

            {group(<>
              {row({ icon: <UserIcon size={17} color={ICON} />, label: 'Username', value: `@${profile.username}`, onPress: () => openAccountPage('username') })}
              {ROW_SEP}
              {row({ icon: <KeyIcon />, label: 'Password', onPress: () => openAccountPage('password') })}
              {ROW_SEP}
              {row({ icon: <BellIcon size={17} color={ICON} />, label: 'Notifications', onPress: () => openAccountPage('notifications') })}
            </>)}

            {profile.is_admin && group(row({ icon: <ShieldIcon />, label: 'Admin Dashboard', href: '/admin' }))}

            {group(<>
              {row({ icon: <ClipboardIcon size={17} color={ICON} />, label: 'Terms of Service', href: '/terms' })}
              {ROW_SEP}
              {row({ icon: <LockIcon />, label: 'Privacy Policy', href: '/privacy' })}
            </>)}

            {group(row({ label: 'Log Out', danger: true, center: true, onPress: handleSignOut }))}
            {group(row({ label: 'Delete Account', danger: true, center: true, onPress: deleteAccount }), { footer: 'Permanently deletes your account and all of your data.' })}
          </div>
        ) : (
          /* ── SUBPAGE ── */
          <div key={accountPage} style={{ animation: 'acctSlideIn 0.22s ease' }}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '2px 8px 16px', position: 'relative', minHeight: 40 }}>
              <button onClick={closeAccountPage} style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'none', border: 'none', cursor: 'pointer', padding: '6px 8px', color: '#C9F400', fontSize: 16, fontWeight: 500, position: 'relative', zIndex: 1 }}>
                <ChevronLeftIcon size={20} color="#C9F400" /> Account
              </button>
              <p style={{ position: 'absolute', left: 0, right: 0, textAlign: 'center', fontSize: 17, fontWeight: 700, color: 'var(--text)', pointerEvents: 'none' }}>{PAGE_TITLES[accountPage]}</p>
            </div>
            {renderSubpage()}
          </div>
        )}
      </div>
    )
  }

  // ── LOGGED OUT ─────────────────────────────────────────────
  const tier = TIERS.find((t) => t.id === selectedTier) ?? TIERS[0]

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg)', color: 'var(--text)', overflowX: 'hidden', paddingTop: 'calc(56px + env(safe-area-inset-top))' }}>
      <style>{`
        * { box-sizing: border-box; }
        .em-input { outline: none; transition: border-color 0.2s ease; font-family: 'Barlow', system-ui, sans-serif; }
        .em-input:focus { border-color: rgba(201,244,0,0.4) !important; box-shadow: 0 0 0 3px rgba(201,244,0,0.08) !important; }
        .em-input::placeholder { color: #4A5F50; }
        .tier-card { transition: transform 0.2s ease, box-shadow 0.2s ease; cursor: pointer; }
        .tier-card:hover { transform: translateY(-4px); }
        .tier-coming { cursor: default !important; }
        .tier-coming:hover { transform: none !important; }
        .cta-btn { transition: opacity 0.15s ease, transform 0.15s ease; }
        .cta-btn:hover { opacity: 0.88; transform: translateY(-1px); }
        .cta-btn:active { transform: translateY(0); }
        .how-card { transition: border-color 0.2s ease, transform 0.2s ease; }
        .how-card:hover { border-color: rgba(201,244,0,0.25) !important; transform: translateY(-2px); }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-8px); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* Background */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, background: 'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(201,244,0,0.07) 0%, transparent 60%)', pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, backgroundImage: 'linear-gradient(rgba(201,244,0,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(201,244,0,0.03) 1px, transparent 1px)', backgroundSize: '32px 32px', pointerEvents: 'none' }} />

      <div style={{ position: 'relative', zIndex: 1, fontFamily: "'Barlow', system-ui, sans-serif" }}>

        {/* ── HERO ── */}
        <div style={{ textAlign: 'center', padding: '36px 24px 28px', animation: 'fadeUp 0.6s ease' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <span style={{ fontSize: 40, display: 'inline-block', animation: 'float 3s ease-in-out infinite' }}>⚡</span>
            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 48, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--accent)' }}>Amped Map</span>
          </div>
          <h1 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 'clamp(26px, 5vw, 44px)', fontWeight: 800, lineHeight: 1.1, marginBottom: 14, letterSpacing: '0.02em', textTransform: 'uppercase' }}>
            Never Hunt for Your<br />
            <span style={{ color: 'var(--accent)' }}>Favorite Energy Drink</span> Again
          </h1>
          <p style={{ fontSize: 15, color: '#7A8F80', maxWidth: 480, margin: '0 auto 20px', lineHeight: 1.7 }}>
            The crowdsourced platform that tracks real-time energy drink stock at stores near you. Find Celsius, Ghost, Alani Nu, Red Bull and more — before you leave the house.
          </p>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, backgroundColor: 'rgba(201,244,0,0.08)', border: '1px solid rgba(201,244,0,0.2)', borderRadius: 20, padding: '6px 16px', marginBottom: 24 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: '#C9F400', animation: 'pulse 2s ease-in-out infinite' }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.1em', fontFamily: "'Barlow Condensed', sans-serif" }}>LIVE STOCK UPDATES</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 10, maxWidth: 560, margin: '0 auto' }}>
            {[
              { value: platformStores > 0 ? `${platformStores.toLocaleString()}+` : '1,000+', label: 'Stores Tracked' },
              { value: platformDrinks > 0 ? `${platformDrinks.toLocaleString()}+` : '274+', label: 'Drink Flavors' },
              ...STATIC_STATS,
            ].map((s, i) => (
              <div key={i} style={{ backgroundColor: 'var(--surface)', border: '1px solid rgba(201,244,0,0.1)', borderRadius: 14, padding: '12px 20px', animation: `fadeUp 0.5s ease ${i * 0.1}s both` }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', fontFamily: "'Barlow Condensed', sans-serif" }}>{s.value}</div>
                <div style={{ fontSize: 10, color: '#4A5F50', marginTop: 2, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: "'Barlow Condensed', sans-serif" }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── HOW IT WORKS ── */}
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 24px 32px', animation: 'fadeUp 0.6s ease 0.2s both' }}>
          <div style={{ textAlign: 'center', marginBottom: 18 }}>
            <div style={{ display: 'inline-block', backgroundColor: 'rgba(201,244,0,0.08)', border: '1px solid rgba(201,244,0,0.2)', borderRadius: 20, padding: '4px 14px', marginBottom: 10 }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--accent)', letterSpacing: '0.14em', fontFamily: "'Barlow Condensed', sans-serif" }}>HOW IT WORKS</span>
            </div>
            <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 26, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6 }}>Built by Energy Drink Fans, for Energy Drink Fans</h2>
            <p style={{ fontSize: 13, color: '#7A8F80', maxWidth: 460, margin: '0 auto', lineHeight: 1.6 }}>
              We know the frustration of driving to three stores for one flavor. Amped Map solves that — powered by a community just like you.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
            {HOW_IT_WORKS.map((item, i) => (
              <div key={i} className="how-card" style={{ backgroundColor: 'var(--surface)', border: '1px solid rgba(201,244,0,0.1)', borderRadius: 14, padding: '12px 10px', textAlign: 'center', animation: `fadeUp 0.5s ease ${i * 0.1}s both` }}>
                <div style={{ fontSize: 20, marginBottom: 6 }}>{item.icon}</div>
                <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text)', fontFamily: "'Barlow Condensed', sans-serif", textTransform: 'uppercase', letterSpacing: '0.02em' }}>{item.title}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── DIVIDER ── */}
        <div style={{ maxWidth: 900, margin: '8px auto 24px', padding: '0 24px' }}>
          <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(201,244,0,0.1), transparent)' }} />
        </div>

        {/* ── MODE TABS ── */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <div style={{ display: 'flex', backgroundColor: 'rgba(201,244,0,0.06)', borderRadius: 14, padding: 4, border: '1px solid rgba(201,244,0,0.1)' }}>
            {(['signup', 'signin'] as Mode[]).map((m) => (
              <button key={m} onClick={() => switchMode(m)}
                style={{ padding: '10px 28px', borderRadius: 10, border: 'none', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.06em', textTransform: 'uppercase', backgroundColor: mode === m ? '#C9F400' : 'transparent', color: mode === m ? '#0D1210' : '#4A5F50', transition: 'all 0.2s ease' }}>
                {m === 'signup' ? 'Sign Up' : 'Sign In'}
              </button>
            ))}
          </div>
        </div>

        {/* ── SIGN IN ── */}
        {mode === 'signin' && (
          <div style={{ maxWidth: 400, margin: '0 auto', padding: '0 24px 60px', animation: 'fadeUp 0.5s ease' }}>
            <div style={{ backgroundColor: 'var(--surface)', borderRadius: 20, padding: 28, border: '1px solid rgba(201,244,0,0.12)' }}>
              <h2 style={{ fontSize: 26, fontWeight: 800, marginBottom: 6, color: 'var(--text)', fontFamily: "'Barlow Condensed', sans-serif", textTransform: 'uppercase', letterSpacing: '0.02em' }}>Welcome back</h2>
              <p style={{ fontSize: 13, color: '#7A8F80', marginBottom: searchParams.get('confirmed') === '1' ? 16 : 24 }}>Sign in to your Amped Map account</p>
              {searchParams.get('confirmed') === '1' && (
                <div style={{ backgroundColor: 'rgba(201,244,0,0.08)', border: '1px solid rgba(201,244,0,0.25)', borderRadius: 10, padding: '10px 14px', marginBottom: 20 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>Email confirmed! Sign in to finish setting up your account.</p>
                </div>
              )}
              <form onSubmit={handleSignIn} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#4A5F50', letterSpacing: '0.14em', display: 'block', marginBottom: 8, fontFamily: "'Barlow Condensed', sans-serif", textTransform: 'uppercase' }}>Email</label>
                  <input className="em-input" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required
                    style={{ width: '100%', padding: '13px 16px', backgroundColor: 'var(--bg)', border: '1px solid rgba(201,244,0,0.12)', borderRadius: 12, color: 'var(--text)', fontSize: 15 }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#4A5F50', letterSpacing: '0.14em', display: 'block', marginBottom: 8, fontFamily: "'Barlow Condensed', sans-serif", textTransform: 'uppercase' }}>Password</label>
                  <div style={{ position: 'relative' }}>
                    <input className="em-input" type={showPassword ? 'text' : 'password'} placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required
                      style={{ width: '100%', padding: '13px 48px 13px 16px', backgroundColor: 'var(--bg)', border: '1px solid rgba(201,244,0,0.12)', borderRadius: 12, color: 'var(--text)', fontSize: 15 }} />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#4A5F50', cursor: 'pointer', fontSize: 16 }}>
                      {showPassword ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>
                <div style={{ textAlign: 'right', marginTop: -6 }}>
                  <button type="button" onClick={handleForgotPassword} style={{ background: 'none', border: 'none', color: '#4A5F50', cursor: 'pointer', fontSize: 12, fontFamily: "'Barlow', sans-serif" }}>
                    Forgot password?
                  </button>
                </div>
                {resetSent && <p style={{ fontSize: 13, color: 'var(--accent)', textAlign: 'center' }}>Reset link sent — check your email.</p>}
                {error && <p style={{ fontSize: 13, color: '#FF4545' }}>{error}</p>}
                <button type="submit" className="cta-btn" disabled={submitting}
                  style={{ width: '100%', padding: 15, backgroundColor: '#C9F400', border: 'none', borderRadius: 14, color: '#0D1210', fontSize: 16, fontWeight: 800, cursor: 'pointer', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.08em', textTransform: 'uppercase', boxShadow: '0 0 20px rgba(201,244,0,0.35)' }}>
                  {submitting ? <div style={{ width: 20, height: 20, border: '2px solid #0D1210', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} /> : 'Sign In →'}
                </button>
              </form>
              <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: '#4A5F50' }}>
                Don't have an account?{' '}
                <button onClick={() => switchMode('signup')} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 13, letterSpacing: '0.04em' }}>Sign up free</button>
              </p>
            </div>
          </div>
        )}

        {/* ── SIGN UP STEP 1 — choose plan ── */}
        {mode === 'signup' && step === 1 && (
          <div style={{ maxWidth: 760, margin: '0 auto', padding: '0 24px 36px', animation: 'fadeUp 0.5s ease' }}>
            <div style={{ textAlign: 'center', marginBottom: 18 }}>
              <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 28, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6, color: 'var(--text)' }}>Choose Your Plan</h2>
              <p style={{ fontSize: 13, color: '#7A8F80' }}>Start free, upgrade anytime</p>
              {waitlistCount !== null && waitlistCount > 0 && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 12, backgroundColor: 'rgba(201,244,0,0.08)', border: '1px solid rgba(201,244,0,0.25)', borderRadius: 24, padding: '8px 16px' }}>
                  <div style={{ position: 'relative', width: 8, height: 8, flexShrink: 0 }}>
                    <div className="animate-ping" style={{ position: 'absolute', inset: 0, borderRadius: '50%', backgroundColor: '#C9F400', opacity: 0.5 }} />
                    <div style={{ position: 'relative', width: 8, height: 8, borderRadius: '50%', backgroundColor: '#C9F400' }} />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent)', fontFamily: "'Barlow Condensed', sans-serif" }}>
                    {waitlistCount.toLocaleString()}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: '#7A8F80' }}>
                    people waiting to join
                  </span>
                </div>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14 }}>
              {TIERS.map((t, i) => (
                <div key={t.id}
                  className={t.comingSoon ? 'tier-card tier-coming' : 'tier-card'}
                  style={{ backgroundColor: 'rgba(201,244,0,0.04)', borderRadius: 20, border: `1px solid ${t.comingSoon ? 'rgba(249,115,22,0.25)' : 'rgba(201,244,0,0.18)'}`, position: 'relative', animation: `fadeUp 0.5s ease ${i * 0.08}s both`, opacity: t.comingSoon ? 0.82 : 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
                >
                  <div style={{ height: 4, background: `linear-gradient(90deg, ${t.color}, ${t.color}88)` }} />
                  {t.tag && (
                    <div style={{ position: 'absolute', top: 16, right: 14, backgroundColor: t.comingSoon ? 'rgba(249,115,22,0.85)' : t.color, borderRadius: 20, padding: '3px 10px', fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', color: t.color === '#C9F400' ? '#0D1210' : '#fff', whiteSpace: 'nowrap', fontFamily: "'Barlow Condensed', sans-serif" }}>{t.tag}</div>
                  )}
                  <div style={{ padding: '13px 14px 12px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: 19, marginBottom: 3, display: 'block' }}>{t.icon}</span>
                    <span style={{ fontSize: 15, fontWeight: 800, color: t.color, display: 'block', marginBottom: 1, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.04em', textTransform: 'uppercase' }}>{t.name}</span>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 2, marginBottom: 8 }}>
                      <span style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', fontFamily: "'Barlow Condensed', sans-serif" }}>{t.price}</span>
                      <span style={{ fontSize: 12, color: '#4A5F50' }}>{t.period}</span>
                    </div>
                    {t.id === 'tracker' && (() => {
                      const BETA_LIMIT = 60
                      const remaining = Math.max(0, BETA_LIMIT - betaCount)
                      const spotsLeft = remaining > 0
                      return (
                        <div style={{ backgroundColor: 'rgba(249,115,22,0.07)', border: '1px dashed rgba(249,115,22,0.35)', borderRadius: 9, padding: '6px 9px', marginBottom: 8 }}>
                          <p style={{ fontSize: 10, color: 'var(--fg-60)', lineHeight: 1.3, marginBottom: 5 }}>
                            {spotsLeft
                              ? `🔥 First 60 beta users get Tracker free — ${remaining} spot${remaining !== 1 ? 's' : ''} left`
                              : '🔒 Beta is full. Tracker is $5.00/mo.'}
                          </p>
                          <div style={{ height: 3, backgroundColor: 'var(--fg-08)', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${Math.min((betaCount / BETA_LIMIT) * 100, 100)}%`, background: 'linear-gradient(90deg, #C9F400, #a8d400)', borderRadius: 4, transition: 'width 0.5s ease' }} />
                          </div>
                        </div>
                      )
                    })()}
                    {t.comingSoon && t.description && (
                      <div style={{ backgroundColor: 'rgba(249,115,22,0.07)', border: '1px dashed rgba(249,115,22,0.35)', borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>
                        <p style={{ fontSize: 11, color: 'var(--fg-50)', lineHeight: 1.6 }}>{t.description}</p>
                      </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3.5, opacity: t.comingSoon ? 0.35 : 1, flex: 1 }}>
                      {/* Inheritance banner */}
                      {t.inherits && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, backgroundColor: 'var(--fg-04)', border: '1px solid var(--fg-08)', borderRadius: 8, padding: '5px 9px', marginBottom: 3 }}>
                          <span style={{ fontSize: 10 }}>⬆️</span>
                          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--fg-50)', letterSpacing: 0.3 }}>
                            Includes everything in <span style={{ color: 'var(--text)' }}>{t.inherits}</span>, plus:
                          </span>
                        </div>
                      )}
                      {t.features.map((f, fi) => (
                        <div key={fi} style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
                          <span style={{ color: t.color, fontSize: 10.5, marginTop: 1.5, flexShrink: 0 }}>✓</span>
                          <span style={{ fontSize: 10.5, color: 'var(--fg-60)', lineHeight: 1.3 }}>{f}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: 10 }}>
                      {process.env.NEXT_PUBLIC_WAITLIST_ACTIVE === '1' && searchParams.get('invited') !== '1' ? (
                        <a href="/waitlist"
                          style={{ display: 'block', width: '100%', padding: 10, backgroundColor: '#C9F400', borderRadius: 12, color: '#0D1210', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.08em', textTransform: 'uppercase', textAlign: 'center', textDecoration: 'none', boxShadow: '0 0 16px rgba(201,244,0,0.3)' }}>
                          Join Waitlist →
                        </a>
                      ) : t.comingSoon ? (
                        <div style={{ width: '100%', padding: 10, background: 'rgba(249,115,22,0.08)', border: '1px dashed rgba(249,115,22,0.3)', borderRadius: 12, textAlign: 'center', fontSize: 12, fontWeight: 700, color: 'rgba(249,115,22,0.6)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                          Notify Me When Available
                        </div>
                      ) : t.id === 'tracker' && betaCount >= 60 ? (
                        <button className="cta-btn" onClick={() => selectAndContinue(t.id)}
                          style={{ width: '100%', padding: 10, backgroundColor: '#C9F400', border: 'none', borderRadius: 12, color: '#0D1210', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.08em', textTransform: 'uppercase', boxShadow: '0 0 16px rgba(201,244,0,0.3)' }}>
                          Buy Tracker — $5.00/mo →
                        </button>
                      ) : (
                        <button className="cta-btn" onClick={() => selectAndContinue(t.id)}
                          style={{ width: '100%', padding: 10, backgroundColor: t.color === '#C9F400' ? '#C9F400' : t.color, border: 'none', borderRadius: 12, color: t.color === '#C9F400' ? '#0D1210' : '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.08em', textTransform: 'uppercase', boxShadow: `0 0 16px ${t.glow}` }}>
                          {t.id === 'tracker' ? 'Claim Beta Spot →' : 'Get Started →'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p style={{ textAlign: 'center', marginTop: 14, fontSize: 11, color: 'var(--fg-20)' }}>
              All paid plans can be cancelled anytime · No hidden fees
            </p>
          </div>
        )}

        {/* ── SIGN UP STEP 2 — create account ── */}
        {mode === 'signup' && step === 2 && (
          <div style={{ maxWidth: 420, margin: '0 auto', padding: '0 24px 60px', animation: 'fadeUp 0.5s ease' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 24 }}>
              <button onClick={() => setStep(1)} style={{ backgroundColor: 'var(--surface)', border: '1px solid rgba(201,244,0,0.12)', borderRadius: 8, padding: '4px 10px', color: '#7A8F80', cursor: 'pointer', fontSize: 12, fontFamily: "'Barlow Condensed', sans-serif" }}>← Back</button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'rgba(201,244,0,0.06)', border: `1px solid ${tier.border}`, borderRadius: 20, padding: '6px 16px' }}>
                <span style={{ fontSize: 14 }}>{tier.icon}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: tier.color, fontFamily: "'Barlow Condensed', sans-serif" }}>{tier.name}</span>
                <span style={{ fontSize: 13, color: '#4A5F50' }}>{tier.price}{tier.period}</span>
              </div>
            </div>
            <div style={{ backgroundColor: 'var(--surface)', borderRadius: 20, padding: 28, border: '1px solid rgba(201,244,0,0.12)' }}>
              <h2 style={{ fontSize: 26, fontWeight: 800, marginBottom: 6, color: 'var(--text)', fontFamily: "'Barlow Condensed', sans-serif", textTransform: 'uppercase', letterSpacing: '0.02em' }}>Create your account</h2>
              <p style={{ fontSize: 13, color: '#7A8F80', marginBottom: 24 }}>Join the Amped Map community</p>
              <form onSubmit={handleSignUp} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#4A5F50', letterSpacing: '0.14em', display: 'block', marginBottom: 8, fontFamily: "'Barlow Condensed', sans-serif", textTransform: 'uppercase' }}>Username</label>
                  <input className="em-input" type="text" placeholder="yourname" value={username} onChange={(e) => { setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '')); setError(null) }} required
                    style={{ width: '100%', padding: '13px 16px', backgroundColor: 'var(--bg)', border: '1px solid rgba(201,244,0,0.12)', borderRadius: 12, color: 'var(--text)', fontSize: 15 }} />
                  <p style={{ fontSize: 10, color: '#4A5F50', marginTop: 6 }}>Letters, numbers, underscores only</p>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#4A5F50', letterSpacing: '0.14em', display: 'block', marginBottom: 8, fontFamily: "'Barlow Condensed', sans-serif", textTransform: 'uppercase' }}>Email</label>
                  <input className="em-input" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required
                    style={{ width: '100%', padding: '13px 16px', backgroundColor: 'var(--bg)', border: '1px solid rgba(201,244,0,0.12)', borderRadius: 12, color: 'var(--text)', fontSize: 15 }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#4A5F50', letterSpacing: '0.14em', display: 'block', marginBottom: 8, fontFamily: "'Barlow Condensed', sans-serif", textTransform: 'uppercase' }}>Password</label>
                  <div style={{ position: 'relative' }}>
                    <input className="em-input" type={showPassword ? 'text' : 'password'} placeholder="Min. 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} required
                      style={{ width: '100%', padding: '13px 48px 13px 16px', backgroundColor: 'var(--bg)', border: '1px solid rgba(201,244,0,0.12)', borderRadius: 12, color: 'var(--text)', fontSize: 15 }} />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#4A5F50', cursor: 'pointer', fontSize: 16 }}>
                      {showPassword ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>
                {error && <p style={{ fontSize: 13, color: '#FF4545' }}>{error}</p>}
                {confirmEmail && (
                  <div style={{ backgroundColor: 'rgba(201,244,0,0.08)', border: '1px solid rgba(201,244,0,0.25)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>Check your email and click the confirmation link to activate your account.</p>
                    <button
                      type="button"
                      onClick={() => { setConfirmEmail(false); switchMode('signin') }}
                      style={{ background: 'none', border: '1px solid rgba(201,244,0,0.3)', borderRadius: 8, color: 'var(--accent)', fontSize: 12, fontWeight: 700, padding: '7px 14px', cursor: 'pointer', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.04em', alignSelf: 'flex-start' }}
                    >
                      Already confirmed? Sign in →
                    </button>
                  </div>
                )}
                <button type="submit" className="cta-btn" disabled={submitting || confirmEmail}
                  style={{ width: '100%', padding: 15, backgroundColor: '#C9F400', border: 'none', borderRadius: 14, color: '#0D1210', fontSize: 16, fontWeight: 800, cursor: 'pointer', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.08em', textTransform: 'uppercase', boxShadow: '0 0 20px rgba(201,244,0,0.35)', marginTop: 4 }}>
                  {submitting
                    ? <div style={{ width: 20, height: 20, border: '2px solid #0D1210', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
                    : selectedTier === 'free' ? 'Create Free Account →' : 'Continue →'}
                </button>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', marginTop: 4 }}>
                  <input
                    type="checkbox"
                    checked={agreedToTerms}
                    onChange={(e) => setAgreedToTerms(e.target.checked)}
                    style={{ marginTop: 2, accentColor: '#C9F400', width: 14, height: 14, flexShrink: 0 }}
                  />
                  <span style={{ fontSize: 11, color: '#4A5F50', lineHeight: 1.6 }}>
                    I agree to the <a href="/terms" target="_blank" style={{ color: '#7A8F80', textDecoration: 'underline' }}>Terms of Service</a> and <a href="/privacy" target="_blank" style={{ color: '#7A8F80', textDecoration: 'underline' }}>Privacy Policy</a>.
                  </span>
                </label>
              </form>
              <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: '#4A5F50' }}>
                Already have an account?{' '}
                <button onClick={() => switchMode('signin')} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 13, letterSpacing: '0.04em' }}>Sign in</button>
              </p>
            </div>
          </div>
        )}

        {/* ── DIVIDER ── */}
        <div style={{ maxWidth: 900, margin: '0 auto 24px', padding: '0 24px' }}>
          <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(201,244,0,0.1), transparent)' }} />
        </div>

        {/* ── CONTACT ── */}
        <div style={{ maxWidth: 420, margin: '0 auto', padding: '0 24px 28px' }}>
          <div style={{ backgroundColor: 'rgba(201,244,0,0.04)', border: '1px solid rgba(201,244,0,0.18)', borderRadius: 20, padding: '22px 20px', textAlign: 'center' }}>
            <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', letterSpacing: '0.14em', marginBottom: 14, fontFamily: "'Barlow Condensed', sans-serif", textTransform: 'uppercase' }}>Get In Touch</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <a
                href="mailto:support@ampedmap.com"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, padding: '12px 16px', backgroundColor: 'var(--surface)', border: '1px solid rgba(201,244,0,0.2)', borderRadius: 14, textDecoration: 'none' }}
              >
                <MailIcon size={16} color="var(--accent)" />
                <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>support@ampedmap.com</span>
              </a>
              <a
                href="https://www.tiktok.com/@ampedmap"
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, padding: '12px 16px', backgroundColor: 'var(--surface)', border: '1px solid rgba(201,244,0,0.2)', borderRadius: 14, textDecoration: 'none' }}
              >
                <TiktokIcon size={16} color="var(--accent)" />
                <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>@ampedmap on TikTok</span>
              </a>
            </div>
          </div>
        </div>

        {/* ── FOOTER ── */}
        <div style={{ textAlign: 'center', padding: '0 24px 48px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 16 }}>⚡</span>
            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#4A5F50' }}>Amped Map</span>
          </div>
          <p style={{ fontSize: 11, color: '#4A5F50' }}>Built for the community · Powered by real-time reports</p>
        </div>
      </div>
    </div>
  )
}

export default function AccountPage() {
  return <Suspense><AccountPageInner /></Suspense>
}
