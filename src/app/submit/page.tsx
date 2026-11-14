'use client'

import { LightningIcon } from '@/components/Icons'

export default function SubmitPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-8 text-center gap-3" style={{ backgroundColor: 'var(--bg)' }}>
      <span style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(201,244,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <LightningIcon size={26} color="#C9F400" />
      </span>
      <p style={{ fontSize: 22, fontWeight: 600, color: 'var(--text)', marginTop: 4 }}>Coming soon</p>
      <p style={{ fontSize: 15, color: 'var(--text-muted)' }}>Quick reporting is on its way.</p>
    </div>
  )
}
