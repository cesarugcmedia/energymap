import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'
import type { Store } from '@/lib/types'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BATCH = 1000
const FREE_RADIUS_MILES = 5
const NEARBY_COUNT_RADIUS_MILES = 10
const ALL_STORES_TTL_MS = 60_000
const COLUMNS = 'id, name, type, address, lat, lng'

function getDistanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Paged read (Supabase caps responses at 1,000 rows). `box` limits it to a
// lat/lng bounding box so free/anonymous requests only read nearby rows
// instead of the whole table.
async function loadStores(box?: { minLat: number; maxLat: number; minLng: number; maxLng: number }): Promise<Store[] | null> {
  const out: Store[] = []
  for (let from = 0; ; from += BATCH) {
    let q = supabaseAdmin.from('stores').select(COLUMNS).eq('status', 'approved')
    if (box) q = q.gte('lat', box.minLat).lte('lat', box.maxLat).gte('lng', box.minLng).lte('lng', box.maxLng)
    const { data, error } = await q.range(from, from + BATCH - 1)
    if (error) return null
    if (!data || data.length === 0) break
    out.push(...(data as Store[]))
    if (data.length < BATCH) break
  }
  return out
}

// Tracker/admin see every store (unlimited radius). That full list is the
// same for everyone, so each server instance keeps it for a minute instead
// of re-reading the whole table on every map load.
let allStoresCache: { stores: Store[]; at: number } | null = null
async function allStores(): Promise<Store[] | null> {
  if (allStoresCache && Date.now() - allStoresCache.at < ALL_STORES_TTL_MS) return allStoresCache.stores
  const stores = await loadStores()
  if (stores) allStoresCache = { stores, at: Date.now() }
  return stores
}

async function callerIsPrivileged(authHeader: string | null): Promise<boolean> {
  if (!authHeader?.startsWith('Bearer ')) return false
  const { data: { user } } = await supabaseAdmin.auth.getUser(authHeader.slice(7))
  if (!user) return false
  const { data: profile } = await supabaseAdmin.from('profiles').select('tier, is_admin').eq('id', user.id).single()
  return !!(profile?.is_admin || profile?.tier === 'tracker')
}

export async function GET(req: NextRequest) {
  if (!checkRateLimit(`nearby-stores:${getClientIp(req)}`, 30, 60 * 1000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const lat = parseFloat(req.nextUrl.searchParams.get('lat') ?? '')
  const lng = parseFloat(req.nextUrl.searchParams.get('lng') ?? '')
  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: 'Missing or invalid lat/lng' }, { status: 400 })
  }

  // Bounding box around the 10-mile count radius (which also covers the
  // 5-mile free radius). 1° latitude ≈ 69 mi; longitude shrinks with cos(lat).
  const dLat = NEARBY_COUNT_RADIUS_MILES / 69
  const dLng = NEARBY_COUNT_RADIUS_MILES / (69 * Math.max(0.2, Math.cos(lat * Math.PI / 180)))
  const box = { minLat: lat - dLat, maxLat: lat + dLat, minLng: lng - dLng, maxLng: lng + dLng }

  // Tier check and the nearby read run in parallel; only tracker/admin
  // callers then need the full list.
  const [isPrivileged, nearbyRows] = await Promise.all([
    callerIsPrivileged(req.headers.get('Authorization')),
    loadStores(box),
  ])
  if (!nearbyRows) return NextResponse.json({ error: 'Failed to load stores' }, { status: 500 })

  const nearbyCount = nearbyRows.filter((s) => getDistanceMiles(lat, lng, s.lat, s.lng) <= NEARBY_COUNT_RADIUS_MILES).length

  if (isPrivileged) {
    const stores = await allStores()
    if (!stores) return NextResponse.json({ error: 'Failed to load stores' }, { status: 500 })
    return NextResponse.json({ stores, nearbyCount })
  }

  const stores = nearbyRows.filter((s) => getDistanceMiles(lat, lng, s.lat, s.lng) <= FREE_RADIUS_MILES)
  return NextResponse.json({ stores, nearbyCount })
}
