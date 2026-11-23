// XP (since 2026-11-22) — the one currency for the leaderboard, profiles and
// rewards. Exactly 5× the old points (2 per report, 5 per store), so totals
// converted automatically. The server-side formula lives in get_leaderboard
// (scripts/xp-bounties.sql); keep these in step with it.

export const XP_SIGHTING = 10 // Spotted or Not there
export const XP_PHOTO = 15 // optional photo on a Spotted
export const XP_BOUNTY = 50 // first sighting at a store nobody checked lately
export const XP_STORE = 25 // approved store you added

/** A store with no sighting for this long carries a bounty. */
export const BOUNTY_AFTER_HOURS = 48
/** Bounties one person can claim per day (no farming). */
export const BOUNTY_DAILY_CAP = 3

/** Plug weeks start Monday 00:00 UTC (same reset as the weekly leaderboard). */
export function weekStartUtc(now = new Date()): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const day = (d.getUTCDay() + 6) % 7 // Monday = 0
  d.setUTCDate(d.getUTCDate() - day)
  return d
}

export function hasBounty(lastCheckedAt: string | null | undefined): boolean {
  if (!lastCheckedAt) return true
  return Date.now() - new Date(lastCheckedAt).getTime() >= BOUNTY_AFTER_HOURS * 3600000
}

/** "2 days" / "3 days" since the last check, for bounty copy. */
export function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null
  return Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000))
}

export type PlugInfo = {
  plugId: string | null
  plugName: string | null // current Plug's username (null when nobody this week)
  plugCount: number // their sightings here this week
  myCount: number // the caller's sightings here this week
  isPlug: boolean
  toBecome: number // more sightings the caller needs to take the title (0 if already Plug)
}

/** Leader among this week's reports at one store: most sightings, ties go
 *  to whoever got there first. */
export function plugFrom(rows: { user_id: string | null; reported_at: string }[], me: string | null, nameOf: (id: string) => string | null): PlugInfo {
  const count = new Map<string, number>()
  const first = new Map<string, string>()
  for (const r of rows) {
    if (!r.user_id) continue
    count.set(r.user_id, (count.get(r.user_id) ?? 0) + 1)
    if (!first.has(r.user_id) || r.reported_at < first.get(r.user_id)!) first.set(r.user_id, r.reported_at)
  }
  let leader: string | null = null
  for (const [id, n] of count) {
    if (!leader) { leader = id; continue }
    const ln = count.get(leader)!
    if (n > ln || (n === ln && first.get(id)! < first.get(leader)!)) leader = id
  }
  const plugCount = leader ? count.get(leader)! : 0
  const myCount = me ? count.get(me) ?? 0 : 0
  const isPlug = !!me && leader === me
  return { plugId: leader, plugName: leader ? nameOf(leader) : null, plugCount, myCount, isPlug, toBecome: isPlug ? 0 : Math.max(1, plugCount - myCount + 1) }
}
