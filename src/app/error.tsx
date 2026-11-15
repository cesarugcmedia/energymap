'use client'

import StatusScreen from '@/components/ui/StatusScreen'
import ui from '@/components/ui/ui.module.css'

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <StatusScreen tone="error" title="Something shorted out" body="We hit an unexpected snag loading this page. It’s usually a one-off.">
      <button className={`${ui.btnPrimary} ${ui.btnBlock} ${ui.btnLarge}`} onClick={reset}>Try again</button>
      {/* Full reload (not client navigation) to leave the broken state behind. */}
      <button className={`${ui.btnGhost} ${ui.btnBlock}`} onClick={() => window.location.assign('/')}>Back to the map</button>
    </StatusScreen>
  )
}
