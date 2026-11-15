import { STALE_HOURS, hoursSince } from '@/lib/freshness'

// A small ring that empties as a report ages over the 3 days before it turns
// Unverified (src/lib/freshness.ts) — full right after a report, empty at
// 3 days. Reports under 2 hours old also pulse (`live-dot`).
export default function FreshnessRing({ reportedAt, color, size = 14 }: { reportedAt: string; color: string; size?: number }) {
  const hrs = hoursSince(reportedAt)
  const left = Math.max(0, Math.min(1, 1 - hrs / STALE_HOURS))
  const stroke = 2.4
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <span className={hrs < 2 ? 'live-dot' : undefined} style={{ display: 'inline-flex', flexShrink: 0, borderRadius: '50%', color }} title={`${Math.round(left * 100)}% fresh`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--fg-13)" strokeWidth={stroke} />
        {left > 0 && (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={c * (1 - left)} className="ring-drain" style={{ ['--ring-c' as string]: `${c}` }} />
        )}
        <circle cx={size / 2} cy={size / 2} r={size * 0.14} fill={color} />
      </svg>
    </span>
  )
}
