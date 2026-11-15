'use client'

import { BADGE_DEFS } from '@/lib/badges'
import PlanDetails from '@/components/account/PlanDetails'
import { useTheme, type ThemePref } from '@/contexts/ThemeContext'
import { useState, useEffect, useRef, Suspense } from 'react'
import Link from 'next/link'
import authStyles from './auth.module.css'
import CheckEmailModal from '@/components/CheckEmailModal'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import Toast from '@/components/Toast'
import Onboarding from '@/components/onboarding/Onboarding'
import { usePreferences } from '@/lib/preferences'
import { StoreTypeIcon, CheckIcon, BellIcon, HeartIcon, CloseIcon, ChevronLeftIcon, ChevronRightIcon, LightningIcon, TrophyIcon, DrinkIcon, UserIcon, ClipboardIcon } from '@/components/Icons'
import BoltLoader from '@/components/ui/BoltLoader'

type Mode = 'signin' | 'signup'
type TierId = 'free' | 'tracker'


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
    const { error: insertError } = await supabase.from('profiles').insert({ id: userId, username, tier: 'free' })
    if (insertError) { setError('Could not save your username. Try again.'); setSubmitting(false); return }

    // Users who signed in with Google land here on first login. Pick up the
    // plan they chose on the signup screen (stashed before the Google
    // redirect), send the welcome email, and continue a Tracker signup.
    let pendingTier = 'free'
    try { pendingTier = JSON.parse(localStorage.getItem('pending_profile') ?? 'null')?.tier ?? 'free' } catch {}
    localStorage.removeItem('pending_profile')

    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      fetch('/api/email/welcome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ email, username, tier: pendingTier }),
      }).catch(() => {})

      if (pendingTier === 'tracker') {
        try {
          const res = await fetch('/api/upgrade/tracker', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({ username }),
          })
          const json = await res.json()
          if (json.url) { window.location.href = json.url; return }
          if (!json.upgraded) { window.location.href = '/account?upgradeError=1'; return }
        } catch {
          window.location.href = '/account?upgradeError=1'
          return
        }
      }
    }
    window.location.href = '/'
  }

  return (
    <div style={{ height: '100%', backgroundColor: 'var(--bg)', paddingLeft: 20, paddingRight: 20, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingBottom: 'calc(70px + env(safe-area-inset-bottom))' }}>
      <p style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>One more step</p>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 24 }}>Pick a username for your account ({email})</p>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', marginBottom: 8 }}>Username</p>
          <input
            type="text"
            style={{ width: '100%', borderRadius: 14, padding: '14px 16px', fontSize: 14, color: 'var(--text)', outline: 'none', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', fontFamily: "'Barlow', sans-serif" }}
            placeholder="yourname"
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
            autoFocus
          />
          <p style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 6 }}>Lowercase letters, numbers, underscores only</p>
        </div>
        {error && <p style={{ fontSize: 13, color: '#FF4545' }}>{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          style={{ width: '100%', borderRadius: 14, padding: 16, fontWeight: 800, color: '#0D1210', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: submitting ? 'not-allowed' : 'pointer', backgroundColor: submitting ? 'rgba(201,244,0,0.4)' : '#C9F400', boxShadow: 'none' }}
        >
          {submitting
            ? <div style={{ width: 20, height: 20, border: '2px solid #0D1210', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            : 'Save Username →'}
        </button>
        <p style={{ fontSize: 11, color: 'var(--text-dim)', textAlign: 'center', lineHeight: 1.5 }}>
          By continuing you agree to the <a href="/terms" style={{ color: 'var(--text-muted)' }}>Terms of Service</a> and <a href="/privacy" style={{ color: 'var(--text-muted)' }}>Privacy Policy</a>.
        </p>
      </form>
    </div>
  )
}

// "Continue with Google". Before redirecting to Google, stash the plan the
// user picked so /auth/callback → SetupProfile can finish the signup the same
// way the email flow does (no username yet, so the callback hands off to the
// username screen instead of inventing one from the email address).
function GoogleSignInButton({ tier = 'free', onError }: { tier?: TierId; onError: (msg: string) => void }) {
  const [busy, setBusy] = useState(false)

  // Hidden until Google is enabled as a provider in Supabase (Auth → Providers).
  // Without that, the redirect lands on a raw Supabase error page.
  if (process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED !== 'true') return null

  async function signIn() {
    if (busy) return
    setBusy(true)
    localStorage.setItem('pending_profile', JSON.stringify({ tier }))
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) {
      onError('Google sign-in is unavailable right now. Try email instead.')
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={signIn}
        disabled={busy}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '13px 16px', borderRadius: 12, backgroundColor: '#fff', border: 'none', color: '#1f1f1f', fontSize: 15, fontWeight: 600, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1, fontFamily: "'Barlow', sans-serif" }}
      >
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
        </svg>
        {busy ? 'Opening Google…' : 'Continue with Google'}
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '18px 0' }}>
        <div style={{ flex: 1, height: 1, backgroundColor: 'var(--fg-08)' }} />
        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>or</span>
        <div style={{ flex: 1, height: 1, backgroundColor: 'var(--fg-08)' }} />
      </div>
    </>
  )
}

const QUANTITY_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  out:    { label: 'OUT',  color: '#FF4545', bg: 'rgba(255,69,69,0.08)',   border: 'rgba(255,69,69,0.25)'   },
  low:    { label: 'LOW',  color: '#FFB300', bg: 'rgba(255,179,0,0.08)',   border: 'rgba(255,179,0,0.25)'   },
  medium: { label: 'MED',  color: '#FFB300', bg: 'rgba(255,179,0,0.08)',   border: 'rgba(255,179,0,0.25)'   },
  full:   { label: 'FULL', color: 'var(--accent-text)', bg: 'rgba(201,244,0,0.08)',   border: 'rgba(201,244,0,0.25)'   },
}

type AccountSubpage = 'root' | 'profile' | 'plan' | 'badges' | 'saved' | 'alerts' | 'username' | 'password' | 'appearance'

// Small line icons used only by the Account settings list (no equivalent in
// the shared Icons set). Same 24×24 / rounded-stroke language as Icons.tsx.
function SlidersIcon({ size = 17, color = '#0D1210' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" />
    </svg>
  )
}
function ThemeIcon({ size = 17, color = '#0D1210' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" /><path d="M12 3.5v17a8.5 8.5 0 0 0 0-17z" fill={color} />
    </svg>
  )
}
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

function AccountPageInner() {
  const { user, profile, loading, refreshProfile } = useAuth()
  const searchParams = useSearchParams()
  const router = useRouter()
  // The landing page (/) links here with ?mode=signin|signup and, from its
  // pricing cards, ?plan=free|tracker to skip straight to the account form.
  const initialPlan = searchParams.get('plan')
  const planParam: TierId | null = initialPlan === 'free' || initialPlan === 'tracker' ? initialPlan : null
  const [mode, setMode] = useState<Mode>(searchParams.get('mode') === 'signin' ? 'signin' : 'signup')
  const [selectedTier, setSelectedTier] = useState<TierId>(planParam ?? 'free')
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
  const [showCheckEmail, setShowCheckEmail] = useState(false)
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
  const { prefs, save: savePrefs } = usePreferences()
  const { pref: themePref, setPref: setThemePref } = useTheme()
  const [editingPrefs, setEditingPrefs] = useState(false)

  useEffect(() => {
    function onPop(e: PopStateEvent) {
      setAccountPage((e.state?.accountPage as AccountSubpage) ?? 'root')
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // Deep links like /account?page=badges (used by notifications) open that
  // drill-down directly, with Back returning to the Account list.
  useEffect(() => {
    const p = searchParams.get('page')
    if (p !== 'badges' && p !== 'alerts' && p !== 'plan' && p !== 'appearance') return
    window.history.replaceState({ accountPage: 'root' }, '', '/account')
    window.history.pushState({ accountPage: p }, '')
    setAccountPage(p)
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Refresh profile after successful Stripe payment
  useEffect(() => {
    if (searchParams.get('payment') === 'success') {
      refreshProfile().then(() => router.replace('/'))
    }
    // If user cancelled Stripe and came back, reset to signup form
    if (searchParams.get('payment') === 'cancelled') {
      setSubmitting(false)
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
      showToast("Couldn't start your Tracker upgrade — you're on Free for now. Retry anytime from Account → Plan.")
    }
  }, [searchParams])

  // Reset submitting state if page is restored from bfcache (browser back button)
  useEffect(() => {
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        setSubmitting(false)
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
        const parsed = pending ? JSON.parse(pending) : null
        // No username chosen on this device (e.g. confirmed the email on
        // another one): stay here and let the pick-a-username screen
        // (SetupProfile) take over, instead of publishing the email prefix.
        if (!parsed?.username) { setSubmitting(false); return }
        const { username: pendingUsername, tier: pendingTier } = parsed

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
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (!agreedToTerms) { setError('Please agree to the Terms of Service and Privacy Policy.'); return }
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
      if (!data.session) { setSubmitting(false); setConfirmEmail(true); setShowCheckEmail(true); return }

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

  // Log out → back to the home page (landing with Sign in / Get started).
  // A full page load clears every bit of signed-in state, and the attributes
  // the pre-paint script set (signed-in spinner, light theme) are removed
  // first so the landing never flashes the wrong look.
  async function handleSignOut() {
    await supabase.auth.signOut()
    document.documentElement.removeAttribute('data-authed')
    document.documentElement.removeAttribute('data-theme')
    window.location.replace('/')
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
    // One read of the report history serves both unique flavors and dates.
    const [{ count: rCount }, { count: sCount }, { data: history }, { data: lb }] = await Promise.all([
      supabase.from('stock_reports').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('stores').select('id', { count: 'exact', head: true }).eq('submitted_by', userId).eq('status', 'approved'),
      supabase.from('stock_reports').select('drink_id, reported_at').eq('user_id', userId).order('reported_at', { ascending: false }),
      supabase.rpc('get_leaderboard', { p_timeframe: 'All Time' }),
    ])
    const flavors = history
    const dates = history
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

  async function cancelSubscription(resume = false, isBeta = false) {
    if (cancelLoading || !user) return
    if (!resume && !window.confirm(isBeta
      ? 'Cancel Tracker? You’ll move to Free right away and give up your free beta spot. Getting Tracker back later may cost $5/month.'
      : 'Cancel Tracker? You keep every Tracker feature until the end of your current billing period, then move to Free. You won’t be charged again.')) return
    setCancelLoading(true)
    setCancelError(null)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setCancelLoading(false); return }
    try {
      const res = await fetch('/api/stripe/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ userId: user.id, resume }),
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


function switchMode(m: Mode) {
    setMode(m)
    setError(null)
    setConfirmEmail(false)
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: 'var(--bg)' }}>
        <BoltLoader fullScreen={false} />
      </div>
    )
  }

  // Full-screen overlay during paid signup redirect to Stripe
  const isPaidSignup = submitting && selectedTier === 'tracker'
  if (isPaidSignup) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: 'var(--bg)', gap: 16 }}>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <BoltLoader fullScreen={false} />
        <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-muted)' }}>Redirecting to payment...</p>
      </div>
    )
  }

  if (user && !profile && !loading) return <SetupProfile userId={user.id} email={user.email ?? ''} />
  if (user && !profile) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: 'var(--bg)' }}>
        <BoltLoader fullScreen={false} />
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
      tracker: { label: 'Tracker', color: 'var(--accent-text)', icon: '⚡' },
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
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', margin: '0 16px 7px' }}>{opts.header}</p>
          )}
          <div style={{ borderRadius: 12, backgroundColor: 'var(--surface)', overflow: 'hidden' }}>{children}</div>
          {opts.footer && (
            <p style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.45, margin: '7px 16px 0' }}>{opts.footer}</p>
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
          {value !== undefined && <span style={{ fontSize: 15, color: 'var(--text-muted)', flexShrink: 0, maxWidth: '45%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>}
          {chevron && !center && <ChevronRightIcon size={15} color="var(--fg-25)" />}
        </div>
      )
      if (href) return <a href={href} style={{ display: 'block', textDecoration: 'none' }}>{inner}</a>
      if (onPress) return <button onClick={onPress} style={{ display: 'block', width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>{inner}</button>
      return inner
    }

    const inputStyle: React.CSSProperties = { width: '100%', padding: '14px 16px', fontSize: 16, color: 'var(--text)', outline: 'none', backgroundColor: 'transparent', border: 'none', fontFamily: "'Barlow', sans-serif" }
    const ICON = '#0D1210'
    const PAGE_TITLES: Record<AccountSubpage, string> = {
      root: 'Account', profile: 'Profile', plan: 'Plan', badges: 'Badges', saved: 'Saved Stores',
      alerts: 'Flavor Alerts', username: 'Username', password: 'Password', appearance: 'Appearance',
    }

    const avatar = (size: number) => (
      <div style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, rgba(201,244,0,0.3), rgba(201,244,0,0.08))', border: `${size > 70 ? 3 : 2}px solid rgba(201,244,0,0.5)` }}>
        <span style={{ fontSize: size * 0.42, fontWeight: 700, color: 'var(--accent-text)' }}>{profile.username[0].toUpperCase()}</span>
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
          <p style={{ fontSize: 13, color: 'var(--text-dim)' }}>{body}</p>
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
                  <p style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>@{profile.username}</p>
                  {profile.is_verified_reporter && <CheckIcon size={16} color="#60a5fa" />}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {profile.is_admin && <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 99, backgroundColor: 'rgba(201,244,0,0.15)', color: 'var(--accent-text)', border: '1px solid rgba(201,244,0,0.3)' }}>ADMIN</span>}
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 99, backgroundColor: `color-mix(in srgb, ${tierInfo.color} 9%, transparent)`, color: tierInfo.color, border: `1px solid color-mix(in srgb, ${tierInfo.color} 25%, transparent)` }}>{tierInfo.icon} {tierInfo.label.toUpperCase()}</span>
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
            <PlanDetails betaSpotsLeft={Math.max(0, 60 - betaCount)} checkoutLoading={checkoutLoading} checkoutError={checkoutError} onUpgrade={() => startCheckout('tracker')} cancelLoading={cancelLoading} cancelError={cancelError} onCancel={(isBeta) => cancelSubscription(false, isBeta)} onResume={() => cancelSubscription(true)} />
          )

        case 'badges': {
          const sorted = [...BADGE_DEFS].sort((a, b) => (earned.has(a.id) ? 0 : 1) - (earned.has(b.id) ? 0 : 1))
          return (
            <div style={{ padding: '0 16px 22px' }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', margin: '0 16px 7px' }}>{earned.size} of {BADGE_DEFS.length} earned</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {sorted.map((b) => {
                  const isEarned = earned.has(b.id)
                  const hint = progressHint(b.id)
                  return (
                    <div key={b.id} className={isEarned ? 'reveal shine' : 'reveal'} style={{ ['--shine-delay' as string]: '0.5s', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center', backgroundColor: isEarned ? 'var(--fg-04)' : 'var(--surface)', border: isEarned ? `1px solid ${b.color}40` : '1px solid transparent', boxShadow: 'none', opacity: isEarned ? 1 : 0.45 }}>
                      <span style={{ fontSize: 26, filter: isEarned ? 'none' : 'grayscale(1)' }}>{b.icon}</span>
                      <p style={{ fontSize: 12, fontWeight: 800, lineHeight: 1.2, color: isEarned ? b.color : 'var(--text-dim)' }}>{b.name}</p>
                      <p style={{ fontSize: 10, lineHeight: 1.3, color: 'var(--text-dim)' }}>{hint ?? b.desc}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        }

        case 'saved':
          if (!isTracker) return emptyState(<HeartIcon size={32} color="var(--text-dim)" />, 'Tracker Feature', 'Save and organize your favorite stores with the Tracker plan.', { label: 'See Plans', onPress: () => openAccountPage('plan') })
          if (favoritesLoading) return spinner
          if (favorites.length === 0) return emptyState(<HeartIcon size={32} color="var(--text-dim)" />, 'No favorites yet', 'Tap the heart on any store page to save it here.')
          return group(favorites.map((fav, i) => {
            const store = fav.store
            return (
              <div key={fav.id}>
                {i > 0 && <div style={{ height: 1, backgroundColor: 'var(--fg-06)', marginLeft: 50 }} />}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px' }}>
                  <StoreTypeIcon type={store?.type} size={22} color="var(--text-muted)" />
                  <a href={`/store/${store.id}?name=${encodeURIComponent(store.name)}`} style={{ flex: 1, minWidth: 0, textDecoration: 'none' }}>
                    <p style={{ fontSize: 16, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{store?.name}</p>
                    <p style={{ fontSize: 12, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{store?.address}</p>
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
                  <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 5, backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
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
                            <BellIcon size={15} color={already ? 'var(--accent-text)' : 'var(--text-dim)'} filled={already} />
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
              {drinkAlertsLoading ? spinner : drinkAlerts.length === 0
                ? emptyState(<BellIcon size={32} color="var(--text-dim)" />, 'No flavor alerts yet', 'Tap the bell on any drink card to get notified when it restocks.')
                : group(drinkAlerts.map((a, i) => {
                    const scopeLabel = a.scope === 'store' ? (a.store?.name ?? 'This store only')
                      : a.scope === 'radius' ? `Within ${a.radius_miles} miles`
                      : 'Anywhere'
                    return (
                      <div key={a.id}>
                        {i > 0 && <div style={{ height: 1, backgroundColor: 'var(--fg-06)', marginLeft: 50 }} />}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px' }}>
                          <BellIcon size={22} color="var(--accent-text)" filled />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 16, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.drink?.flavor ?? a.drink?.name}</p>
                            <p style={{ fontSize: 12, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{scopeLabel}</p>
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
                  <span style={{ fontSize: 16, color: 'var(--text-muted)' }}>@</span>
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

        case 'appearance': {
          const OPTIONS: { value: ThemePref; label: string; hint: string }[] = [
            { value: 'dark', label: 'Dark', hint: 'The original AmpedMap look' },
            { value: 'light', label: 'Light', hint: 'Bright backgrounds, easier in sunlight' },
            { value: 'system', label: 'Match my phone', hint: 'Follows your device’s light/dark setting' },
          ]
          return (
            <>
              {group(OPTIONS.map((o, i) => (
                <div key={o.value}>
                  {i > 0 && ROW_SEP}
                  <button
                    onClick={() => setThemePref(o.value)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}
                  >
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 16, color: 'var(--text)' }}>{o.label}</span>
                      <span style={{ display: 'block', fontSize: 13, color: 'var(--text-dim)', marginTop: 1 }}>{o.hint}</span>
                    </span>
                    {themePref === o.value && <span className="anim-pop" style={{ display: 'flex' }}><CheckIcon size={18} color="var(--accent-text)" /></span>}
                  </button>
                </div>
              )), { footer: 'Saved on this device. The sign-in and welcome pages always stay dark.' })}
            </>
          )
        }

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

        {editingPrefs && user && (
          <Onboarding userId={user.id} initial={prefs} mode="edit" onSave={async (p) => { await savePrefs(p); fetchDrinkAlerts(user.id); showToast('Preferences saved') }} onClose={() => setEditingPrefs(false)} />
        )}

        {accountPage === 'root' ? (
          /* ── ROOT LIST ── */
          <div key="root" style={{ animation: 'acctFadeIn 0.18s ease' }}>
            <h1 style={{ fontSize: 30, fontWeight: 700, color: 'var(--text)', padding: '4px 20px 14px', lineHeight: 1.1 }}>Account</h1>

            {/* Profile card */}
            <div style={{ margin: '0 16px 22px' }}>
              <button onClick={() => openAccountPage('profile')} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', borderRadius: 12, backgroundColor: 'var(--surface)', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                {avatar(60)}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <p style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{profile.username}</p>
                    {profile.is_verified_reporter && <CheckIcon size={15} color="#60a5fa" />}
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
              {ROW_SEP}
              {row({ icon: <ThemeIcon />, label: 'Appearance', value: themePref === 'system' ? 'Match phone' : themePref === 'light' ? 'Light' : 'Dark', onPress: () => openAccountPage('appearance') })}
              {ROW_SEP}
              {row({ icon: <SlidersIcon />, label: 'Your preferences', value: prefs.brands.length ? prefs.brands.slice(0, 2).join(', ') + (prefs.brands.length > 2 ? '…' : '') : 'Not set', onPress: () => setEditingPrefs(true) })}
            </>)}

            {group(<>
              {row({ icon: <UserIcon size={17} color={ICON} />, label: 'Username', value: `@${profile.username}`, onPress: () => openAccountPage('username') })}
              {ROW_SEP}
              {row({ icon: <KeyIcon />, label: 'Password', onPress: () => openAccountPage('password') })}
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
              <button onClick={closeAccountPage} style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'none', border: 'none', cursor: 'pointer', padding: '6px 8px', color: 'var(--accent-text)', fontSize: 16, fontWeight: 500, position: 'relative', zIndex: 1 }}>
                <ChevronLeftIcon size={20} color="var(--accent-text)" /> Account
              </button>
              <p style={{ position: 'absolute', left: 0, right: 0, textAlign: 'center', fontSize: 17, fontWeight: 700, color: 'var(--text)', pointerEvents: 'none' }}>{PAGE_TITLES[accountPage]}</p>
            </div>
            {renderSubpage()}
          </div>
        )}
      </div>
    )
  }

  // ── LOGGED OUT: sign in / sign up ──────────────────────────
  // Styled to match the landing page at / (shared look via auth.module.css).
  // Sign-up is a single form; new accounts start on Free unless the visitor
  // chose Tracker on the landing page's pricing cards (?plan=tracker).
  const waitlistGated = process.env.NEXT_PUBLIC_WAITLIST_ACTIVE === '1' && searchParams.get('invited') !== '1'
  const spotsLeft = Math.max(0, 60 - betaCount)

  const passwordField = (placeholder: string, autoComplete: string) => (
    <div className={authStyles.passwordWrap}>
      <input
        id="password"
        className={authStyles.input}
        type={showPassword ? 'text' : 'password'}
        placeholder={placeholder}
        autoComplete={autoComplete}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      <button type="button" className={authStyles.eye} onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
          {showPassword && <path d="M4 4l16 16" />}
        </svg>
      </button>
    </div>
  )

  const spinnerDark = <span className={authStyles.btnSpinner} aria-label="Loading" />

  return (
    <div className={authStyles.page}>
      <header className={authStyles.header}>
        <Link href="/" className={authStyles.brand}>
          <span className={authStyles.logoMark}>
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 2 4.5 13.5h6.2L9.8 22l9-11.6h-6.3L13.5 2z" fill="#0D1210" /></svg>
          </span>
          AmpedMap
        </Link>
      </header>

      <main className={authStyles.main}>
        <div className={authStyles.card}>
          {mode === 'signin' ? (
            <>
              <h1 className={authStyles.title}>Welcome back</h1>
              <p className={authStyles.subtitle}>Sign in to see what&apos;s in stock near you.</p>

              {searchParams.get('confirmed') === '1' && (
                <p className={authStyles.notice}>Email confirmed! Sign in to finish setting up your account.</p>
              )}

              <GoogleSignInButton onError={setError} />

              <form onSubmit={handleSignIn} className={authStyles.form}>
                <div className={authStyles.field}>
                  <label htmlFor="email" className={authStyles.label}>Email</label>
                  <input id="email" className={authStyles.input} type="email" placeholder="you@example.com" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div className={authStyles.field}>
                  <div className={authStyles.labelRow}>
                    <label htmlFor="password" className={authStyles.label}>Password</label>
                    <button type="button" className={authStyles.linkBtn} onClick={handleForgotPassword}>Forgot password?</button>
                  </div>
                  {passwordField('Your password', 'current-password')}
                </div>
                {resetSent && <p className={authStyles.notice}>Reset link sent. Check your email.</p>}
                {error && <p className={authStyles.error}>{error}</p>}
                <button type="submit" className={authStyles.btnPrimary} disabled={submitting}>
                  {submitting ? spinnerDark : 'Sign in'}
                </button>
              </form>

              <p className={authStyles.switch}>
                New to AmpedMap? <button type="button" className={authStyles.linkBtnAccent} onClick={() => switchMode('signup')}>Create an account</button>
              </p>
            </>
          ) : waitlistGated ? (
            <>
              <h1 className={authStyles.title}>Invite only, for now</h1>
              <p className={authStyles.subtitle}>
                AmpedMap is letting people in from the waitlist.{waitlistCount != null ? ` ${waitlistCount.toLocaleString()} people are already on it.` : ''}
              </p>
              <a href="/waitlist" className={authStyles.btnPrimary}>Join the waitlist</a>
              <p className={authStyles.switch}>
                Already have an account? <button type="button" className={authStyles.linkBtnAccent} onClick={() => switchMode('signin')}>Sign in</button>
              </p>
            </>
          ) : (
            <>
              <h1 className={authStyles.title}>Create your account</h1>
              <p className={authStyles.subtitle}>Free to join. Takes about a minute.</p>

              {selectedTier === 'tracker' && (
                <div className={authStyles.planNote}>
                  <p>
                    <strong>Signing up for Tracker.</strong>{' '}
                    {spotsLeft > 0 ? `The first 60 members get it free. ${spotsLeft} spot${spotsLeft === 1 ? '' : 's'} left.` : '$5/month, cancel anytime.'}
                  </p>
                  <button type="button" className={authStyles.linkBtn} onClick={() => setSelectedTier('free')}>Start on Free instead</button>
                </div>
              )}

              <GoogleSignInButton tier={selectedTier} onError={setError} />

              <form onSubmit={handleSignUp} className={authStyles.form}>
                <div className={authStyles.field}>
                  <label htmlFor="username" className={authStyles.label}>Username</label>
                  <input id="username" className={authStyles.input} type="text" placeholder="yourname" autoComplete="username" value={username} onChange={(e) => { setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '')); setError(null) }} required />
                  <p className={authStyles.hint}>Shown on reports and the leaderboard. Lowercase letters, numbers and underscores.</p>
                </div>
                <div className={authStyles.field}>
                  <label htmlFor="email" className={authStyles.label}>Email</label>
                  <input id="email" className={authStyles.input} type="email" placeholder="you@example.com" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div className={authStyles.field}>
                  <label htmlFor="password" className={authStyles.label}>Password</label>
                  {passwordField('At least 8 characters', 'new-password')}
                </div>
                <label className={authStyles.checkRow}>
                  <input type="checkbox" checked={agreedToTerms} onChange={(e) => setAgreedToTerms(e.target.checked)} />
                  <span>I agree to the <a href="/terms" target="_blank">Terms of Service</a> and <a href="/privacy" target="_blank">Privacy Policy</a>.</span>
                </label>
                {error && <p className={authStyles.error}>{error}</p>}
                {confirmEmail ? (
                  <div className={authStyles.notice}>
                    <p style={{ margin: 0 }}>Check your email and tap the link to activate your account. It can take up to 24 hours, and it may land in Spam or Junk.</p>
                    <button type="button" className={authStyles.linkBtnAccent} style={{ marginTop: 8 }} onClick={() => { setConfirmEmail(false); switchMode('signin') }}>Already confirmed? Sign in</button>
                  </div>
                ) : (
                  <button type="submit" className={authStyles.btnPrimary} disabled={submitting}>
                    {submitting ? spinnerDark : selectedTier === 'tracker' ? 'Create account and continue' : 'Create account'}
                  </button>
                )}
              </form>

              <p className={authStyles.switch}>
                Already have an account? <button type="button" className={authStyles.linkBtnAccent} onClick={() => switchMode('signin')}>Sign in</button>
              </p>
            </>
          )}
        </div>
      </main>

      {showCheckEmail && <CheckEmailModal email={email} kind="confirm" onClose={() => setShowCheckEmail(false)} />}

      <footer className={authStyles.footer}>
        <Link href="/">Home</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/privacy">Privacy</Link>
        <a href="mailto:support@ampedmap.com">Contact</a>
      </footer>
    </div>
  )
}

export default function AccountPage() {
  return <Suspense><AccountPageInner /></Suspense>
}
