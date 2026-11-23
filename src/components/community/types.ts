// Shared types + small helpers for the Community feed (src/components/community).

export type PostType = 'post' | 'found' | 'looking'
export type Quantity = 'full' | 'medium' | 'low' | 'out'

export interface FeedComment {
  id: string
  post_id: string
  user_id: string
  body: string
  created_at: string
  username: string
  avatar?: string | null
  parent_id: string | null
  store: { id: string; name: string } | null
}

export interface FeedPost {
  id: string
  user_id: string
  body: string
  created_at: string
  username: string
  avatar?: string | null
  post_type: PostType
  photos: string[]
  store: { id: string; name: string; address: string | null; lat: number | null; lng: number | null } | null
  drink: { id: string; brand: string; flavor: string } | null
  quantity: Quantity | null
  likeCount: number
  likedByMe: boolean
}

export interface StoreSummary { inStock: number; total: number; latest: string | null }

// community_posts.quantity keeps its stored values; since sightings
// (2026-11-22) they read as the optional amount on a "Found it" post:
// full → Plenty, medium / low → Just a few, out (older posts) → Not there.
export const QUANTITY_STYLE: Record<string, { label: string; color: string }> = {
  full: { label: 'Plenty', color: 'var(--accent-text)' },
  medium: { label: 'Just a few', color: 'var(--text-muted)' },
  low: { label: 'Just a few', color: 'var(--text-muted)' },
  out: { label: 'Not there', color: '#FF4545' },
}

export function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return days < 7 ? `${days}d ago` : new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function milesBetween(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 3958.8
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** Trending: engagement decayed by age, so fresh activity can outrank old hits. */
export function trendingScore(p: FeedPost, commentCount: number) {
  const hours = (Date.now() - new Date(p.created_at).getTime()) / 3600000
  return (p.likeCount * 2 + commentCount * 1.5 + 1) / Math.pow(hours + 2, 1.4)
}

const AVATAR_HUES = ['#C9F400', '#60a5fa', '#a78bfa', '#fb923c', '#f472b6', '#22d3ee', '#fbbf24', '#34d399']
export function avatarColor(name: string) {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return AVATAR_HUES[h % AVATAR_HUES.length]
}
