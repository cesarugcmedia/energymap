import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit } from '@/lib/rateLimit'
import { sightingOf, type SightingRow } from '@/lib/sightings'

// GET /api/stores/patterns?store_id=&tz= — Tracker-only restock patterns for
// one store, worked out from its report history (90 days once
// scripts/tracker-features.sql has extended retention; 7 days before that).
//
// A "restock" is a Spotted sighting that follows a Not there for that flavor
// at this store, or follows RESTOCK_GAP_MS with no sighting. Those are
// bucketed by weekday and time of day in the viewer's timezone (`tz` =
// Date#getTimezoneOffset()). With too few restocks it falls back to when
// flavors get spotted at all (basis "full", kept for the client).

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const RESTOCK_GAP_MS = 3 * 24 * 3600 * 1000
const DAY_MS = 86400000
const MIN_SIGNALS = 3

type Row = SightingRow & { drink_id: string; reported_at: string }

function partOf(hour: number) {
  return hour < 5 ? 'night' : hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night'
}

export async function GET(req: NextRequest) {
  try {
    return await handle(req)
  } catch (e) {
    console.error('patterns failed', e)
    return NextResponse.json({ error: 'server' }, { status: 500 })
  }
}

async function handle(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: { user } } = await supabaseAdmin.auth.getUser(authHeader.slice(7))
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!checkRateLimit(`patterns:${user.id}`, 60, 60 * 1000)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const { data: profile } = await supabaseAdmin.from('profiles').select('tier, is_admin').eq('id', user.id).single()
  if (!(profile?.is_admin || profile?.tier === 'tracker' || profile?.tier === 'admin')) {
    return NextResponse.json({ error: 'tracker_only' }, { status: 403 })
  }

  const storeId = req.nextUrl.searchParams.get('store_id') ?? ''
  if (!/^[0-9a-f-]{36}$/i.test(storeId)) return NextResponse.json({ error: 'Invalid store' }, { status: 400 })
  const tz = Math.max(-840, Math.min(840, parseInt(req.nextUrl.searchParams.get('tz') ?? '0', 10) || 0))

  // Up to 5,000 reports, newest window first (paged past the 1,000-row cap).
  const since = new Date(Date.now() - 90 * DAY_MS).toISOString()
  const rows: Row[] = []
  for (let from = 0; from < 5000; from += 1000) {
    const { data, error } = await supabaseAdmin.from('stock_reports')
      .select('*')
      .eq('store_id', storeId)
      .gte('reported_at', since)
      .order('reported_at', { ascending: true })
      .range(from, from + 999)
    if (error) {
      console.error('patterns: stock_reports query failed', error.message)
      return NextResponse.json({ error: 'reports' }, { status: 500 })
    }
    rows.push(...((data ?? []) as Row[]))
    if (!data || data.length < 1000) break
  }

  const local = (iso: string) => new Date(new Date(iso).getTime() - tz * 60000)
  const restockDays = [0, 0, 0, 0, 0, 0, 0]
  const restockParts: Record<string, number> = { morning: 0, afternoon: 0, evening: 0, night: 0 }
  const fullDays = [0, 0, 0, 0, 0, 0, 0]
  const fullParts: Record<string, number> = { morning: 0, afternoon: 0, evening: 0, night: 0 }
  const outCount = new Map<string, number>()
  const last = new Map<string, { s: string; at: number }>()
  let restocks = 0
  let fulls = 0
  const monthAgo = Date.now() - 30 * DAY_MS

  for (const r of rows) {
    const d = local(r.reported_at)
    const day = (d.getUTCDay() + 6) % 7 // Monday = 0
    const part = partOf(d.getUTCHours())
    const prev = last.get(r.drink_id)
    const s = sightingOf(r)
    const at = new Date(r.reported_at).getTime()
    if (s === 'spotted' && prev && (prev.s === 'not_there' || at - prev.at > RESTOCK_GAP_MS)) {
      restocks++
      restockDays[day]++
      restockParts[part]++
    }
    if (s === 'spotted') { fulls++; fullDays[day]++; fullParts[part]++ }
    // Most often not found (counting each fresh Not there once).
    if (s === 'not_there' && prev?.s !== 'not_there' && at >= monthAgo) {
      outCount.set(r.drink_id, (outCount.get(r.drink_id) ?? 0) + 1)
    }
    last.set(r.drink_id, { s, at })
  }

  // "Sighting patterns": when flavors get spotted here (all Spotted sightings).
  // Restocks are still counted and returned for reference.
  const basis = fulls >= MIN_SIGNALS ? 'full' : 'none'
  const days = fullDays
  const parts = fullParts
  void restockDays; void restockParts

  // Flavors most often marked Not there in the last 30 days.
  const topOut = [...outCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
  let sellsOut: { name: string; times: number }[] = []
  if (topOut.length) {
    const { data: drinks } = await supabaseAdmin.from('drinks').select('id, name, brand, flavor').in('id', topOut.map(([id]) => id))
    const byId = new Map((drinks ?? []).map((d) => [d.id, d]))
    sellsOut = topOut.map(([id, times]) => {
      const d = byId.get(id)
      return { name: d ? (d.flavor ? `${d.brand} ${d.flavor}` : d.name) : 'A flavor', times }
    })
  }

  return NextResponse.json({
    basis,
    days,
    parts,
    signals: fulls,
    restocks,
    reports: rows.length,
    since: rows[0]?.reported_at ?? null,
    sellsOut,
  })
}
