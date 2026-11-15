// Shared full-screen status page (error / offline / not found) in the app's
// look: a bolt mark in a soft tile, a short title, one line of help, actions.
// Server-safe (no hooks) so error, offline and not-found can all use it.
const BOLT = 'M13 2 4 14h6l-1 8 9-12h-6l1-8z'

export type StatusTone = 'error' | 'offline' | 'missing'

const TONE: Record<StatusTone, { fill: string; tile: string; stroke: string }> = {
  error:   { fill: 'none',    tile: 'rgba(255,107,107,0.12)', stroke: '#FF6B6B' },
  offline: { fill: 'none',    tile: 'var(--fg-06)',           stroke: 'var(--text-dim)' },
  missing: { fill: '#C9F400', tile: 'rgba(201,244,0,0.12)',   stroke: 'var(--accent-text)' },
}

export default function StatusScreen({ tone, title, body, children }: {
  tone: StatusTone
  title: string
  body: string
  children?: React.ReactNode
}) {
  const t = TONE[tone]
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'var(--bg)', color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 24px calc(env(safe-area-inset-bottom) + 24px)' }}>
      <div className="anim-rise" style={{ width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <span style={{ position: 'relative', width: 84, height: 84, borderRadius: 26, background: t.tile, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 22 }}>
          <svg width="40" height="40" viewBox="0 0 24 24" aria-hidden="true">
            <path d={BOLT} fill={t.fill} stroke={t.stroke} strokeWidth="1.5" strokeLinejoin="round" strokeDasharray={tone === 'offline' ? '3 2.2' : undefined} />
            {tone === 'error' && <path d="M3 21 21 3" stroke={t.stroke} strokeWidth="1.6" strokeLinecap="round" />}
          </svg>
        </span>
        <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 8, lineHeight: 1.2 }}>{title}</h1>
        <p style={{ fontSize: 16, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 24 }}>{body}</p>
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>
      </div>
    </div>
  )
}
