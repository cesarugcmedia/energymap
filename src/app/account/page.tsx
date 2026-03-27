'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

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
    // Reload to refresh auth context
    window.location.reload()
  }

  return (
    <div className="h-full bg-[#0a0a0f] px-5 flex flex-col justify-center" style={{ paddingBottom: 'calc(70px + env(safe-area-inset-bottom))' }}>
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

export default function AccountPage() {
  const { user, profile, loading, refreshProfile } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [favorites, setFavorites] = useState<any[]>([])
  const [favLoading, setFavLoading] = useState(false)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [confirmEmail, setConfirmEmail] = useState(false)

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError) {
      setError('Invalid email or password.')
    }
    setSubmitting(false)
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!username.trim()) { setError('Username is required.'); return }
    if (username.length < 3) { setError('Username must be at least 3 characters.'); return }
    setSubmitting(true)

    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', username.trim())
      .maybeSingle()
    if (existing) {
      setError('That username is already taken.')
      setSubmitting(false)
      return
    }

    const { data, error: authError } = await supabase.auth.signUp({ email, password })
    if (authError) {
      setError(authError.message)
      setSubmitting(false)
      return
    }

    if (data.user) {
      await supabase.from('profiles').insert({ id: data.user.id, username: username.trim() })
      if (!data.session) {
        setSubmitting(false)
        setConfirmEmail(true)
        return
      }
      await refreshProfile()
    }
    setSubmitting(false)
  }

  useEffect(() => {
    if (user) fetchFavorites(user.id)
  }, [user])

  async function fetchFavorites(userId: string) {
    setFavLoading(true)
    const { data } = await supabase
      .from('favorites')
      .select('*, store:stores(id, name, type, address)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    if (data) setFavorites(data)
    setFavLoading(false)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0a0a0f]">
        <div className="w-8 h-8 border-2 border-[#22c55e] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // User is logged in but has no profile — only show setup after loading is confirmed done
  if (user && !profile && !loading) {
    return <SetupProfile userId={user.id} email={user.email} />
  }

  // Still resolving profile — show spinner
  if (user && !profile) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0a0a0f]">
        <div className="w-8 h-8 border-2 border-[#22c55e] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const TYPE_ICON: Record<string, string> = {
    gas_station: '⛽',
    convenience: '🏪',
    grocery: '🛒',
    other: '📍',
  }

  if (user && profile) {
    return (
      <div className="bg-[#0a0a0f]" style={{ paddingTop: 'calc(56px + env(safe-area-inset-top))' }}>

        {/* Profile card */}
        <div className="px-5 mb-6">
          <div
            className="rounded-2xl p-5"
            style={{ backgroundColor: '#1a1a24', border: '1px solid rgba(34,197,94,0.25)' }}
          >
            {/* Avatar + info row */}
            <div className="flex items-center gap-4 mb-4">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center shrink-0"
                style={{ backgroundColor: 'rgba(34,197,94,0.15)', border: '2px solid rgba(34,197,94,0.3)' }}
              >
                <span className="text-2xl font-black" style={{ color: '#22c55e' }}>
                  {profile.username[0].toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-lg font-black text-white truncate">@{profile.username}</p>
                <p className="text-xs text-white/40 mt-0.5 truncate">{user.email}</p>
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  {profile.is_admin && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}>
                      ADMIN
                    </span>
                  )}
                  {profile.is_verified_reporter && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.3)' }}>
                      ✓ VERIFIED
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Sign out button — full width below */}
            <button
              onClick={handleSignOut}
              className="w-full rounded-xl py-2.5 text-sm font-bold"
              style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* Favorite Stores */}
        <div className="px-5 mb-3">
          <p className="text-[10px] font-bold" style={{ color: 'rgba(255,255,255,0.35)', letterSpacing: '1.5px' }}>
            FAVORITE STORES
          </p>
        </div>

        {favLoading ? (
          <div className="flex justify-center mt-6">
            <div className="w-7 h-7 border-2 border-[#22c55e] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : favorites.length === 0 ? (
          <div
            className="mx-5 rounded-2xl p-6 flex flex-col items-center gap-2"
            style={{ backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <span style={{ fontSize: 32 }}>🤍</span>
            <p className="text-sm font-bold text-white">No favorites yet</p>
            <p className="text-xs text-white/40 text-center">Tap ❤️ on any store to save it here.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 px-5 pb-8">
            {favorites.map((fav) => {
              const store = fav.store
              if (!store) return null
              return (
                <div
                  key={fav.id}
                  className="rounded-2xl p-4 flex items-center gap-3"
                  style={{ backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.07)' }}
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}
                  >
                    <span style={{ fontSize: 20 }}>{TYPE_ICON[store.type] ?? '📍'}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{store.name}</p>
                    {store.address && (
                      <p className="text-xs text-white/40 mt-0.5 truncate">{store.address}</p>
                    )}
                  </div>
                  <a
                    href={`/store/${store.id}?name=${encodeURIComponent(store.name)}`}
                    className="text-xs font-bold px-3 py-2 rounded-xl shrink-0"
                    style={{ backgroundColor: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)', color: '#22c55e' }}
                  >
                    View Stock
                  </a>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  const TIERS = [
    {
      name: 'Free',
      price: null,
      color: '#22c55e',
      bg: 'rgba(34,197,94,0.08)',
      border: 'rgba(34,197,94,0.25)',
      icon: '🗺️',
      tag: null,
      features: [
        'Map with nearby stores',
        'View stock reports',
        'Submit stock reports',
        'Add missing stores',
        'Basic radius (10 miles)',
      ],
    },
    {
      name: 'Hunter',
      price: '$5/mo',
      color: '#f59e0b',
      bg: 'rgba(245,158,11,0.08)',
      border: 'rgba(245,158,11,0.3)',
      icon: '🎯',
      tag: 'For flavor seekers',
      features: [
        'Flavor alerts — instant notifications',
        'Saved favorites — pin top drinks',
        'Extended radius (25 miles)',
        'Early alerts before free users',
        'No staleness warning banners',
        'Verified reporter badge',
      ],
    },
    {
      name: 'Tracker',
      price: '$10/mo',
      color: '#a855f7',
      bg: 'rgba(168,85,247,0.08)',
      border: 'rgba(168,85,247,0.3)',
      icon: '📊',
      tag: 'For power users',
      features: [
        'Everything in Hunter',
        '30-day stock history per drink',
        'Custom lists (e.g. Best Ghost spots)',
        'Leaderboard placement + badge',
        'Dispute wrong reports',
        'Photo uploads — shelf proof',
      ],
    },
    {
      name: 'Store Owner',
      price: '$15/mo',
      color: '#3b82f6',
      bg: 'rgba(59,130,246,0.08)',
      border: 'rgba(59,130,246,0.3)',
      icon: '🏪',
      tag: 'For businesses',
      features: [
        'Everything in Tracker',
        'Claim your store',
        'Self-report stock updates',
        'Respond to community reports',
        'Verified store badge on the map',
        'Analytics — store view counts',
      ],
    },
  ]

  return (
    <div className="bg-[#0a0a0f] pb-12" style={{ paddingTop: 'calc(56px + env(safe-area-inset-top))' }}>

      {/* Hero */}
      <div className="px-5 pt-5 pb-7 text-center">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{ backgroundColor: 'rgba(34,197,94,0.12)', border: '1.5px solid rgba(34,197,94,0.3)', boxShadow: '0 0 24px rgba(34,197,94,0.2)' }}
        >
          <span style={{ fontSize: 32 }}>⚡</span>
        </div>
        <h1 className="text-3xl font-black text-white mb-2">EnergyMap</h1>
        <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.45)' }}>
          Know what's in stock before you drive there.<br />Track energy drinks at stores near you.
        </p>
      </div>

      {/* Tier cards — horizontal scroll */}
      <div className="mb-7">
        <p className="text-[10px] font-bold px-5 mb-3" style={{ color: 'rgba(255,255,255,0.3)', letterSpacing: '1.5px' }}>PLANS</p>
        <div className="flex gap-3 px-5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
          {TIERS.map((tier) => (
            <div
              key={tier.name}
              className="rounded-2xl p-4 flex-shrink-0"
              style={{
                width: 220,
                backgroundColor: tier.bg,
                border: `1.5px solid ${tier.border}`,
                boxShadow: `0 0 16px ${tier.color}18`,
              }}
            >
              {/* Header */}
              <div className="flex items-center gap-2.5 mb-3">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${tier.color}18`, border: `1px solid ${tier.color}33` }}
                >
                  <span style={{ fontSize: 18 }}>{tier.icon}</span>
                </div>
                <div>
                  <p className="text-base font-black text-white">{tier.name}</p>
                  {tier.price
                    ? <p className="text-xs font-bold" style={{ color: tier.color }}>{tier.price}</p>
                    : <p className="text-xs font-bold" style={{ color: tier.color }}>Free forever</p>
                  }
                </div>
              </div>

              {tier.tag && (
                <p className="text-[10px] font-semibold mb-3" style={{ color: `${tier.color}cc` }}>{tier.tag}</p>
              )}

              {/* Features */}
              <div className="flex flex-col gap-2">
                {tier.features.map((f) => (
                  <div key={f} className="flex items-start gap-2">
                    <span className="text-xs mt-0.5 shrink-0" style={{ color: tier.color }}>✓</span>
                    <p className="text-xs leading-snug" style={{ color: 'rgba(255,255,255,0.65)' }}>{f}</p>
                  </div>
                ))}
              </div>

              {tier.price && (
                <div
                  className="mt-4 rounded-xl py-2 text-center"
                  style={{ backgroundColor: `${tier.color}18`, border: `1px solid ${tier.color}33` }}
                >
                  <p className="text-xs font-bold" style={{ color: tier.color }}>Coming Soon</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Auth form */}
      <div className="px-5">
        <div
          className="rounded-2xl p-5"
          style={{ backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <p className="text-lg font-black text-white mb-1">
            {mode === 'signin' ? 'Welcome back' : 'Get started free'}
          </p>
          <p className="text-xs mb-5" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {mode === 'signin' ? 'Sign in to your account' : 'Create your free account today'}
          </p>

          {/* Toggle */}
          <div className="flex rounded-xl p-1 mb-5" style={{ backgroundColor: '#0a0a0f' }}>
            {(['signin', 'signup'] as const).map((m) => (
              <button
                key={m}
                className="flex-1 rounded-lg py-2.5 text-sm font-bold"
                style={{
                  backgroundColor: mode === m ? '#22c55e' : 'transparent',
                  color: mode === m ? '#000' : 'rgba(255,255,255,0.4)',
                }}
                onClick={() => { setMode(m); setError(null) }}
              >
                {m === 'signin' ? 'Sign In' : 'Sign Up'}
              </button>
            ))}
          </div>

          <form onSubmit={mode === 'signin' ? handleSignIn : handleSignUp} className="flex flex-col gap-3.5">
            {mode === 'signup' && (
              <div>
                <p className="text-[10px] font-bold text-white/35 mb-2" style={{ letterSpacing: '1.5px' }}>USERNAME</p>
                <input
                  type="text"
                  className="w-full rounded-xl p-3.5 text-sm text-white outline-none"
                  style={{ backgroundColor: '#0a0a0f', border: '1px solid rgba(255,255,255,0.07)' }}
                  placeholder="yourname"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  autoComplete="username"
                />
                <p className="text-[10px] text-white/25 mt-1.5">Lowercase letters, numbers, underscores only</p>
              </div>
            )}

            <div>
              <p className="text-[10px] font-bold text-white/35 mb-2" style={{ letterSpacing: '1.5px' }}>EMAIL</p>
              <input
                type="email"
                className="w-full rounded-xl p-3.5 text-sm text-white outline-none"
                style={{ backgroundColor: '#0a0a0f', border: '1px solid rgba(255,255,255,0.07)' }}
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>

            <div>
              <p className="text-[10px] font-bold text-white/35 mb-2" style={{ letterSpacing: '1.5px' }}>PASSWORD</p>
              <input
                type="password"
                className="w-full rounded-xl p-3.5 text-sm text-white outline-none"
                style={{ backgroundColor: '#0a0a0f', border: '1px solid rgba(255,255,255,0.07)' }}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                required
              />
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}

            {confirmEmail && (
              <div
                className="rounded-xl p-3.5"
                style={{ backgroundColor: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)' }}
              >
                <p className="text-sm font-semibold" style={{ color: '#22c55e' }}>
                  Check your email to confirm your account, then sign in.
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || confirmEmail}
              className="w-full rounded-2xl p-4 font-bold text-white text-base flex items-center justify-center mt-1"
              style={{
                backgroundColor: submitting ? 'rgba(34,197,94,0.5)' : '#22c55e',
                boxShadow: '0 0 16px rgba(34,197,94,0.35)',
              }}
            >
              {submitting ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                mode === 'signin' ? 'Sign In →' : 'Create Free Account →'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
