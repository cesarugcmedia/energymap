// Branded loader: the AmpedMap bolt "charging" — an outline that fills with
// lime from the bottom, then glows, on a loop. Pure CSS (.bolt-loader in
// globals.css), so it's safe in server components too; under reduced motion
// it's a static filled bolt.
//
// Full-screen mode is a fixed layer over the whole viewport, so it's always
// dead center — not shifted by the tab-bar padding, the desktop sidebar, or
// mobile browser bars (which a 100vh box inside <main> was).
const BOLT = 'M13 2 4 14h6l-1 8 9-12h-6l1-8z'

export default function BoltLoader({ size = 48, fullScreen = true, message = 'Charging up…' }: {
  size?: number
  fullScreen?: boolean
  message?: string | null
}) {
  const icon = (
    <span className="bolt-loader" role="status" aria-label={message ?? 'Loading'} style={{ width: size, height: size }}>
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" aria-hidden="true">
        <path d={BOLT} stroke="var(--accent-text)" strokeWidth="1.4" strokeLinejoin="round" opacity="0.45" />
      </svg>
      <span className="bolt-loader-fill">
        <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
          <path d={BOLT} fill="#C9F400" stroke="var(--accent-text)" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      </span>
    </span>
  )
  if (!fullScreen) return icon
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
      {icon}
      {message && <p className="bolt-loader-text" style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-muted)', margin: 0 }}>{message}</p>}
    </div>
  )
}
