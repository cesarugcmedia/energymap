'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase'
import { MailIcon } from '@/components/Icons'
import ui from '@/components/ui/ui.module.css'

// "Check your email" pop-up shown after signing up (confirmation link) or
// joining the waitlist (invite). Our emails sometimes land in spam/junk, so
// this spells out where to look and how long to wait before giving up.
export default function CheckEmailModal({ email, kind, onClose }: {
  email: string
  kind: 'confirm' | 'waitlist'
  onClose: () => void
}) {
  const [cooldown, setCooldown] = useState(0)
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function resend() {
    if (cooldown > 0 || resendState === 'sending') return
    setResendState('sending')
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    setResendState(error ? 'error' : 'sent')
    setCooldown(60)
  }

  const tips = kind === 'confirm'
    ? [
        <>It can take <strong>up to 24 hours</strong> to arrive.</>,
        <>Check your <strong>Spam</strong>, <strong>Junk</strong> or <strong>Promotions</strong> folder.</>,
        <>Found it there? Mark it <strong>Not spam</strong> so future emails reach your inbox.</>,
      ]
    : [
        <>When your invite goes out, it can take <strong>up to 24 hours</strong> to arrive.</>,
        <>Check your <strong>Spam</strong>, <strong>Junk</strong> or <strong>Promotions</strong> folder so you don&apos;t miss it.</>,
        <>Mark it <strong>Not spam</strong> so future emails reach your inbox.</>,
      ]

  return createPortal(
    <div className="anim-fade" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div
        className="anim-rise"
        role="dialog"
        aria-modal="true"
        aria-labelledby="check-email-title"
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 400, background: 'var(--surface)', border: '1px solid var(--fg-10)', borderRadius: 20, padding: '24px 22px 20px', boxShadow: '0 20px 60px rgba(0,0,0,0.55)' }}
      >
        <span style={{ width: 52, height: 52, borderRadius: 16, background: 'rgba(201,244,0,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
          <MailIcon size={24} color="#C9F400" />
        </span>
        <h2 id="check-email-title" style={{ fontSize: 22, fontWeight: 600, color: 'var(--text)', textAlign: 'center', marginBottom: 6 }}>
          {kind === 'confirm' ? 'Check your email' : "You're on the list!"}
        </h2>
        <p style={{ fontSize: 15, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.5, marginBottom: 18 }}>
          {kind === 'confirm'
            ? <>We sent a confirmation link to <strong style={{ color: 'var(--text)', fontWeight: 600, wordBreak: 'break-all' }}>{email}</strong>. Tap it to activate your account.</>
            : <>We&apos;ll email <strong style={{ color: 'var(--text)', fontWeight: 600, wordBreak: 'break-all' }}>{email}</strong> when your spot opens up.</>}
        </p>

        <ul style={{ listStyle: 'none', margin: '0 0 20px', padding: '14px 16px', borderRadius: 14, background: 'var(--fg-04)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {tips.map((tip, i) => (
            <li key={i} style={{ display: 'flex', gap: 10, fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.45 }}>
              <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(201,244,0,0.14)', color: '#C9F400', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{i + 1}</span>
              <span style={{ color: 'var(--text-muted)' }}>{tip}</span>
            </li>
          ))}
        </ul>

        <button className={`${ui.btnPrimary} ${ui.btnBlock} ${ui.btnLarge}`} onClick={onClose}>Got it</button>

        {kind === 'confirm' && (
          <p style={{ fontSize: 13, color: 'var(--text-dim)', textAlign: 'center', marginTop: 14 }}>
            {resendState === 'sent' && cooldown > 0 ? `Sent again. You can resend in ${cooldown}s.`
              : resendState === 'error' ? 'Couldn’t resend right now. Try again in a minute.'
              : <>Still nothing after a while?{' '}</>}
            {(resendState === 'idle' || (cooldown === 0 && resendState !== 'sending')) && (
              <button onClick={resend} style={{ background: 'none', border: 'none', padding: 0, fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: 'var(--accent)', cursor: 'pointer' }}>Resend email</button>
            )}
            {resendState === 'sending' && 'Sending…'}
          </p>
        )}
      </div>
    </div>,
    document.body
  )
}
