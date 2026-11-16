import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'
import { chainName, cityState } from '@/lib/place'

// GET /api/landing/activity — public, no login. Powers the landing page's
// "Live right now" strip: the most recent stock reports as
// "flavor · level · a <chain> in <City, ST> · time". Deliberately anonymous:
// no usernames, user ids, store ids or street addresses leave the server.
// Edge-cached for 60 s so traffic on the landing page doesn't hit the DB.

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const MAX_ITEMS = 14

export async function GET(req: NextRequest) {
  if (!checkRateLimit(`landing-activity:${getClientIp(req)}`, 30, 60 * 1000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const since = new Date(Date.now() - 48 * 3600 * 1000).toISOString()
  const [{ data: reports, error }, { count: dayCount }] = await Promise.all([
    supabaseAdmin.from('stock_reports')
      .select('store_id, drink_id, quantity, reported_at')
      .gte('reported_at', since)
      .order('reported_at', { ascending: false })
      .limit(200),
    supabaseAdmin.from('stock_reports')
      .select('id', { count: 'exact', head: true })
      .gte('reported_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString()),
  ])
  if (error) return NextResponse.json({ error: 'Failed to load' }, { status: 500 })

  // One line per store+flavor, newest first.
  const seen = new Set<string>()
  const picked = (reports ?? []).filter((r) => {
    const k = `${r.store_id}:${r.drink_id}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  }).slice(0, MAX_ITEMS * 2)

  const storeIds = [...new Set(picked.map((r) => r.store_id))]
  const drinkIds = [...new Set(picked.map((r) => r.drink_id))]
  const [{ data: stores }, { data: drinks }] = await Promise.all([
    storeIds.length ? supabaseAdmin.from('stores').select('id, name, address, status').in('id', storeIds) : Promise.resolve({ data: [] as { id: string; name: string; address: string | null; status: string }[] }),
    drinkIds.length ? supabaseAdmin.from('drinks').select('id, brand, name, flavor').in('id', drinkIds) : Promise.resolve({ data: [] as { id: string; brand: string; name: string; flavor: string | null }[] }),
  ])
  const storeById = new Map((stores ?? []).filter((s) => s.status === 'approved').map((s) => [s.id, s]))
  const drinkById = new Map((drinks ?? []).map((d) => [d.id, d]))

  const items = picked.flatMap((r) => {
    const s = storeById.get(r.store_id)
    const d = drinkById.get(r.drink_id)
    if (!s || !d) return []
    return [{
      flavor: d.flavor ? `${d.brand} ${d.flavor}` : d.name,
      quantity: r.quantity as 'full' | 'medium' | 'low' | 'out',
      chain: chainName(s.name),
      place: cityState(s.address),
      at: r.reported_at,
    }]
  }).slice(0, MAX_ITEMS)

  return NextResponse.json(
    { items, reportsToday: dayCount ?? null },
    { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } }
  )
}
