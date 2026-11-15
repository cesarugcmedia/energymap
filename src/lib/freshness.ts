// How old a stock report can get before it reads as less trustworthy.
// One source of truth for the store page labels, the map pins, the
// "Fresh only" chip and the landing ZIP preview.
//
//   Fresh       < 1 day
//   Aging       1 – 2 days
//   Stale       2 – 3 days
//   Unverified  3+ days
//
// Map pins / list dots collapse this to fresh (lime) vs. not.

export const FRESH_HOURS = 24
export const AGING_HOURS = 48
export const STALE_HOURS = 72

export type Staleness = 'Fresh' | 'Aging' | 'Stale' | 'Unverified'

export function hoursSince(dateStr: string): number {
  return (Date.now() - new Date(dateStr).getTime()) / 3600000
}

export function stalenessOf(dateStr: string): Staleness {
  const hrs = hoursSince(dateStr)
  if (hrs < FRESH_HOURS) return 'Fresh'
  if (hrs < AGING_HOURS) return 'Aging'
  if (hrs < STALE_HOURS) return 'Stale'
  return 'Unverified'
}

/** True while a report still counts as fresh (lime pin / dot). */
export function isFresh(dateStr: string | null | undefined): boolean {
  return !!dateStr && hoursSince(dateStr) < FRESH_HOURS
}
