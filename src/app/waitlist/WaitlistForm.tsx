'use client'

import { useState } from 'react'
import CheckEmailModal from '@/components/CheckEmailModal'
import ui from '@/components/ui/ui.module.css'

export default function WaitlistForm() {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'duplicate' | 'error'>('idle')
  const [showTips, setShowTips] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || state === 'loading') return
    setState('loading')
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (data.success) { setState('success'); setShowTips(true) }
      else if (data.alreadyJoined) setState('duplicate')
      else setState('error')
    } catch {
      setState('error')
    }
  }

  if (state === 'success' || state === 'duplicate') {
    const joined = state === 'success'
    return (
      <div className={`${ui.card} anim-rise`} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', borderColor: 'rgba(201,244,0,0.35)' }}>
        <span style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(201,244,0,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C9F400" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path className="anim-draw" d="M5 12.5l4.5 4.5L19 7.5" /></svg>
        </span>
        <div>
          <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>{joined ? "You're on the list!" : 'You’re already on the list'}</p>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {joined
              ? 'We’ll email your invite when your spot opens. It can take up to 24 hours to arrive, so check Spam or Junk too.'
              : 'We’ve got your email. When your invite goes out, check Spam or Junk if you don’t see it.'}
          </p>
        </div>
        {showTips && <CheckEmailModal email={email} kind="waitlist" onClose={() => setShowTips(false)} />}
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <label htmlFor="waitlist-email" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Email address</label>
        <input
          id="waitlist-email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => { setEmail(e.target.value); if (state === 'error') setState('idle') }}
          required
          className={ui.input}
          style={{ flex: '1 1 220px', fontSize: 16, borderColor: state === 'error' ? 'rgba(255,69,69,0.5)' : undefined }}
        />
        <button type="submit" className={`${ui.btnPrimary} ${ui.btnLarge}`} style={{ flex: '1 1 160px' }} disabled={state === 'loading' || !email.trim()}>
          {state === 'loading'
            ? <span style={{ width: 18, height: 18, border: '2px solid #0D1210', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            : 'Join the waitlist'}
        </button>
      </div>
      {state === 'error' && <p style={{ fontSize: 14, color: '#FF6B6B' }}>Something went wrong. Try again.</p>}
    </form>
  )
}
