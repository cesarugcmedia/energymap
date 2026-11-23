import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'

// GET /api/stores/sightings?store_id=&tz= — how many times each flavor was
// spotted at a store today (viewer's day, via `tz` = getTimezoneOffset()).
// Powers "Spotted 4 times today" on store pages. Counts only, no user info.

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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
  const since = new Date(midnightLocal + tz * 60000).toISOString()

  const { data, error } = await supabaseAdmin.from('stock_reports')
    .select('*')
    .eq('store_id', storeId)
    .gte('reported_at', since)
    .range(0, 999)
  if (error) return NextResponse.json({ error: 'Failed to load' }, { status: 500 })

  const spotted: Record<string, number> = {}
  let total = 0
  for (const r of (data ?? []) as { drink_id: string; sighting?: string | null; quantity?: string | null }[]) {
    total++
    const s = r.sighting ?? (r.quantity === 'out' ? 'not_there' : 'spotted')
    if (s === 'spotted') spotted[r.drink_id] = (spotted[r.drink_id] ?? 0) + 1
  }
  return NextResponse.json({ spotted, total }, { headers: { 'Cache-Control': 'private, max-age=30' } })
}
