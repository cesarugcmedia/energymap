'use client'

import { useRouter } from 'next/navigation'
import { ChevronLeftIcon } from '@/components/Icons'

// iOS-style "‹ Label" back link, matching the /account sub-page headers.
// Goes back in history when there's somewhere to go back to; otherwise (page
// opened directly or in a new tab, e.g. Terms from the signup form) falls back
// to `fallbackHref` so the button never dead-ends. Pass `to` to always go to a
// fixed page instead (for pages also reachable from the tab bar, where
// "back" might not be the page the label names).
export default function BackButton({ label = 'Account', fallbackHref = '/account', to }: { label?: string; fallbackHref?: string; to?: string }) {
  const router = useRouter()

  function goBack() {
    if (to) router.push(to)
    else if (window.history.length > 1) router.back()
    else router.push(fallbackHref)
  }

  return (
    <button
      onClick={goBack}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 2, background: 'none', border: 'none', cursor: 'pointer', padding: '6px 8px 6px 0', color: 'var(--accent-text)', fontSize: 16, fontWeight: 500 }}
    >
      <ChevronLeftIcon size={20} color="var(--accent-text)" /> {label}
    </button>
  )
}
