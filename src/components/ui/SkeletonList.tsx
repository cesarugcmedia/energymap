import ui from './ui.module.css'

// Placeholder cards shown while a list loads, instead of a lone spinner, so
// the page keeps its shape and feels faster. Matches the shared card style.
export default function SkeletonList({ count = 3, avatar = true }: { count?: number; avatar?: boolean }) {
  return (
    <div className={ui.skeletonList} aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={ui.skeletonCard}>
          {avatar && <span className={ui.skeletonBlock} style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0 }} />}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span className={ui.skeletonBlock} style={{ height: 14, width: `${60 + ((i * 17) % 30)}%` }} />
            <span className={ui.skeletonBlock} style={{ height: 11, width: `${35 + ((i * 23) % 25)}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}
