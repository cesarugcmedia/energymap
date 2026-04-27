'use client'

import { useState } from 'react'

export default function WaitlistForm() {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'duplicate' | 'error'>('idle')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || state === 'loading') return
    setState('loading')

    const res = await fetch('/api/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    const data = await res.json()

    if (data.success) setState('success')
    else if (data.alreadyJoined) setState('duplicate')
    else setState('error')
  }

  if (state === 'success') {
    return (
      <div
        className="w-full rounded-2xl p-5 text-center"
        style={{ backgroundColor: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)' }}
      >
        <p className="text-2xl mb-2">🎉</p>
        <p className="text-base font-bold text-white mb-1">You're on the list!</p>
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>
          We'll email you the moment we launch.
        </p>
      </div>
    )
  }

  if (state === 'duplicate') {
    return (
      <div
        className="w-full rounded-2xl p-5 text-center"
        style={{ backgroundColor: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.25)' }}
      >
        <p className="text-2xl mb-2">⚡</p>
        <p className="text-base font-bold text-white mb-1">Already on the list!</p>
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>
          We've already got your email — you'll be first to know.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="w-full flex flex-col gap-3">
      <input
        type="email"
        placeholder="your@email.com"
        value={email}
        onChange={(e) => { setEmail(e.target.value); if (state === 'error') setState('idle') }}
        required
        className="w-full rounded-2xl px-4 py-4 text-white text-sm outline-none"
        style={{
          backgroundColor: '#1a1a24',
          border: `1.5px solid ${state === 'error' ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.1)'}`,
        }}
      />
      {state === 'error' && (
        <p className="text-xs text-center" style={{ color: '#ef4444' }}>
          Something went wrong — try again.
        </p>
      )}
      <button
        type="submit"
        disabled={state === 'loading' || !email.trim()}
        className="w-full rounded-2xl py-4 font-bold text-black text-sm flex items-center justify-center"
        style={{
          backgroundColor: state === 'loading' || !email.trim() ? 'rgba(34,197,94,0.4)' : '#22c55e',
          transition: 'background-color 0.15s',
        }}
      >
        {state === 'loading'
          ? <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
          : 'Join the Waitlist →'}
      </button>
    </form>
  )
}
