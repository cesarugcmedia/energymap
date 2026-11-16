'use client'

import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { LightningIcon } from '@/components/Icons'
import ui from '@/components/ui/ui.module.css'

// Bottom sheet shown when a free account reaches a Tracker feature (e.g. the
// 6th flavor alert). Portaled to <body> so the tab bar can't cover it.
export default function UpgradeSheet({ title, body, onClose }: { title: string; body: string; onClose: () => void }) {
  const router = useRouter()
  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="anim-fade" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div className="anim-sheet" onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, background: 'var(--surface)', borderRadius: '24px 24px 0 0', border: '1px solid var(--fg-08)', padding: '22px 16px calc(env(safe-area-inset-bottom) + 20px)' }}>
        <span style={{ width: 46, height: 46, borderRadius: 14, background: 'rgba(201,244,0,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
          <LightningIcon size={22} color="var(--accent-text)" />
        </span>
        <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 6, color: 'var(--text)' }}>{title}</p>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 18, lineHeight: 1.5 }}>{body}</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={ui.btnSecondary} style={{ flex: 1 }} onClick={onClose}>Not now</button>
          <button className={ui.btnPrimary} style={{ flex: 1 }} onClick={() => { onClose(); router.push('/account?page=plan') }}>See Tracker</button>
        </div>
      </div>
    </div>,
    document.body
  )
}

export const ALERT_LIMIT_COPY = (limit: number) => ({
  title: `You're following ${limit} flavors`,
  body: `Free accounts can follow ${limit} flavors. Tracker follows as many as you like and sends a push notification the minute one restocks. Or unfollow one to make room.`,
})
