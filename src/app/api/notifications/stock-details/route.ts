import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit } from '@/lib/rateLimit'
import { amountOf, sightingOf } from '@/lib/sightings'

// POST /api/notifications/stock-details { ids: string[] }
// For the caller's own stock notifications, returns the flavors and levels
// that were actually reported, so the Alerts tab can color them. The
// notification text is written by DB triggers/RPCs whose wording isn't in
// this repo, so instead of parsing it we match each notification to the
// stock reports made at its store around the moment it was created.
// Returns { [notificationId]: { drink_id, sighting, amount }[] } — no user ids.
// Window: 3 min before to 10 min after the notification, since "spotted
// nearby" notifications go out once per reporter per store per 10 minutes.

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BEFORE_MS = 3 * 60 * 1000
const AFTER_MS = 10 * 60 * 1000

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: { user } } = await supabaseAdmin.auth.getUser(authHeader.slice(7))
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!checkRateLimit(`notif-stock:${user.id}`, 60, 60 * 1000)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const body = await req.json().catch(() => ({}))
  const ids: string[] = Array.isArray(body.ids) ? body.ids.filter((x: unknown) => typeof x === 'string').slice(0, 100) : []
  if (!ids.length) return NextResponse.json({ details: {} })

  const { data: notes } = await supabaseAdmin.from('notifications')
    .select('id, store_id, created_at, type')
    .eq('user_id', user.id)
    .in('id', ids)
  const withStore = (notes ?? []).filter((n) => n.store_id && n.created_at)
  if (!withStore.length) return NextResponse.json({ details: {} })

  const times = withStore.map((n) => new Date(n.created_at).getTime())
  const from = new Date(Math.min(...times) - BEFORE_MS).toISOString()
  const to = new Date(Math.max(...times) + AFTER_MS).toISOString()
  const { data: reports } = await supabaseAdmin.from('stock_reports')
    .select('*')
    .in('store_id', [...new Set(withStore.map((n) => n.store_id))])
    .gte('reported_at', from)
    .lte('reported_at', to)
    .order('reported_at', { ascending: false })
    .range(0, 999)

  const details: Record<string, { drink_id: string; sighting: string; amount: string | null }[]> = {}
  for (const n of withStore) {
    const t = new Date(n.created_at).getTime()
    const seen = new Set<string>()
    const list = (reports ?? []).filter((r) => {
      const dt = new Date(r.reported_at).getTime() - t
      if (r.store_id !== n.store_id || dt < -BEFORE_MS || dt > AFTER_MS) return false
      if (seen.has(r.drink_id)) return false
      seen.add(r.drink_id)
      return true
    })
    // Restock alerts are about a flavor being spotted; keep only those.
    const rows = n.type === 'drink_alert' ? list.filter((r) => sightingOf(r) === 'spotted') : list
    if (rows.length) details[n.id] = rows.slice(0, 12).map((r) => ({ drink_id: r.drink_id, sighting: sightingOf(r), amount: amountOf(r) }))
  }
  return NextResponse.json({ details })
}
