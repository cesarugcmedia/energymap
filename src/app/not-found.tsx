import Link from 'next/link'
import StatusScreen from '@/components/ui/StatusScreen'
import ui from '@/components/ui/ui.module.css'

export default function NotFound() {
  return (
    <StatusScreen tone="missing" title="This page ran dry" body="We couldn’t find what you were looking for. The link may be old, or the page moved.">
      <Link href="/" className={`${ui.btnPrimary} ${ui.btnBlock} ${ui.btnLarge}`}>Back to the map</Link>
    </StatusScreen>
  )
}
