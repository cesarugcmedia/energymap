'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import ui from '@/components/ui/ui.module.css'
import SkeletonList from '@/components/ui/SkeletonList'
import { LightningIcon, CheckIcon } from '@/components/Icons'

type PlanData = {
  tier: 'free' | 'tracker' | 'admin'
  memberSince: string | null
  usage: { reportsToday: number; reportsLimit: number | null; storesToday: number; storesLimit: number | null; resetsAt: string; reportsTotal: number }
  subscription: null | {
    status: string
    renewsAt: string | null
    cancelAtPeriodEnd: boolean
    amount: number | null
    currency: string | null
    interval: string | null
    card: { brand: string; last4: string } | null
    startedAt: string | null
  }
}

// Comparison rows — must match what the server actually enforces (see the
// "Plan copy must match enforcement" note in CLAUDE.md).
const COMPARE: { label: string; free: string | boolean; tracker: string | boolean }[] = [
  { label: 'Map radius', free: '5 miles', tracker: 'Unlimited' },
  { label: 'Report times', free: 'Fresh / Aging labels', tracker: 'Exact time' },
  { label: 'Saved store lists', free: false, tracker: true },
  { label: 'Re-report the same drink', free: 'After 30 min', tracker: 'Anytime' },
  { label: 'Stores you can add', free: '10 a day', tracker: 'Unlimited' },
  { label: 'Stock reports', free: '25 a day', tracker: '25 a day' },
  { label: 'Flavor restock alerts', free: true, tracker: true },
  { label: 'Community & leaderboard', free: true, tracker: true },
]

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : null)
function untilReset(iso: string) {
  const ms = new Date(iso).getTime() - Date.now()
  const h = Math.max(0, Math.floor(ms / 3600000))
  const m = Math.max(0, Math.floor((ms % 3600000) / 60000))
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export default function PlanDetails({ betaSpotsLeft, checkoutLoading, checkoutError, onUpgrade, cancelLoading, cancelError, onCancel, onResume }: {
  onResume: () => void
  betaSpotsLeft: number
  checkoutLoading: boolean
  checkoutError: string | null
  onUpgrade: () => void
  cancelLoading: boolean
  cancelError: string | null
  onCancel: (isBeta: boolean) => void
}) {
  const [data, setData] = useState<PlanData | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const res = await fetch('/api/account/plan', { headers: { Authorization: `Bearer ${session.access_token}` } })
      if (cancelled) return
      if (!res.ok) { setError(true); return }
      setData(await res.json())
    })()
    return () => { cancelled = true }
  }, [cancelLoading])

  if (error) return <div className={ui.emptyState}><p className={ui.emptyTitle}>Couldn&apos;t load your plan</p><p className={ui.emptyBody}>Check your connection and try again.</p></div>
  if (!data) return <div style={{ padding: '0 16px' }}><SkeletonList count={3} avatar={false} /></div>

  const { tier, usage, subscription: sub } = data
  const isTracker = tier === 'tracker' || tier === 'admin'
  const isBeta = tier === 'tracker' && !sub
  const price = sub?.amount != null ? `$${(sub.amount / 100).toFixed(2)}/${sub.interval ?? 'month'}` : '$5.00/month'

  const section = (title: string, children: React.ReactNode) => (
    <div style={{ marginBottom: 22 }}>
      <p className={ui.sectionLabel} style={{ margin: '0 4px 8px' }}>{title}</p>
      {children}
    </div>
  )
  const usageBar = (label: string, used: number, limit: number | null) => (
    <div style={{ padding: '12px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, marginBottom: limit ? 8 : 0 }}>
        <span style={{ color: 'var(--text)' }}>{label}</span>
        <span style={{ color: 'var(--text-muted)' }}>{limit ? <><strong style={{ color: 'var(--text)', fontWeight: 600 }}>{used}</strong> of {limit}</> : <>{used} · Unlimited</>}</span>
      </div>
      {limit && (
        <div style={{ height: 6, borderRadius: 999, background: 'var(--fg-08)', overflow: 'hidden' }}>
          <div className="anim-fill" style={{ height: '100%', width: `${Math.min(100, (used / limit) * 100)}%`, borderRadius: 999, background: used >= limit ? '#FF4545' : used / limit > 0.8 ? '#FFB300' : '#C9F400' }} />
        </div>
      )}
    </div>
  )

  return (
    <div style={{ padding: '0 16px 24px' }}>
      {/* Current plan */}
      <div className={`${ui.card} anim-rise`} style={{ marginBottom: 22, borderColor: isTracker ? 'rgba(201,244,0,0.4)' : undefined, padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 46, height: 46, borderRadius: 14, background: isTracker ? 'rgba(201,244,0,0.14)' : 'var(--fg-06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <LightningIcon size={22} color={isTracker ? '#C9F400' : 'var(--text-muted)'} />
          </span>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 13, color: 'var(--text-dim)' }}>Your plan</p>
            <p style={{ fontSize: 22, fontWeight: 700, color: isTracker ? '#C9F400' : 'var(--text)', lineHeight: 1.15 }}>
              {tier === 'admin' ? 'Admin' : tier === 'tracker' ? 'Tracker' : 'Free'}
            </p>
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{tier === 'free' ? '$0' : isBeta || tier === 'admin' ? 'Free' : price}</span>
        </div>

        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14, color: 'var(--text-muted)' }}>
          {isBeta && <p>You&apos;re one of the first beta members, so Tracker is free for you. 🎉</p>}
          {tier === 'admin' && <p>Admins get every Tracker feature with no limits.</p>}
          {sub && (
            <>
              <p>
                {sub.status === 'active' || sub.status === 'trialing'
                  ? sub.cancelAtPeriodEnd ? `Cancels on ${fmtDate(sub.renewsAt)}. You keep Tracker until then.` : `Renews on ${fmtDate(sub.renewsAt)}`
                  : sub.status === 'past_due' ? 'Your last payment didn’t go through. Update your card to keep Tracker.'
                  : sub.status === 'canceled' ? 'Your subscription has ended.'
                  : `Status: ${sub.status.replace('_', ' ')}`}
              </p>
              {sub.card && <p>Paying with {sub.card.brand[0].toUpperCase() + sub.card.brand.slice(1)} •••• {sub.card.last4}</p>}
              {sub.startedAt && <p>Tracker since {fmtDate(sub.startedAt)}</p>}
            </>
          )}
          {tier === 'free' && <p>See stock within 5 miles, report, add stores and follow flavors, all free.</p>}
        </div>
        {sub?.cancelAtPeriodEnd && sub.status !== 'canceled' && (
          <div style={{ marginTop: 14 }}>
            {cancelError && <p style={{ fontSize: 13, color: '#FF6B6B', marginBottom: 6 }}>{cancelError}</p>}
            <button className={`${ui.btnPrimary} ${ui.btnBlock}`} onClick={onResume} disabled={cancelLoading}>
              {cancelLoading ? 'Saving…' : 'Keep Tracker'}
            </button>
          </div>
        )}
      </div>

      {/* Today's usage */}
      {section('Today', (
        <div className={ui.card} style={{ padding: 0 }}>
          {usageBar('Stock reports', usage.reportsToday, usage.reportsLimit)}
          <div style={{ height: 1, background: 'var(--fg-06)', margin: '0 16px' }} />
          {usageBar('Stores added', usage.storesToday, usage.storesLimit)}
          <p style={{ padding: '0 16px 12px', fontSize: 13, color: 'var(--text-dim)' }}>
            Limits reset in {untilReset(usage.resetsAt)} · {usage.reportsTotal.toLocaleString()} reports all time
          </p>
        </div>
      ))}

      {/* Compare plans */}
      {section('Compare plans', (
        <div className={ui.card} style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr', padding: '10px 14px', borderBottom: '1px solid var(--fg-06)', fontSize: 13, fontWeight: 600 }}>
            <span style={{ color: 'var(--text-dim)' }}>Feature</span>
            <span style={{ textAlign: 'center', color: !isTracker ? '#C9F400' : 'var(--text-muted)' }}>Free{!isTracker ? ' · You' : ''}</span>
            <span style={{ textAlign: 'center', color: isTracker ? '#C9F400' : 'var(--text-muted)' }}>Tracker{isTracker ? ' · You' : ''}</span>
          </div>
          {COMPARE.map((row, i) => (
            <div key={row.label} style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr', alignItems: 'center', padding: '11px 14px', borderTop: i ? '1px solid var(--fg-06)' : 'none', fontSize: 14 }}>
              <span style={{ color: 'var(--text)' }}>{row.label}</span>
              {[row.free, row.tracker].map((v, j) => (
                <span key={j} style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, background: (j === 1) === isTracker ? 'rgba(201,244,0,0.04)' : 'transparent', borderRadius: 6, padding: '2px 0' }}>
                  {v === true ? <span style={{ display: 'inline-flex' }}><CheckIcon size={15} color="#C9F400" /></span> : v === false ? <span style={{ color: 'var(--text-dim)' }}>—</span> : v}
                </span>
              ))}
            </div>
          ))}
        </div>
      ))}

      {/* Actions */}
      {tier === 'free' && (
        <div className={ui.card} style={{ marginBottom: 22, borderColor: 'rgba(201,244,0,0.35)' }}>
          <p style={{ fontSize: 17, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Upgrade to Tracker</p>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 12 }}>
            {betaSpotsLeft > 0 ? `The first 60 members get it free. ${betaSpotsLeft} spot${betaSpotsLeft === 1 ? '' : 's'} left.` : '$5/month. Cancel anytime.'}
          </p>
          {checkoutError && <p style={{ fontSize: 13, color: '#FF6B6B', marginBottom: 8 }}>{checkoutError}</p>}
          <button className={`${ui.btnPrimary} ${ui.btnBlock} ${ui.btnLarge}`} onClick={onUpgrade} disabled={checkoutLoading}>
            {checkoutLoading ? 'Starting…' : betaSpotsLeft > 0 ? 'Claim a free spot' : 'Upgrade for $5/month'}
          </button>
        </div>
      )}

      {/* FAQ */}
      {section('Questions', (
        <div className={ui.card} style={{ padding: '2px 16px' }}>
          {[
            { q: 'How does billing work?', a: 'Tracker is $5 a month, billed through Stripe on the same day each month. We never see or store your full card number.' },
            { q: 'What happens if I cancel?', a: 'You keep Tracker until the end of the month you’ve paid for and won’t be charged again. Then your plan switches to Free. You keep your account, reports, badges and flavor alerts; only Tracker features like the unlimited radius and saved stores turn off. Changed your mind? Tap Keep Tracker any time before then.' },
            { q: 'Why is there a daily report limit?', a: 'Up to 25 reports a day keeps the map accurate and stops spam. It’s the same on every plan, and resets at midnight (UTC).' },
            { q: 'Need help with your plan?', a: 'Email support@ampedmap.com and we’ll sort it out.' },
          ].map(({ q, a }, i) => (
            <details key={q} style={{ borderTop: i ? '1px solid var(--fg-06)' : 'none', padding: '12px 0' }}>
              <summary style={{ cursor: 'pointer', fontSize: 15, fontWeight: 500, color: 'var(--text)' }}>{q}</summary>
              <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.5, marginTop: 8 }}>{a}</p>
            </details>
          ))}
        </div>
      ))}

      {/* Every Tracker member can cancel: paying members keep access until the
          period ends; beta members (no Stripe subscription) move to Free now. */}
      {tier === 'tracker' && !sub?.cancelAtPeriodEnd && section('Manage plan', (
        <div className={ui.card}>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 12 }}>
            {isBeta
              ? 'Cancelling moves you to Free right away and gives up your free beta spot. Getting Tracker back later may cost $5/month.'
              : sub?.status === 'active' || sub?.status === 'trialing'
                ? `You won’t be charged again, and you keep Tracker until ${fmtDate(sub.renewsAt) ?? 'the end of this billing period'}.`
                : 'Cancelling moves you to Free.'}
          </p>
          {cancelError && <p style={{ fontSize: 13, color: '#FF6B6B', marginBottom: 8 }}>{cancelError}</p>}
          <button onClick={() => onCancel(isBeta)} disabled={cancelLoading} className={`${ui.btnSecondary} ${ui.btnBlock}`} style={{ color: '#FF6B6B', borderColor: 'rgba(255,107,107,0.3)' }}>
            {cancelLoading ? 'Cancelling…' : 'Cancel Tracker'}
          </button>
        </div>
      ))}
    </div>
  )
}
