'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { flushQueue, getQueue } from '@/lib/reportQueue'
import Toast from '@/components/Toast'

// Sends stock reports that were saved offline as soon as the phone is back
// online (on app open, on reconnect, and when the app returns to view), and
// says so with a toast.
export default function ReportQueueSync() {
  const { user } = useAuth()
  const [toast, setToast] = useState('')
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!user) return
    let hideTimer: ReturnType<typeof setTimeout> | undefined
    const show = (msg: string) => {
      setToast(msg)
      setVisible(true)
      clearTimeout(hideTimer)
      hideTimer = setTimeout(() => setVisible(false), 3500)
    }
    const run = async () => {
      if (getQueue().length === 0) return
      const { sent, failed } = await flushQueue()
      if (sent > 0) show(`${sent} saved sighting${sent === 1 ? '' : 's'} sent`)
      else if (failed.length > 0) show(failed[0])
    }
    const onVisible = () => { if (document.visibilityState === 'visible') run() }
    run()
    window.addEventListener('online', run)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearTimeout(hideTimer)
      window.removeEventListener('online', run)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [user])

  return <Toast message={toast} visible={visible} />
}
