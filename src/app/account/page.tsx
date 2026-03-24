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
    <div className="min-h-screen bg-[#0a0a0f] px-5 flex flex-col justify-center" style={{ paddingBottom: 'calc(70px + env(safe-area-inset-bottom))' }}>
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
  const { user, profile, loading } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [reports, setReports] = useState<any[]>([])
  const [reportsLoading, setReportsLoading] = useState(false)

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
      // If email confirmation is still enabled, session won't exist yet
      if (!data.session) {
        setError(null)
        setSubmitting(false)
        // Show a message — repurpose error state with a success style flag
        setConfirmEmail(true)
        return
      }
    }
    setSubmitting(false)
  }

  useEffect(() => {
    if (user) fetchReports(user.id)
  }, [user])

  async function fetchReports(userId: string) {
    setReportsLoading(true)
    const { data } = await supabase
      .from('stock_reports')
      .select('*, drink:drinks(name, brand, flavor), store:stores(name)')
      .eq('user_id', userId)
      .order('reported_at', { ascending: false })
      .limit(50)
    if (data) setReports(data)
    setReportsLoading(false)
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

  // User is logged in but has no profile yet — let them set a username
  if (user && !profile) {
    return <SetupProfile userId={user.id} email={user.email} />
  }

  if (user && profile) {
    const uniqueStores = new Set(reports.map((r) => r.store_id)).size
    const freshReports = reports.filter((r) => {
      const hrs = (Date.now() - new Date(r.reported_at).getTime()) / 3600000
      return hrs < 2
    }).length

    return (
      <div className="min-h-screen bg-[#0a0a0f]" style={{ paddingTop: 'calc(56px + env(safe-area-inset-top))' }}>

        {/* Profile card */}
        <div className="px-5 mb-5">
          <div
            className="rounded-2xl p-5"
            style={{ backgroundColor: '#1a1a24', border: '1px solid rgba(34,197,94,0.25)', boxShadow: '0 0 0 1px rgba(34,197,94,0.08)' }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center shrink-0"
                  style={{ backgroundColor: 'rgba(34,197,94,0.15)', border: '2px solid rgba(34,197,94,0.3)' }}
                >
                  <span className="text-2xl font-black" style={{ color: '#22c55e' }}>
                    {profile.username[0].toUpperCase()}
                  </span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-lg font-black text-white">@{profile.username}</p>
                    {profile.is_admin && (
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}
                      >
                        ADMIN
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-white/40 mt-0.5">{user.email}</p>
                </div>
              </div>
              <button
                onClick={handleSignOut}
                className="text-xs font-bold px-3 py-1.5 rounded-full"
                style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="px-5 mb-5">
          <p className="text-[10px] font-bold mb-3" style={{ color: 'rgba(255,255,255,0.35)', letterSpacing: '1.5px' }}>YOUR STATS</p>
          <div className="grid grid-cols-3 gap-2.5">
            {[
              { label: 'Reports', value: reports.length },
              { label: 'Stores', value: uniqueStores },
              { label: 'Fresh Today', value: freshReports },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-2xl p-4 flex flex-col items-center justify-center"
                style={{ backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.07)' }}
              >
                <p className="text-2xl font-black text-white">{stat.value}</p>
                <p className="text-[10px] text-white/40 mt-1 font-semibold">{stat.label.toUpperCase()}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Report history */}
        <div className="px-5 mb-2">
          <p className="text-[10px] font-bold" style={{ color: 'rgba(255,255,255,0.35)', letterSpacing: '1.5px' }}>REPORT HISTORY</p>
        </div>

        {reportsLoading ? (
          <div className="flex justify-center mt-6">
            <div className="w-7 h-7 border-2 border-[#22c55e] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : reports.length === 0 ? (
          <div className="flex flex-col items-center gap-2 mt-10 px-5">
            <span style={{ fontSize: 36 }}>⚡</span>
            <p className="text-base font-bold text-white">No reports yet</p>
            <p className="text-sm text-white/40 text-center">Head to a store and report some stock!</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2 px-5 pb-6 mt-3">
            {reports.map((r) => {
              const QUANTITY_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
                out:    { label: 'OUT',  color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.25)'  },
                low:    { label: 'LOW',  color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.25)' },
                medium: { label: 'MED',  color: '#f97316', bg: 'rgba(249,115,22,0.1)',  border: 'rgba(249,115,22,0.25)' },
                full:   { label: 'FULL', color: '#22c55e', bg: 'rgba(34,197,94,0.1)',   border: 'rgba(34,197,94,0.25)'  },
              }
              const q = QUANTITY_CONFIG[r.quantity]
              const mins = Math.floor((Date.now() - new Date(r.reported_at).getTime()) / 60000)
              const timeStr = mins < 1 ? 'just now' : mins < 60 ? `${mins}m ago` : mins < 1440 ? `${Math.floor(mins/60)}h ago` : `${Math.floor(mins/1440)}d ago`
              return (
                <div
                  key={r.id}
                  className="rounded-2xl p-4 flex items-center gap-3"
                  style={{ backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.07)' }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{r.drink?.flavor ?? r.drink?.name}</p>
                    <p className="text-xs text-white/40 mt-0.5 truncate">{r.store?.name} · {timeStr}</p>
                  </div>
                  <div
                    className="px-2.5 py-1 rounded-full shrink-0"
                    style={{ backgroundColor: q?.bg, border: `1px solid ${q?.border}` }}
                  >
                    <span className="text-[10px] font-bold" style={{ color: q?.color }}>{q?.label}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] px-5" style={{ paddingTop: 'calc(56px + env(safe-area-inset-top))' }}>
      <p className="text-2xl font-black text-white mb-1">
        {mode === 'signin' ? 'Welcome back' : 'Join EnergyMap'}
      </p>
      <p className="text-xs text-white/40 mb-6">
        {mode === 'signin' ? 'Sign in to your account' : 'Create your account'}
      </p>

      {/* Toggle */}
      <div className="flex rounded-xl p-1 mb-6" style={{ backgroundColor: '#1a1a24' }}>
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

      <form onSubmit={mode === 'signin' ? handleSignIn : handleSignUp} className="flex flex-col gap-4">
        {mode === 'signup' && (
          <div>
            <p className="text-[10px] font-bold text-white/35 mb-2" style={{ letterSpacing: '1.5px' }}>USERNAME</p>
            <input
              type="text"
              className="w-full rounded-xl p-3.5 text-sm text-white outline-none"
              style={{ backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.07)' }}
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
            style={{ backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.07)' }}
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
            style={{ backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.07)' }}
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
          className="w-full rounded-2xl p-4 font-bold text-white text-base flex items-center justify-center mt-2"
          style={{ backgroundColor: submitting ? 'rgba(34,197,94,0.5)' : '#22c55e' }}
        >
          {submitting ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            mode === 'signin' ? 'Sign In →' : 'Create Account →'
          )}
        </button>
      </form>
    </div>
  )
}
