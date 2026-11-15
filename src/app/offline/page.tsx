import StatusScreen from '@/components/ui/StatusScreen'
import ui from '@/components/ui/ui.module.css'
import ReloadButton from './ReloadButton'

// Served by the service worker when a page can't load without a connection.
export default function OfflinePage() {
  return (
    <StatusScreen tone="offline" title="No signal" body="You’re offline right now. Any stock reports you make are saved on your phone and sent once you’re back.">
      <ReloadButton className={`${ui.btnPrimary} ${ui.btnBlock} ${ui.btnLarge}`} />
    </StatusScreen>
  )
}
