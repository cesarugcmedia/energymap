// Branded full-screen loader: the AmpedMap bolt "charging" — an outline that
// fills with lime from the bottom, then glows, on a loop. Pure CSS
// (.bolt-loader in globals.css), so it's safe in server components too;
// under reduced motion it's a static filled bolt.
const BOLT = 'M13 2 4 14h6l-1 8 9-12h-6l1-8z'

export default function BoltLoader({ size = 44, fullScreen = true }: { size?: number; fullScreen?: boolean }) {
  const icon = (
    <span className="bolt-loader" role="status" aria-label="Loading" style={{ width: size, height: size }}>
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
  return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh', background: 'var(--bg)' }}>{icon}</div>
}
