// What each plan gets — one place for the limits the server enforces and the
// copy that advertises them (landing pricing, Account → Plan, upsells).
// Keep the copy in step with enforcement: see "Plan copy must match
// enforcement" in CLAUDE.md.

/** Map radius for free and signed-out users, enforced in /api/stores/nearby. */
export const FREE_RADIUS_MILES = 20

/** Flavors a free account can follow (Flavor Alerts). Tracker is unlimited.
 *  Enforced client-side before saving and by the drink_alerts trigger in
 *  scripts/tracker-features.sql once that has been run. */
export const FREE_ALERT_LIMIT = 5

export const TRACKER_PRICE = '$5/month'

export const FREE_FEATURES = [
  `See stock within ${FREE_RADIUS_MILES} miles, with exact report times`,
  'Report stock and add missing stores',
  `Follow up to ${FREE_ALERT_LIMIT} flavors for restock alerts`,
  'Community, profiles, badges and leaderboard',
]

export const TRACKER_FEATURES = [
  'Unlimited map range: hunt in any town',
  'Push notifications the minute a flavor restocks',
  'Unlimited flavor alerts',
  'Sighting patterns: which days each store gets spotted',
  'Saved store lists and a Tracker badge',
]

/** Short one-liner for upsell cards. */
export const TRACKER_PITCH = 'Push restock alerts, unlimited range and flavor alerts, and sighting patterns'

export function isTrackerProfile(profile: { tier?: string | null; is_admin?: boolean | null } | null | undefined): boolean {
  return !!profile && (profile.is_admin === true || profile.tier === 'tracker' || profile.tier === 'admin')
}
