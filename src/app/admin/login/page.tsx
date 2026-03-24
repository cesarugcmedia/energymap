'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function AdminLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      setError('Invalid email or password.')
      setLoading(false)
      return
    }

    router.replace('/admin')
  }

  return (
    <div className="flex flex-col justify-center min-h-screen bg-[#0a0a0f] px-6">
      <div className="mb-10">
        <p className="text-2xl font-black text-white">🔧 Admin Login</p>
        <p className="text-sm text-white/40 mt-1">Sign in to manage store submissions</p>
      </div>

      <form onSubmit={handleLogin} className="flex flex-col gap-4">
        <div>
          <p className="text-[10px] font-bold text-white/35 mb-2" style={{ letterSpacing: '1.5px' }}>
            EMAIL
          </p>
          <input
            type="email"
            className="w-full rounded-xl p-3.5 text-sm text-white outline-none"
            style={{ backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.07)' }}
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>

        <div>
          <p className="text-[10px] font-bold text-white/35 mb-2" style={{ letterSpacing: '1.5px' }}>
            PASSWORD
          </p>
          <input
            type="password"
            className="w-full rounded-xl p-3.5 text-sm text-white outline-none"
            style={{ backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.07)' }}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </div>

        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-2xl p-4 font-bold text-white text-base flex items-center justify-center mt-2"
          style={{ backgroundColor: loading ? 'rgba(34,197,94,0.5)' : '#22c55e' }}
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            'Sign In →'
          )}
        </button>
      </form>
    </div>
  )
}
