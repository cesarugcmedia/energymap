// Sightings — how the community reports stock (since 2026-11-22).
//
// A report is either "Spotted" (with an optional amount: "Just a few" /
// "Plenty") or "Not there". Older reports used full / medium / low / out;
// those are kept in `quantity` and read through these helpers, so every
// screen works both before and after scripts/sightings.sql has run:
//   full → spotted + plenty, medium / low → spotted + few, out → not there.

export type Sighting = 'spotted' | 'not_there'
export type Amount = 'few' | 'plenty'

/** Any stock row: new columns when present, else the legacy level. */
export type SightingRow = {
  sighting?: string | null
  amount?: string | null
  quantity?: string | null
  reported_at?: string | null
}

export function sightingOf(r: SightingRow): Sighting {
  if (r.sighting === 'spotted' || r.sighting === 'not_there') return r.sighting
  return r.quantity === 'out' ? 'not_there' : 'spotted'
}

export function amountOf(r: SightingRow): Amount | null {
  if (sightingOf(r) === 'not_there') return null
  if (r.amount === 'few' || r.amount === 'plenty') return r.amount
  if (r.sighting) return null // a new-style sighting with no amount given
  if (r.quantity === 'full') return 'plenty'
  if (r.quantity === 'medium' || r.quantity === 'low') return 'few'
  return null
}

export const isSpotted = (r: SightingRow) => sightingOf(r) === 'spotted'

export const AMOUNT_LABEL: Record<Amount, string> = { few: 'Just a few', plenty: 'Plenty' }

// Lime for spotted (use the CSS var for text so it reads in light mode),
// red for not there. Fills/dots can use the hex.
export const SPOTTED_HEX = '#C9F400'
export const NOT_THERE_HEX = '#FF4545'
export const SPOTTED_TEXT = 'var(--accent-text)'

/** Reports fade after this long ("less reliable"). */
export const RELIABLE_HOURS = 24

export function hoursSince(iso: string | null | undefined): number {
  if (!iso) return Infinity
  return (Date.now() - new Date(iso).getTime()) / 3600000
}

export const isReliable = (iso: string | null | undefined) => hoursSince(iso) < RELIABLE_HOURS

/** "just now", "12 min ago", "2 hrs ago", "3 days ago". */
export function agoText(iso: string | null | undefined): string {
  if (!iso) return ''
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? '' : 's'} ago`
  const days = Math.floor(hrs / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

/** "Spotted 2 hrs ago" / "Not found 30 min ago". */
export function sightingLine(r: SightingRow): string {
  return `${sightingOf(r) === 'spotted' ? 'Spotted' : 'Not found'} ${agoText(r.reported_at)}`
}

/** "Spotted 4 times today" (only meaningful for 2+). */
export function timesToday(n: number): string {
  return n === 1 ? 'Spotted once today' : `Spotted ${n} times today`
}

/** Start of today in the viewer's timezone. */
export function startOfToday(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Legacy `quantity` value to store alongside a sighting where an older
 *  column still needs one (community_posts.quantity). */
export function legacyQuantity(s: Sighting, a: Amount | null): 'full' | 'low' | 'medium' | 'out' {
  if (s === 'not_there') return 'out'
  return a === 'plenty' ? 'full' : a === 'few' ? 'low' : 'medium'
}
