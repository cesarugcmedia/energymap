import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'
import { plugFrom, weekStartUtc } from '@/lib/xp'

// GET /api/stores/sightings?store_id=&tz= — store-page extras:
//   spotted:     times each flavor was spotted here today (viewer's day,
//                via `tz` = getTimezoneOffset()) → "4× today"
//   total:       all sightings here today
//   lastSpotted: newest Spotted per flavor in 30 days → "Last spotted yesterday"
//                under a Not found row
//   lastCheckedAt: newest sighting of any kind (drives the bounty)
//   plug:        this week's Plug { username, count } or null
// Counts and usernames only; no user ids.

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type Row = { drink_id: string; user_id: string | null; reported_at: string; sighting?: string | null; quantity?: string | null }
const isSpotted = (r: Row) => (r.sighting ?? (r.quantity === 'out' ? 'not_there' : 'spotted')) === 'spotted'

export async function GET(req: NextRequest) {
  if (!checkRateLimit(`store-sightings:${getClientIp(req)}`, 60, 60 * 1000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }
  const storeId = req.nextUrl.searchParams.get('store_id') ?? ''
  if (!/^[0-9a-f-]{36}$/i.test(storeId)) return NextResponse.json({ error: 'Invalid store' }, { status: 400 })
  const tz = Math.max(-840, Math.min(840, parseInt(req.nextUrl.searchParams.get('tz') ?? '0', 10) || 0))

  // Midnight in the viewer's timezone, as UTC.
  const nowLocal = new Date(Date.now() - tz * 60000)
  const midnightLocal = Date.UTC(nowLocal.getUTCFullYear(), nowLocal.getUTCMonth(), nowLocal.getUTCDate())
  const todayStart = midnightLocal + tz * 60000
  const since = new Date(Date.now() - 30 * 86400000).toISOString()

  const { data, error } = await supabaseAdmin.from('stock_reports')
    .select('*')
    .eq('store_id', storeId)
    .gte('reported_at', since)
    .order('reported_at', { ascending: false })
    .range(0, 1999)
  if (error) return NextResponse.json({ error: 'Failed to load' }, { status: 500 })
  const rows = (data ?? []) as Row[]

  const spotted: Record<string, number> = {}
  const lastSpotted: Record<string, string> = {}
  let total = 0
  for (const r of rows) {
    const t = new Date(r.reported_at).getTime()
    if (t >= todayStart) {
      total++
      if (isSpotted(r)) spotted[r.drink_id] = (spotted[r.drink_id] ?? 0) + 1
    }
    if (isSpotted(r) && !lastSpotted[r.drink_id]) lastSpotted[r.drink_id] = r.reported_at
  }

  // Last check ever (not just 30 days) for the bounty.
  let lastCheckedAt = rows[0]?.reported_at ?? null
  if (!lastCheckedAt) {
    const { data: older } = await supabaseAdmin.from('stock_reports').select('reported_at')
      .eq('store_id', storeId).order('reported_at', { ascending: false }).limit(1)
    lastCheckedAt = older?.[0]?.reported_at ?? null
  }

  // This week's Plug.
  const weekStart = weekStartUtc().getTime()
  const week = rows.filter((r) => new Date(r.reported_at).getTime() >= weekStart)
  const p = plugFrom(week, null, () => null)
  let plug: { username: string; count: number } | null = null
  if (p.plugId) {
    const { data: prof } = await supabaseAdmin.from('profiles').select('username').eq('id', p.plugId).maybeSingle()
    if (prof?.username) plug = { username: prof.username, count: p.plugCount }
  }

  return NextResponse.json({ spotted, total, lastSpotted, lastCheckedAt, plug }, { headers: { 'Cache-Control': 'private, max-age=20' } })
}
