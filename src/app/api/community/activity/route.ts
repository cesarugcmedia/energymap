import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit } from '@/lib/rateLimit'

// Auto-generated activity cards mixed into the Community feed, so the feed
// stays alive even when few people post: recent stock reports (grouped per
// person+store visit), newly added stores, and restocks of flavors the
// caller follows. Read with the service role because stock_reports rows
// belong to other users; only public-facing fields are returned.

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const DAY = 24 * 3600 * 1000
const VISIT_WINDOW_MS = 20 * 60 * 1000
const NEAR_MILES = 10

function miles(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 3958.8
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

type DrinkLite = { brand: string; flavor: string; quantity: string }
type ActivityItem =
  | { kind: 'report'; id: string; created_at: string; user_id: string; username: string; store: { id: string; name: string }; drinks: DrinkLite[] }
  | { kind: 'store'; id: string; created_at: string; username: string | null; store: { id: string; name: string; address: string | null } }
  | { kind: 'restock'; id: string; created_at: string; store: { id: string; name: string }; drink: DrinkLite }

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: { user } } = await supabaseAdmin.auth.getUser(authHeader.slice(7))
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!checkRateLimit(`community-activity:${user.id}`, 30, 60 * 1000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const sp = req.nextUrl.searchParams
  const nearLat = parseFloat(sp.get('lat') ?? '')
  const nearLng = parseFloat(sp.get('lng') ?? '')
  const near = !isNaN(nearLat) && !isNaN(nearLng)
  const since = new Date(Date.now() - 7 * DAY).toISOString()

  const [{ data: reports }, { data: newStores }, { data: alerts }] = await Promise.all([
    supabaseAdmin.from('stock_reports').select('store_id, drink_id, quantity, user_id, reported_at')
      .gte('reported_at', since).order('reported_at', { ascending: false }).limit(200),
    supabaseAdmin.from('stores').select('id, name, address, lat, lng, created_at, submitted_by')
      .eq('status', 'approved').gte('created_at', since).order('created_at', { ascending: false }).limit(15),
    supabaseAdmin.from('drink_alerts').select('drink_id').eq('user_id', user.id),
  ])

  const storeIds = [...new Set((reports ?? []).map((r) => r.store_id))]
  const drinkIds = [...new Set((reports ?? []).map((r) => r.drink_id))]
  const userIds = [...new Set([...(reports ?? []).map((r) => r.user_id), ...(newStores ?? []).map((s) => s.submitted_by).filter(Boolean)])]
  const [{ data: stores }, { data: drinks }, { data: profiles }] = await Promise.all([
    storeIds.length ? supabaseAdmin.from('stores').select('id, name, lat, lng').in('id', storeIds.slice(0, 300)) : Promise.resolve({ data: [] as any[] }),
    drinkIds.length ? supabaseAdmin.from('drinks').select('id, brand, name, flavor').in('id', drinkIds.slice(0, 300)) : Promise.resolve({ data: [] as any[] }),
    // anonymous_reports (scripts/profile-v2.sql): fall back to plain usernames before it runs.
    userIds.length
      ? supabaseAdmin.from('profiles').select('id, username, anonymous_reports').in('id', userIds.slice(0, 300))
          .then((r) => (r.error ? supabaseAdmin.from('profiles').select('id, username').in('id', userIds.slice(0, 300)) : r))
      : Promise.resolve({ data: [] as any[] }),
  ])
  const storeById = new Map((stores ?? []).map((s: any) => [s.id, s]))
  const drinkById = new Map((drinks ?? []).map((d: any) => [d.id, d]))
  const nameById = new Map((profiles ?? []).map((p: any) => [p.id, p.username]))
  // People who chose "Hide my name on stock reports" show as "A hunter".
  const anonymous = new Set((profiles ?? []).filter((p: any) => p.anonymous_reports).map((p: any) => p.id))
  const isNear = (s: { lat: number; lng: number } | undefined) => !near || (s ? miles(nearLat, nearLng, s.lat, s.lng) <= NEAR_MILES : false)
  const drinkLite = (drinkId: string, quantity: string): DrinkLite | null => {
    const d = drinkById.get(drinkId)
    return d ? { brand: d.brand, flavor: d.flavor || d.name, quantity } : null
  }

  const items: ActivityItem[] = []

  // Group reports into "visits": same person + store within VISIT_WINDOW_MS.
  const visits = new Map<string, Extract<ActivityItem, { kind: 'report' }>>()
  for (const r of reports ?? []) {
    const store = storeById.get(r.store_id)
    if (!store || !isNear(store)) continue
    const bucket = Math.floor(new Date(r.reported_at).getTime() / VISIT_WINDOW_MS)
    const key = `${r.user_id}:${r.store_id}:${bucket}`
    const lite = drinkLite(r.drink_id, r.quantity)
    if (!lite) continue
    const existing = visits.get(key)
    if (existing) { if (existing.drinks.length < 12) existing.drinks.push(lite); continue }
    visits.set(key, {
      kind: 'report', id: `report:${key}`, created_at: r.reported_at, user_id: anonymous.has(r.user_id) ? '' : r.user_id,
      username: anonymous.has(r.user_id) ? '' : nameById.get(r.user_id) ?? 'someone', store: { id: store.id, name: store.name }, drinks: [lite],
    })
  }
  items.push(...[...visits.values()].slice(0, 30))

  for (const s of newStores ?? []) {
    if (!isNear(s)) continue
    items.push({ kind: 'store', id: `store:${s.id}`, created_at: s.created_at, username: s.submitted_by ? nameById.get(s.submitted_by) ?? null : null, store: { id: s.id, name: s.name, address: s.address } })
  }

  // Restocks of flavors this user follows (in stock, last 48h, newest per store+drink).
  const followed = new Set((alerts ?? []).map((a: any) => a.drink_id))
  if (followed.size > 0) {
    const seen = new Set<string>()
    const cutoff = Date.now() - 2 * DAY
    for (const r of reports ?? []) {
      if (!followed.has(r.drink_id) || r.quantity === 'out' || new Date(r.reported_at).getTime() < cutoff) continue
      const key = `${r.store_id}:${r.drink_id}`
      if (seen.has(key)) continue
      seen.add(key)
      const store = storeById.get(r.store_id)
      const lite = drinkLite(r.drink_id, r.quantity)
      if (!store || !lite) continue
      items.push({ kind: 'restock', id: `restock:${key}`, created_at: r.reported_at, store: { id: store.id, name: store.name }, drink: lite })
      if (seen.size >= 5) break
    }
  }

  items.sort((a, b) => b.created_at.localeCompare(a.created_at))
  return NextResponse.json({ items })
}
