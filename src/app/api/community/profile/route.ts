import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit } from '@/lib/rateLimit'
import { computeBadges, streakFrom } from '@/lib/badges'

// Public profile summary for /u/[username]: identity, counts, and whether the
// caller follows them. Posts are fetched client-side (RLS allows reading).

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: { user } } = await supabaseAdmin.auth.getUser(authHeader.slice(7))
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!checkRateLimit(`community-profile:${user.id}`, 60, 60 * 1000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const username = (req.nextUrl.searchParams.get('username') ?? '').toLowerCase()
  if (!/^[a-z0-9_]{3,30}$/.test(username)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // bio / favorite_drink_id come from scripts/profile-extras.sql — fall back
  // to the base columns until that has run.
  const BASE = 'id, username, created_at, is_verified_reporter, badges, tier'
  // avatar_url / anonymous_reports come from scripts/profile-v2.sql.
  let profile: any = null
  for (const cols of [`${BASE}, bio, favorite_drink_id, avatar_url, anonymous_reports`, `${BASE}, bio, favorite_drink_id`, BASE]) {
    const res = await supabaseAdmin.from('profiles').select(cols).eq('username', username).maybeSingle()
    if (!res.error) { profile = res.data; break }
  }
  if (!profile) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const extras = profile as { bio?: string | null; favorite_drink_id?: string | null; avatar_url?: string | null; anonymous_reports?: boolean }
  // "Keep my reports private": others don't see where this person reports.
  const privateReports = !!extras.anonymous_reports && profile.id !== user.id
  let favoriteDrink: string | null = null
  if (extras.favorite_drink_id) {
    const { data: d } = await supabaseAdmin.from('drinks').select('brand, name, flavor').eq('id', extras.favorite_drink_id).maybeSingle()
    if (d) favoriteDrink = `${d.brand} ${d.flavor ?? d.name}`
  }

  const count = async (q: any) => { const { count } = await q; return count ?? 0 }
  const [reports, storesAdded, followers, following, iFollow, { data: rows }, finds_] = await Promise.all([
    count(supabaseAdmin.from('stock_reports').select('id', { count: 'exact', head: true }).eq('user_id', profile.id)),
    count(supabaseAdmin.from('stores').select('id', { count: 'exact', head: true }).eq('submitted_by', profile.id).eq('status', 'approved')),
    count(supabaseAdmin.from('follows').select('id', { count: 'exact', head: true }).eq('followed_id', profile.id)),
    count(supabaseAdmin.from('follows').select('id', { count: 'exact', head: true }).eq('follower_id', profile.id)),
    count(supabaseAdmin.from('follows').select('id', { count: 'exact', head: true }).eq('follower_id', user.id).eq('followed_id', profile.id)),
    supabaseAdmin.from('stock_reports').select('drink_id, store_id, quantity, reported_at').eq('user_id', profile.id).order('reported_at', { ascending: false }).limit(1000),
    // Permanent flavor collection (profile-v2); errors until that script runs.
    supabaseAdmin.from('flavor_finds').select('drink_id').eq('user_id', profile.id).limit(5000),
  ])
  const reportRows: { drink_id: string; store_id: string; quantity: string; reported_at: string }[] = rows ?? []

  // Night owl / early bird use the viewer's UTC offset (minutes, from
  // Date#getTimezoneOffset) as a stand-in for the owner's local time.
  const tz = Number(req.nextUrl.searchParams.get('tz') ?? 0) || 0
  const localHour = (iso: string) => new Date(new Date(iso).getTime() - tz * 60000).getUTCHours()
  const hours = reportRows.map((r) => localHour(r.reported_at))
  const streak = streakFrom(reportRows.map((r) => r.reported_at))
  // Flavors found = flavors ever reported in stock. Without flavor_finds,
  // fall back to the reports that survive the 7-day pruning.
  const collection = finds_.error
    ? [...new Set(reportRows.filter((r) => r.quantity !== 'out').map((r) => r.drink_id))]
    : (finds_.data ?? []).map((f: { drink_id: string }) => f.drink_id)
  const uniqueFlavors = collection.length
  const weeklyChampion = Array.isArray(profile.badges) && profile.badges.includes('weekly_champion')
  const badges = [...computeBadges({
    memberSince: profile.created_at, reports, storesAdded, uniqueFlavors, streak,
    nightOwl: hours.some((h) => h >= 0 && h < 4), earlyBird: hours.some((h) => h >= 5 && h < 7),
    verified: !!profile.is_verified_reporter, weeklyChampion,
  })]

  // Favorite stores (most reports) and recent in-stock finds.
  const perStore: Record<string, number> = {}
  for (const r of reportRows) perStore[r.store_id] = (perStore[r.store_id] ?? 0) + 1
  const topStoreIds = Object.entries(perStore).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => id)
  const finds = reportRows.filter((r) => r.quantity !== 'out').slice(0, 6)
  const storeIds = [...new Set([...topStoreIds, ...finds.map((f) => f.store_id)])]
  const drinkIds = [...new Set(finds.map((f) => f.drink_id))]
  const [{ data: stores }, { data: drinks }] = await Promise.all([
    storeIds.length ? supabaseAdmin.from('stores').select('id, name, type').in('id', storeIds) : Promise.resolve({ data: [] as any[] }),
    drinkIds.length ? supabaseAdmin.from('drinks').select('id, brand, name, flavor').in('id', drinkIds) : Promise.resolve({ data: [] as any[] }),
  ])
  const storeById = new Map((stores ?? []).map((s: any) => [s.id, s]))
  const drinkById = new Map((drinks ?? []).map((d: any) => [d.id, d]))

  return NextResponse.json({
    stats: { uniqueFlavors, streak },
    collection: { found: collection, permanent: !finds_.error },
    privateReports,
    badges,
    topStores: privateReports ? [] : topStoreIds.filter((id) => storeById.has(id)).map((id) => ({ id, name: storeById.get(id).name, type: storeById.get(id).type, reports: perStore[id] })),
    recentFinds: privateReports ? [] : finds.filter((f) => storeById.has(f.store_id) && drinkById.has(f.drink_id)).map((f) => {
      const d = drinkById.get(f.drink_id)
      return { drink: `${d.brand} ${d.flavor ?? d.name}`, quantity: f.quantity, storeId: f.store_id, storeName: storeById.get(f.store_id).name, at: f.reported_at }
    }),
    profile: {
      id: profile.id,
      username: profile.username,
      joined: profile.created_at,
      verified: !!profile.is_verified_reporter,
      weeklyChampion,
      // Supporter flair: paying Tracker members get a badge on their profile.
      tracker: profile.tier === 'tracker',
      bio: extras.bio ?? null,
      avatarUrl: extras.avatar_url ?? null,
      favoriteDrink,
    },
    counts: { reports, storesAdded, followers, following },
    following: iFollow > 0,
  })
}
