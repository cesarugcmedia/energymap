'use client'

import Link from 'next/link'
import { avatarColor } from './types'
import { useIsLive } from '@/contexts/PresenceContext'

// Post/comment text with @mentions turned into profile links.
export function RichText({ text, style }: { text: string; style?: React.CSSProperties }) {
  const parts = text.split(/(@[a-z0-9_]{3,30})/gi)
  return (
    <p style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, ...style }}>
      {parts.map((part, i) =>
        /^@[a-z0-9_]{3,30}$/i.test(part)
          ? <Link key={i} href={`/u/${part.slice(1).toLowerCase()}`} style={{ color: 'var(--accent-text)', fontWeight: 600, textDecoration: 'none' }}>{part}</Link>
          : <span key={i}>{part}</span>
      )}
    </p>
  )
}

export function Avatar({ name, size = 36, url, userId }: { name: string; size?: number; url?: string | null; userId?: string | null }) {
  const live = useIsLive(userId)
  let face: React.ReactNode
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    face = <img src={url} alt="" width={size} height={size} loading="lazy" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, background: 'var(--fg-06)' }} />
  } else {
    const color = avatarColor(name)
    face = (
      <span style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: `${color}22`, color, fontSize: size * 0.4, fontWeight: 700 }}>
        {name[0]?.toUpperCase() ?? '?'}
      </span>
    )
  }
  if (!live) return face
  // Live: a lime dot with a soft pulse on the bottom-right edge.
  const dot = Math.max(8, Math.round(size * 0.28))
  return (
    <span style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }} title="Live now">
      {face}
      <span className="live-dot" aria-label="Live now" style={{ position: 'absolute', right: 0, bottom: 0, width: dot, height: dot, borderRadius: '50%', background: '#C9F400', border: `${size >= 60 ? 3 : 2}px solid var(--bg)` }} />
    </span>
  )
}
