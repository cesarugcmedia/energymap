'use client'

import { useEffect, useState } from 'react'
import { BellIcon, LightningIcon } from '@/components/Icons'
import ui from '@/components/ui/ui.module.css'
import { disablePush, enablePush, getPushState, type PushState } from '@/lib/pushClient'

// Account → Notifications: phone push for flavor restocks (Tracker).
// Free accounts see what it does and an upgrade link instead of the switch.
export default function PushSettings({ isTracker, onUpgrade }: { isTracker: boolean; onUpgrade: () => void }) {
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => { getPushState().then(setState).catch(() => setState('unsupported')) }, [])

  async function toggle() {
    if (busy || !state) return
    setBusy(true)
    setNote(null)
    try {
      if (state === 'on') setState(await disablePush())
      else {
        const r = await enablePush()
        if (r === 'not_ready') { setNote('Push notifications aren’t switched on for the app yet. Try again soon.'); setState('off') }
        else if (r === 'error') { setNote('Couldn’t turn on notifications. Try again.'); setState('off') }
        else setState(r)
      }
    } catch {
      setNote('Couldn’t turn on notifications on this device.')
    }
    setBusy(false)
  }

  const on = state === 'on'
  const hint = !isTracker ? 'Get a notification on your phone the minute a flavor you follow restocks, even with the app closed.'
    : state === 'unavailable' ? 'Coming very soon: a notification on your phone the minute a flavor you follow restocks.'
    : state === 'ios-install' ? 'On iPhone, add AmpedMap to your Home Screen first (Share → Add to Home Screen), then open it from there to turn this on.'
    : state === 'denied' ? 'Notifications are blocked for AmpedMap. Allow them in your phone or browser settings, then come back.'
    : state === 'unsupported' ? 'This browser can’t receive push notifications.'
    : 'A notification on this device the minute a flavor you follow restocks, even with the app closed.'

  return (
    <div className={ui.card} style={{ margin: '0 16px 22px', padding: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px' }}>
        <span style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(201,244,0,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <BellIcon size={17} color="var(--accent-text)" filled={on} />
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 16, color: 'var(--text)' }}>
            Push restock alerts
            {!isTracker && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: 'rgba(201,244,0,0.14)', color: 'var(--accent-text)' }}>Tracker</span>}
          </span>
          <span style={{ display: 'block', fontSize: 13, color: 'var(--text-dim)', marginTop: 2, lineHeight: 1.45 }}>{hint}</span>
        </span>
        {isTracker && (state === 'on' || state === 'off') && (
          <button onClick={toggle} role="switch" aria-checked={on} aria-label="Push restock alerts" disabled={busy}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
            <span aria-hidden="true" style={{ width: 46, height: 28, borderRadius: 999, padding: 3, background: on ? '#C9F400' : 'var(--fg-15)', transition: 'background 0.2s ease', display: 'flex' }}>
              <span style={{ width: 22, height: 22, borderRadius: '50%', background: on ? '#0D1210' : 'var(--surface)', boxShadow: '0 1px 3px rgba(0,0,0,0.3)', transform: on ? 'translateX(18px)' : 'none', transition: 'transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)' }} />
            </span>
          </button>
        )}
      </div>
      {note && <p style={{ padding: '0 16px 12px', fontSize: 13, color: '#FFB300' }}>{note}</p>}
      {!isTracker && (
        <button onClick={onUpgrade} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '12px 16px', background: 'none', border: 'none', borderTop: '1px solid var(--fg-06)', color: 'var(--accent-text)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          <LightningIcon size={14} color="var(--accent-text)" /> See Tracker
        </button>
      )}
      {isTracker && on && <p style={{ padding: '0 16px 12px', fontSize: 12, color: 'var(--text-dim)' }}>Turn it on for each phone or computer you use.</p>}
    </div>
  )
}
