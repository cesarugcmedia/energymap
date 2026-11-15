'use client'

import { useState } from 'react'
import ui from '@/components/ui/ui.module.css'
import Burst from '@/components/ui/Burst'
import { haptic } from '@/lib/haptics'

// Follow / ✓ Following. Following someone pops the button, draws the check,
// fires a small burst and buzzes (Android). Unfollowing is quiet.
export default function FollowButton({ following, onToggle, disabled, compact }: {
  following: boolean
  onToggle: () => void
  disabled?: boolean
  compact?: boolean
}) {
  const [anim, setAnim] = useState(0)
  function click() {
    if (!following) { setAnim((n) => n + 1); haptic(12) }
    onToggle()
  }
  return (
    <button
      className={following ? ui.btnSecondary : ui.btnPrimary}
      onClick={click}
      disabled={disabled}
      aria-pressed={following}
      style={{ position: 'relative', flexShrink: 0, gap: 5, ...(compact ? { padding: '7px 14px', fontSize: 14 } : {}) }}
    >
      <Burst trigger={following ? anim : 0} />
      <span key={following ? `on-${anim}` : 'off'} className={following && anim ? 'anim-pop' : undefined} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        {following && (
          <svg className={anim ? 'follow-check' : undefined} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        )}
        {following ? 'Following' : 'Follow'}
      </span>
    </button>
  )
}
