// The 19-badge catalog, shared by Account → Badges and public profiles
// (/u/[username]). Thematic emoji are intentional here (see CLAUDE.md,
// "Deliberately left as emoji").

/** Founding Hunter: everyone who joins before this date keeps the badge for
 *  good. Advertised on the landing page ("Join before January 1"). */
export const FOUNDING_CUTOFF = '2027-01-01T00:00:00Z'
export const FOUNDING_CUTOFF_LABEL = 'January 1'

export function isFoundingMember(joined: string | null | undefined): boolean {
  return !!joined && new Date(joined).getTime() < new Date(FOUNDING_CUTOFF).getTime()
}

export const BADGE_DEFS = [
  { id: 'founding_hunter', icon: '🎖️', name: 'Founding Hunter', desc: 'Joined before ' + FOUNDING_CUTOFF_LABEL + ', 2027. Yours forever', color: '#C9F400', glow: 'rgba(201,244,0,0.25)' },
  { id: 'early_adopter',   icon: '🌟', name: 'Early Adopter',   desc: 'Joined in the founding era',          color: '#f59e0b', glow: 'rgba(245,158,11,0.25)'  },
  { id: 'first_report',    icon: '⚡', name: 'First Sighting',    desc: 'Logged your first sighting',   color: '#C9F400', glow: 'rgba(201,244,0,0.25)'   },
  { id: 'reporter_10',     icon: '📊', name: 'Spotter',        desc: '10 sightings logged',          color: '#C9F400', glow: 'rgba(201,244,0,0.25)'   },
  { id: 'reporter_50',     icon: '🏆', name: 'Veteran',         desc: '50 sightings logged',          color: '#f97316', glow: 'rgba(249,115,22,0.25)'  },
  { id: 'reporter_100',    icon: '💎', name: 'Elite',           desc: '100 sightings logged',         color: '#a855f7', glow: 'rgba(168,85,247,0.25)'  },
  { id: 'reporter_200',    icon: '📈', name: 'Dedicated',       desc: '200 sightings logged',         color: '#f97316', glow: 'rgba(249,115,22,0.25)'  },
  { id: 'reporter_500',    icon: '🚀', name: 'Legend',          desc: '500 sightings logged',         color: '#ec4899', glow: 'rgba(236,72,153,0.25)'  },
  { id: 'scout',           icon: '📍', name: 'Scout',           desc: 'Added your first approved store',     color: '#3b82f6', glow: 'rgba(59,130,246,0.25)'  },
  { id: 'pathfinder',      icon: '🗺️', name: 'Pathfinder',     desc: 'Added 5 approved stores',             color: '#06b6d4', glow: 'rgba(6,182,212,0.25)'   },
  { id: 'store_builder',   icon: '🏗️', name: 'Builder',        desc: 'Added 10 approved stores',            color: '#f59e0b', glow: 'rgba(245,158,11,0.25)'  },
  { id: 'flavor_hunter',   icon: '🎯', name: 'Flavor Hunter',  desc: 'Spotted 5 different flavors',         color: '#ec4899', glow: 'rgba(236,72,153,0.25)'  },
  { id: 'flavor_master',   icon: '🧪', name: 'Connoisseur',    desc: 'Spotted 20 different flavors',        color: '#a855f7', glow: 'rgba(168,85,247,0.25)'  },
  { id: 'on_fire',         icon: '🔥', name: 'On Fire',        desc: '3-day sighting streak',              color: '#f97316', glow: 'rgba(249,115,22,0.25)'  },
  { id: 'unstoppable',     icon: '💥', name: 'Unstoppable',    desc: '7-day sighting streak',              color: '#ef4444', glow: 'rgba(239,68,68,0.25)'   },
  { id: 'night_owl',       icon: '🦉', name: 'Night Owl',      desc: 'Logged a sighting after midnight',   color: '#818cf8', glow: 'rgba(129,140,248,0.25)' },
  { id: 'early_bird',      icon: '🐦', name: 'Early Bird',     desc: 'Logged a sighting before 7am',      color: '#fbbf24', glow: 'rgba(251,191,36,0.25)'  },
  { id: 'verified',        icon: '✅', name: 'Verified',        desc: 'Trusted community spotter',         color: '#60a5fa', glow: 'rgba(96,165,250,0.25)'  },
  { id: 'weekly_champion', icon: '👑', name: 'Weekly Champion', desc: 'Top spotter of the week',           color: '#ffd700', glow: 'rgba(255,215,0,0.25)'   },
]

export type BadgeStats = {
  memberSince: string | null
  reports: number
  storesAdded: number
  uniqueFlavors: number
  streak: number
  nightOwl: boolean
  earlyBird: boolean
  verified: boolean
  weeklyChampion: boolean
}

// Same thresholds as the Account page's own computation.
export function computeBadges(s: BadgeStats): Set<string> {
  const earned = new Set<string>()
  const memberDays = s.memberSince ? Math.floor((Date.now() - new Date(s.memberSince).getTime()) / 86400000) : 0
  if (memberDays >= 30) earned.add('early_adopter')
  if (isFoundingMember(s.memberSince)) earned.add('founding_hunter')
  if (s.reports >= 1) earned.add('first_report')
  if (s.reports >= 10) earned.add('reporter_10')
  if (s.reports >= 50) earned.add('reporter_50')
  if (s.reports >= 100) earned.add('reporter_100')
  if (s.reports >= 200) earned.add('reporter_200')
  if (s.reports >= 500) earned.add('reporter_500')
  if (s.storesAdded >= 1) earned.add('scout')
  if (s.storesAdded >= 5) earned.add('pathfinder')
  if (s.storesAdded >= 10) earned.add('store_builder')
  if (s.uniqueFlavors >= 5) earned.add('flavor_hunter')
  if (s.uniqueFlavors >= 20) earned.add('flavor_master')
  if (s.streak >= 3) earned.add('on_fire')
  if (s.streak >= 7) earned.add('unstoppable')
  if (s.nightOwl) earned.add('night_owl')
  if (s.earlyBird) earned.add('early_bird')
  if (s.verified) earned.add('verified')
  if (s.weeklyChampion) earned.add('weekly_champion')
  return earned
}

// Consecutive report days ending today or yesterday (UTC dates, matching
// the Account page).
export function streakFrom(dates: string[]): number {
  const days = [...new Set(dates.map((d) => d.slice(0, 10)))].sort().reverse()
  const today = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  if (days[0] !== today && days[0] !== yesterday) return 0
  let s = 0
  let cursor = new Date(days[0])
  for (const d of days) {
    if (d !== cursor.toISOString().slice(0, 10)) break
    s++
    cursor = new Date(cursor.getTime() - 86400000)
  }
  return s
}
