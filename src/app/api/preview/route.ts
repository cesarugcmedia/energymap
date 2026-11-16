import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'
import { geocode } from '@/lib/geocode'
import { FREE_RADIUS_MILES } from '@/lib/plans'

// Public, no-login teaser for the landing page's "See what's near you" box.
// Deliberately limited: stores within the same radius free users get,
// at most PREVIEW_STORES stores and PREVIEW_DRINKS in-stock drinks each, no
// store IDs. The full map stays behind sign-up.

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const RADIUS_MILES = FREE_RADIUS_MILES
const PREVIEW_STORES = 5
const PREVIEW_DRINKS = 3

function distanceMiles(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 3958.8
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

type PreviewStore = {
  name: string
  type: string | null
  distanceMi: number
  lastReportedAt: string | null
  inStock: { brand: string; flavor: string; quantity: string }[]
  inStockCount: number
}

export async function GET(req: NextRequest) {
  if (!checkRateLimit(`preview:${getClientIp(req)}`, 15, 60 * 1000)) {
    return NextResponse.json({ error: 'Too many lookups. Try again in a minute.' }, { status: 429 })
  }

  const zip = req.nextUrl.searchParams.get('zip') ?? ''
  if (!/^\d{5}$/.test(zip)) {
    return NextResponse.json({ error: 'Enter a 5-digit ZIP code.' }, { status: 400 })
  }

  const point = await geocode(zip)
  if (!point) return NextResponse.json({ error: "We couldn't find that ZIP code." }, { status: 404 })

  // Bounding box first so we don't pull every store; then exact distance.
  const dLat = RADIUS_MILES / 69
  const dLng = RADIUS_MILES / (69 * Math.cos((point.lat * Math.PI) / 180))
  const { data: boxStores, error: storesError } = await supabaseAdmin
    .from('stores')
    .select('id, name, type, lat, lng')
    .eq('status', 'approved')
    .gte('lat', point.lat - dLat).lte('lat', point.lat + dLat)
    .gte('lng', point.lng - dLng).lte('lng', point.lng + dLng)
    .range(0, 999)
  if (storesError) return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 })

  const nearby = (boxStores ?? [])
    .map((s) => ({ ...s, distanceMi: distanceMiles(point.lat, point.lng, s.lat, s.lng) }))
    .filter((s) => s.distanceMi <= RADIUS_MILES)

  if (nearby.length === 0) {
    return NextResponse.json({ zip, totalStores: 0, reportedStores: 0, stores: [] }, { headers: { 'Cache-Control': 'public, s-maxage=300' } })
  }

  // Latest report per drink per store, newest first.
  const ids = nearby.map((s) => s.id)
  const { data: stock, error: stockError } = await supabaseAdmin
    .from('latest_stock')
    .select('store_id, drink_id, quantity, reported_at')
    .in('store_id', ids.slice(0, 300))
    .order('reported_at', { ascending: false })
    .range(0, 999)

  // Surface a failed stock query instead of silently showing '0 reports'.
  if (stockError) {
    console.error('preview: latest_stock query failed', stockError.message)
    return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 })
  }

  const drinkIds = [...new Set((stock ?? []).map((r) => r.drink_id))]
  const { data: drinks } = drinkIds.length
    ? await supabaseAdmin.from('drinks').select('id, brand, name, flavor').in('id', drinkIds.slice(0, 500))
    : { data: [] as { id: string; brand: string; name: string; flavor: string | null }[] }
  const drinkById = new Map((drinks ?? []).map((d) => [d.id, d]))

  const byStore = new Map<string, { last: string | null; inStock: PreviewStore['inStock'] }>()
  for (const r of stock ?? []) {
    const entry = byStore.get(r.store_id) ?? { last: null, inStock: [] }
    if (!entry.last) entry.last = r.reported_at
    const d = drinkById.get(r.drink_id)
    if (r.quantity !== 'out' && d) entry.inStock.push({ brand: d.brand, flavor: d.flavor || d.name, quantity: r.quantity })
    byStore.set(r.store_id, entry)
  }

  // Stores with reports first (freshest first), then the rest by distance.
  const ranked = nearby.sort((a, b) => {
    const la = byStore.get(a.id)?.last, lb = byStore.get(b.id)?.last
    if (la && lb) return lb.localeCompare(la)
    if (la) return -1
    if (lb) return 1
    return a.distanceMi - b.distanceMi
  })

  const stores: PreviewStore[] = ranked.slice(0, PREVIEW_STORES).map((s) => {
    const entry = byStore.get(s.id)
    return {
      name: s.name,
      type: s.type,
      distanceMi: Math.round(s.distanceMi * 10) / 10,
      lastReportedAt: entry?.last ?? null,
      inStock: (entry?.inStock ?? []).slice(0, PREVIEW_DRINKS),
      inStockCount: entry?.inStock.length ?? 0,
    }
  })

  return NextResponse.json(
    { zip, totalStores: nearby.length, reportedStores: nearby.filter((s) => byStore.has(s.id)).length, stores },
    { headers: { 'Cache-Control': 'public, s-maxage=300' } }
  )
}
