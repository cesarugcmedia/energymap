'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

type Mode = 'signin' | 'signup'
type TierId = 'free' | 'hunter' | 'tracker'

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
    tag: 'EARLY ACCESS' as string | null,
    comingSoon: false,
    description: null as string | null,
    inherits: 'Free' as string | null,
    features: [
      'Flavor alerts — instant notifications',
      'Saved favorite drinks',
      'Extended 25 mile radius',
      'Early alerts before free users',
      'No staleness warning banners',
      'Verified reporter badge',
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
    tag: 'COMING SOON' as string | null,
    comingSoon: true,
    description: 'Advanced tools for power users — dropping soon. Join the waitlist and get early access when it launches.',
    inherits: 'Hunter' as string | null,
    features: [
      '30-day stock history',
      'Custom store lists',
      'Leaderboard placement + badge',
      'Dispute wrong reports',
      'Photo proof uploads',
    ],
  },
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

export default function AccountPage() {
  const { user, profile, loading, refreshProfile } = useAuth()
  const [mode, setMode] = useState<Mode>('signup')
  const [selectedTier, setSelectedTier] = useState<TierId | null>(null)
  const [step, setStep] = useState(1)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [favorites, setFavorites] = useState<any[]>([])
  const [favLoading, setFavLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [confirmEmail, setConfirmEmail] = useState(false)
  const [waitlistCount, setWaitlistCount] = useState<number>(0)

  useEffect(() => {
    supabase
      .from('waitlist')
      .select('id', { count: 'exact', head: true })
      .eq('tier', 'hunter')
      .then(({ count }) => setWaitlistCount(count ?? 0))
  }, [])

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
      await supabase.from('profiles').insert({ id: data.user.id, username: username.trim() })
      if (selectedTier === 'hunter') {
        await supabase.from('waitlist').insert({ email: email.trim(), tier: 'hunter' })
      }
      if (!data.session) { setSubmitting(false); setConfirmEmail(true); return }
      await refreshProfile()
    }
    setSubmitting(false)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
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
    return (
      <div className="bg-[#070710]" style={{ paddingTop: 'calc(56px + env(safe-area-inset-top))' }}>
        <div className="px-5 mb-6">
          <div className="rounded-2xl p-5" style={{ backgroundColor: '#1a1a24', border: '1px solid rgba(34,197,94,0.25)' }}>
            <div className="flex items-center gap-4 mb-4">
              <div className="w-14 h-14 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: 'rgba(34,197,94,0.15)', border: '2px solid rgba(34,197,94,0.3)' }}>
                <span className="text-2xl font-black" style={{ color: '#22c55e' }}>{profile.username[0].toUpperCase()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-lg font-black text-white truncate">@{profile.username}</p>
                <p className="text-xs text-white/40 mt-0.5 truncate">{user.email}</p>
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  {profile.is_admin && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}>ADMIN</span>
                  )}
                  {profile.is_verified_reporter && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.3)' }}>✓ VERIFIED</span>
                  )}
                </div>
              </div>
            </div>
            <button onClick={handleSignOut} className="w-full rounded-xl py-2.5 text-sm font-bold" style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
              Sign Out
            </button>
          </div>
        </div>

        <div className="px-5 mb-3">
          <p className="text-[10px] font-bold" style={{ color: 'rgba(255,255,255,0.35)', letterSpacing: '1.5px' }}>FAVORITE STORES</p>
        </div>

        {favLoading ? (
          <div className="flex justify-center mt-6">
            <div className="w-7 h-7 border-2 border-[#22c55e] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : favorites.length === 0 ? (
          <div className="mx-5 rounded-2xl p-6 flex flex-col items-center gap-2" style={{ backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.07)' }}>
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
                <div key={fav.id} className="rounded-2xl p-4 flex items-center gap-3" style={{ backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
                    <span style={{ fontSize: 20 }}>{TYPE_ICON[store.type] ?? '📍'}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{store.name}</p>
                    {store.address && <p className="text-xs text-white/40 mt-0.5 truncate">{store.address}</p>}
                  </div>
                  <a href={`/store/${store.id}?name=${encodeURIComponent(store.name)}`} className="text-xs font-bold px-3 py-2 rounded-xl shrink-0" style={{ backgroundColor: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)', color: '#22c55e' }}>
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
            <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 48, letterSpacing: 3, background: 'linear-gradient(135deg, #22c55e, #4ade80)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>EnergyMap</span>
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
              We know the frustration of driving to three stores for one flavor. EnergyMap solves that — powered by a community just like you.
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
              Energy drink culture is exploding — new flavors drop constantly, stores sell out fast, and fans are left empty-handed. EnergyMap gives the community a single place to share, discover, and track stock so no one misses out.
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
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 24 }}>Sign in to your EnergyMap account</p>
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
                    {t.id === 'hunter' && (() => {
                      const BETA_LIMIT = 50
                      const remaining = Math.max(0, BETA_LIMIT - waitlistCount)
                      const spotsLeft = remaining > 0
                      return (
                        <div style={{ backgroundColor: 'rgba(34,197,94,0.07)', border: '1px dashed rgba(34,197,94,0.35)', borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>
                          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, marginBottom: 8 }}>
                            {spotsLeft
                              ? `🔥 First 50 beta users get Hunter free. Only ${remaining} spot${remaining !== 1 ? 's' : ''} left!`
                              : '🔒 Beta spots are full. Hunter will be $5/mo at launch.'}
                          </p>
                          {/* Progress bar */}
                          <div style={{ height: 4, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${Math.min((waitlistCount / BETA_LIMIT) * 100, 100)}%`, background: 'linear-gradient(90deg, #22c55e, #4ade80)', borderRadius: 4, transition: 'width 0.5s ease' }} />
                          </div>
                          <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 5 }}>{waitlistCount} / {BETA_LIMIT} spots claimed</p>
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
                      ) : t.id === 'hunter' && waitlistCount >= 50 ? (
                        <div style={{ width: '100%', padding: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, textAlign: 'center', fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.3)' }}>
                          Beta Full — Launching Soon
                        </div>
                      ) : (
                        <button className="cta-btn" onClick={() => selectAndContinue(t.id)}
                          style={{ width: '100%', padding: 12, background: `linear-gradient(135deg, ${t.color}, ${t.color}bb)`, border: 'none', borderRadius: 12, color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", boxShadow: `0 4px 16px ${t.glow}` }}>
                          {t.id === 'free' ? 'Get Started Free →' : 'Join Waitlist →'}
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
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 24 }}>Join the EnergyMap community</p>
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
                    : selectedTier === 'free' ? 'Create Free Account →' : 'Join Waitlist →'}
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
            <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, letterSpacing: 2, color: 'rgba(255,255,255,0.3)' }}>EnergyMap</span>
          </div>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>Built for the community · Powered by real-time reports</p>
        </div>
      </div>
    </div>
  )
}
