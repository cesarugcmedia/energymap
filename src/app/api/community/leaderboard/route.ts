import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit } from '@/lib/rateLimit'

// Extra leaderboards beyond the points board (which comes from the
// get_leaderboard RPC):
//   board=stores   → approved stores added (any timeframe; stores aren't pruned)
//   board=flavors  → different drinks reported, this week
//   board=near     → stock reports at stores within 10 mi of lat/lng, this week
// Weekly-only boards are weekly because automation-stale-cleanup.sql deletes
// non-latest stock reports older than 7 days, so longer windows undercount.

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const DAY = 86400000
const NEAR_MILES = 10
const TOP = 50

function miles(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 3958.8
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function sinceFor(timeframe: string): string | null {
  if (timeframe === 'This Week') return new Date(Date.now() - 7 * DAY).toISOString()
  if (timeframe === 'This Month') return new Date(Date.now() - 30 * DAY).toISOString()
  return null
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: { user } } = await supabaseAdmin.auth.getUser(authHeader.slice(7))
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!checkRateLimit(`leaderboard:${user.id}`, 30, 60 * 1000)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const sp = req.nextUrl.searchParams
  const board = sp.get('board')
  const counts = new Map<string, number>()

  if (board === 'stores') {
    let q = supabaseAdmin.from('stores').select('submitted_by').eq('status', 'approved').not('submitted_by', 'is', null).limit(5000)
    const since = sinceFor(sp.get('timeframe') ?? 'All Time')
    if (since) q = q.gte('created_at', since)
    const { data, error } = await q
    if (error) return NextResponse.json({ error: 'Failed to load' }, { status: 500 })
    for (const s of data ?? []) counts.set(s.submitted_by, (counts.get(s.submitted_by) ?? 0) + 1)
  } else if (board === 'flavors' || board === 'near') {
    const lat = parseFloat(sp.get('lat') ?? '')
    const lng = parseFloat(sp.get('lng') ?? '')
    if (board === 'near' && (isNaN(lat) || isNaN(lng))) return NextResponse.json({ error: 'Location required' }, { status: 400 })
    const { data: reports, error } = await supabaseAdmin
      .from('stock_reports').select('user_id, drink_id, store_id')
      .gte('reported_at', new Date(Date.now() - 7 * DAY).toISOString()).limit(10000)
    if (error) return NextResponse.json({ error: 'Failed to load' }, { status: 500 })

    if (board === 'flavors') {
      const seen = new Map<string, Set<string>>()
      for (const r of reports ?? []) { const s = seen.get(r.user_id) ?? new Set(); s.add(r.drink_id); seen.set(r.user_id, s) }
      for (const [uid, s] of seen) counts.set(uid, s.size)
    } else {
      const storeIds = [...new Set((reports ?? []).map((r) => r.store_id))]
      const nearStores = new Set<string>()
      for (let i = 0; i < storeIds.length; i += 300) {
        const { data: stores } = await supabaseAdmin.from('stores').select('id, lat, lng').in('id', storeIds.slice(i, i + 300))
        for (const s of stores ?? []) if (miles(lat, lng, s.lat, s.lng) <= NEAR_MILES) nearStores.add(s.id)
      }
      for (const r of reports ?? []) if (nearStores.has(r.store_id)) counts.set(r.user_id, (counts.get(r.user_id) ?? 0) + 1)
    }
  } else {
    return NextResponse.json({ error: 'Unknown board' }, { status: 400 })
  }

  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP)
  const ids = top.map(([id]) => id)
  const { data: profiles } = ids.length
    ? await supabaseAdmin.from('profiles').select('id, username, is_verified_reporter, tier, badges').in('id', ids)
    : { data: [] as any[] }
  const byId = new Map((profiles ?? []).map((p: any) => [p.id, p]))

  // Where does the caller rank, even if outside the top 50?
  const all = [...counts.entries()].sort((a, b) => b[1] - a[1])
  const myIndex = all.findIndex(([id]) => id === user.id)

  return NextResponse.json({
    entries: top
      .filter(([id]) => byId.has(id))
      .map(([id, value]) => {
        const p = byId.get(id)
        return { id, username: p.username, value, is_verified_reporter: !!p.is_verified_reporter, tier: p.tier, badges: p.badges ?? [] }
      }),
    me: myIndex >= 0 ? { rank: myIndex + 1, value: all[myIndex][1] } : null,
  })
}
