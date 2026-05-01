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
        style={{ width: '100%', borderRadius: 16, padding: 20, textAlign: 'center', backgroundColor: 'rgba(201,244,0,0.08)', border: '1px solid rgba(201,244,0,0.25)' }}
      >
        <p style={{ fontSize: 24, marginBottom: 8 }}>🎉</p>
        <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', marginBottom: 4, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.02em', textTransform: 'uppercase' }}>You're on the list!</p>
        <p style={{ fontSize: 13, color: '#7A8F80' }}>
          We'll email you the moment we launch.
        </p>
      </div>
    )
  }

  if (state === 'duplicate') {
    return (
      <div
        style={{ width: '100%', borderRadius: 16, padding: 20, textAlign: 'center', backgroundColor: 'rgba(201,244,0,0.06)', border: '1px solid rgba(201,244,0,0.2)' }}
      >
        <p style={{ fontSize: 24, marginBottom: 8 }}>⚡</p>
        <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', marginBottom: 4, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.02em', textTransform: 'uppercase' }}>Already on the list!</p>
        <p style={{ fontSize: 13, color: '#7A8F80' }}>
          We've already got your email — you'll be first to know.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <input
        type="email"
        placeholder="your@email.com"
        value={email}
        onChange={(e) => { setEmail(e.target.value); if (state === 'error') setState('idle') }}
        required
        style={{
          width: '100%',
          borderRadius: 14,
          padding: '16px',
          color: 'var(--text)',
          fontSize: 15,
          outline: 'none',
          backgroundColor: 'var(--surface)',
          border: `1.5px solid ${state === 'error' ? 'rgba(255,69,69,0.5)' : 'rgba(201,244,0,0.12)'}`,
          fontFamily: "'Barlow', sans-serif",
        }}
      />
      {state === 'error' && (
        <p style={{ fontSize: 12, textAlign: 'center', color: '#FF4545' }}>
          Something went wrong — try again.
        </p>
      )}
      <button
        type="submit"
        disabled={state === 'loading' || !email.trim()}
        style={{
          width: '100%',
          borderRadius: 14,
          padding: '16px',
          fontWeight: 800,
          color: '#0D1210',
          fontSize: 15,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: 'none',
          cursor: state === 'loading' || !email.trim() ? 'not-allowed' : 'pointer',
          fontFamily: "'Barlow Condensed', sans-serif",
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          backgroundColor: state === 'loading' || !email.trim() ? 'rgba(201,244,0,0.4)' : '#C9F400',
          boxShadow: state === 'loading' || !email.trim() ? 'none' : '0 0 20px rgba(201,244,0,0.35)',
          transition: 'background-color 0.15s',
        }}
      >
        {state === 'loading'
          ? <div style={{ width: 16, height: 16, border: '2px solid #0D1210', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          : 'Join the Waitlist →'}
      </button>
    </form>
  )
}
